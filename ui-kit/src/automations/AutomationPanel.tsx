// AutomationPanel — one automation, rendered from server truth (contract G).
//
// Controlled: the host fetches (see ./client.ts) and passes the summary, the
// occurrences and `busy`; the panel forwards intent through the callbacks and
// holds only view state (which form is open). Occurrences read as a chat: a
// trigger/task turn and an answer turn per occurrence. Quiet ticks stay visible
// but subdued; failures, human waits and explicit `notify` are prominent.
//
// The pieces below the panel (header, controls bar, revise form, occurrence
// pair) are hook-free so scripts/check_automation_panel.mjs can render them in
// any state and invoke their handlers without a DOM.
import React, { useEffect, useId, useRef, useState } from "react";
import {
  apiErrorText,
  attentionAckCursor,
  attentionLabel,
  automationControls,
  ActionIds,
  CONTROL_COMMANDS,
  contextLabel,
  formatUtc,
  isApiError,
  mintUuid,
  parseEventPayload,
  WAIT_KIND_LABELS,
  waitToolCalls,
  occurrenceViews,
  pickFocusTarget,
  parseDuration,
  reviseChanges,
  reviseFormFrom,
  SeenAckTracker,
  STATUS_LABELS,
  triggerSummary,
  type ControlId,
  type ControlState,
  type OccurrenceView,
  type ReviseForm,
} from "./panel_core.js";
import type {
  ApiError,
  AutomationChanges,
  AutomationDefinition,
  AutomationSummary,
  CommandReceipt,
  ContextMode,
  JsonObject,
  OccurrenceRow,
  OccurrenceWait,
  TriggerSourceEntry,
  TriggerSource,
} from "./types.js";

export type AutomationPanelProps = {
  summary: AutomationSummary;
  definition?: AutomationDefinition;
  occurrences: OccurrenceRow[];
  triggerSources: Array<TriggerSource | TriggerSourceEntry>;
  busy: boolean;
  error?: ApiError;
  /**
   * The trailing `meta` carries the ONE id the panel minted for this user
   * action; it is reused when the user retries after a transport failure.
   * Pass it to the client (`command_id` / `request_id`) so retries are
   * idempotent.
   */
  onRevise(changes: AutomationChanges, expectedRevision: number | null, meta?: { command_id: string }): Promise<CommandReceipt>;
  /** `type` is the full command type, e.g. `automation.run_now`. */
  onCommand(type: string, payload?: JsonObject, meta?: { command_id: string }): Promise<CommandReceipt>;
  onDiscuss(index: number, prompt: string, meta?: { request_id: string }): Promise<{ session_id: string; run_id: string }>;
  /** Receives the cursor of the last DISPLAYED attention item. */
  onSeen(attentionCursor: string): Promise<void>;
  onLoadMore(): void;
  onOpenRun(runId: string): void;
  /**
   * `payload` follows the wait's `kind`: `ask_user` → `{response}` (a choice or
   * free text), `tool_approval` → `{approved: true|false}`, `event` → `{payload}`.
   */
  onAnswerWait(runId: string, waitKey: string, payload: JsonObject): Promise<void>;
  /** Id source for the per-action ids (default `crypto.randomUUID`). */
  newId?: () => string;
  /**
   * Required in practice: the shared chat renderer (panel-chat
   * `automationRenderers.renderText`). Without it the panel shows plain text
   * and carries `data-text-rendering="unformatted"`.
   */
  renderText?: RenderText;
  className?: string;
};

export const DISCUSS_LABEL = "Discuss — forked session, read-only workspace";

/**
 * Renders model/user text (occurrence turns, wait prompts, notify and
 * attention bodies, the definition's task). Hosts pass the SHARED chat
 * renderer — panel-chat's `automationRenderers.renderText` (or use
 * `AutomationPanelWithMarkdown`) — so automations read exactly like chats.
 * ui-kit cannot import panel-chat (panel-chat depends on ui-kit).
 */
export type RenderText = (text: string) => React.ReactNode;

/**
 * Fallback when no renderer is passed: escaped plain text, marked
 * `data-unformatted="true"` so a host that forgot the shared renderer notices.
 */
export const plainTextRenderer: RenderText = (text) => (
  <div className="af-auto-text" data-unformatted="true">
    {text}
  </div>
);

function toApiError(e: unknown): ApiError {
  if (isApiError(e)) return e;
  const message = e && typeof e === "object" && "message" in e ? String((e as { message: unknown }).message) : String(e);
  return { status: 0, code: "client_error", message };
}

// --- header ----------------------------------------------------------------------

/**
 * The trigger source this gateway reports for the binding, or why it cannot
 * run: missing from `GET /trigger-sources`, or listed `available:false`.
 */
export function triggerSourceProblem(summary: AutomationSummary, sources: Array<TriggerSource | TriggerSourceEntry>): string | null {
  const t = summary.trigger;
  const src = sources.find((x) => x.id === t.source_id && x.version === t.source_version);
  if (!src) return `This gateway does not list the trigger source ${t.source_id}@${t.source_version}.`;
  if ("available" in src && src.available === false) return `Trigger source ${t.source_id}@${t.source_version} is unavailable${src.unavailable_reason ? `: ${src.unavailable_reason}` : "."}`;
  return null;
}

export function AutomationHeader(props: { summary: AutomationSummary; triggerSources: Array<TriggerSource | TriggerSourceEntry>; titleId?: string }): React.ReactElement {
  const s = props.summary;
  const problem = triggerSourceProblem(s, props.triggerSources);
  const next = s.next_fire_at ? formatUtc(s.next_fire_at) : s.status === "paused" ? "none while paused" : "none scheduled";
  return (
    <header className="af-auto__head">
      <div className="af-auto__titlebar">
        <h2 className="af-auto__title" id={props.titleId} tabIndex={-1}>
          {s.title}
        </h2>
        <span className={`af-auto__status af-auto__status--${s.status}`}>{STATUS_LABELS[s.status] ?? s.status}</span>
        {s.legacy ? <span className="af-auto__legacy">Legacy schedule</span> : null}
      </div>
      <dl className="af-auto__facts">
        <dt>When</dt>
        <dd data-fact="trigger">
          {triggerSummary(s.trigger)}
          {problem ? (
            <span className="af-auto__warn" role="note">
              {" "}
              {problem}
            </span>
          ) : null}
        </dd>
        <dt>Context</dt>
        <dd data-fact="context">{contextLabel(s.context_mode)}</dd>
        <dt>Next run</dt>
        <dd data-fact="next">{next}</dd>
        <dt>Runs</dt>
        <dd data-fact="count">{s.occurrence_count}</dd>
        <dt>Attention</dt>
        <dd data-fact="attention" className={s.attention.unread || s.attention.pending_waits ? "is-notable" : undefined}>
          {attentionLabel(s)}
        </dd>
        {s.revision !== null ? (
          <>
            <dt>Revision</dt>
            <dd data-fact="revision">{s.revision}</dd>
          </>
        ) : null}
      </dl>
    </header>
  );
}

// --- definition ------------------------------------------------------------------

/**
 * The committed definition (`GET /automations/{id}` → `definition`), compact
 * and collapsed: target workflow, trigger config, context, policy (incl.
 * tool approval) and revision.
 */
export function AutomationDefinitionBlock(props: { definition: AutomationDefinition; renderText?: RenderText }): React.ReactElement {
  const d = props.definition;
  const render = props.renderText ?? plainTextRenderer;
  const task = (d.target.input_data as { prompt?: unknown }).prompt;
  const retry = d.policy.retry;
  const approval = d.policy.tool_approval;
  return (
    <details className="af-auto__definition" data-definition-revision={d.revision}>
      <summary>Definition (revision {d.revision})</summary>
      <dl className="af-auto__facts">
        <dt>Target</dt>
        <dd data-def="target">
          <code>{d.target.workflow_id}</code>
        </dd>
        {typeof task === "string" && task ? (
          <>
            <dt>Task</dt>
            <dd data-def="prompt">{render(task)}</dd>
          </>
        ) : null}
        <dt>Trigger</dt>
        <dd data-def="trigger">
          {d.trigger.source_id}@{d.trigger.source_version} · {triggerSummary(d.trigger)}
          <pre className="af-auto__json">{JSON.stringify(d.trigger.config, null, 2)}</pre>
        </dd>
        <dt>Context</dt>
        <dd data-def="context">{contextLabel(d.context.mode)}</dd>
        <dt>Tools</dt>
        <dd data-def="tool_approval">{approval === "ask" ? "Ask before each tool call (ask)" : approval === "auto" ? "Run without asking (auto)" : String(approval)}</dd>
        <dt>Retries</dt>
        <dd data-def="retry">
          {retry.max_attempts} {retry.max_attempts === 1 ? "attempt" : "attempts"}, backoff {retry.backoff.initial} ×{retry.backoff.factor} up to {retry.backoff.max}
        </dd>
        <dt>Revision</dt>
        <dd data-def="revision">{d.revision}</dd>
      </dl>
    </details>
  );
}

// --- controls ----------------------------------------------------------------------

export type AutomationControlsBarProps = {
  summary: AutomationSummary;
  occurrences: OccurrenceRow[];
  busy: boolean;
  confirmingArchive: boolean;
  reviseOpen: boolean;
  onCommand(type: string): void;
  onToggleRevise(): void;
  onAskArchive(): void;
  onCancelArchive(): void;
  /** Prefix for the ids of the visible "why disabled" texts. */
  idBase?: string;
};

const CONTROL_LABELS: Record<ControlId, string> = {
  pause: "Pause",
  resume: "Resume",
  run_now: "Run now",
  stop_current: "Stop current",
  revise: "Revise",
  archive: "Archive",
  discuss: "Discuss",
};

/**
 * Visible reasons for disabled controls, one line per distinct reason
 * ("Run now, Stop current: Nothing is running."), each with an id the
 * disabled buttons reference through `aria-describedby`.
 */
export function disabledReasons(controls: Record<ControlId, ControlState>, shown: ControlId[], idBase: string): { lines: Array<{ id: string; text: string }>; describedBy: Partial<Record<ControlId, string>> } {
  const byReason = new Map<string, ControlId[]>();
  for (const id of shown) {
    const st = controls[id];
    if (st.enabled) continue;
    const reason = st.reason ?? "Not available now.";
    byReason.set(reason, [...(byReason.get(reason) ?? []), id]);
  }
  const lines: Array<{ id: string; text: string }> = [];
  const describedBy: Partial<Record<ControlId, string>> = {};
  [...byReason.entries()].forEach(([reason, ids], i) => {
    const id = `${idBase}-why-${i}`;
    lines.push({ id, text: `${ids.map((c) => CONTROL_LABELS[c]).join(", ")}: ${reason}` });
    for (const c of ids) describedBy[c] = id;
  });
  return { lines, describedBy };
}

export function AutomationControlsBar(p: AutomationControlsBarProps): React.ReactElement {
  const c = automationControls(p.summary, p.occurrences, p.busy);
  const shown: ControlId[] = [p.summary.status === "paused" ? "resume" : "pause", "run_now", "stop_current", "revise", "archive"];
  const why = disabledReasons(c, shown, p.idBase ?? `af-auto-${p.summary.automation_id}`);
  const btn = (id: ControlId, label: string, onClick: () => void, extra?: { pressed?: boolean; danger?: boolean }) => (
    <button
      key={id}
      type="button"
      className={`af-auto__btn${extra?.danger ? " af-auto__btn--danger" : ""}`}
      data-action={id}
      disabled={!c[id].enabled}
      aria-describedby={why.describedBy[id]}
      aria-pressed={extra?.pressed}
      onClick={onClick}
    >
      {label}
    </button>
  );
  return (
    <div className="af-auto__controls-wrap">
      <div className="af-auto__controls" role="toolbar" aria-label="Automation controls">
        {p.summary.status === "paused"
          ? btn("resume", "Resume", () => p.onCommand(CONTROL_COMMANDS.resume))
          : btn("pause", "Pause", () => p.onCommand(CONTROL_COMMANDS.pause))}
        {btn("run_now", "Run now", () => p.onCommand(CONTROL_COMMANDS.run_now))}
        {btn("stop_current", "Stop current", () => p.onCommand(CONTROL_COMMANDS.stop_current))}
        {btn("revise", "Revise…", p.onToggleRevise, { pressed: p.reviseOpen })}
        {btn("archive", "Archive…", p.onAskArchive, { danger: true })}
      </div>
      {why.lines.length ? (
        <p className="af-auto__reasons">
          {why.lines.map((l) => (
            <span key={l.id} id={l.id}>
              {l.text}
            </span>
          ))}
        </p>
      ) : null}
      {p.summary.status === "paused" && c.run_now.enabled ? (
        <p className="af-auto__hint">Paused: scheduled runs are skipped. Run now works and keeps it paused.</p>
      ) : null}
      {p.confirmingArchive ? (
        <div className="af-auto__confirm" role="group" aria-label="Confirm archive">
          <p>
            Archive “{p.summary.title}”? Its history stays readable; it will not run again. The current run, if any, finishes.
          </p>
          <div className="af-auto__row">
            <button type="button" className="af-auto__btn af-auto__btn--danger" data-action="archive-confirm" disabled={!c.archive.enabled} onClick={() => p.onCommand(CONTROL_COMMANDS.archive)}>
              Archive
            </button>
            <button type="button" className="af-auto__btn" data-action="archive-cancel" onClick={p.onCancelArchive}>
              Keep it
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

// --- revise ------------------------------------------------------------------------

const UNIT_OPTIONS: Array<[string, string]> = [
  ["m", "minutes"],
  ["h", "hours"],
  ["d", "days"],
];

/** Read the revise form's fields (uncontrolled inputs) into a `ReviseForm`. */
export function readReviseForm(form: { elements: { namedItem(name: string): unknown } }, fallback: ReviseForm): ReviseForm {
  const val = (name: string): string | null => {
    const el = form.elements.namedItem(name) as { value?: string } | null;
    return el && typeof el.value === "string" ? el.value : null;
  };
  const amount = val("every_amount");
  const unit = val("every_unit");
  const every = amount !== null && unit !== null ? `${amount.trim()}${unit}` : fallback.every;
  const ctx = form.elements.namedItem("context") as { value?: string } | null;
  const context = (ctx && (ctx.value === "growing" || ctx.value === "independent") ? ctx.value : fallback.context) as ContextMode;
  return { title: val("title") ?? fallback.title, every, context };
}

export type AutomationReviseFormProps = {
  summary: AutomationSummary;
  busy: boolean;
  errors: string[];
  onSubmit(form: ReviseForm): void;
  onCancel(): void;
};

export function AutomationReviseForm(p: AutomationReviseFormProps): React.ReactElement {
  const initial = reviseFormFrom(p.summary);
  const d = initial.every ? parseDuration(initial.every) : null;
  const units = d && d.unit === "s" ? [["s", "seconds"] as [string, string], ...UNIT_OPTIONS] : UNIT_OPTIONS;
  const base = `af-auto-revise-${p.summary.automation_id}`;
  return (
    <form
      className="af-auto__revise"
      aria-label="Revise automation"
      onSubmit={(e) => {
        e.preventDefault();
        p.onSubmit(readReviseForm(e.currentTarget, initial));
      }}
    >
      <label className="af-auto__field" htmlFor={`${base}-title`}>
        <span>Title</span>
        <input id={`${base}-title`} name="title" defaultValue={initial.title} maxLength={120} required />
      </label>
      {d ? (
        <fieldset className="af-auto__field">
          <legend>Repeat every (UTC)</legend>
          <div className="af-auto__row">
            <input name="every_amount" type="number" min={1} step={1} defaultValue={d.amount} aria-label="Interval amount" />
            <select name="every_unit" defaultValue={d.unit} aria-label="Interval unit">
              {units.map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </div>
        </fieldset>
      ) : (
        <p className="af-auto__hint">This trigger has no interval to revise.</p>
      )}
      <fieldset className="af-auto__field">
        <legend>Context</legend>
        <label>
          <input type="radio" name="context" value="independent" defaultChecked={initial.context === "independent"} /> Independent — each run starts fresh
        </label>
        <label>
          <input type="radio" name="context" value="growing" defaultChecked={initial.context === "growing"} /> Growing — each run sees the previous runs
        </label>
      </fieldset>
      <p className="af-auto__hint">Changes apply from the next run; a new interval never fires past ticks.</p>
      {p.errors.length ? (
        <ul className="af-auto__form-errors" role="alert">
          {p.errors.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      ) : null}
      <div className="af-auto__row">
        <button type="submit" className="af-auto__btn af-auto__btn--primary" data-action="revise-submit" disabled={p.busy}>
          Save revision
        </button>
        <button type="button" className="af-auto__btn" data-action="revise-cancel" onClick={p.onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}

// --- occurrences -----------------------------------------------------------------

export type OccurrencePairProps = {
  view: OccurrenceView;
  busy: boolean;
  /** `automationControls(...).discuss` — the capability / legacy gate. */
  discuss: ControlState;
  discussOpen: boolean;
  onOpenRun(runId: string): void;
  onAnswerWait(runId: string, waitKey: string, payload: JsonObject): void;
  /** An answer the panel could not send (e.g. an `event` payload that is not JSON). */
  onWaitError?(message: string): void;
  onDiscussOpen(index: number): void;
  onDiscussCancel(): void;
  onDiscussSubmit(index: number, prompt: string): void;
  renderText?: RenderText;
};

function fieldValue(form: HTMLFormElement, name: string): string {
  const el = form.elements.namedItem(name) as { value?: string } | null;
  return el && typeof el.value === "string" ? el.value.trim() : "";
}

export type WaitAnswerFormProps = {
  wait: OccurrenceWait;
  busy: boolean;
  idBase: string;
  onAnswerWait(runId: string, waitKey: string, payload: JsonObject): void;
  onWaitError?(message: string): void;
  renderText?: RenderText;
};

/**
 * One typed wait (decision D1). The answer payload follows `wait.kind`, never
 * the prompt text: `ask_user` → `{response}`, `tool_approval` →
 * `{approved}`, `event` → `{payload}`. An unknown kind is shown, not answered.
 */
export function WaitAnswerForm(p: WaitAnswerFormProps): React.ReactElement {
  const w = p.wait;
  const promptId = `${p.idBase}-${w.run_id}-${w.wait_key}-prompt`;
  const answer = (payload: JsonObject) => p.onAnswerWait(w.run_id, w.wait_key, payload);
  const render = p.renderText ?? plainTextRenderer;
  const head = (fallback: string) => (
    <div className="af-auto-wait__prompt" id={promptId}>
      <span className="af-auto-wait__kind">{WAIT_KIND_LABELS[w.kind] ?? "Waiting"}</span>
      {w.prompt ? render(w.prompt) : <span> {fallback}</span>}
    </div>
  );
  if (w.kind === "tool_approval") {
    const calls = waitToolCalls(w);
    return (
      <div className="af-auto-wait af-auto-wait--tool_approval" role="group" data-wait-key={w.wait_key} data-wait-kind={w.kind} aria-labelledby={promptId}>
        {head("A tool call needs your approval.")}
        {calls && calls.length ? (
          <ul className="af-auto-wait__calls" aria-label="Tool calls to approve">
            {calls.map((c, i) => (
              <li key={c.call_id ?? `${c.name}:${i}`} data-tool={c.name}>
                <code className="af-auto-wait__tool">{c.name}</code>
                <pre className="af-auto-wait__args">{JSON.stringify(c.arguments, null, 2)}</pre>
              </li>
            ))}
          </ul>
        ) : (
          <p className="af-auto__hint">The gateway did not list the tool calls; open the run to see them before approving.</p>
        )}
        <div className="af-auto__row">
          <button type="button" className="af-auto__btn af-auto__btn--primary" data-action="wait-approve" disabled={p.busy} onClick={() => answer({ approved: true })}>
            Approve
          </button>
          <button type="button" className="af-auto__btn af-auto__btn--danger" data-action="wait-deny" disabled={p.busy} onClick={() => answer({ approved: false })}>
            Deny
          </button>
        </div>
      </div>
    );
  }
  if (w.kind === "event") {
    return (
      <form
        className="af-auto-wait af-auto-wait--event"
        data-wait-key={w.wait_key}
        data-wait-kind={w.kind}
        aria-labelledby={promptId}
        onSubmit={(e) => {
          e.preventDefault();
          const parsed = parseEventPayload(fieldValue(e.currentTarget, "payload"));
          if (parsed.ok) answer({ payload: parsed.payload });
          else p.onWaitError?.(parsed.error);
        }}
      >
        {head("The run waits for an event.")}
        <textarea name="payload" rows={3} aria-label="Event payload (JSON)" placeholder='{"key": "value"}' disabled={p.busy} />
        <div className="af-auto__row">
          <button type="submit" className="af-auto__btn af-auto__btn--primary" data-action="wait-send-event" disabled={p.busy}>
            Send event
          </button>
        </div>
      </form>
    );
  }
  if (w.kind === "ask_user") {
    return (
      <form
        className="af-auto-wait af-auto-wait--ask_user"
        data-wait-key={w.wait_key}
        data-wait-kind={w.kind}
        aria-labelledby={promptId}
        onSubmit={(e) => {
          e.preventDefault();
          const v = fieldValue(e.currentTarget, "response");
          if (v) answer({ response: v });
        }}
      >
        {head("The run is waiting for your input.")}
        {w.choices && w.choices.length ? (
          <div className="af-auto__row" role="group" aria-label="Choices">
            {w.choices.map((c) => (
              <button key={c} type="button" className="af-auto__btn" data-action="wait-choice" disabled={p.busy} onClick={() => answer({ response: c })}>
                {c}
              </button>
            ))}
          </div>
        ) : null}
        <div className="af-auto__row">
          <input name="response" aria-label="Your answer" placeholder="Your answer" disabled={p.busy} />
          <button type="submit" className="af-auto__btn af-auto__btn--primary" data-action="wait-answer" disabled={p.busy}>
            Answer
          </button>
        </div>
      </form>
    );
  }
  return (
    <div className="af-auto-wait" role="group" data-wait-key={w.wait_key} data-wait-kind={String(w.kind)} aria-labelledby={promptId}>
      {head("The run is waiting.")}
      <p className="af-auto__hint">This kind of wait ({String(w.kind)}) cannot be answered here; open the run.</p>
    </div>
  );
}

export function OccurrencePair(p: OccurrencePairProps): React.ReactElement {
  const { row, tone, badge, statusText } = p.view;
  const idBase = `af-auto-occ-${row.run_id}`;
  const render = p.renderText ?? plainTextRenderer;
  const discussOk = p.discuss.enabled && p.view.canDiscuss && !p.busy;
  const discussWhy = !p.discuss.enabled ? p.discuss.reason ?? "Not available." : !p.view.canDiscuss ? "Available once this occurrence finishes." : null;
  const empty =
    tone === "failed" ? (row.failure ? "No answer." : "No answer: the run failed.") : tone === "waiting" ? "Waiting for your answer." : tone === "running" ? "Running…" : "No answer.";
  return (
    <li className={`af-auto-occ af-auto-occ--${tone}`} data-index={row.index} data-tone={tone} aria-labelledby={`${idBase}-h`}>
      <div className="af-auto-turn af-auto-turn--trigger" data-turn="trigger">
        <div className="af-auto-turn__meta" id={`${idBase}-h`}>
          <span className="af-auto-turn__index">#{row.index}</span> · {row.trigger.summary} · fired {formatUtc(row.fired_at)}
        </div>
        <div className="af-auto-turn__text">{render(row.user_turn)}</div>
      </div>
      <div className="af-auto-turn af-auto-turn--answer" data-turn="answer">
        <div className="af-auto-turn__meta">
          {badge ? <span className={`af-auto-badge af-auto-badge--${tone}`}>{badge}</span> : null}
          <span className="af-auto-turn__status">{statusText}</span>
          {row.finished_at ? <span> · {formatUtc(row.finished_at)}</span> : null}
        </div>
        {row.notify ? (
          <div className="af-auto-notify" data-notify="true">
            <strong>{row.notify.title}</strong>
            {row.notify.body ? <div className="af-auto-notify__body">{render(row.notify.body)}</div> : null}
          </div>
        ) : null}
        {row.failure ? (
          <div className="af-auto-failure" data-failure={row.failure.reason_code}>
            <strong>{row.failure.reason_code}</strong>: {row.failure.message}{" "}
            <span className="af-auto-turn__muted">
              (after {row.failure.attempts} {row.failure.attempts === 1 ? "attempt" : "attempts"})
            </span>
          </div>
        ) : null}
        {row.answer ? <div className="af-auto-turn__text">{render(row.answer)}</div> : <div className="af-auto-turn__empty">{empty}</div>}
        {row.artifacts.length ? (
          <ul className="af-auto-artifacts" aria-label="Artifacts">
            {row.artifacts.map((a) => (
              <li key={a.artifact_id}>
                <a href={a.url} target="_blank" rel="noopener noreferrer">
                  {a.name}
                </a>{" "}
                <span className="af-auto-turn__muted">{a.mime_type}</span>
              </li>
            ))}
          </ul>
        ) : null}
        {row.waits.map((w) => (
          <WaitAnswerForm key={`${w.run_id}:${w.wait_key}`} wait={w} busy={p.busy} idBase={idBase} onAnswerWait={p.onAnswerWait} onWaitError={p.onWaitError} renderText={p.renderText} />
        ))}
      </div>
      <div className="af-auto-occ__foot">
        <details className="af-auto-occ__details">
          <summary>Run details</summary>
          <dl className="af-auto__facts">
            <dt>Run</dt>
            <dd>
              <code>{row.run_id}</code>
            </dd>
            <dt>Attempts</dt>
            <dd>{row.attempts}</dd>
          </dl>
          <div className="af-auto__row">
            <button type="button" className="af-auto__btn" data-action="open-run" onClick={() => p.onOpenRun(row.run_id)}>
              Open run ledger
            </button>
            <a className="af-auto__link" href={row.ledger_url} target="_blank" rel="noopener noreferrer">
              Ledger (JSON)
            </a>
            {row.workspace_url ? (
              <a className="af-auto__link" href={row.workspace_url} target="_blank" rel="noopener noreferrer">
                Workspace
              </a>
            ) : null}
          </div>
        </details>
        {p.discussOpen ? (
          <form
            className="af-auto-discuss"
            aria-label={`${DISCUSS_LABEL}, from occurrence ${row.index}`}
            onSubmit={(e) => {
              e.preventDefault();
              const v = fieldValue(e.currentTarget, "prompt");
              if (v) p.onDiscussSubmit(row.index, v);
            }}
          >
            <p className="af-auto__hint">
              Starts a new session seeded with this automation's conversation up to #{row.index}. It never changes the automation; the workspace is mounted read-only.
            </p>
            <textarea name="prompt" rows={3} aria-label="Your message" placeholder="Ask about this result…" required />
            <div className="af-auto__row">
              <button type="submit" className="af-auto__btn af-auto__btn--primary" data-action="discuss-submit" disabled={p.busy}>
                Start discussion
              </button>
              <button type="button" className="af-auto__btn" data-action="discuss-cancel" onClick={p.onDiscussCancel}>
                Cancel
              </button>
            </div>
          </form>
        ) : (
          <>
            <button
              type="button"
              className="af-auto__btn af-auto__btn--quiet"
              data-action="discuss"
              disabled={!discussOk}
              aria-describedby={discussWhy ? `${idBase}-discuss-why` : undefined}
              onClick={() => p.onDiscussOpen(row.index)}
            >
              {DISCUSS_LABEL}
            </button>
            {discussWhy ? (
              <span className="af-auto__reasons" id={`${idBase}-discuss-why`}>
                {discussWhy}
              </span>
            ) : null}
          </>
        )}
      </div>
    </li>
  );
}

// --- the panel ---------------------------------------------------------------------

export function AutomationPanel(props: AutomationPanelProps): React.ReactElement {
  const { summary, busy } = props;
  const render = props.renderText ?? plainTextRenderer;
  const titleId = useId();
  const rootRef = useRef<HTMLElement | null>(null);
  const [reviseOpen, setReviseOpen] = useState(false);
  const [reviseErrors, setReviseErrors] = useState<string[]>([]);
  const [confirmingArchive, setConfirmingArchive] = useState(false);
  const [discussAt, setDiscussAt] = useState<number | null>(null);
  const [localError, setLocalError] = useState<ApiError | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  // Where focus goes once a form or confirmation closes (its focused control
  // unmounts): the control that opened it, else the notice, else the title.
  const [focusAfter, setFocusAfter] = useState<string[] | null>(null);
  useEffect(() => {
    if (!focusAfter) return;
    pickFocusTarget(rootRef.current, [...focusAfter, ".af-auto__notice", ".af-auto__title"])?.focus();
    setFocusAfter(null);
  }, [focusAfter]);

  // ONE id per user action, reused when the same action is retried after a
  // transport failure (see ActionIds).
  const idsRef = useRef<ActionIds | null>(null);
  if (!idsRef.current) idsRef.current = new ActionIds(props.newId ?? mintUuid);
  const ids = idsRef.current;

  const report = (e: unknown) => setLocalError(toApiError(e));
  const act = <T,>(signature: string, run: (id: string) => Promise<T>, done: (value: T) => void) => {
    setLocalError(null);
    setNotice(null);
    run(ids.idFor(signature)).then(
      (value) => {
        ids.settle(signature, { ok: true });
        done(value);
      },
      (error) => {
        ids.settle(signature, { ok: false, error });
        report(error);
      },
    );
  };

  // Acknowledge the attention items this panel displays: the LAST displayed
  // item's cursor, recorded only once `/seen` succeeded; a failure is retried
  // on the next render that brings a new summary.
  const ack = attentionAckCursor(summary);
  const onSeenRef = useRef(props.onSeen);
  onSeenRef.current = props.onSeen;
  const seenRef = useRef<SeenAckTracker | null>(null);
  if (!seenRef.current) seenRef.current = new SeenAckTracker();
  useEffect(() => {
    const tracker = seenRef.current as SeenAckTracker;
    const key = ack ? `${summary.automation_id}|${ack}` : null;
    if (!ack || !tracker.next(key, summary)) return;
    const token = summary;
    onSeenRef.current(ack).then(
      () => tracker.succeeded(key as string),
      (e) => {
        tracker.failed(key as string, token);
        report(e);
      },
    );
  });

  const controls = automationControls(summary, props.occurrences, busy);
  const views = occurrenceViews(props.occurrences);
  const more = summary.occurrence_count - props.occurrences.length;
  const shownError = localError ?? props.error ?? null;
  const errText = shownError ? apiErrorText(shownError) : null;
  const att = summary.attention;

  return (
    <section ref={rootRef} className={`af-auto${props.className ? ` ${props.className}` : ""}`} aria-labelledby={titleId} aria-busy={busy} data-text-rendering={props.renderText ? "rich" : "unformatted"}>
      <AutomationHeader summary={summary} triggerSources={props.triggerSources} titleId={titleId} />
      {props.definition ? <AutomationDefinitionBlock definition={props.definition} renderText={render} /> : null}
      <AutomationControlsBar
        summary={summary}
        occurrences={props.occurrences}
        busy={busy}
        confirmingArchive={confirmingArchive}
        reviseOpen={reviseOpen}
        idBase={`${titleId}-ctl`}
        onCommand={(type) =>
          act(`command:${type}`, (command_id) => props.onCommand(type, undefined, { command_id }), () => {
            if (type === CONTROL_COMMANDS.archive) {
              setConfirmingArchive(false);
              setNotice("Archive requested.");
              setFocusAfter(['[data-action="archive"]']);
            } else setNotice("Command sent.");
          })
        }
        onToggleRevise={() => {
          setReviseErrors([]);
          setReviseOpen(!reviseOpen);
        }}
        onAskArchive={() => setConfirmingArchive(true)}
        onCancelArchive={() => {
          setConfirmingArchive(false);
          setFocusAfter(['[data-action="archive"]']);
        }}
      />
      {reviseOpen ? (
        <AutomationReviseForm
          summary={summary}
          busy={busy}
          errors={reviseErrors}
          onCancel={() => {
            setReviseOpen(false);
            setFocusAfter(['[data-action="revise"]']);
          }}
          onSubmit={(form) => {
            const changes = reviseChanges(summary, form);
            if (changes === null) {
              setReviseErrors(["Nothing changed."]);
              return;
            }
            if ("errors" in changes) {
              setReviseErrors(changes.errors as string[]);
              return;
            }
            setReviseErrors([]);
            act(`revise:${summary.revision}:${JSON.stringify(changes)}`, (command_id) => props.onRevise(changes, summary.revision, { command_id }), () => {
              setNotice("Revision sent; it applies from the next run.");
              setReviseOpen(false);
              setFocusAfter(['[data-action="revise"]']);
            });
          }}
        />
      ) : null}
      {errText ? (
        <div className="af-auto__error" role="alert" data-code={shownError?.code}>
          <strong>{errText.title}</strong> <span>{errText.detail}</span>
        </div>
      ) : null}
      {notice ? (
        <div className="af-auto__notice" role="status" tabIndex={-1}>
          {notice}
        </div>
      ) : null}
      {att.items.length || att.waits.length ? (
        <section className="af-auto__attention" aria-label="Needs attention">
          <ul>
            {att.items.map((it) => (
              <li key={it.cursor} className={`af-auto__attention-item af-auto__attention-item--${it.kind}`} data-cursor={it.cursor}>
                <span className={`af-auto-badge af-auto-badge--${it.kind === "failure" ? "failed" : "notified"}`}>{it.kind === "failure" ? "Failed" : "Notified"}</span>{" "}
                <strong>{it.title}</strong> <span className="af-auto-turn__muted">#{it.index} · {formatUtc(it.at)}</span>
                {it.body ? <div className="af-auto__attention-body">{render(it.body)}</div> : null}
              </li>
            ))}
            {att.waits.map((w) => (
              <li key={`${w.run_id}:${w.wait_key}`} className="af-auto__attention-item af-auto__attention-item--wait">
                <span className="af-auto-badge af-auto-badge--waiting" data-wait-kind={w.kind}>
                  {WAIT_KIND_LABELS[w.kind] ?? "Waiting for you"}
                </span>{" "}
                <span className="af-auto-turn__muted">#{w.index}</span>
                {w.prompt ? <div className="af-auto__attention-body">{render(w.prompt)}</div> : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {more > 0 ? (
        <button type="button" className="af-auto__btn af-auto__more" data-action="load-more" disabled={busy} onClick={props.onLoadMore}>
          Load earlier occurrences ({more} more)
        </button>
      ) : null}
      {views.length ? (
        <ol className="af-auto__timeline" aria-label="Occurrences">
          {views.map((v) => {
            const rowSel = `[data-index="${v.row.index}"]`;
            return (
              <OccurrencePair
                key={v.row.run_id}
                view={v}
                busy={busy}
                discuss={controls.discuss}
                renderText={render}
                discussOpen={discussAt === v.row.index}
                onOpenRun={props.onOpenRun}
                onAnswerWait={(runId, waitKey, payload) => {
                  setLocalError(null);
                  props.onAnswerWait(runId, waitKey, payload).then(() => setNotice("Answer sent."), report);
                }}
                onWaitError={(message) => setLocalError({ status: 0, code: "invalid_payload", message })}
                onDiscussOpen={setDiscussAt}
                onDiscussCancel={() => {
                  setDiscussAt(null);
                  setFocusAfter([`${rowSel} [data-action="discuss"]`]);
                }}
                onDiscussSubmit={(index, prompt) =>
                  act(`discuss:${index}:${prompt}`, (request_id) => props.onDiscuss(index, prompt, { request_id }), (r) => {
                    setDiscussAt(null);
                    setNotice(`Discussion started (session ${r.session_id}).`);
                    setFocusAfter([`${rowSel} [data-action="discuss"]`]);
                  })
                }
              />
            );
          })}
        </ol>
      ) : (
        <p className="af-auto__empty">No occurrences yet.</p>
      )}
    </section>
  );
}

export default AutomationPanel;
