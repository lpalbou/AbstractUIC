// An automation's runs read as a chat (operator 2026-11-27: "the trigger is the equivalent of the
// user message; the response is the AI response"): the facts the shared chat thread needs about
// each run, read from the served row's typed fields, never parsed out of its text. The thread
// itself is panel-chat's `AutomationChat`; ui-kit cannot import panel-chat, so the pure rules live
// here, where every client (and the checks) can read them.
import type { AutomationSummary, OccurrenceRow } from "./types.js";

/**
 * The runtime's frame line of a run's input, rebuilt from the row's own fields
 * (AbstractRuntime `automations/controller.py` `_render_prompt`:
 * `[Trigger {source_id}@{source_version} · occurrence {index} · fired {fired_at}]`), or null when
 * the row does not carry every piece (an AbstractGateway that does not serve
 * `trigger.source_version`): the frame is then never removed.
 */
export function automationTriggerFrame(row: Pick<OccurrenceRow, "trigger" | "index" | "fired_at">): string | null {
  const t = row.trigger;
  const source = typeof t?.source_id === "string" ? t.source_id : "";
  const version = t?.source_version;
  if (!source || typeof version !== "number" || !Number.isSafeInteger(version)) return null;
  if (!Number.isSafeInteger(row.index) || typeof row.fired_at !== "string" || !row.fired_at) return null;
  return `[Trigger ${source}@${version} · occurrence ${row.index} · fired ${row.fired_at}]`;
}

/**
 * The run's user message: its `task` when the gateway serves one (the task as written for THAT
 * run, no frame); else its `user_turn`, without the first line only when that line is, character
 * for character, the frame rebuilt from the row (`automationTriggerFrame`). `from` says which.
 */
export function automationRunTask(row: Pick<OccurrenceRow, "task" | "user_turn" | "trigger" | "index" | "fired_at">): { text: string; from: "task" | "user_turn" | "user_turn_unframed" } {
  if (typeof row.task === "string" && row.task.trim()) return { text: row.task, from: "task" };
  const turn = typeof row.user_turn === "string" ? row.user_turn : "";
  const frame = automationTriggerFrame(row);
  const nl = turn.indexOf("\n");
  if (frame && nl >= 0 && turn.slice(0, nl) === frame) return { text: turn.slice(nl + 1), from: "user_turn_unframed" };
  if (frame && nl < 0 && turn === frame) return { text: "", from: "user_turn_unframed" };
  return { text: turn, from: "user_turn" };
}

/** The unseen results of an automation, by run index: each one's attention cursor (oldest first). */
export function unseenRuns(summary: Pick<AutomationSummary, "attention">): Map<number, string> {
  const out = new Map<number, string>();
  for (const it of summary.attention.items) if (!out.has(it.index)) out.set(it.index, it.cursor);
  return out;
}

/**
 * Where an automation's thread opens: the first unseen result among the loaded runs (its answer),
 * else the newest loaded run (its task). Null when no run is loaded.
 */
export function automationOpening(
  summary: Pick<AutomationSummary, "attention">,
  rows: ReadonlyArray<Pick<OccurrenceRow, "index" | "run_id">>,
): { runId: string; at: "unseen" | "newest" } | null {
  if (!rows.length) return null;
  const byIndex = new Map(rows.map((r) => [r.index, r] as const));
  for (const it of summary.attention.items) {
    const row = byIndex.get(it.index);
    if (row) return { runId: row.run_id, at: "unseen" };
  }
  const newest = rows.reduce((a, b) => (b.index > a.index ? b : a));
  return { runId: newest.run_id, at: "newest" };
}
