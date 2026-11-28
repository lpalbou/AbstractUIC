// The live line of a run in progress (spec C, client half): `2:14 · Search the web for AI news`
// and, once a tool call ended, `7 steps so far`. The gateway folds what a running run is doing
// (`summary.current_occurrence.live`); the kit only words it (the words file and
// `describeToolCall`) and ticks the elapsed time. Pure: `AutomationLiveLine` renders it.
import { describeToolCall } from "../tool_call_words.js";
import { AUTOMATION_EDIT_WORDS } from "./automation_words.js";
import type { AutomationSummary, CurrentOccurrence } from "./types.js";

export type AutomationLiveWords = {
  /** `Date.parse(live.started_at)`: the client ticks the elapsed time from it; null when the
   * occurrence is not running (only admitted, or waiting to retry: the gateway serves no `live`). */
  elapsedFrom: number | null;
  /** What the run does now, in words. */
  text: string;
  /** "7 steps so far" when `steps_done > 0`, else null. */
  steps: string | null;
};

/**
 * The live line of the occurrence in flight, or null when there is nothing to say (no occurrence,
 * or a running one the gateway serves no `live` for: the row then reads "Running" as before).
 * `status` `"backoff"` reads `live.retry` with the attempt about to run (the runtime already
 * stores the NEXT attempt in backoff: controller.py `retry_scheduled`) and `"admitted"` reads
 * `live.starting`; neither has a `live` nor an elapsed time. A running one words `live.state`;
 * `tool` is the tool-call words' sentence without its secondary options (verb, lead and key:
 * "Search the web for AI news"). A `live` this kit cannot word (an unknown `state`, `tool` without
 * its call, an unreadable `started_at`) is null: the row reads "Running" as without a `live`
 * (spec C), never a guessed line and never an error that takes the panel down.
 */
export function automationLiveWords(current: CurrentOccurrence | null | undefined): AutomationLiveWords | null {
  const w = AUTOMATION_EDIT_WORDS.live;
  if (!current) return null;
  if (current.status === "backoff") return { elapsedFrom: null, text: w.retry.replace("{attempt}", String(current.attempt)), steps: null };
  if (current.status === "admitted") return { elapsedFrom: null, text: w.starting, steps: null };
  const live = current.live;
  if (!live) return null;
  const elapsedFrom = Date.parse(live.started_at);
  if (Number.isNaN(elapsedFrom)) return null;
  let text: string;
  switch (live.state) {
    case "starting":
      text = w.starting;
      break;
    case "thinking":
      text = w.thinking;
      break;
    case "waiting":
      text = w.waiting;
      break;
    case "tool": {
      if (!live.tool || typeof live.tool.name !== "string") return null;
      const words = describeToolCall({ name: live.tool.name, arguments: live.tool.arguments });
      text = [words.verb, words.lead, words.key].filter(Boolean).join(" ");
      break;
    }
    default:
      return null;
  }
  const n = live.steps_done;
  const steps = Number.isSafeInteger(n) && n > 0 ? (n === 1 ? w.steps_one : w.steps_many.replace("{count}", String(n))) : null;
  return { elapsedFrom, text, steps };
}

/** Elapsed time as `m:ss` (`h:mm:ss` past an hour), clamped at zero (a clock behind the gateway's). */
export function liveElapsed(fromMs: number, nowMs: number): string {
  const total = Math.max(0, Math.floor((nowMs - fromMs) / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = String(total % 60).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${s}` : `${m}:${s}`;
}

/** How often the open automation is re-read while a run is in progress (only while visible). */
export const LIVE_REFRESH_MS = 3000;

/**
 * The delay before the host re-reads the open automation (`GET /automations/{id}`; the panel
 * polls nothing): `LIVE_REFRESH_MS` while it has a `current_occurrence` and the page is visible,
 * else the host's own cadence `hostMs`.
 */
export function automationRefreshMs(summary: Pick<AutomationSummary, "current_occurrence"> | null | undefined, hostMs: number, visible: boolean): number {
  return visible && summary?.current_occurrence ? LIVE_REFRESH_MS : hostMs;
}
