// AutomationPanel — one automation, rendered from server truth (contract G).
//
// Controlled: the host fetches (see ./client.ts) and passes the summary, the
// occurrences and `busy`; the panel forwards intent through the callbacks and
// holds only view state (which form is open; the Edit form can also be
// driven by the host through `editOpen` / `onEditOpenChange`). Occurrences read as a chat: a
// trigger/task turn and an answer turn per occurrence. Quiet ticks stay visible
// but subdued; failures, human waits and explicit `notify` are prominent.
//
// The pieces below the panel (header, controls bar, revise form, occurrence
// pair) are hook-free so scripts/check_automation_panel.mjs can render them in
// any state and invoke their handlers without a DOM.
import React, { useEffect, useId, useRef, useState } from "react";
import { Icon, type IconName } from "../icon.js";
import { AfSwitch } from "../af_switch.js";
import { AfEmailSetupNotice } from "./email_fields.js";
import controlsSpec from "./automation_controls.json" with { type: "json" };
import {
  apiErrorText,
  attentionAckCursor,
  attentionLabel,
  automationControls,
  ActionIds,
  CONTROL_COMMANDS,
  contextLabel,
  EMAIL_TEXT,
  emailRecipientsLabel,
  emailUsable,
  isEmailTrigger,
  notifyLabel,
  formatUtc,
  isApiError,
  currentOccurrenceLabel,
  relativeIn,
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
  activeToggleCommand,
  type ControlId,
  type ControlState,
  type OccurrenceView,
  type ReviseDefinition,
  type ReviseForm,
} from "./panel_core.js";
import type {
  ApiError,
  AutomationChanges,
  AutomationDefinition,
  AutomationStatus,
  AutomationSummary,
  CommandReceipt,
  ContextMode,
  JsonObject,
  MyEmailStatus,
  OccurrenceRow,
  OccurrenceWait,
  TriggerSourceEntry,
  TriggerSource,
  ToolApprovalPolicy,
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
  onDiscuss(index: number, prompt: string, meta?: { request_id: string }): Promise<{ session_id: string; run_id: string; workspace_root?: string; mounted_workspace?: string }>;
  /** Receives the cursor of the last DISPLAYED attention item. */
  onSeen(attentionCursor: string): Promise<void>;
  onLoadMore(): void;
  onOpenRun(runId: string): void;
  /**
   * `payload` follows the wait's `kind`: `ask_user` → `{response}` (a choice or
   * free text), `tool_approval` → `{approved: true|false}`, `event` → `{payload}`.
   */
  onAnswerWait(runId: string, waitKey: string, payload: JsonObject): Promise<void>;
  /** Id source for the per-action ids (default `randomId()`: crypto.randomUUID, else getRandomValues). */
  newId?: () => string;
  /**
   * Required in practice: the shared chat renderer (panel-chat
   * `automationRenderers.renderText`). Without it the panel shows plain text
   * and carries `data-text-rendering="unformatted"`.
   */
  renderText?: RenderText;
  /**
   * Renders one occurrence turn (trigger or answer) as a chat message. Hosts
   * pass the SHARED chat card — panel-chat `automationRenderers.renderTurn`
   * (or use `AutomationPanelWithMarkdown`) — so an automation's transcript
   * reads exactly like a chat. Without it the turn's text goes through
   * `renderText`.
   */
  renderTurn?: RenderTurn;
  /**
   * Opens a run's folder (the host's workspace browser; a local app may open
   * it in the file manager). Called with the automation id (= its controller
   * run) from the header's Workspace fact, and with an occurrence's run id
   * from its run details. Without it no folder control is shown: a bare link
   * to the JSON route carries no bearer token and shows no files.
   */
  onOpenWorkspace?(runId: string): void;
  /**
   * Opens a file the gateway links in its data — a run's ledger JSON, an
   * artifact — through the host's credentials (panel-chat
   * `openGatewayResource(fetchGateway, resource.url, …)`, or
   * `AutomationPanelWithMarkdown`'s `fetchGateway`). The panel never renders
   * those server URLs as raw links (they are rooted at the gateway and would
   * bypass the app's session and proxy); without this prop artifacts show as
   * plain names and there is no ledger JSON link. A rejection is shown as
   * the panel's error.
   */
  onOpenResource?(resource: GatewayResource): Promise<void> | void;
  /** Clock for "next in …" (ms since epoch); default `Date.now()`. */
  nowMs?: number;
  /**
   * Controlled Edit form. When `editOpen` is given the panel shows its Edit
   * form exactly when it is `true` (a host's own "Edit" control can open it
   * directly) and asks for changes through `onEditOpenChange` — the panel's
   * Edit button asks `true`, Cancel and a successful save ask `false`.
   * Opening the form focuses its first field. Omit both and the panel keeps
   * this state itself (the Edit button toggles the form).
   */
  editOpen?: boolean;
  onEditOpenChange?(open: boolean): void;
  /**
   * `GET /api/gateway/me/email` (the client's `getMyEmail()`): the Edit form
   * offers "Email me the result" and allowed recipients only when the account
   * is usable (an option already on can still be turned off); otherwise it
   * shows "Email isn't set up — open My email".
   */
  emailStatus?: MyEmailStatus | null;
  onOpenMyEmail?: () => void;
  className?: string;
};

/** Icon shown AFTER each state word ("Active ▶", "Paused ⏸"; operator 2026-09-28). */
export const STATUS_ICONS: Record<AutomationStatus, IconName> = {
  active: "play",
  paused: "pause",
  completed: "check",
  failed: "error",
  archived: "archive",
};

/**
 * An automation's state as WORD then ICON — the one rendering every client
 * uses. The word is the accessible text; the icon is decorative. A state
 * this kit does not know shows its raw value and no icon.
 */
export function AutomationStateLabel(props: { status: AutomationStatus | string; className?: string; iconSize?: number }): React.ReactElement {
  const status = String(props.status);
  const icon = (STATUS_ICONS as Record<string, IconName | undefined>)[status];
  return (
    <span className={`af-auto__status af-auto__status--${status}${props.className ? ` ${props.className}` : ""}`} data-state={status}>
      <span className="af-auto__status-word">{STATUS_LABELS[status] ?? status}</span>
      {icon ? <Icon name={icon} size={props.iconSize ?? 11} className="af-auto__status-icon" /> : null}
    </span>
  );
}

/** A file the gateway links in its data, handed to `onOpenResource`. `url` is the server's string, gateway-rooted (map it with ui-kit `gatewayResourcePath`). */
export type GatewayResource = {
  kind: "ledger" | "artifact";
  url: string;
  /** File name to save it under ("run-<id>-ledger.json", the artifact's name). */
  name: string;
  /** The artifact's declared type (artifacts only). */
  mimeType?: string;
  runId: string;
};

/** One occurrence turn handed to `renderTurn`. */
export type AutomationTurn = {
  /** `trigger`: the message the trigger sent (role user); `answer`: the run's reply (role assistant). */
  kind: "trigger" | "answer";
  role: "user" | "assistant";
  text: string;
  /** The occurrence index (#N) and its run. */
  index: number;
  runId: string;
};

export type RenderTurn = (turn: AutomationTurn) => React.ReactNode;

export const DISCUSS_LABEL = "Discuss — fork at this occurrence (own workspace, automation files read-only)";

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
 * A long path that wraps at its separators ("/", "-", "_") instead of mid-word
 * or off the edge: the text is unchanged (copy/paste gives the exact path).
 */
export function WrappingPath(props: { path: string }): React.ReactElement {
  const parts = props.path.split(/(?<=[/\\_-])/);
  return (
    <code className="af-auto__path-text">
      {parts.map((part, i) => (
        <React.Fragment key={i}>
          {part}
          {i < parts.length - 1 ? <wbr /> : null}
        </React.Fragment>
      ))}
    </code>
  );
}

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

export function AutomationHeader(props: {
  summary: AutomationSummary;
  triggerSources: Array<TriggerSource | TriggerSourceEntry>;
  titleId?: string;
  nowMs?: number;
  onOpenWorkspace?(runId: string): void;
}): React.ReactElement {
  const s = props.summary;
  const current = currentOccurrenceLabel(s);
  const problem = triggerSourceProblem(s, props.triggerSources);
  const next = s.next_fire_at
    ? `${formatUtc(s.next_fire_at)} (${relativeIn(s.next_fire_at, props.nowMs ?? Date.now())})`
    : s.status === "paused"
      ? "none while paused"
      : "none scheduled";
  return (
    <header className="af-auto__head">
      <div className="af-auto__titlebar">
        <h2 className="af-auto__title" id={props.titleId} tabIndex={-1}>
          {s.title}
        </h2>
        <AutomationStateLabel status={s.status} />
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
        {current ? (
          <>
            <dt>Now</dt>
            <dd data-fact="current" className="is-notable">
              {current}
            </dd>
          </>
        ) : null}
        <dt>Next run</dt>
        <dd data-fact="next">{next}</dd>
        <dt>Runs</dt>
        <dd data-fact="count">{s.occurrence_count}</dd>
        {s.workspace_root ? (
          <>
            <dt>Workspace</dt>
            <dd data-fact="workspace" className="af-auto__workspace">
              {props.onOpenWorkspace ? (
                <button
                  type="button"
                  className="af-auto__path"
                  data-action="open-workspace"
                  title={`Browse the automation's folder\n${s.workspace_root}`}
                  aria-label={`Browse the automation's folder ${s.workspace_root}`}
                  onClick={() => props.onOpenWorkspace?.(s.automation_id)}
                >
                  <Icon name="folder" size={14} className="af-auto__path-icon" />
                  <WrappingPath path={s.workspace_root} />
                </button>
              ) : (
                <span className="af-auto__path af-auto__path--static">
                  <Icon name="folder" size={14} className="af-auto__path-icon" />
                  <WrappingPath path={s.workspace_root} />
                </span>
              )}
            </dd>
          </>
        ) : null}
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
 * The committed definition (`GET /automations/{id}` → `definition`) as a
 * card right under the controls, collapsed by default (`open` to start
 * expanded): target workflow, task, trigger config, context, policy (incl.
 * tool approval) and revision.
 */
export function AutomationDefinitionBlock(props: { definition: AutomationDefinition; renderText?: RenderText; open?: boolean }): React.ReactElement {
  const d = props.definition;
  const render = props.renderText ?? plainTextRenderer;
  const task = (d.target.input_data as { prompt?: unknown }).prompt;
  const retry = d.policy.retry;
  const approval = d.policy.tool_approval;
  return (
    <details className="af-auto__definition" data-definition-revision={d.revision} open={props.open}>
      <summary>
        <Icon name="chevronRight" size={14} className="af-auto__definition-chevron" />
        <Icon name="file" size={14} />
        <span className="af-auto__definition-title">Definition</span>
        <span className="af-auto__definition-meta">revision {d.revision}</span>
      </summary>
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
        <dt>Notify</dt>
        <dd data-def="notify">{notifyLabel(d.notify)}</dd>
        <dt>May email</dt>
        <dd data-def="email_allowed_recipients">{emailRecipientsLabel(d.policy.email_allowed_recipients)}</dd>
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
  /** The Edit form is open (the Edit button reads pressed). */
  reviseOpen: boolean;
  onCommand(type: string): void;
  /** The Edit button. */
  onToggleRevise(): void;
  onAskArchive(): void;
  onCancelArchive(): void;
  /** Feedback on the last action, shown next to the buttons until dismissed. */
  notice?: string | null;
  onDismissNotice?(): void;
  /** Prefix for the ids of the "why disabled" texts. */
  idBase?: string;
};

/**
 * The automation controls' names, hints and run-now glyph, in ONE canonical
 * file: `automation_controls.json` (next to this module). Clients that cannot
 * import the kit (the Qt Assistant, AbstractCode's terminal client) vendor it
 * byte-identical; the root `scripts/check_identity_sync.py` fails on drift.
 */
type AutomationControlsSpec = {
  labels: Record<ControlId, string>;
  hints: Record<ControlId, string>;
  run_now_next_run_line: string;
  run_now_growing_line: string;
  run_now_one_line: string;
  icons: { run_now: { name: IconName; view_box: string; stroke_width: number; svg: string } };
};
const SPEC = controlsSpec as AutomationControlsSpec;

/** One name per action, everywhere (operator 2026-09-28: "Edit", never "Revise"). */
export const CONTROL_LABELS: Record<ControlId, string> = SPEC.labels;

/** The kit icon of each control (the same glyphs in every client's rows and panels). */
export const CONTROL_ICONS: Record<ControlId, IconName> = {
  active: "play",
  pause: "pause",
  resume: "play",
  run_now: SPEC.icons.run_now.name,
  stop_current: "stop",
  revise: "edit",
  archive: "archive",
  discuss: "chat",
};

/**
 * What each control does: the tooltip (`title`) and `aria-description` of the
 * control in every client (operator 2026-09-28: "a tooltip explaining it will
 * run the automated task rather than later - and the effect it has or not on
 * the next scheduled run"). Lines are separated by "\n".
 *
 * Every sentence is the runtime's behaviour (abstractruntime 0.7.1
 * `automations/commands.py` `_decide`, `automations/controller.py`
 * `wait_decision`/`admit`, `triggers/schedule.py` `admit`/`rearm`), checked
 * against its tests: a manual run never moves the schedule cursor nor counts
 * toward `count`; a tick that falls due during it is admitted as soon as it
 * ends (coalesced, never dropped); it is refused while an occurrence is in
 * flight (no queue) and allowed while paused (it stays paused).
 */
export const CONTROL_HINTS: Record<ControlId, string> = SPEC.hints;

/** Run now in one line (terminal key-hint/help rows). */
export const RUN_NOW_ONE_LINE: string = SPEC.run_now_one_line;

/** The run-now glyph as SVG markup, for clients that draw it without React (it IS `<Icon name="playCircle">`). */
export const RUN_NOW_GLYPH: Readonly<{ name: IconName; view_box: string; stroke_width: number; svg: string }> = SPEC.icons.run_now;

/** The run-now line added when the summary carries `next_fire_at` ("{time}" = `formatUtc`). */
export const RUN_NOW_NEXT_RUN_LINE: string = SPEC.run_now_next_run_line;
/** The run-now line added for a Growing-context automation (a manual run is a turn of its session). */
export const RUN_NOW_GROWING_LINE: string = SPEC.run_now_growing_line;

/**
 * A control's hint for this automation: `CONTROL_HINTS[id]`, plus, for Run
 * now, the next scheduled time when the server reports one and the Growing
 * line when the automation replays its history.
 */
export function controlHint(id: ControlId, summary?: Pick<AutomationSummary, "next_fire_at" | "context_mode">): string {
  const lines = [CONTROL_HINTS[id]];
  if (id === "run_now" && summary) {
    if (summary.next_fire_at) lines.push(RUN_NOW_NEXT_RUN_LINE.replace("{time}", formatUtc(summary.next_fire_at)));
    if (summary.context_mode === "growing") lines.push(RUN_NOW_GROWING_LINE);
  }
  return lines.join("\n");
}

/**
 * Reasons for disabled controls, one line per distinct reason
 * ("Run now, Stop current: Nothing is running."), each with an id the
 * disabled buttons reference through `aria-describedby`. The bar shows them as
 * one compact muted line (also the buttons' tooltips): a tooltip alone is
 * unreliable on a disabled button.
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

/** A button's content: its kit icon, then its label. */
function IconLabel(props: { icon: IconName; label: string }): React.ReactElement {
  return (
    <>
      <Icon name={props.icon} size={14} className="af-auto__btn-icon" />
      <span>{props.label}</span>
    </>
  );
}

export function AutomationControlsBar(p: AutomationControlsBarProps): React.ReactElement {
  const c = automationControls(p.summary, p.occurrences, p.busy);
  const shown: ControlId[] = ["active", "run_now", "stop_current", "revise", "archive"];
  const why = disabledReasons(c, shown, p.idBase ?? `af-auto-${p.summary.automation_id}`);
  const btn = (id: ControlId, onClick: () => void, extra?: { pressed?: boolean; danger?: boolean; action?: string; label?: string }) => {
    const hint = controlHint(id, p.summary);
    return (
    <button
      key={id}
      type="button"
      className={`af-auto__btn${extra?.danger ? " af-auto__btn--danger" : ""}`}
      data-action={extra?.action ?? id}
      disabled={!c[id].enabled}
      title={c[id].enabled ? hint : `${c[id].reason}\n${hint}`}
      aria-description={hint}
      aria-describedby={why.describedBy[id]}
      aria-pressed={extra?.pressed}
      onClick={onClick}
    >
      <IconLabel icon={CONTROL_ICONS[id]} label={extra?.label ?? CONTROL_LABELS[id]} />
    </button>
    );
  };
  return (
    <div className="af-auto__controls-wrap">
      <div className="af-auto__actionbar">
        <div className="af-auto__controls" role="toolbar" aria-label="Automation controls">
          <AfSwitch
            key="active"
            className="af-auto__switch"
            action="active"
            label={CONTROL_LABELS.active}
            checked={p.summary.status === "active"}
            unavailableReason={c.active.enabled ? null : c.active.reason ?? "Not available now."}
            describedBy={why.describedBy.active}
            busy={p.busy}
            hint={controlHint("active", p.summary)}
            onChange={() => p.onCommand(activeToggleCommand(p.summary))}
          />
          {btn("run_now", () => p.onCommand(CONTROL_COMMANDS.run_now))}
          {btn("stop_current", () => p.onCommand(CONTROL_COMMANDS.stop_current))}
          {btn("revise", p.onToggleRevise, { pressed: p.reviseOpen, action: "edit" })}
          {btn("archive", p.onAskArchive, { danger: true, label: "Archive…" })}
        </div>
        <span className={`af-auto__notice${p.notice ? " af-auto__notice--on" : ""}`} role="status" tabIndex={-1}>
          {p.notice ? (
            <>
              <Icon name="check" size={13} />
              <span className="af-auto__notice-text">{p.notice}</span>
              {p.onDismissNotice ? (
                <button type="button" className="af-auto__icon-btn af-auto__icon-btn--bare" data-action="dismiss-notice" aria-label="Dismiss" title="Dismiss" onClick={p.onDismissNotice}>
                  <Icon name="x" size={12} />
                </button>
              ) : null}
            </>
          ) : null}
        </span>
      </div>
      {why.lines.length ? (
        <p className="af-auto__reasons">
          <Icon name="info" size={12} className="af-auto__reasons-icon" />
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
              <IconLabel icon="archive" label="Archive" />
            </button>
            <button type="button" className="af-auto__btn" data-action="archive-cancel" onClick={p.onCancelArchive}>
              <IconLabel icon="x" label="Keep it" />
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

/** Read the Edit form's fields (uncontrolled inputs) into a `ReviseForm`. */
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
  const prompt = val("prompt");
  const tools = form.elements.namedItem("tool_approval") as { value?: string } | null;
  const toolApproval = (tools && (tools.value === "auto" || tools.value === "ask") ? tools.value : fallback.toolApproval ?? null) as ToolApprovalPolicy | null;
  const notifyEl = form.elements.namedItem("notify_email") as { checked?: boolean } | null;
  const notifyEmail = notifyEl && typeof notifyEl.checked === "boolean" ? notifyEl.checked : fallback.notifyEmail ?? null;
  const rcpt = form.elements.namedItem("email_recipients") as { value?: string } | null;
  const list = val("email_recipient_list");
  const emailRecipients =
    rcpt && (rcpt.value === "self" || rcpt.value === "list") ? { mode: rcpt.value as "self" | "list", addresses: list ?? "" } : fallback.emailRecipients ?? null;
  return { title: val("title") ?? fallback.title, every, context, prompt: prompt ?? fallback.prompt ?? null, toolApproval, notifyEmail, emailRecipients };
}

export type AutomationReviseFormProps = {
  summary: AutomationSummary;
  /** The committed definition: with it the form also edits the task (`input_data.prompt`) and tool approval. */
  definition?: ReviseDefinition | null;
  busy: boolean;
  errors: string[];
  onSubmit(form: ReviseForm): void;
  onCancel(): void;
  /** See `AutomationPanelProps.emailStatus`. */
  emailStatus?: MyEmailStatus | null;
  onOpenMyEmail?: () => void;
};

/** The Edit form: everything `PATCH /automations/{id}` can change that this kit knows how to show, prefilled. */
export function AutomationReviseForm(p: AutomationReviseFormProps): React.ReactElement {
  const initial = reviseFormFrom(p.summary, p.definition);
  const d = initial.every ? parseDuration(initial.every) : null;
  const units = d && d.unit === "s" ? [["s", "seconds"] as [string, string], ...UNIT_OPTIONS] : UNIT_OPTIONS;
  const base = `af-auto-revise-${p.summary.automation_id}`;
  const usable = emailUsable(p.emailStatus);
  const emailTrigger = isEmailTrigger(p.summary.trigger);
  return (
    <form
      className="af-auto__revise"
      aria-labelledby={`${base}-heading`}
      onSubmit={(e) => {
        e.preventDefault();
        p.onSubmit(readReviseForm(e.currentTarget, initial));
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          p.onCancel();
        }
      }}
    >
      <h3 className="af-auto__form-title" id={`${base}-heading`}>
        <Icon name="edit" size={14} /> Edit automation
      </h3>
      <label className="af-auto__field" htmlFor={`${base}-title`}>
        <span>Title</span>
        <input id={`${base}-title`} name="title" defaultValue={initial.title} maxLength={120} required />
      </label>
      {initial.prompt !== null && initial.prompt !== undefined ? (
        <label className="af-auto__field" htmlFor={`${base}-prompt`}>
          <span>Task</span>
          <textarea id={`${base}-prompt`} name="prompt" defaultValue={initial.prompt} rows={Math.min(10, Math.max(3, initial.prompt.split("\n").length + 1))} required />
        </label>
      ) : null}
      {d ? (
        <fieldset className="af-auto__field">
          <legend>{emailTrigger ? EMAIL_TEXT.every_label : "Repeat every (UTC)"}</legend>
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
          {emailTrigger ? <p className="af-auto__hint" data-email-rule="interval">{EMAIL_TEXT.interval_rule}</p> : null}
        </fieldset>
      ) : (
        <p className="af-auto__hint">This trigger has no interval to change.</p>
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
      {initial.toolApproval ? (
        <fieldset className="af-auto__field">
          <legend>Tools</legend>
          <label>
            <input type="radio" name="tool_approval" value="auto" defaultChecked={initial.toolApproval === "auto"} /> Run without asking
          </label>
          <label>
            <input type="radio" name="tool_approval" value="ask" defaultChecked={initial.toolApproval === "ask"} /> Ask before each tool call
          </label>
        </fieldset>
      ) : null}
      {initial.notifyEmail !== null && initial.notifyEmail !== undefined && initial.emailRecipients ? (
        <fieldset className="af-auto__field" data-field="email">
          <legend>Email</legend>
          {!usable ? <AfEmailSetupNotice status={p.emailStatus} onOpenMyEmail={p.onOpenMyEmail} /> : null}
          <label className="af-email__check">
            {/* Without a usable account an option already on can still be turned off, never on. */}
            <input type="checkbox" name="notify_email" defaultChecked={initial.notifyEmail} disabled={!usable && !initial.notifyEmail} /> {EMAIL_TEXT.notify_label}
          </label>
          <p className="af-auto__hint">{EMAIL_TEXT.notify_hint}</p>
          <fieldset className="af-auto__field" data-field="email-recipients">
            <legend>{EMAIL_TEXT.recipients_legend}</legend>
            <label>
              <input type="radio" name="email_recipients" value="self" defaultChecked={initial.emailRecipients.mode === "self"} /> {EMAIL_TEXT.recipients_self}
            </label>
            <label>
              <input type="radio" name="email_recipients" value="list" defaultChecked={initial.emailRecipients.mode === "list"} disabled={!usable && initial.emailRecipients.mode !== "list"} /> {EMAIL_TEXT.recipients_list}
            </label>
            <textarea name="email_recipient_list" aria-label={EMAIL_TEXT.recipients_list} rows={2} spellCheck={false} defaultValue={initial.emailRecipients.addresses} disabled={!usable && initial.emailRecipients.mode !== "list"} />
            <p className="af-auto__hint">{EMAIL_TEXT.recipients_hint}</p>
          </fieldset>
        </fieldset>
      ) : null}
      <p className="af-auto__hint">Changes apply from the next run; a new interval never fires past ticks.</p>
      {p.errors.length ? (
        <ul className="af-auto__form-errors" role="alert">
          {p.errors.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      ) : null}
      <div className="af-auto__row">
        <button type="submit" className="af-auto__btn af-auto__btn--primary" data-action="edit-save" disabled={p.busy}>
          <IconLabel icon="check" label="Save changes" />
        </button>
        <button type="button" className="af-auto__btn" data-action="edit-cancel" onClick={p.onCancel}>
          <IconLabel icon="x" label="Cancel" />
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
  /** See `AutomationPanelProps.renderTurn`. */
  renderTurn?: RenderTurn;
  /** See `AutomationPanelProps.onOpenWorkspace` (called with this occurrence's run id). */
  onOpenWorkspace?(runId: string): void;
  /** See `AutomationPanelProps.onOpenResource`. */
  onOpenResource?(resource: GatewayResource): void;
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
            <IconLabel icon="check" label="Approve" />
          </button>
          <button type="button" className="af-auto__btn af-auto__btn--danger" data-action="wait-deny" disabled={p.busy} onClick={() => answer({ approved: false })}>
            <IconLabel icon="x" label="Deny" />
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
            <IconLabel icon="send" label="Send event" />
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
            <IconLabel icon="send" label="Answer" />
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
  const turn = (kind: AutomationTurn["kind"], text: string) =>
    p.renderTurn ? p.renderTurn({ kind, role: kind === "trigger" ? "user" : "assistant", text, index: row.index, runId: row.run_id }) : render(text);
  const turnClass = p.renderTurn ? " af-auto-turn--card" : "";
  const empty =
    tone === "failed" ? (row.failure ? "No answer." : "No answer: the run failed.") : tone === "waiting" ? "Waiting for your answer." : tone === "running" ? "Running…" : "No answer.";
  return (
    <li className={`af-auto-occ af-auto-occ--${tone}`} data-index={row.index} data-tone={tone} aria-labelledby={`${idBase}-h`}>
      <div className={`af-auto-turn af-auto-turn--trigger${turnClass}`} data-turn="trigger">
        <div className="af-auto-turn__meta" id={`${idBase}-h`}>
          <span className="af-auto-turn__index">#{row.index}</span> · {row.trigger.summary} · fired {formatUtc(row.fired_at)}
        </div>
        <div className="af-auto-turn__text">{turn("trigger", row.user_turn)}</div>
      </div>
      <div className={`af-auto-turn af-auto-turn--answer${turnClass}`} data-turn="answer">
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
        {row.answer ? <div className="af-auto-turn__text">{turn("answer", row.answer)}</div> : <div className="af-auto-turn__empty">{empty}</div>}
        {row.artifacts.length ? (
          <ul className="af-auto-artifacts" aria-label="Artifacts">
            {row.artifacts.map((a) => (
              <li key={a.artifact_id}>
                {p.onOpenResource ? (
                  <button
                    type="button"
                    className="af-auto__linkbtn"
                    data-action="open-artifact"
                    onClick={() => p.onOpenResource?.({ kind: "artifact", url: a.url, name: a.name, mimeType: a.mime_type, runId: row.run_id })}
                  >
                    <Icon name="file" size={13} className="af-auto__btn-icon" /> {a.name}
                  </button>
                ) : (
                  <span className="af-auto-artifact__name">{a.name}</span>
                )}{" "}
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
              <IconLabel icon="list" label="Open run ledger" />
            </button>
            {p.onOpenResource ? (
              <button
                type="button"
                className="af-auto__btn"
                data-action="open-ledger-json"
                onClick={() => p.onOpenResource?.({ kind: "ledger", url: row.ledger_url, name: `run-${row.run_id}-ledger.json`, runId: row.run_id })}
              >
                <IconLabel icon="file" label="Ledger (JSON)" />
              </button>
            ) : null}
            {row.workspace_url && p.onOpenWorkspace ? (
              <button type="button" className="af-auto__btn" data-action="open-workspace" title="Browse this run's folder" onClick={() => p.onOpenWorkspace?.(row.run_id)}>
                <IconLabel icon="folder" label="Workspace" />
              </button>
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
              Starts a new session that forks this automation at #{row.index} with its full history (runs 1–{row.index}). It works in its own writable workspace; the automation's files are mounted read-only for the file tools (shell commands are not sandboxed), and nothing is written back into the automation's session.
            </p>
            <textarea name="prompt" rows={3} aria-label="Your message" placeholder="Ask about this result…" required />
            <div className="af-auto__row">
              <button type="submit" className="af-auto__btn af-auto__btn--primary" data-action="discuss-submit" disabled={p.busy}>
                <IconLabel icon="send" label="Start discussion" />
              </button>
              <button type="button" className="af-auto__btn" data-action="discuss-cancel" onClick={p.onDiscussCancel}>
                <IconLabel icon="x" label="Cancel" />
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
              title={CONTROL_HINTS.discuss}
              aria-description={CONTROL_HINTS.discuss}
              aria-describedby={discussWhy ? `${idBase}-discuss-why` : undefined}
              onClick={() => p.onDiscussOpen(row.index)}
            >
              <IconLabel icon={CONTROL_ICONS.discuss} label={DISCUSS_LABEL} />
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

/** How long an action's feedback stays next to the buttons. */
export const NOTICE_MS = 5000;

const COMMAND_NOTICES: Record<string, string> = {
  [CONTROL_COMMANDS.pause]: "Pause sent.",
  [CONTROL_COMMANDS.resume]: "Resume sent.",
  [CONTROL_COMMANDS.run_now]: "Run requested.",
  [CONTROL_COMMANDS.stop_current]: "Stop sent.",
};

export function AutomationPanel(props: AutomationPanelProps): React.ReactElement {
  const { summary, busy } = props;
  const render = props.renderText ?? plainTextRenderer;
  const titleId = useId();
  const rootRef = useRef<HTMLElement | null>(null);
  // The Edit form: controlled by the host when it passes `editOpen`.
  const [ownEditOpen, setOwnEditOpen] = useState(false);
  const controlled = props.editOpen !== undefined;
  // Never on an automation that cannot be edited (archived, legacy, not permitted),
  // whatever the host asks; `busy` does not close it (a save in flight keeps it).
  const editable = automationControls(summary, props.occurrences, false).revise.enabled;
  const reviseOpen = editable && (controlled ? props.editOpen === true : ownEditOpen);
  // The automation AS THE FORM OPENED IT: the form's values, the diff base and
  // expected_revision all come from this snapshot, never from a summary a poll
  // refreshed meanwhile. A concurrent change (another client renamed it) then
  // makes the save a 409 revision_conflict instead of a silent revert.
  const editBaseRef = useRef<{ summary: AutomationSummary; definition?: AutomationDefinition } | null>(null);
  if (!reviseOpen) editBaseRef.current = null;
  else if (!editBaseRef.current || editBaseRef.current.summary.automation_id !== summary.automation_id)
    editBaseRef.current = { summary, definition: props.definition };
  const editBase = editBaseRef.current;
  const onEditOpenChangeRef = useRef(props.onEditOpenChange);
  onEditOpenChangeRef.current = props.onEditOpenChange;
  const setReviseOpen = (open: boolean) => {
    if (!controlled) setOwnEditOpen(open);
    onEditOpenChangeRef.current?.(open);
  };
  const [reviseErrors, setReviseErrors] = useState<string[]>([]);
  const [confirmingArchive, setConfirmingArchive] = useState(false);
  const [discussAt, setDiscussAt] = useState<number | null>(null);
  const [localError, setLocalError] = useState<ApiError | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  // Action feedback is brief: it clears itself (or on dismiss).
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), NOTICE_MS);
    return () => clearTimeout(t);
  }, [notice]);
  // Opening the Edit form (from the Edit button or the host) focuses its first field.
  useEffect(() => {
    if (!reviseOpen) return;
    setReviseErrors([]);
    const field = pickFocusTarget(rootRef.current, ['.af-auto__revise [name="title"]']);
    field?.focus();
    (field as { scrollIntoView?: (o: object) => void } | null)?.scrollIntoView?.({ block: "nearest" });
  }, [reviseOpen, summary.automation_id]);
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
      <AutomationHeader summary={summary} triggerSources={props.triggerSources} titleId={titleId} nowMs={props.nowMs} onOpenWorkspace={props.onOpenWorkspace} />
      <AutomationControlsBar
        summary={summary}
        occurrences={props.occurrences}
        busy={busy}
        confirmingArchive={confirmingArchive}
        reviseOpen={reviseOpen}
        notice={notice}
        onDismissNotice={() => setNotice(null)}
        idBase={`${titleId}-ctl`}
        onCommand={(type) =>
          act(`command:${type}`, (command_id) => props.onCommand(type, undefined, { command_id }), () => {
            if (type === CONTROL_COMMANDS.archive) {
              setConfirmingArchive(false);
              setNotice("Archive requested.");
              setFocusAfter(['[data-action="archive"]']);
            } else setNotice(COMMAND_NOTICES[type] ?? "Command sent.");
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
      {reviseOpen && editBase ? (
        <AutomationReviseForm
          summary={editBase.summary}
          definition={editBase.definition}
          busy={busy}
          errors={reviseErrors}
          emailStatus={props.emailStatus}
          onOpenMyEmail={props.onOpenMyEmail}
          onCancel={() => {
            setReviseOpen(false);
            setFocusAfter(['[data-action="edit"]']);
          }}
          onSubmit={(form) => {
            const base = editBase.summary;
            const changes = reviseChanges(base, form, editBase.definition);
            if (changes === null) {
              setReviseErrors(["Nothing changed."]);
              return;
            }
            if ("errors" in changes) {
              setReviseErrors(changes.errors as string[]);
              return;
            }
            setReviseErrors([]);
            act(`revise:${base.revision}:${JSON.stringify(changes)}`, (command_id) => props.onRevise(changes, base.revision, { command_id }), () => {
              setNotice("Saved; applies from the next run.");
              setReviseOpen(false);
              setFocusAfter(['[data-action="edit"]']);
            });
          }}
        />
      ) : props.definition ? (
        <AutomationDefinitionBlock definition={props.definition} renderText={render} />
      ) : null}
      {errText ? (
        <div className="af-auto__error" role="alert" data-code={shownError?.code}>
          <Icon name="error" size={14} className="af-auto__btn-icon" />
          <span className="af-auto__error-text">
            <strong>{errText.title}</strong> <span>{errText.detail}</span>
          </span>
          {localError ? (
            <button type="button" className="af-auto__icon-btn af-auto__icon-btn--bare" data-action="dismiss-error" aria-label="Dismiss" title="Dismiss" onClick={() => setLocalError(null)}>
              <Icon name="x" size={12} />
            </button>
          ) : null}
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
          <IconLabel icon="history" label={`Load earlier occurrences (${more} more)`} />
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
                renderTurn={props.renderTurn}
                onOpenWorkspace={props.onOpenWorkspace}
                onOpenResource={
                  props.onOpenResource
                    ? (resource) => {
                        setLocalError(null);
                        try {
                          Promise.resolve(props.onOpenResource?.(resource)).catch(report);
                        } catch (e) {
                          report(e);
                        }
                      }
                    : undefined
                }
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
