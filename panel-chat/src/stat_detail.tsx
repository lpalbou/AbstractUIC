import React, { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import type { WorkflowModelCall, WorkflowStatistics } from "./workflow_evidence.js";

/**
 * Structured detail for the message-card stat chips (tokens / time / tools).
 *
 * WHY STRUCTURED (operator, 2026-09-22): the chips used a native `title`
 * with one or two lines ("Input: 5,996 · Output: 423"), while the run ledger
 * carries the prompt-cache split, measured time-to-first-token, generation
 * rate, speculative-decoding acceptance and per-tool timing. The detail is
 * built here as DATA (`statDetail`, pure and testable in Node) and rendered
 * by `StatDetailPanel`; `StatChip` gives it hover/focus/escape behaviour.
 *
 * Honesty rule, unchanged: a value the ledger did not report reads
 * "not reported" — never 0, which would be a claim.
 */

export type StatDetailKind = "tokens" | "time" | "tools";
export type StatDetailRow = { label: string; value: string; hint?: string };
export type StatDetailSection = {
  heading: string;
  rows?: StatDetailRow[];
  table?: { columns: string[]; rows: string[][] };
  note?: string;
};
export type StatDetail = {
  kind: StatDetailKind;
  title: string;
  headline: string;
  sections: StatDetailSection[];
  footer: string[];
};

const NR = "not reported";
const n0 = (n?: number) => (n === undefined ? NR : Math.round(n).toLocaleString());
export const formatDuration = (ms?: number): string => {
  if (ms === undefined) return NR;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  const total = Math.round(ms / 1000);
  return `${Math.floor(total / 60)}m ${String(total % 60).padStart(2, "0")}s`;
};
const rate = (n?: number) => (n === undefined ? NR : `${Math.round(n).toLocaleString()} tok/s`);
const pct = (part: number, whole: number) => (whole > 0 ? `${Math.round((part / whole) * 100)}%` : "");
const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString()} ${n === 1 ? one : many}`;
/** `org/Model-Name` → `Model-Name`; a local path keeps its last segment. */
export const shortModel = (model: string): string => {
  const clean = model.split("#")[0].replace(/\/+$/, "");
  return clean.slice(clean.lastIndexOf("/") + 1) || model;
};
/** "cold ×3 · hit_restore" — outcome tally across calls, in first-seen order. */
function tally(values: (string | undefined)[]): string {
  const counts = new Map<string, number>();
  for (const v of values) if (v) counts.set(v, (counts.get(v) || 0) + 1);
  return [...counts].map(([v, c]) => (c > 1 ? `${v} ×${c}` : v)).join(" · ");
}

function footer(s: WorkflowStatistics): string[] {
  const lines: string[] = [];
  const models = (s.models || []).map(shortModel);
  const providers = s.providers || [];
  if (models.length || providers.length)
    lines.push([models.join(", ") || "model not reported", providers.join(", ")].filter(Boolean).join(" · "));
  lines.push("From the run ledger; summed across this turn and its child runs.");
  return lines;
}

function tokenDetail(s: WorkflowStatistics): StatDetail {
  const calls = s.modelCalls || [];
  const sections: StatDetailSection[] = [];
  const usage: StatDetailRow[] = [
    { label: "Input", value: n0(s.inputTokens) },
    { label: "Output", value: n0(s.outputTokens) },
  ];
  if (s.reasoningTokens !== undefined)
    usage.push({ label: "Reasoning", value: n0(s.reasoningTokens), hint: "part of output" });
  usage.push({ label: "Total", value: n0(s.totalTokens) });
  sections.push({ heading: `Usage · ${plural(s.llmCalls, "model call")}`, rows: usage });

  if (s.measuredCacheCalls) {
    const cached = s.cachedTokens || 0,
      fed = s.fedTokens || 0;
    const rows: StatDetailRow[] = [
      { label: "Reused from cache", value: `${n0(cached)}${cached + fed ? ` (${pct(cached, cached + fed)})` : ""}` },
      { label: "Newly processed", value: n0(s.fedTokens) },
      { label: "Outcome", value: tally(calls.map((c) => c.cacheOutcome)) || (s.cacheOutcomes || []).join(" · ") || NR },
      { label: "Backend", value: (s.cacheBackends || []).join(", ") || NR },
    ];
    if (s.measuredCacheCalls !== s.llmCalls)
      rows.push({ label: "Measured on", value: `${s.measuredCacheCalls} of ${s.llmCalls} calls` });
    sections.push({ heading: "Prompt cache", rows });
  } else if (s.llmCalls) {
    sections.push({ heading: "Prompt cache", rows: [{ label: "Cache reuse", value: NR }] });
  }

  const sized = calls.filter((c) => c.inputTokens !== undefined);
  if (sized.length === 1 && calls.length === 1)
    sections.push({ heading: "Context", rows: [{ label: "Prompt size", value: `${n0(sized[0].inputTokens)} tokens` }] });
  else if (sized.length > 1)
    sections.push({
      heading: "Context",
      rows: [
        {
          label: "First → last call",
          value: `${n0(sized[0].inputTokens)} → ${n0(sized[sized.length - 1].inputTokens)} tokens`,
        },
      ],
      note: "Each call re-sends the conversation, so the input total counts the context once per call.",
    });

  if (calls.length > 1)
    sections.push({
      heading: "Per call",
      table: {
        columns: ["#", "Input", "Cached", "New", "Output", "Cache"],
        rows: calls.map((c, i) => [
          String(i + 1),
          n0(c.inputTokens),
          c.cachedTokens === undefined ? "—" : n0(c.cachedTokens),
          c.fedTokens === undefined ? "—" : n0(c.fedTokens),
          n0(c.outputTokens),
          c.cacheOutcome || "—",
        ]),
      },
    });
  return {
    kind: "tokens",
    title: "Tokens",
    headline: s.totalTokens === undefined ? NR : `${s.totalTokens.toLocaleString()} total`,
    sections,
    footer: footer(s),
  };
}

function phase(ms: number | undefined, tokens: number | undefined, tps: number | undefined, unit: string): string {
  if (ms === undefined) return NR;
  const parts = [formatDuration(ms)];
  if (tokens !== undefined) parts.push(`${tokens.toLocaleString()} ${unit}${tps !== undefined ? ` at ${rate(tps)}` : ""}`);
  return parts.join(" · ");
}

function timeDetail(s: WorkflowStatistics): StatDetail {
  const calls = s.modelCalls || [];
  const sections: StatDetailSection[] = [];
  const wall = s.durationMs;
  const turn: StatDetailRow[] = [{ label: "Wall clock", value: formatDuration(wall) }];
  turn.push({
    label: "Model",
    value:
      s.genTimeMs === undefined
        ? NR
        : `${formatDuration(s.genTimeMs)} · ${plural(s.timedCalls || 0, "call")}${
            s.timedCalls !== s.llmCalls ? ` (of ${s.llmCalls})` : ""
          }`,
  });
  turn.push({
    label: "Tools",
    value: s.toolTimeMs !== undefined ? `${formatDuration(s.toolTimeMs)} · ${plural(s.toolBatches || 0, "batch", "batches")}` : s.toolCalls ? NR : "none",
    hint: s.toolTimeIncludesApproval ? "includes approval wait" : undefined,
  });
  if (wall !== undefined && s.genTimeMs !== undefined) {
    const rest = wall - s.genTimeMs - (s.toolTimeMs || 0);
    turn.push({
      label: "Orchestration",
      value: rest >= 0 ? formatDuration(rest) : "overlaps (parallel runs)",
      hint: "wall − model − tools: routing, hand-offs, model load",
    });
  }
  sections.push({ heading: "Turn", rows: turn });

  const model: StatDetailRow[] = [];
  const measured = s.ttftCalls || 0,
    phased = s.promptPhaseCalls || 0;
  if (s.promptPhaseMs !== undefined)
    model.push({
      label: measured && measured === phased ? "Prefill (TTFT)" : "Prefill",
      value: phase(s.promptPhaseMs, s.promptPhaseNewTokens, s.promptPhaseTokensPerSecond, "new tok"),
      hint:
        measured === phased
          ? "measured time to first token"
          : measured
            ? `TTFT measured on ${measured} of ${phased}; rest from provider rate`
            : "derived: prompt ÷ provider rate",
    });
  // Statistics built without per-call rows (hosts assembling them by hand,
  // or an older fold) still carry the rate-derived fields.
  else if (s.prefillMs !== undefined && s.prefillNewTokensPerSecond !== undefined)
    model.push({
      label: "Prefill",
      value: phase(s.prefillMs, s.prefillNewTokens, s.prefillNewTokensPerSecond, "new tok"),
      hint: "derived: prompt ÷ provider rate",
    });
  else if (s.prefillMs !== undefined)
    model.push({
      label: "Prefill",
      value: `${formatDuration(s.prefillMs)}${s.promptTokensPerSecond !== undefined ? ` at ${rate(s.promptTokensPerSecond)}` : ""}`,
      hint: "provider rate over all prompt tokens, restored included",
    });
  else model.push({ label: "Prefill", value: NR });
  if (s.cachedTokens && (s.promptPhaseMs ?? s.prefillMs) !== undefined)
    model.push({ label: "Restored", value: `${s.cachedTokens.toLocaleString()} tok from cache`, hint: "not recomputed" });
  model.push({
    label: "Generation",
    value:
      s.generationPhaseMs !== undefined
        ? phase(s.generationPhaseMs, s.generationPhaseTokens, s.generationPhaseTokensPerSecond, "tok")
        : phase(s.decodeMs, s.outputTokens, s.generationTokensPerSecond, "tok"),
  });
  if (s.measuredSpeedCalls && s.measuredSpeedCalls !== s.llmCalls)
    model.push({ label: "Speeds from", value: `${s.measuredSpeedCalls} of ${s.llmCalls} calls` });
  sections.push({ heading: "Model", rows: model });

  const spec = s.speculation;
  if (spec) {
    const kinds = (spec.draftKinds || []).map((k) => k.toUpperCase()).join(", ");
    const rows: StatDetailRow[] = [
      {
        label: "Mode",
        value: `${spec.used ? "on" : "off"}${kinds ? ` · ${kinds}` : ""}${spec.modes?.length ? ` (${spec.modes.join(", ")})` : ""}`,
        hint: spec.calls !== s.llmCalls || spec.used !== spec.calls ? `used on ${spec.used} of ${s.llmCalls} calls` : undefined,
      },
      {
        label: "Acceptance",
        value:
          spec.acceptanceRate === undefined
            ? NR
            : `${Math.round(spec.acceptanceRate * 100)}% · ${n0(spec.acceptedTokens)} of ${n0(spec.draftedTokens)} drafted`,
      },
    ];
    if (spec.draftLengths?.length || spec.rounds !== undefined)
      rows.push({
        label: "Draft length",
        value: `${spec.draftLengths?.length ? `${spec.draftLengths.join("/")} tok/round` : NR}${spec.rounds !== undefined ? ` · ${spec.rounds.toLocaleString()} rounds` : ""}`,
      });
    sections.push({ heading: "Speculation", rows });
  }

  if (s.slowestToolBatch)
    sections.push({
      heading: "Tools",
      rows: [
        { label: "Total", value: `${formatDuration(s.toolTimeMs)} · ${plural(s.toolBatches || 0, "batch", "batches")}` },
        { label: "Slowest", value: `${formatDuration(s.slowestToolBatch.ms)} · ${batchLabel(s.slowestToolBatch)}` },
      ],
      note: s.toolTimeIncludesApproval ? "Gated calls are timed from request to result, so this includes waiting for your approval." : undefined,
    });

  if (calls.length > 1)
    sections.push({
      heading: "Per call",
      table: {
        columns: ["#", "Prefill", "New tok/s", "Gen", "Gen tok/s", "Cache"],
        rows: calls.map((c: WorkflowModelCall, i) => [
          String(i + 1),
          c.promptMs === undefined ? "—" : `${formatDuration(c.promptMs)}${c.promptSource === "rate" ? "*" : ""}`,
          c.promptNewTokensPerSecond === undefined ? "—" : Math.round(c.promptNewTokensPerSecond).toLocaleString(),
          c.generationMs === undefined ? "—" : formatDuration(c.generationMs),
          c.generationTokensPerSecond === undefined ? "—" : Math.round(c.generationTokensPerSecond).toLocaleString(),
          c.cacheOutcome || "—",
        ]),
      },
      note: calls.some((c) => c.promptSource === "rate") ? "* derived from the provider's prompt rate (no TTFT event)." : undefined,
    });
  return {
    kind: "time",
    title: "Time",
    headline: wall === undefined ? NR : `${formatDuration(wall)} wall clock`,
    sections,
    footer: footer(s),
  };
}

function batchLabel(batch: { calls: number; tools: string[] }): string {
  return batch.tools.length === 1 ? `${batch.tools[0]} ×${batch.calls}` : `${plural(batch.calls, "call")} (${batch.tools.join(", ")})`;
}

function toolDetail(s: WorkflowStatistics): StatDetail {
  const sections: StatDetailSection[] = [];
  const pending = (s.toolsWaiting || 0) + (s.toolsRunning || 0);
  if (!s.toolCalls && !pending) {
    sections.push({ heading: "Outcome", rows: [{ label: "Tools called", value: "none" }] });
    return { kind: "tools", title: "Tools", headline: "none", sections, footer: footer(s) };
  }
  const outcome: StatDetailRow[] = [
    { label: "Succeeded", value: (s.toolCalls - (s.toolsFailed || 0)).toLocaleString() },
    { label: "Failed", value: (s.toolsFailed || 0).toLocaleString() },
  ];
  if (s.toolsRunning) outcome.push({ label: "Running", value: s.toolsRunning.toLocaleString() });
  if (s.toolsWaiting)
    outcome.push({ label: "Awaiting approval", value: s.toolsWaiting.toLocaleString(), hint: "not run yet — not a failure" });
  sections.push({ heading: "Outcome", rows: outcome });

  const breakdown = Object.entries(s.toolBreakdown || {}).sort(
    (a, b) => b[1].calls - a[1].calls || a[0].localeCompare(b[0]),
  );
  if (breakdown.length)
    sections.push({
      heading: "By tool",
      table: {
        columns: ["Tool", "Calls", "Failed", "Time"],
        rows: breakdown.map(([name, row]) => [
          name,
          row.calls.toLocaleString(),
          row.failed.toLocaleString(),
          row.ms !== undefined
            ? `${formatDuration(row.ms)}${row.sharedBatches ? " +shared" : ""}`
            : row.sharedBatches
              ? "shared"
              : NR,
        ]),
      },
      note: breakdown.some(([, row]) => row.sharedBatches)
        ? "A batch that mixed tools ran them together; its time is not split between them."
        : undefined,
    });
  const failures = breakdown.filter(([, row]) => row.errors && Object.keys(row.errors).length);
  if (failures.length)
    sections.push({
      heading: "Failures",
      rows: failures.map(([name, row]) => ({
        label: name,
        value: Object.entries(row.errors!)
          .sort((a, b) => b[1] - a[1])
          .map(([cls, n]) => (n > 1 ? `${cls} ×${n}` : cls))
          .join(" · "),
      })),
    });
  const timing: StatDetailRow[] = [
    {
      label: "Tool time",
      value:
        s.toolTimeMs === undefined ? NR : `${formatDuration(s.toolTimeMs)} · ${plural(s.toolBatches || 0, "batch", "batches")}`,
    },
  ];
  if (s.slowestToolBatch)
    timing.push({ label: "Slowest batch", value: `${formatDuration(s.slowestToolBatch.ms)} · ${batchLabel(s.slowestToolBatch)}` });
  sections.push({
    heading: "Timing",
    rows: timing,
    note: s.toolTimeIncludesApproval
      ? "Gated calls are timed from request to result, so this includes waiting for your approval."
      : undefined,
  });
  return {
    kind: "tools",
    title: "Tools",
    headline: `${plural(s.toolCalls, "call")}${s.toolsFailed ? ` · ${s.toolsFailed} failed` : ""}`,
    sections,
    footer: footer(s),
  };
}

/** Pure: the structured detail for one chip, from the folded statistics. */
export function statDetail(kind: StatDetailKind, statistics: WorkflowStatistics): StatDetail {
  if (kind === "tokens") return tokenDetail(statistics);
  if (kind === "time") return timeDetail(statistics);
  return toolDetail(statistics);
}

/** Plain-text rendering (copy, logs, non-DOM hosts). */
export function statDetailText(detail: StatDetail): string {
  const lines = [`${detail.title} · ${detail.headline}`];
  for (const section of detail.sections) {
    lines.push("", section.heading);
    for (const row of section.rows || []) lines.push(`  ${row.label}: ${row.value}${row.hint ? ` (${row.hint})` : ""}`);
    if (section.table) {
      lines.push(`  ${section.table.columns.join(" | ")}`);
      for (const r of section.table.rows) lines.push(`  ${r.join(" | ")}`);
    }
    if (section.note) lines.push(`  ${section.note}`);
  }
  lines.push("", ...detail.footer);
  return lines.join("\n");
}

export function StatDetailPanel(props: {
  detail: StatDetail;
  id?: string;
  style?: React.CSSProperties;
  panelRef?: React.Ref<HTMLDivElement>;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
}): React.ReactElement {
  const d = props.detail;
  return (
    <div
      ref={props.panelRef}
      id={props.id}
      role="tooltip"
      className={`pc-stat-detail pc-stat-detail--${d.kind}`}
      style={props.style}
      onMouseEnter={props.onMouseEnter}
      onMouseLeave={props.onMouseLeave}
    >
      <div className="pc-stat-detail-head">
        <span className="pc-stat-detail-title">{d.title}</span>
        <span className="pc-stat-detail-headline">{d.headline}</span>
      </div>
      {d.sections.map((section) => (
        <div className="pc-stat-detail-section" key={section.heading}>
          <div className="pc-stat-detail-heading">{section.heading}</div>
          {section.rows?.length ? (
            <dl className="pc-stat-detail-rows">
              {section.rows.map((row) => (
                <React.Fragment key={row.label}>
                  <dt>{row.label}</dt>
                  <dd>
                    <span className={row.value === NR ? "pc-stat-detail-value pc-stat-detail-value--absent" : "pc-stat-detail-value"}>
                      {row.value}
                    </span>
                    {row.hint ? <span className="pc-stat-detail-hint">{row.hint}</span> : null}
                  </dd>
                </React.Fragment>
              ))}
            </dl>
          ) : null}
          {section.table ? (
            <table className="pc-stat-detail-table">
              <thead>
                <tr>
                  {section.table.columns.map((c) => (
                    <th key={c} scope="col">{c}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {section.table.rows.map((r, i) => (
                  <tr key={i}>
                    {r.map((cell, j) => (
                      <td key={j}>{cell}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          ) : null}
          {section.note ? <p className="pc-stat-detail-note">{section.note}</p> : null}
        </div>
      ))}
      <div className="pc-stat-detail-foot">
        {d.footer.map((line) => (
          <div key={line}>{line}</div>
        ))}
      </div>
    </div>
  );
}

const GAP = 8;

/**
 * A stat chip whose detail opens on hover or keyboard focus, closes on
 * mouse-out / blur / Escape, and is positioned (in a body portal, so no
 * clipping ancestor can cut it) above the chip — or below when there is no
 * room — clamped inside the viewport.
 */
export function StatChip(props: {
  label: string;
  detail: StatDetail;
  className?: string;
  icon?: React.ReactNode;
  onClick?: () => void;
  defaultOpen?: boolean;
}): React.ReactElement {
  const [open, setOpen] = useState(Boolean(props.defaultOpen));
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const chipRef = useRef<HTMLElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const closeTimer = useRef<number | null>(null);
  const id = `pc-stat-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;

  const cancelClose = useCallback(() => {
    if (closeTimer.current !== null) window.clearTimeout(closeTimer.current);
    closeTimer.current = null;
  }, []);
  const show = useCallback(() => {
    cancelClose();
    setOpen(true);
  }, [cancelClose]);
  const hideSoon = useCallback(() => {
    cancelClose();
    closeTimer.current = window.setTimeout(() => setOpen(false), 120);
  }, [cancelClose]);
  useEffect(() => cancelClose, [cancelClose]);

  useLayoutEffect(() => {
    if (!open) {
      setPos(null);
      return;
    }
    const place = () => {
      const chip = chipRef.current,
        panel = panelRef.current;
      if (!chip || !panel) return;
      const r = chip.getBoundingClientRect();
      const w = panel.offsetWidth,
        h = panel.offsetHeight;
      const vw = window.innerWidth,
        vh = window.innerHeight;
      const above = r.top - GAP - h;
      const below = r.bottom + GAP;
      const top = above >= GAP ? above : below + h <= vh - GAP ? below : Math.max(GAP, vh - GAP - h);
      const left = Math.min(Math.max(GAP, r.left), Math.max(GAP, vw - GAP - w));
      setPos({ top, left });
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  const clickable = typeof props.onClick === "function";
  const Element = clickable ? "button" : "span";
  const panel = open ? (
    <StatDetailPanel
      detail={props.detail}
      id={id}
      panelRef={panelRef}
      onMouseEnter={cancelClose}
      onMouseLeave={hideSoon}
      style={{ position: "fixed", top: pos?.top ?? 0, left: pos?.left ?? 0, visibility: pos ? "visible" : "hidden" }}
    />
  ) : null;
  return (
    <>
      <Element
        ref={chipRef as any}
        {...(clickable ? { type: "button" as const } : { tabIndex: 0 })}
        className={["pc-chat-stat", "pc-chat-stat--detail", clickable ? "pc-chat-stat--clickable" : "", props.className]
          .filter(Boolean)
          .join(" ")}
        aria-label={`${props.label} — ${props.detail.title.toLowerCase()} details`}
        aria-describedby={open ? id : undefined}
        data-stat-kind={props.detail.kind}
        onMouseEnter={show}
        onMouseLeave={hideSoon}
        onFocus={show}
        onBlur={() => setOpen(false)}
        onKeyDown={(e: React.KeyboardEvent) => {
          if (e.key === "Escape") setOpen(false);
        }}
        onClick={clickable ? () => props.onClick?.() : undefined}
      >
        {props.icon ? <span className="pc-chat-stat-icon" aria-hidden="true">{props.icon}</span> : null}
        <span className="pc-chat-stat-label">{props.label}</span>
      </Element>
      {panel && typeof document !== "undefined" ? createPortal(panel, document.body) : panel}
    </>
  );
}
