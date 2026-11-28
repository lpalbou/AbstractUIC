import { ToolCallWordsList } from "../tool_call_words_view.js";
import type { AutomationWorkflowPickerOptions } from "./automation_workflow_picker.js";
import { prepareAutomationTarget } from "./prepare_target.js";
import { AUTOMATION_EDIT_WORDS } from "./automation_words.js";
import { AutomationLiveLine } from "./automation_live_line.js";
import { automationLiveWords } from "./automation_live.js";
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
import React, { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { VisibleContentMarker } from "../visible_content.js";
import { Icon, type IconName } from "../icon.js";
import { AfSwitch } from "../af_switch.js";
import { AfChip, AfChipButton, type AfChipTone } from "../af_chip.js";
import { AfModal } from "../af_modal.js";
import type { PreviewSchedule } from "./schedule_when.js";
import type { ToolCatalogItem } from "../tool_plan.js";
import { AutomationReviseForm, automationModelWords, type AutomationEditSection, type AutomationModelPickerOptions } from "./AutomationEditForm.js";
import controlsSpec from "./automation_controls.json" with { type: "json" };
import { occurrenceEventCard, whenWords, type OccurrenceEventCard } from "./trigger_words.js";
import {
  apiErrorText,
  formatServedLocal,
  nextRunLabel,
  relativeIn,
  DEFAULT_GROWING_MAX_TOKENS,
  consumedAttentionCursor,
  automationControls,
  ActionIds,
  CONTROL_COMMANDS,
  contextLabel,
  emailRecipientsLabel,
  emailTriggerLabel,
  isEmailTrigger,
  notifyLabel,
  isApiError,
  mintUuid,
  eventPayloadFromWords,
  failureReasonWords,
  WAIT_KIND_LABELS,
  waitToolCalls,
  occurrenceViews,
  pickFocusTarget,
  reviseChanges,
  automationModelFrom,
  SeenAckTracker,
  STATUS_LABELS,
  triggerSummary,
  activeToggleCommand,
  type ControlId,
  type ControlState,
  type OccurrenceView,
} from "./panel_core.js";
import type {
  ApiError,
  AutomationChanges,
  AutomationDefinition,
  AutomationStatus,
  AutomationSummary,
  CommandReceipt,
  CurrentOccurrence,
  JsonObject,
  Mailbox,
  MyEmailStatus,
  OccurrenceArtifact,
  OccurrenceRow,
  OccurrenceWait,
  TriggerSourceEntry,
  TriggerSource,
  TriggerConnection,
} from "./types.js";

export type AutomationPanelProps = {
  prepareTarget?(target: NonNullable<AutomationChanges["target"]>): Promise<NonNullable<AutomationChanges["target"]>>;
  workflowPickerOptions?: AutomationWorkflowPickerOptions;
  /** The Edit form's Model field (see `AutomationReviseFormProps.modelPickerOptions`). Absent = no Model field. */
  modelPickerOptions?: AutomationModelPickerOptions;
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
   * `"card"` (spec F; `AutomationPanelWithMarkdown` sets it): each turn IS the shared chat card —
   * the card shows the time (the reader's), the files and a run's working state, so the panel drops
   * its own times, its file list and its bubble around the trigger, and calls `renderTurn` for a run
   * in progress too (`AutomationTurn.chrome`, `ts`, `live`, `artifacts`). Needs `renderTurn`.
   * Absent = the turns as before.
   */
  turnChrome?: "card";
  /** A chip the host adds at the end of the header's chip row (Observer: Workspaces, opening its chooser). */
  headerChip?: AutomationHeaderChip;
  /**
   * Opens a run's folder (the host's workspace browser; a local app may open
   * it in the file manager). Called with the automation id (= its controller
   * run) from the header's Workspace fact, and with an occurrence's run id
   * from its run details. Without it no folder control is shown: a bare link
   * to the JSON route carries no bearer token and shows no files.
   */
  onOpenWorkspace?(runId: string): void;
  /**
   * Opens what a run was given (the host's context view: earlier runs carried in, the trigger
   * message as the agent received it). When passed, each run's trigger turn shows ONE "Context"
   * button and no "What the agent received" disclosure (one way to look, not two). Absent: the
   * disclosure as before. Called with the occurrence's own run id and its index.
   */
  onOpenContext?(run: { runId: string; index: number }): void;
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
   * The host draws its own header and controls (AbstractCode's automation header):
   * the panel then starts at the occurrences (the Details dialog is the header's, so it is the
   * host's too). Default false.
   */
  hideHeader?: boolean;
  /** Where an automation opens (operator 2026-10-29: "if I click an attention icon, I should get
   * directly to where you need my attention"). "attention" (default): the first unresolved wait's
   * card in the thread, else the run of the oldest unseen result, scrolled into view and outlined
   * for a moment; "none": the host decides. */
  openAt?: "attention" | "none";
  /** No longer read by the Edit form (see `toolCatalog`). */
  availableTools?: string[];
  /** The gateway's tool catalog (`normalizeToolCatalog` of discovery/tools): the Edit form then offers
   * "Choose per tool" (`AutomationReviseFormProps.toolCatalog`). */
  toolCatalog?: readonly ToolCatalogItem[];
  /**
   * `GET /api/gateway/me/email` (the client's `getMyEmail()`): the Edit form
   * offers "Email result" and allowed recipients only when the account
   * is usable (an option already on can still be turned off); otherwise it
   * shows "Connect a mailbox first — open My email".
   */
  emailStatus?: MyEmailStatus | null;
  onOpenMyEmail?: () => void;
  /** The gateway's dry-run schedule description (the Edit form shows a calendar rule's served sentence and next run). */
  previewSchedule: PreviewSchedule;
  className?: string;
  /**
   * The user's feeds and webhooks (the client's `listTriggerConnections()`): the trigger reads by
   * name ("When Release notes has a new item"). Absent = "When a feed has a new item".
   */
  triggerConnections?: readonly TriggerConnection[] | null;
  /** The user's mailboxes (the client's `listMailboxes()`): "When mail arrives in me@example.org". */
  mailboxes?: readonly Mailbox[] | null;
  /**
   * Each occurrence's `input_data.event` by run id (the host reads `GET /runs/{id}/input_data`):
   * the card "Release notes · 1 new item: “…” · 15:13" above the task. Absent = no card.
   */
  occurrenceEvents?: Readonly<Record<string, unknown>>;
  /**
   * The flow's name for a person ("Release digest"). The header shows it as **Flow**; without it
   * the header names no flow (the target's id stays under Details).
   */
  workflowName?: string;
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
  /**
   * Set only by a panel with `turnChrome="card"`: the card draws the time, the files and the
   * working state, and the panel draws none of them. Absent = the turn as before (text only).
   */
  chrome?: "card";
  /** When it was said (the served ISO time): `fired_at` for the trigger, `finished_at` for the answer. Card chrome only. */
  ts?: string;
  /**
   * The answer of a run in progress, not written yet (card chrome only): the card shows its working
   * state. `current` is the summary's `current_occurrence` when it is this run (its live line), else null.
   */
  live?: { current: CurrentOccurrence | null; nowMs?: number };
  /** The run's files (the occurrence's `artifacts`), on the answer turn. Card chrome only. */
  artifacts?: OccurrenceArtifact[];
};

export type RenderTurn = (turn: AutomationTurn) => React.ReactNode;

export const DISCUSS_LABEL = "Discuss this run";

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

/**
 * What the header says about a FAILED automation (spec D): the served `failed_reason` as served (a
 * whole sentence that already says what to do) when there is one, and only it; `failed.explain`
 * only when no reason is served and the gateway lists `resume` for it (it can be turned back on).
 * Null for any other status, and for a failed automation an older gateway serves neither for (the
 * header is then as before).
 */
export function automationFailedNote(s: Pick<AutomationSummary, "status" | "capabilities" | "failed_reason">): { explain: string | null; reason: string | null } | null {
  if (s.status !== "failed") return null;
  const reason = typeof s.failed_reason === "string" && s.failed_reason.trim() ? s.failed_reason : null;
  const explain = !reason && Array.isArray(s.capabilities) && s.capabilities.includes("resume") ? AUTOMATION_EDIT_WORDS.failed.explain : null;
  return explain || reason ? { explain, reason } : null;
}

/** What the header says about a PAUSED automation: the served `paused_reason` as served (a whole
 * sentence), only while it is paused; null otherwise (a pause by the person serves none). */
export function automationPausedNote(s: Pick<AutomationSummary, "status" | "paused_reason">): string | null {
  return s.status === "paused" && typeof s.paused_reason === "string" && s.paused_reason.trim() ? s.paused_reason : null;
}

/** The one action a header notice carries: a command the gateway lists for it, or the Edit form at a section. */
export type AutomationNoticeAction =
  | { kind: "command"; command: string; label: string; hint: string; icon: IconName }
  | { kind: "edit"; section: AutomationEditSection; label: string; hint: string; icon: IconName };

/** The header's one notice: what a person can act on, in one sentence, with the button that fixes it. */
export type AutomationNotice = {
  /** `failed`, `paused_reason` or `archived` (the element's `data-fact`). */
  fact: "failed" | "paused_reason" | "archived";
  tone: "error" | "warning" | "neutral";
  icon: IconName;
  text: string;
  /** The text is the gateway's sentence (`failed_reason` / `paused_reason`), not the kit's words. */
  served: boolean;
  action: AutomationNoticeAction | null;
};

/**
 * The header's notice for a stopped, gateway-paused or archived automation, and its one action:
 * failed → the served sentence (`automationFailedNote`) and **Restart** (`automation.resume`) when
 * the gateway lists `resume`; paused with a served `paused_reason` → the sentence and **Edit** at
 * the Flow section when `flow_missing` is true (and the form shows it: `editSections`), otherwise
 * **Turn back on** (`automation.resume`); archived → its line and **Unarchive** when listed. Each
 * action is offered only when `automationControls` enables it. Null for anything else.
 */
export function automationNotice(s: AutomationSummary, editSections?: ReadonlySet<AutomationEditSection>): AutomationNotice | null {
  const F = AUTOMATION_EDIT_WORDS.failed;
  const c = automationControls(s, [], false);
  const resume = (label: string, hint: string, icon: IconName): AutomationNoticeAction | null =>
    c.resume.enabled ? { kind: "command", command: CONTROL_COMMANDS.resume, label, hint, icon } : null;
  if (s.status === "failed") {
    const note = automationFailedNote(s);
    if (!note) return null;
    return { fact: "failed", tone: "error", icon: "error", text: (note.reason ?? note.explain) as string, served: note.reason !== null, action: resume(F.restart, F.restart_hint, "refresh") };
  }
  if (s.status === "paused") {
    const why = automationPausedNote(s);
    if (!why) return null;
    const action: AutomationNoticeAction | null =
      s.flow_missing === true
        ? editSections?.has("what")
          ? { kind: "edit", section: "what", label: CONTROL_LABELS.revise, hint: F.edit_flow_hint, icon: CONTROL_ICONS.revise }
          : null
        : resume(F.turn_on, CONTROL_HINTS.resume, CONTROL_ICONS.resume);
    return { fact: "paused_reason", tone: "warning", icon: "pause", text: why, served: true, action };
  }
  if (s.status === "archived") {
    return {
      fact: "archived",
      tone: "neutral",
      icon: "archive",
      text: AUTOMATION_EDIT_WORDS.header.archived,
      served: false,
      action: c.unarchive.enabled ? { kind: "command", command: CONTROL_COMMANDS.unarchive, label: CONTROL_LABELS.unarchive, hint: CONTROL_HINTS.unarchive, icon: CONTROL_ICONS.unarchive } : null,
    };
  }
  return null;
}

/** The notice's state while its action is sent: busy, the gateway's refusal, or the confirmation line. */
export type AutomationNoticeState = { busy?: boolean; error?: string | null; done?: string | null };

/**
 * ONE notice line: the sentence and, in it, the filled button that fixes it; `error` (the
 * gateway's own sentence) shows in the line, the button still there. (`done`, the confirmation,
 * replaces the line in `AutomationHeader`.) Hook-free.
 */
export function AutomationNoticeLine(props: { notice: AutomationNotice; state?: AutomationNoticeState; disabled?: boolean; onAction?(action: AutomationNoticeAction): void }): React.ReactElement {
  const n = props.notice;
  const st = props.state ?? {};
  const a = props.onAction ? n.action : null;
  const toneClass = n.tone === "error" ? "af-auto__failed" : n.tone === "warning" ? "af-auto__note af-auto__note--warning" : "af-auto__note";
  return (
    <div className={`${toneClass} af-auto__notice-line`} role="note" data-fact={n.fact}>
      <Icon name={n.icon} size={14} className="af-auto__btn-icon" />
      <span className="af-auto__notice-words">
        <span data-fact={n.fact === "failed" && n.served ? "failed_reason" : undefined}>{n.text}</span>
        {st.error ? (
          <span className="af-auto__notice-error" role="alert" data-fact="notice_error">
            {st.error}
          </span>
        ) : null}
      </span>
      {a ? (
        <button
          type="button"
          className="af-auto__btn af-auto__btn--primary af-auto__notice-btn"
          data-action={a.kind === "edit" ? "notice-edit" : `notice-${a.command === CONTROL_COMMANDS.unarchive ? "unarchive" : n.fact === "failed" ? "restart" : "resume"}`}
          disabled={props.disabled || st.busy === true}
          aria-busy={st.busy === true || undefined}
          title={a.hint}
          aria-description={a.hint}
          onClick={() => props.onAction?.(a)}
        >
          <Icon name={st.busy ? "loader" : a.icon} size={14} className="af-auto__btn-icon" />
          <span>{a.label}</span>
        </button>
      ) : null}
    </div>
  );
}

/**
 * The notice's button, for a header host (`AutomationHeaderCard`, `AutomationPanel`): a command
 * goes through `onCommand` with the host's `ActionIds` (one id per action, reused on a retry after
 * a transport failure); while it is sent the button is busy; a refusal puts the gateway's own
 * sentence in the notice; success shows "Back on. Next run: …" (the served next run; "Back on."
 * while the summary is not yet served active) where the notice was, for `NOTICE_MS`. An edit action calls `openEdit(section)`.
 */
export function useAutomationNoticeAction(
  summary: AutomationSummary,
  ids: ActionIds,
  onCommand: (type: string, payload: JsonObject | undefined, meta: { command_id: string }) => Promise<unknown>,
  openEdit: (section: AutomationEditSection) => void,
  nowMs?: number,
): { state: AutomationNoticeState; onAction(action: AutomationNoticeAction): void } {
  const [st, setSt] = useState<{ id: string; busy?: boolean; error?: string; done?: string } | null>(null);
  const done = st?.done;
  useEffect(() => {
    if (!done) return;
    const t = setTimeout(() => setSt(null), NOTICE_MS);
    return () => clearTimeout(t);
  }, [done]);
  const mine = st && st.id === summary.automation_id ? st : null;
  const F = AUTOMATION_EDIT_WORDS.failed;
  const state: AutomationNoticeState = mine
    ? {
        busy: mine.busy === true,
        error: mine.error ?? null,
        // The next run once the refreshed summary serves it active ("Back on." until then).
        done:
          mine.done === CONTROL_COMMANDS.resume
            ? summary.status === "active"
              ? fillWords(F.restarted, { when: nextRunLabel(summary, nowMs ?? Date.now()) })
              : F.back_on
            : mine.done
              ? (COMMAND_NOTICES[mine.done] ?? null)
              : null,
      }
    : {};
  const onAction = (a: AutomationNoticeAction) => {
    if (a.kind === "edit") {
      openEdit(a.section);
      return;
    }
    const id = summary.automation_id;
    const signature = `command:${a.command}`;
    setSt({ id, busy: true });
    onCommand(a.command, undefined, { command_id: ids.idFor(signature) }).then(
      () => {
        ids.settle(signature, { ok: true });
        setSt({ id, done: a.command });
      },
      (error: unknown) => {
        ids.settle(signature, { ok: false, error });
        const e = toApiError(error);
        setSt({ id, error: e.message.trim() || apiErrorText(e).title });
      },
    );
  };
  return { state, onAction };
}

/** A chip the host adds to the header (the Workspaces chip): its one-line summary; a press opens the host's chooser. */
export type AutomationHeaderChip = {
  label: string;
  /** The whole fact (default: the label). */
  title?: string;
  onClick(): void;
};

const fillWords = (s: string, values: Record<string, string | number>): string => s.replace(/\{(\w+)\}/g, (_m, k: string) => String(values[k] ?? ""));

/** One fact of the header's chip row: an icon, a short text, and the whole fact as its tooltip. */
function HeaderChip(props: { fact: string; icon: IconName; text: string; title: string; tone?: AfChipTone; onClick?: () => void; action?: string; ariaLabel?: string }): React.ReactElement {
  const inner = (
    <>
      <Icon name={props.icon} size={13} className="af-auto__chip-icon" />
      <span className="af-auto__chip-text">{props.text}</span>
    </>
  );
  return (
    <li className="af-auto__chip" data-fact={props.fact}>
      {props.onClick ? (
        <AfChipButton tone={props.tone ?? "neutral"} title={props.title} ariaLabel={props.ariaLabel ?? props.title} onClick={props.onClick} {...(props.action ? { action: props.action } : {})}>
          {inner}
        </AfChipButton>
      ) : (
        <AfChip tone={props.tone ?? "neutral"} title={props.title}>
          {inner}
        </AfChip>
      )}
    </li>
  );
}

/**
 * The header (operator 2026-11-27, "a clear top header well detached that shows the parameters and
 * enable changing them"): ONE header, no folds, three rows. Row 1 the title (the row's whole width
 * up to the state badge) and the state badge; row 2 the host's buttons (`controls`: the
 * `AutomationControlsBar`); row 3 the parameters as chips, each with the whole fact in its tooltip:
 * Task · Flow · Schedule · Next run · Memory · Model · Tools · Results · the host's chip
 * (Workspaces) · Files. A chip whose section the Edit form shows (`editSections`) opens it there
 * (`onEditSection`); Next run is never editable. Runs and attention are not parameters: they are
 * not here. A reason line only for what a person can act on: failed, paused with a reason,
 * archived. Hook-free.
 */
export function AutomationHeader(props: {
  /** The flow's name for a person ("Release digest"): the **Flow** chip. Never the target's id. */
  workflowLabel?: string;
  summary: AutomationSummary;
  /** The committed definition: the task line, the memory budget and the model chip read it. */
  definition?: AutomationDefinition;
  triggerSources: Array<TriggerSource | TriggerSourceEntry>;
  titleId?: string;
  nowMs?: number;
  onOpenWorkspace?(runId: string): void;
  triggerConnections?: readonly TriggerConnection[] | null;
  mailboxes?: readonly Mailbox[] | null;
  /** The buttons on line 1 (the panel's `AutomationControlsBar`). */
  controls?: React.ReactNode;
  /** The host's chip in row 3, before Files (Observer: Workspaces). */
  extraChip?: AutomationHeaderChip;
  /** The Edit form's sections for this automation (`automationEditSections`); empty or absent =
   * no chip opens the form (an automation that cannot be edited). */
  editSections?: ReadonlySet<AutomationEditSection>;
  /** A chip was clicked: open the Edit form at that section. */
  onEditSection?(section: AutomationEditSection): void;
  /** What runs when no model is chosen (the Model chip; default "Workflow / Gateway default"). */
  defaultModelLabel?: string;
  /** The notice's button was pressed (`automationNotice`): absent = the notice shows no button. */
  onNoticeAction?(action: AutomationNoticeAction): void;
  /** The notice's action in flight, refused, or done (the confirmation line). */
  noticeState?: AutomationNoticeState;
  /** Everything is disabled while a command is in flight. */
  busy?: boolean;
}): React.ReactElement {
  const s = props.summary;
  const d = props.definition;
  const W = AUTOMATION_EDIT_WORDS.header;
  const problem = triggerSourceProblem(s, props.triggerSources);
  const nowMs = props.nowMs ?? Date.now();
  const notice = automationNotice(s, props.editSections);
  const taskValue = (d?.target.input_data as { prompt?: unknown } | undefined)?.prompt;
  const task = typeof taskValue === "string" ? taskValue.trim() : "";
  const rule = triggerSummary(s.trigger, s, { connections: props.triggerConnections, mailboxes: props.mailboxes });
  // The next run is the gateway's (served `next_run_local` + `next_run_at`); the kit never computes it.
  const nextShown = Boolean(s.next_run_at && s.next_run_local);
  const growing = s.context_mode === "growing";
  const budget = d?.context.mode === "growing" ? Number(d.context.growing?.max_tokens ?? DEFAULT_GROWING_MAX_TOKENS) : null;
  const model = d ? automationModelFrom(d.target.input_data) : null;
  const E = AUTOMATION_EDIT_WORDS.edit;
  const sections = props.onEditSection ? props.editSections : undefined;
  // A chip whose section the Edit form shows opens it there; its tooltip says so.
  const edit = (section: AutomationEditSection, title: string): { title: string; onClick?: () => void; action?: string } =>
    sections?.has(section) ? { title: `${title}\n${W.change_hint}`, onClick: () => props.onEditSection?.(section), action: `edit-${section}` } : { title };
  const tools = d ? (d.policy.tool_policy ? E.tools.per_tool : d.policy.tool_approval === "ask" ? E.tools.ask : d.policy.tool_approval === "auto" ? E.tools.auto : String(d.policy.tool_approval)) : null;
  const results = d ? notifyLabel(d.notify) : null;
  const modelWords = model ? (model.provider && model.model ? `${model.provider} / ${model.model}` : props.defaultModelLabel || E.model_default) : null;
  const taskLine = task.split("\n")[0] ?? "";
  return (
    <header className="af-auto__head">
      <div className="af-auto__titlebar">
        <h2 className="af-auto__title" id={props.titleId} tabIndex={-1} title={s.title}>
          {s.title}
        </h2>
        <AutomationStateLabel status={s.status} />
        {s.legacy ? <span className="af-auto__legacy">Legacy schedule</span> : null}
      </div>
      {props.controls ? <div className="af-auto__actionrow">{props.controls}</div> : null}
      <ul className="af-auto__chips" aria-label={W.parameters}>
        {task ? <HeaderChip fact="task" icon="compose" text={taskLine} {...edit("what", fillWords(W.task_title, { task }))} /> : null}
        {props.workflowLabel ? <HeaderChip fact="workflow" icon="branch" text={props.workflowLabel} {...edit("what", fillWords(W.flow_title, { name: props.workflowLabel }))} /> : null}
        <HeaderChip
          fact="trigger"
          icon="clock"
          text={rule}
          tone={problem ? "warning" : "neutral"}
          {...edit("schedule", [fillWords(W.when_title, { rule }), problem].filter(Boolean).join("\n"))}
        />
        {nextShown ? (
          <HeaderChip fact="next" icon="playCircle" text={fillWords(W.next, { when: relativeIn(String(s.next_run_at), nowMs) })} title={fillWords(W.next_title, { when: nextRunLabel(s, nowMs) })} />
        ) : null}
        <HeaderChip
          fact="context"
          icon="book"
          text={growing ? E.fields.memory_switch : W.memory_off}
          {...edit("memory", growing ? (budget !== null ? fillWords(W.memory_on_title, { tokens: budget.toLocaleString("en-US") }) : E.fields.memory_on) : E.fields.memory_off)}
        />
        {model && modelWords ? <HeaderChip fact="model" icon="sparkle" text={modelWords} {...edit("model", fillWords(W.model_title, { model: automationModelWords(model, props.defaultModelLabel) }))} /> : null}
        {tools ? <HeaderChip fact="tools" icon="wrench" text={tools} {...edit("tools", fillWords(W.tools_title, { tools }))} /> : null}
        {results ? <HeaderChip fact="results" icon="inbox" text={results} {...edit("results", fillWords(W.results_title, { results }))} /> : null}
        {props.extraChip ? (
          <HeaderChip
            fact="workspaces"
            action="open-workspaces"
            icon="board"
            text={props.extraChip.label}
            title={props.extraChip.title ?? props.extraChip.label}
            onClick={props.extraChip.onClick}
          />
        ) : null}
        {s.workspace_root && props.onOpenWorkspace ? (
          // The folder's path is under Details (UX review 2026-10-25 #4: no paths in the person's view).
          <HeaderChip fact="workspace" action="open-workspace" icon="folder" text={W.files} title={W.files_title} onClick={() => props.onOpenWorkspace?.(s.automation_id)} />
        ) : null}
      </ul>
      {props.noticeState?.done ? (
        <p className="af-auto__note af-auto__note--ok" role="status" data-fact="notice_done">
          <Icon name="check" size={14} className="af-auto__btn-icon" />
          <span>{props.noticeState.done}</span>
        </p>
      ) : notice ? (
        <AutomationNoticeLine notice={notice} state={props.noticeState} disabled={props.busy} onAction={props.onNoticeAction} />
      ) : null}
    </header>
  );
}

// --- definition ------------------------------------------------------------------

/**
 * The committed definition (`GET /automations/{id}` → `definition`) as the inspection facts the
 * header's Details button opens in the kit's modal (spec G; no fold): flow version, task, model, the
 * trigger in words and its exact configuration, memory, tools, where results go and recipients,
 * retries, folder path, the workspaces rule (the host's, when given) and revision.
 */
export function AutomationDefinitionBlock(props: {
  definition: AutomationDefinition;
  renderText?: RenderText;
  /** The summary's served `schedule_rule_text` (a schedule@2 rule reads only that). */
  served?: Pick<AutomationSummary, "schedule_rule_text"> | null;
  triggerConnections?: readonly TriggerConnection[] | null;
  mailboxes?: readonly Mailbox[] | null;
  /** What runs when no model is chosen (`AutomationModelPickerOptions.defaultModeLabel`; default
   * "Workflow / Gateway default"). */
  defaultModelLabel?: string;
  /** The workspaces rule in words (the host's one-line summary, e.g. Observer's Workspaces chip). */
  workspaces?: string;
}): React.ReactElement {
  const d = props.definition;
  const render = props.renderText ?? plainTextRenderer;
  const task = (d.target.input_data as { prompt?: unknown }).prompt;
  const retry = d.policy.retry;
  const approval = d.policy.tool_approval;
  return (
    <div className="af-auto__definition" data-definition-revision={d.revision}>
      <dl className="af-auto__facts">
        <dt>Flow</dt>
        <dd data-def="target">
          <code>{d.target.workflow_id}</code>
        </dd>
        {typeof task === "string" && task ? (
          <>
            <dt>Task</dt>
            <dd data-def="prompt">{render(task)}</dd>
          </>
        ) : null}
        <dt>Model</dt>
        <dd data-def="model">{automationModelWords(automationModelFrom(d.target.input_data), props.defaultModelLabel)}</dd>
        <dt>Trigger</dt>
        <dd data-def="trigger">
          {/* In words (operator 2026-10-29); the exact configuration behind a disclosure. */}
          {triggerSummary(d.trigger, props.served, { connections: props.triggerConnections, mailboxes: props.mailboxes })}
          {isEmailTrigger(d.trigger) ? <div className="af-auto__hint" data-def="email_rule">{emailTriggerLabel(d.trigger.config)}</div> : null}
        </dd>
        <dt>Exact configuration</dt>
        <dd data-def="trigger_config">
          <pre className="af-auto__json">{JSON.stringify(d.trigger.config, null, 2)}</pre>
        </dd>
        <dt>Context</dt>
        <dd data-def="context">{contextLabel(d.context.mode)}{d.context.mode === "growing" ? ` · ${Number(d.context.growing?.max_tokens ?? 50_000).toLocaleString()} tokens` : ""}</dd>
        <dt>Tools</dt>
        {/* A named per-tool policy is what runs (its tool_approval is not read): the Edit form's third choice. */}
        <dd data-def="tool_approval">{d.policy.tool_policy ? AUTOMATION_EDIT_WORDS.edit.tools.per_tool : approval === "ask" ? "Ask before each tool call" : approval === "auto" ? "Run without asking" : String(approval)}</dd>
        <dt>Notify</dt>
        <dd data-def="notify">{notifyLabel(d.notify)}</dd>
        {d.notify?.channels.includes("email") ? <><dt>Recipients</dt>
        <dd data-def="email_recipients">{emailRecipientsLabel(d.notify.recipients)}</dd></> : null}
        <dt>Retries</dt>
        <dd data-def="retry">
          {retry.max_attempts} {retry.max_attempts === 1 ? "attempt" : "attempts"}, backoff {retry.backoff.initial} ×{retry.backoff.factor} up to {retry.backoff.max}
        </dd>
        {d.workspace_root ? (
          <>
            <dt>Folder</dt>
            <dd data-def="workspace">
              <WrappingPath path={d.workspace_root} />
            </dd>
          </>
        ) : null}
        {props.workspaces ? (
          <>
            <dt>Workspaces</dt>
            <dd data-def="workspaces">{props.workspaces}</dd>
          </>
        ) : null}
        <dt>Revision</dt>
        <dd data-def="revision">{d.revision}</dd>
      </dl>
    </div>
  );
}

/** The header's Details button opens this: the kit's modal around `AutomationDefinitionBlock`. */
export function AutomationDetailsDialog(props: {
  open: boolean;
  onClose(): void;
  summary: Pick<AutomationSummary, "title"> & Partial<Pick<AutomationSummary, "status" | "failed_detail">>;
  children: React.ReactNode;
}): React.ReactElement | null {
  // The raw error a stopped automation died on: here only, never in the header's notice.
  const detail = props.summary.status === "failed" && typeof props.summary.failed_detail === "string" ? props.summary.failed_detail.trim() : "";
  return (
    <AfModal open={props.open} onClose={props.onClose} size="narrow" className="af-auto__details-dialog" title={fillWords(AUTOMATION_EDIT_WORDS.header.details_title, { title: props.summary.title })}>
      {detail ? (
        <div className="af-auto__technical" data-fact="failed_detail">
          <p className="af-auto__technical-label">{AUTOMATION_EDIT_WORDS.failed.technical}</p>
          <pre className="af-auto__technical-text">{detail}</pre>
        </div>
      ) : null}
      {props.children}
    </AfModal>
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
  /** The Details button (absent = no button): opens the inspection facts in the kit's modal. */
  onOpenDetails?(): void;
  detailsOpen?: boolean;
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
  icons: {
    run_now: { name: IconName; view_box: string; stroke_width: number; svg: string };
    attention: { name: IconName; view_box: string; stroke_width: number; svg: string };
  };
  attention: AttentionText;
};

/** The attention badge's words (`automation_controls.json` → `attention`). */
export type AttentionText = {
  doc: string;
  waiting_one: string;
  waiting_many: string;
  result_one: string;
  result_many: string;
  open_hint: string;
  label: string;
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
  unarchive: "unarchive",
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

/**
 * The attention badge on a client's sessions control (operator 2026-10-29: an icon and a count,
 * not a text banner). The glyph IS `<Icon name="inbox">`, as SVG markup for clients that draw it
 * without React (the Assistant, the Code TUI vendor this file).
 */
export const ATTENTION_GLYPH: Readonly<{ name: IconName; view_box: string; stroke_width: number; svg: string }> = SPEC.icons.attention;
export const ATTENTION_TEXT: Readonly<AttentionText> = SPEC.attention;

/** The badge's tooltip: one line per non-zero count, then the hint ("" when nothing waits). */
export function attentionBadgeTooltip(waiting: number, results: number): string {
  const t = SPEC.attention;
  const lines: string[] = [];
  if (waiting === 1) lines.push(t.waiting_one);
  else if (waiting > 1) lines.push(t.waiting_many.replace("{n}", String(waiting)));
  if (results === 1) lines.push(t.result_one);
  else if (results > 1) lines.push(t.result_many.replace("{n}", String(results)));
  return lines.length ? [...lines, t.open_hint].join("\n") : "";
}

/** The badge's accessible name ("3 waiting for you"); "" at zero. */
export function attentionBadgeLabel(total: number): string {
  return total > 0 ? SPEC.attention.label.replace("{n}", String(total)) : "";
}

/** The run-now line added when the summary carries a next run ("{time}" = `formatServedLocal` of the served `next_run_local`). */
export const RUN_NOW_NEXT_RUN_LINE: string = SPEC.run_now_next_run_line;
/** The run-now line added for a Growing-context automation (a manual run is a turn of its session). */
export const RUN_NOW_GROWING_LINE: string = SPEC.run_now_growing_line;

/**
 * A control's hint for this automation: `CONTROL_HINTS[id]`, plus, for Run
 * now, the next scheduled time when the server reports one and the Growing
 * line when the automation replays its history.
 */
export function controlHint(id: ControlId, summary?: Pick<AutomationSummary, "next_run_local" | "time_zone" | "context_mode">): string {
  const lines = [CONTROL_HINTS[id]];
  if (id === "run_now" && summary) {
    if (summary.next_run_local) lines.push(RUN_NOW_NEXT_RUN_LINE.replace("{time}", formatServedLocal(summary.next_run_local, summary.time_zone)));
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
  // An archived automation shows Unarchive in place of Archive (0.7.0); the
  // other controls stay visible, disabled with the "Archived" reason.
  const archived = p.summary.status === "archived";
  // ONE Run now / Stop button (spec G): Stop while a run is in progress (the served
  // `current_occurrence`), Run now otherwise.
  const runId: ControlId = p.summary.current_occurrence ? "stop_current" : "run_now";
  // A stopped automation cannot run until it is restarted: its notice carries Restart, and a
  // dimmed primary "Run now" next to it read as a second, broken way to start it.
  const stopped = p.summary.status === "failed";
  const shown: ControlId[] = ["active", ...(stopped ? [] : [runId]), "revise", archived ? "unarchive" : "archive"];
  const why = disabledReasons(c, shown, p.idBase ?? `af-auto-${p.summary.automation_id}`);
  const btn = (id: ControlId, onClick: () => void, extra?: { pressed?: boolean; tone?: "primary" | "danger"; action?: string; label?: string }) => {
    const hint = controlHint(id, p.summary);
    const label = extra?.label ?? CONTROL_LABELS[id];
    return (
    <button
      key={id}
      type="button"
      className={`af-auto__btn${extra?.tone ? ` af-auto__btn--${extra.tone}` : ""}`}
      data-action={extra?.action ?? id}
      disabled={!c[id].enabled}
      title={c[id].enabled ? hint : `${c[id].reason}\n${hint}`}
      aria-label={label}
      aria-description={hint}
      aria-describedby={why.describedBy[id]}
      aria-pressed={extra?.pressed}
      onClick={onClick}
    >
      <IconLabel icon={CONTROL_ICONS[id]} label={label} />
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
          {stopped ? null : runId === "run_now" ? btn("run_now", () => p.onCommand(CONTROL_COMMANDS.run_now), { tone: "primary" }) : btn("stop_current", () => p.onCommand(CONTROL_COMMANDS.stop_current), { tone: "danger" })}
          {btn("revise", p.onToggleRevise, { pressed: p.reviseOpen, action: "edit" })}
          {p.onOpenDetails ? (
            <button
              type="button"
              className="af-auto__btn"
              data-action="details"
              aria-haspopup="dialog"
              aria-expanded={p.detailsOpen === true}
              aria-label={AUTOMATION_EDIT_WORDS.header.details}
              title={AUTOMATION_EDIT_WORDS.header.details_hint}
              onClick={p.onOpenDetails}
            >
              <IconLabel icon="info" label={AUTOMATION_EDIT_WORDS.header.details} />
            </button>
          ) : null}
          {archived ? btn("unarchive", () => p.onCommand(CONTROL_COMMANDS.unarchive)) : btn("archive", p.onAskArchive, { label: "Archive…" })}
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
      {/* Why a button is disabled: its tooltip and its aria-describedby (spec G: the header's one
          visible reason line is the failed / paused / archived note a person can act on). */}
      {why.lines.length ? (
        <p className="af-auto__reasons af-auto__sr-only">
          {why.lines.map((l) => (
            <span key={l.id} id={l.id}>
              {l.text}
            </span>
          ))}
        </p>
      ) : null}
      {p.confirmingArchive && !archived ? (
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
// The Edit form lives in ./AutomationEditForm.tsx (spec E); re-exported here under its names.
export { AutomationReviseForm, type AutomationReviseFormProps, type AutomationModelPickerOptions } from "./AutomationEditForm.js";

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
  /** See `AutomationPanelProps.turnChrome` (read only with `renderTurn`). */
  turnChrome?: "card";
  readMarker?: React.ReactNode;
  /** See `AutomationPanelProps.onOpenWorkspace` (called with this occurrence's run id). */
  onOpenWorkspace?(runId: string): void;
  /** See `AutomationPanelProps.onOpenResource`. */
  onOpenResource?(resource: GatewayResource): void;
  /** See `AutomationPanelProps.onOpenContext`. */
  onOpenContext?(run: { runId: string; index: number }): void;
  /** What arrived (`occurrenceEventCard` of the run's `input_data.event`): the card above the task. */
  eventCard?: OccurrenceEventCard | null;
  /**
   * The automation's task (`definition.target.input_data.prompt`). When the occurrence's
   * `user_turn` carries it verbatim, the turn shows the task alone and the whole text the agent
   * received (trigger header, framed events) moves behind "What the agent received".
   */
  task?: string;
  /** The automation's time zone (the summary's `time_zone`) for the run's time; default the viewer's. */
  timeZone?: string;
  nowMs?: number;
  /** The summary's `current_occurrence` when it is THIS row's run: its live line (`AutomationLiveLine`)
   * shows under the badge. Absent = the row as before. */
  current?: CurrentOccurrence | null;
};

/**
 * The task when an occurrence's text is the runtime's framing of it (AbstractRuntime
 * `controller._render_prompt`: "[Trigger …]" on the first line, then the task verbatim; a feed or
 * webhook's events framed after a blank line), else null. Exact positions only, never a search.
 */
export function taskOfTurn(userTurn: string | null | undefined, task: string | null | undefined): string | null {
  const t = typeof task === "string" ? task.trim() : "";
  const turn = typeof userTurn === "string" ? userTurn : "";
  const nl = turn.indexOf("\n");
  if (!t || nl < 0 || !turn.startsWith("[")) return null;
  const rest = turn.slice(nl + 1);
  return rest === t || rest.startsWith(`${t}\n`) ? t : null;
}

/** How a run started, in words, for its meta line ("Run #3 · on schedule · today 08:00"). */
export function occurrenceStartWords(row: Pick<OccurrenceRow, "trigger">): string {
  const source = String(row.trigger?.source_id || "");
  if (source === "schedule") return "on schedule";
  if (source === "manual") return "run by hand";
  if (source.startsWith("email")) return "new mail";
  return source ? "something arrived" : "";
}

/** The summary of the disclosure that holds the raw text an occurrence's agent received. */
export const RECEIVED_LABEL = "What the agent received";

/**
 * Whether a run's notification is shown under its answer. The response is shown once, in the answer
 * bubble: a notification whose text (its body, else its title) is the answer's text, both trimmed
 * and compared exactly, is a delivery fact only (the "Notified" badge says it) and is not shown.
 * One whose text differs, or a run with no answer, shows it, after the answer.
 */
export function notifyShown(row: Pick<OccurrenceRow, "notify" | "answer">): boolean {
  if (!row.notify) return false;
  const sent = (row.notify.body || "").trim() || (row.notify.title || "").trim();
  const answer = (row.answer || "").trim();
  return !answer || sent !== answer;
}

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
/** The tool-approval card's first line (operator ruling 2026-10-29). */
export const TOOL_APPROVAL_HEADING = "The automation wants to use these tools:";

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
        {/* Operator ruling 2026-10-29: the bold first line (the card's only bold), one bullet per call. */}
        {calls && calls.length ? (
          <ToolCallWordsList calls={calls} heading={TOOL_APPROVAL_HEADING} headingId={promptId} label="Tool calls to approve" className="af-auto-wait__calls" />
        ) : (
          <>
            <p className="af-toolwords__heading" id={promptId}><strong>{TOOL_APPROVAL_HEADING}</strong></p>
            <p className="af-auto__hint">The gateway did not list the tool calls; open the run to see them before approving.</p>
          </>
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
          const parsed = eventPayloadFromWords(fieldValue(e.currentTarget, "payload"));
          if (parsed.ok) answer({ payload: parsed.payload });
          else p.onWaitError?.(parsed.error);
        }}
      >
        {head("The run waits for an event.")}
        <textarea name="payload" rows={3} aria-label="What happened" placeholder="What happened, in a few words (for example: the signed contract arrived)" disabled={p.busy} />
        <p className="af-auto__hint">Your words are sent as the event's text.</p>
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

/** How long the opened-at item stays outlined. */
export const ATTENTION_FOCUS_MS = 2600;

/** What an automation opens on (the attention rule): the first unresolved wait's card in the
 * thread (runs are listed oldest first, so the first in the document), else the run of the oldest
 * unseen result (`unseenIndex`), else nothing. */
export function attentionTarget(root: ParentNode | null, unseenIndex?: number): HTMLElement | null {
  if (!root) return null;
  const wait = root.querySelector<HTMLElement>(".af-auto-occ .af-auto-wait");
  if (wait) return wait;
  if (typeof unseenIndex === "number") return root.querySelector<HTMLElement>(`.af-auto-occ[data-index="${unseenIndex}"]`);
  return null;
}

/** The selector of the newest run's row: runs are listed oldest first, so the timeline's last one. */
export const NEWEST_RUN_SELECTOR = ".af-auto__timeline > li.af-auto-occ:last-child";

/** The newest run's row (`NEWEST_RUN_SELECTOR`), or null. */
export function newestRunRow(root: ParentNode | null): HTMLElement | null {
  return root ? root.querySelector<HTMLElement>(NEWEST_RUN_SELECTOR) : null;
}

/**
 * Where an opening lands (spec B): what needs the person (`attentionTarget`: a wait to answer,
 * else the oldest unseen result), else the START of the newest run (`newestRunRow`). Null when no
 * run is on screen.
 */
export function openingTarget(root: ParentNode | null, unseenIndex?: number): { el: HTMLElement; reason: "attention" | "latest" } | null {
  const attention = attentionTarget(root, unseenIndex);
  if (attention) return { el: attention, reason: "attention" };
  const latest = newestRunRow(root);
  return latest ? { el: latest, reason: "latest" } : null;
}

/**
 * The opening is decided ONCE per automation (selecting it in a list): `decide` answers true
 * exactly once per `key` (the automation's id), on the first render that shows its runs, and
 * false on every later render (a refresh, new rows, a live-line change, a wait that arrives
 * later). An automation that has no run (`runCount` 0) is decided at once, with nothing to scroll
 * to; one whose runs are still loading (none shown, some counted) waits for them.
 */
export class OpeningOnce {
  private decided: string | null = null;
  decide(key: string, rowsShown: number, runCount: number): boolean {
    if (this.decided === key) return false;
    if (rowsShown === 0 && runCount > 0) return false;
    this.decided = key;
    return rowsShown > 0;
  }
}

type ScrollBox = { scrollTop: number; scrollHeight: number; clientHeight: number; parentElement: ScrollBox | null };
/**
 * The element that scrolls `el` vertically: the nearest ancestor whose `overflow-y` lets it scroll
 * and whose content overflows it, else the document's scrolling element (`fallback`).
 */
export function scrollParentOf<T extends ScrollBox>(el: T | null, styleOf: (node: T) => { overflowY: string }, fallback: T | null): T | null {
  for (let node = (el?.parentElement ?? null) as T | null; node; node = node.parentElement as T | null) {
    const o = styleOf(node).overflowY;
    if ((o === "auto" || o === "scroll" || o === "overlay") && node.scrollHeight > node.clientHeight) return node;
  }
  return fallback;
}

/** A run row's place on screen: its `data-run-id`, its top and bottom (viewport px). */
export type RunRowPlace = { runId: string; top: number; bottom: number };

/**
 * The run row "Load earlier runs" keeps in place: the first row (in the order given, oldest first)
 * that shows in the scroll area `[boxTop, boxBottom)`, with its top relative to the area's top.
 * Null when no row shows.
 */
export function visibleRunAnchor(rows: readonly RunRowPlace[], boxTop: number, boxBottom: number): { runId: string; offset: number } | null {
  for (const r of rows) if (r.bottom > boxTop && r.top < boxBottom) return { runId: r.runId, offset: r.top - boxTop };
  return null;
}

/**
 * The scroll offset that puts a row at `wantedOffset` from the top of the scroll area, given its
 * offset now (`rowOffset`), within what the content allows (0 … scrollHeight − clientHeight).
 * "Load earlier runs": the anchor row back at the offset it had before the click. The opening
 * (spec B), the same rule with `wantedOffset` 0: the newest run's start at the top when the content
 * allows; otherwise the list is at its end, where a newest run shorter than the area shows whole
 * (`scrollIntoView({block: "start"})`, which the panel uses for the opening, clamps the same way).
 */
export function anchoredScrollTop(scrollTop: number, rowOffset: number, wantedOffset: number, scrollHeight: number, clientHeight: number): number {
  const max = Math.max(0, scrollHeight - clientHeight);
  return Math.min(max, Math.max(0, scrollTop + rowOffset - wantedOffset));
}

/** How long "Load earlier runs" keeps re-applying its anchor while the rows above it settle. */
export const EARLIER_HOLD_MS = 1000;
/** How long the opening (card chrome) holds its place while the cards' files and pictures load. */
export const OPENING_HOLD_MS = 3000;

/**
 * Keeps a run row at `offset` from the top of `box`'s scroll area while `list` changes size (late
 * content in the rows just added: cards a host fills in a later commit, images), until the person
 * scrolls (wheel, touch, a key, a press on the scroll area or its scrollbar) or `EARLIER_HOLD_MS`
 * has passed, whichever comes first. Returns the stop (idempotent); everything is disconnected then.
 */
function holdRunAnchor(box: HTMLElement, list: Element, rowOf: () => HTMLElement | undefined, offset: number, holdMs: number = EARLIER_HOLD_MS): () => void {
  const doc = box.ownerDocument;
  const win = doc.defaultView as (Window & typeof globalThis) | null;
  if (!win || typeof win.ResizeObserver !== "function") return () => {};
  const pageScroller = box === doc.scrollingElement || box === doc.documentElement;
  const target: EventTarget = pageScroller ? win : box;
  const personEvents = ["wheel", "touchstart", "pointerdown", "mousedown"] as const;
  let stopped = false;
  const apply = () => {
    const row = rowOf();
    if (!row || !box.isConnected) return stop();
    box.scrollTop = anchoredScrollTop(box.scrollTop, row.getBoundingClientRect().top - scrollAreaOf(box).top, offset, box.scrollHeight, box.clientHeight);
  };
  const ro = new win.ResizeObserver(() => {
    if (!stopped) apply();
  });
  const timer = win.setTimeout(() => stop(), holdMs);
  function stop(): void {
    if (stopped) return;
    stopped = true;
    ro.disconnect();
    win!.clearTimeout(timer);
    for (const e of personEvents) target.removeEventListener(e, stop, true);
    win!.removeEventListener("keydown", stop, true);
  }
  for (const e of personEvents) target.addEventListener(e, stop, { capture: true, passive: true });
  win.addEventListener("keydown", stop, { capture: true, passive: true });
  ro.observe(list);
  return stop;
}

/** The top and bottom (viewport px) of the area `box` scrolls: the viewport for the page's scroller. */
function scrollAreaOf(box: HTMLElement): { top: number; bottom: number } {
  const doc = box.ownerDocument;
  if (box === doc.scrollingElement || box === doc.documentElement) return { top: 0, bottom: box.clientHeight };
  const top = box.getBoundingClientRect().top + (box.clientTop || 0);
  return { top, bottom: top + box.clientHeight };
}

const useBeforePaint = typeof window === "undefined" ? useEffect : useLayoutEffect;

export function OccurrencePair(p: OccurrencePairProps): React.ReactElement {
  const { row, tone, badge, statusText } = p.view;
  const idBase = `af-auto-occ-${row.run_id}`;
  const render = p.renderText ?? plainTextRenderer;
  const discussOk = p.discuss.enabled && p.view.canDiscuss && !p.busy;
  const discussWhy = !p.discuss.enabled ? p.discuss.reason ?? "Not available." : !p.view.canDiscuss ? "Available once this run finishes." : null;
  // Card chrome (spec F): the shared chat card draws the time, the files and the working state.
  const card = p.turnChrome === "card" && !!p.renderTurn;
  const turn = (kind: AutomationTurn["kind"], text: string, extra?: Pick<AutomationTurn, "ts" | "live" | "artifacts">) =>
    p.renderTurn
      ? p.renderTurn({ kind, role: kind === "trigger" ? "user" : "assistant", text, index: row.index, runId: row.run_id, ...(card ? { chrome: "card" as const, ...extra } : {}) })
      : render(text);
  const turnClass = p.renderTurn ? " af-auto-turn--card" : "";
  // The task alone when the turn is the runtime's framing of it — its one-line trigger header, then
  // the task verbatim, then nothing or the appended events (structure, not prose); the whole
  // received text goes behind a disclosure.
  const task = typeof p.task === "string" ? p.task.trim() : "";
  const showTask = taskOfTurn(row.user_turn, task) !== null;
  const started = occurrenceStartWords(row);
  const firedWords = whenWords(row.fired_at, { timeZone: p.timeZone, nowMs: p.nowMs, style: "day" });
  // Only when there is a line to show: the pair stays hook-free otherwise (the row as before).
  const liveShown = !!(p.current && automationLiveWords(p.current));
  const empty =
    tone === "failed" ? (row.failure ? "No answer." : "No answer: the run failed.") : tone === "waiting" ? "Waiting for your answer." : tone === "running" ? "Running…" : "No answer.";
  const contextButton = p.onOpenContext ? (
    <button
      type="button"
      className="af-btn af-btn--quiet af-auto-context-btn"
      data-action="open-context"
      title={AUTOMATION_EDIT_WORDS.context.button_hint}
      aria-label={`${AUTOMATION_EDIT_WORDS.context.button} · Run #${row.index}`}
      onClick={() => p.onOpenContext?.({ runId: row.run_id, index: row.index })}
    >
      <Icon name="info" size={14} className="af-btn__icon" />
      <span>{AUTOMATION_EDIT_WORDS.context.button}</span>
    </button>
  ) : null;
  const firedTitle = `${row.trigger.summary} · fired ${whenWords(row.fired_at, { timeZone: p.timeZone, nowMs: p.nowMs, style: "day" })}`;
  // Card chrome: a run in progress has no answer yet; its card shows the working state.
  const liveAnswer = card && !row.answer && tone === "running";
  return (
    <li className={`af-auto-occ af-auto-occ--${tone}`} data-index={row.index} data-tone={tone} data-run-id={row.run_id} aria-labelledby={`${idBase}-h`} {...(card ? { "data-chrome": "card" } : {})}>
      <div className={`af-auto-turn af-auto-turn--trigger${turnClass}`} data-turn="trigger">
        {card ? (
          // The run line: no time (it is in the card, in the reader's zone); the automation's zone is the tooltip.
          <div className="af-auto-turn__meta af-auto-turn__runline" title={firedTitle}>
            <span className="af-auto-turn__runwords" id={`${idBase}-h`}>
              <span className="af-auto-turn__index">Run #{row.index}</span>
              {started ? ` · ${started}` : ""}
            </span>
            {contextButton}
          </div>
        ) : (
        <div className="af-auto-turn__meta" id={`${idBase}-h`} title={firedTitle}>
          <span className="af-auto-turn__index">Run #{row.index}</span>
          {started ? ` · ${started}` : ""}
          {firedWords ? ` · ${firedWords}` : ""}
        </div>
        )}
        {p.eventCard ? (
          <div className="af-auto-event" data-event-card="true">
            <Icon name="inbox" size={14} className="af-auto__btn-icon" />
            <span className="af-auto-event__text">
              <strong className="af-auto-event__source">{p.eventCard.source}</strong>
              {p.eventCard.what ? <span> · {p.eventCard.what}</span> : null}
              {p.eventCard.at ? <span className="af-auto-turn__muted"> · {p.eventCard.at}</span> : null}
            </span>
          </div>
        ) : null}
        {/* A flow with no task (it reads only what arrived) has no message: no empty bubble (UX re-review #14). */}
        {(showTask ? task : row.user_turn).trim() ? <div className="af-auto-turn__text">{turn("trigger", showTask ? task : row.user_turn, { ts: row.fired_at })}</div> : null}
        {p.onOpenContext ? (
          card ? null : <div className="af-auto-turn__context">{contextButton}</div>
        ) : showTask ? (
          <details className="af-auto-received" data-received="true">
            <summary>{RECEIVED_LABEL}</summary>
            <div className="af-auto-received__body">{render(row.user_turn)}</div>
          </details>
        ) : null}
      </div>
      <div className={`af-auto-turn af-auto-turn--answer${turnClass}`} data-turn="answer">
        {card ? (
          badge || statusText ? (
            <div className="af-auto-turn__meta">
              {badge ? <span className={`af-auto-badge af-auto-badge--${tone}`}>{badge}</span> : null}
              {statusText ? <span className="af-auto-turn__status">{statusText}</span> : null}
            </div>
          ) : null
        ) : (
        <div className="af-auto-turn__meta">
          {badge ? <span className={`af-auto-badge af-auto-badge--${tone}`}>{badge}</span> : null}
          {statusText ? <span className="af-auto-turn__status">{statusText}</span> : null}
          {/* One time format with the run's own line ("today 17:29"); the UTC time is the tooltip. */}
          {row.finished_at ? <span title={whenWords(row.finished_at, { timeZone: p.timeZone, nowMs: p.nowMs, style: "clock" })}> · {whenWords(row.finished_at, { timeZone: p.timeZone, nowMs: p.nowMs, style: "day" })}</span> : null}
        </div>
        )}
        {/* Card chrome: the live line is the card's footer (the host's renderer draws it). */}
        {liveShown && !liveAnswer ? <AutomationLiveLine current={p.current!} nowMs={p.nowMs} /> : null}
        {row.failure ? (
          <div className="af-auto-failure" data-failure={row.failure.reason_code}>
            <strong>{failureReasonWords(row.failure.reason_code)}</strong>
            {row.failure.message && row.failure.message.trim().toLowerCase() !== failureReasonWords(row.failure.reason_code).toLowerCase() ? `: ${row.failure.message}` : ""}{" "}
            <span className="af-auto-turn__muted">
              (after {row.failure.attempts} {row.failure.attempts === 1 ? "attempt" : "attempts"})
            </span>
          </div>
        ) : null}
        {/* The live line already says the run is in progress: no "Running…" under it too. */}
        {card ? (
          row.answer || liveAnswer || row.artifacts.length ? (
            <>
              {!row.answer && !liveAnswer ? <div className="af-auto-turn__empty">{empty}</div> : null}
              <div className="af-auto-turn__text">
                {turn("answer", row.answer ?? "", {
                  ...(row.finished_at ? { ts: row.finished_at } : {}),
                  ...(liveAnswer ? { live: { current: p.current ?? null, ...(p.nowMs !== undefined ? { nowMs: p.nowMs } : {}) } } : {}),
                  artifacts: row.artifacts,
                })}
              </div>
            </>
          ) : (
            <div className="af-auto-turn__empty">{empty}</div>
          )
        ) : row.answer ? <div className="af-auto-turn__text">{turn("answer", row.answer)}</div> : liveShown ? null : <div className="af-auto-turn__empty">{empty}</div>}
        {/* What the person was sent, after the response, only when it is not the response itself. */}
        {row.notify && notifyShown(row) ? (
          <div className="af-auto-notify" data-notify="true">
            <span className="af-auto-notify__label">{AUTOMATION_EDIT_WORDS.run.notify_sent}</span>
            <strong>{row.notify.title}</strong>
            {row.notify.body ? <div className="af-auto-notify__body">{render(row.notify.body)}</div> : null}
          </div>
        ) : null}
        {row.artifacts.length && !card ? (
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
        {p.readMarker}
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
            aria-label={`${DISCUSS_LABEL}, from run ${row.index}`}
            onSubmit={(e) => {
              e.preventDefault();
              const v = fieldValue(e.currentTarget, "prompt");
              if (v) p.onDiscussSubmit(row.index, v);
            }}
          >
            <p className="af-auto__hint">
              Starts a new conversation from run #{row.index} with the automation's whole history (runs 1–{row.index}). It works in its own folder; the automation's files can be read but not changed (by the file tools; shell commands are not sandboxed), and nothing is written back into the automation.
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

// A notice names the NEW STATE (operator rule 2026-09-30), never the command that was sent.
export const COMMAND_NOTICES: Readonly<Record<string, string>> = {
  [CONTROL_COMMANDS.pause]: "Automation paused.",
  [CONTROL_COMMANDS.resume]: "Automation active.",
  [CONTROL_COMMANDS.run_now]: "Run requested.",
  [CONTROL_COMMANDS.stop_current]: "Stop requested.",
  [CONTROL_COMMANDS.unarchive]: "Unarchived: it is paused until you make it active.",
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
  const [detailsOpen, setDetailsOpen] = useState(false);
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
  // The header notice's button (Restart / Turn back on / Unarchive; Edit opens the form).
  const noticeAction = useAutomationNoticeAction(summary, ids, props.onCommand, () => {
    setReviseErrors([]);
    setReviseOpen(true);
  }, props.nowMs);

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

  // Loading a summary is not consumption. Keep a bounded set of the current
  // page's visibly consumed items; /seen may advance only through their prefix.
  const consumedRef = useRef({ id: summary.automation_id, cursors: new Set<string>() });
  const [, consumedChanged] = useState(0);
  if (consumedRef.current.id !== summary.automation_id) consumedRef.current = { id: summary.automation_id, cursors: new Set() };
  const currentCursors = new Set(summary.attention.items.map((it) => it.cursor));
  for (const cursor of consumedRef.current.cursors) if (!currentCursors.has(cursor)) consumedRef.current.cursors.delete(cursor);
  const markConsumed = (cursor: string) => {
    const owner = summary.automation_id;
    if (consumedRef.current.id !== owner || consumedRef.current.cursors.has(cursor)) return;
    consumedRef.current.cursors.add(cursor);
    consumedChanged((n) => n + 1);
  };
  const marker = (cursor: string) => <VisibleContentMarker key={`${summary.automation_id}:${cursor}`} ownerKey={summary.automation_id}
    contentKey={cursor} enabled onConsume={() => markConsumed(cursor)} />;
  const ack = consumedAttentionCursor(summary, consumedRef.current.cursors);
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

  // The opening (spec B), decided ONCE per automation when its runs are on screen: what needs the
  // person (outlined for a moment), else the start of the newest run, at the top of the scroll area.
  const openingRef = useRef<OpeningOnce | null>(null);
  if (!openingRef.current) openingRef.current = new OpeningOnce();
  const focusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const openAt = props.openAt ?? "attention";
  const firstUnseen = summary.attention.items[0]?.index;
  const cardChrome = props.turnChrome === "card" && !!props.renderTurn;
  useEffect(() => {
    if (openAt !== "attention") return;
    if (!(openingRef.current as OpeningOnce).decide(summary.automation_id, props.occurrences.length, summary.occurrence_count)) return;
    const target = openingTarget(rootRef.current, firstUnseen);
    if (!target) return;
    (target.el as { scrollIntoView?: (o: object) => void }).scrollIntoView?.({ block: "start" });
    // Card chrome: files and pictures in the cards load after this commit (their names, their
    // thumbnails), above and below; the opening's rule is held while they settle, until the person
    // scrolls: the target's start at the top of the scroll area, as far as the content allows (a
    // newest run too short to reach the top follows the end as content grows below it).
    if (cardChrome && typeof getComputedStyle === "function") {
      const el = target.el;
      const doc = el.ownerDocument;
      const box = scrollParentOf<HTMLElement>(el, (n) => getComputedStyle(n), (doc.scrollingElement as HTMLElement | null) ?? doc.documentElement);
      const list = rootRef.current?.querySelector(".af-auto__timeline");
      if (box && list) {
        holdRef.current?.();
        holdRef.current = holdRunAnchor(box, list, () => (el.isConnected ? el : undefined), 0, OPENING_HOLD_MS);
      }
    }
    if (target.reason !== "attention") return;
    const el = target.el;
    el.classList.add("is-attention-focus");
    if (focusTimerRef.current) clearTimeout(focusTimerRef.current);
    focusTimerRef.current = setTimeout(() => el.classList.remove("is-attention-focus"), ATTENTION_FOCUS_MS);
  }, [openAt, summary.automation_id, props.occurrences, summary.occurrence_count, firstUnseen, cardChrome]);
  useEffect(() => () => {
    if (focusTimerRef.current) clearTimeout(focusTimerRef.current);
  }, []);

  // "Load earlier runs" keeps what the person looks at in place, by ANCHOR: the click remembers the
  // first run row showing in the scroll area and its top there; once the earlier rows are in, the
  // scroll is set so that same row (`data-run-id`) has the same top — whatever the button and the
  // margins above it did meanwhile.
  const earlierRef = useRef<{ key: string; rows: number; box: HTMLElement; runId: string; offset: number } | null>(null);
  // The anchor stays held a moment after the restore (`holdRunAnchor`): rows above it keep changing
  // height after the commit that added them.
  const holdRef = useRef<(() => void) | null>(null);
  useEffect(() => () => holdRef.current?.(), []);
  const runRows = () => Array.from(rootRef.current?.querySelectorAll<HTMLElement>("li.af-auto-occ[data-run-id]") ?? []);
  const loadEarlier = () => {
    earlierRef.current = null;
    holdRef.current?.();
    holdRef.current = null;
    const rows = runRows();
    if (rows.length) {
      const doc = rows[0].ownerDocument;
      const box = scrollParentOf<HTMLElement>(rows[0], (n) => getComputedStyle(n), (doc.scrollingElement as HTMLElement | null) ?? doc.documentElement);
      if (box) {
        const area = scrollAreaOf(box);
        const anchor = visibleRunAnchor(rows.map((r) => { const b = r.getBoundingClientRect(); return { runId: r.getAttribute("data-run-id") ?? "", top: b.top, bottom: b.bottom }; }), area.top, area.bottom);
        if (anchor) earlierRef.current = { key: summary.automation_id, rows: props.occurrences.length, box, ...anchor };
      }
    }
    props.onLoadMore();
  };
  useBeforePaint(() => {
    const pending = earlierRef.current;
    if (!pending) return;
    const row = runRows().find((r) => r.getAttribute("data-run-id") === pending.runId);
    if (pending.key !== summary.automation_id || !row || !pending.box.isConnected) {
      earlierRef.current = null;
      return;
    }
    if (props.occurrences.length <= pending.rows) return;
    earlierRef.current = null;
    const box = pending.box;
    box.scrollTop = anchoredScrollTop(box.scrollTop, row.getBoundingClientRect().top - scrollAreaOf(box).top, pending.offset, box.scrollHeight, box.clientHeight);
    holdRef.current?.();
    const list = row.parentElement;
    holdRef.current = list ? holdRunAnchor(box, list, () => runRows().find((r) => r.getAttribute("data-run-id") === pending.runId), pending.offset) : null;
  }, [props.occurrences, summary.automation_id]);

  const controls = automationControls(summary, props.occurrences, busy);
  const views = occurrenceViews(props.occurrences);
  const task = (props.definition?.target.input_data as { prompt?: unknown } | undefined)?.prompt;
  const eventCardOf = (runId: string): OccurrenceEventCard | null =>
    props.occurrenceEvents && runId in props.occurrenceEvents
      ? occurrenceEventCard(props.occurrenceEvents[runId], { trigger: summary.trigger, connections: props.triggerConnections, mailboxes: props.mailboxes, timeZone: summary.time_zone, nowMs: props.nowMs })
      : null;
  const more = summary.occurrence_count - props.occurrences.length;
  const shownError = localError ?? props.error ?? null;
  const errText = shownError ? apiErrorText(shownError) : null;
  const att = summary.attention;
  const current = summary.current_occurrence;

  return (
    <section ref={rootRef} className={`af-auto${props.className ? ` ${props.className}` : ""}`} {...(props.hideHeader ? { "aria-label": summary.title } : { "aria-labelledby": titleId })} aria-busy={busy} data-text-rendering={props.renderText ? "rich" : "unformatted"}>
      {props.hideHeader ? null : <>
      <AutomationHeader
        summary={summary}
        definition={props.definition}
        workflowLabel={props.workflowName}
        triggerSources={props.triggerSources}
        titleId={titleId}
        nowMs={props.nowMs}
        onOpenWorkspace={props.onOpenWorkspace}
        triggerConnections={props.triggerConnections}
        mailboxes={props.mailboxes}
        extraChip={props.headerChip}
        editSections={editable ? new Set<AutomationEditSection>(["what"]) : undefined}
        onNoticeAction={noticeAction.onAction}
        noticeState={noticeAction.state}
        busy={busy}
        controls={
      <AutomationControlsBar
        summary={summary}
        occurrences={props.occurrences}
        busy={busy}
        confirmingArchive={confirmingArchive}
        reviseOpen={reviseOpen}
        notice={notice}
        onDismissNotice={() => setNotice(null)}
        idBase={`${titleId}-ctl`}
        {...(props.definition ? { onOpenDetails: () => setDetailsOpen(true), detailsOpen } : {})}
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
        }
      />
      {props.definition ? (
        <AutomationDetailsDialog open={detailsOpen} onClose={() => setDetailsOpen(false)} summary={summary}>
          <AutomationDefinitionBlock definition={props.definition} renderText={render} served={summary} triggerConnections={props.triggerConnections} mailboxes={props.mailboxes} defaultModelLabel={props.modelPickerOptions?.defaultModeLabel} {...(props.headerChip ? { workspaces: props.headerChip.label } : {})} />
        </AutomationDetailsDialog>
      ) : null}
      </>}
      {reviseOpen && editBase ? (
        <AutomationReviseForm
          presentation="dialog"
          summary={editBase.summary}
          definition={editBase.definition}
          busy={busy}
          // A refused save is said inside the dialog too (the panel's error line is behind it).
          errors={localError ? [...reviseErrors, `${apiErrorText(localError).title} ${apiErrorText(localError).detail}`.trim()] : reviseErrors}
          toolCatalog={props.toolCatalog}
          workflowPickerOptions={props.workflowPickerOptions}
          modelPickerOptions={props.modelPickerOptions}
          emailStatus={props.emailStatus}
          onOpenMyEmail={props.onOpenMyEmail}
          previewSchedule={props.previewSchedule}
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
            act(`revise:${base.revision}:${JSON.stringify(changes)}`, async (command_id) => {
              const prepared = form.target && changes.target ? { ...changes, target: await (props.prepareTarget ? props.prepareTarget(changes.target) : prepareAutomationTarget(changes.target, props.workflowPickerOptions!)) } : changes;
              return props.onRevise(prepared, base.revision, { command_id });
            }, () => {
              setNotice("Saved; applies from the next run.");
              setReviseOpen(false);
              setFocusAfter(['[data-action="edit"]']);
            });
          }}
        />
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
                <strong>{it.title}</strong> <span className="af-auto-turn__muted">Run #{it.index} · {whenWords(it.at, { timeZone: summary.time_zone, nowMs: props.nowMs, style: "day" })}</span>
                {it.body ? <div className="af-auto__attention-body">{render(it.body)}</div> : null}
                {marker(it.cursor)}
              </li>
            ))}
            {att.waits.map((w) => (
              <li key={`${w.run_id}:${w.wait_key}`} className="af-auto__attention-item af-auto__attention-item--wait">
                <span className="af-auto-badge af-auto-badge--waiting" data-wait-kind={w.kind}>
                  {WAIT_KIND_LABELS[w.kind] ?? "Waiting for you"}
                </span>{" "}
                <span className="af-auto-turn__muted">Run #{w.index}</span>
                {w.prompt ? <div className="af-auto__attention-body">{render(w.prompt)}</div> : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {more > 0 ? (
        <button type="button" className="af-auto__btn af-auto__more" data-action="load-more" disabled={busy} onClick={loadEarlier}>
          <IconLabel icon="history" label={`Load earlier runs (${more} more)`} />
        </button>
      ) : null}
      {views.length ? (
        <ol className="af-auto__timeline" aria-label="Runs">
          {views.map((v) => {
            const rowSel = `[data-index="${v.row.index}"]`;
            return (
              <OccurrencePair
                key={v.row.run_id}
                view={v}
                busy={busy}
                eventCard={eventCardOf(v.row.run_id)}
                task={typeof task === "string" ? task : undefined}
                timeZone={summary.time_zone}
                nowMs={props.nowMs}
                current={current && current.run_id === v.row.run_id ? current : null}
                discuss={controls.discuss}
                renderText={render}
                renderTurn={props.renderTurn}
                {...(props.turnChrome ? { turnChrome: props.turnChrome } : {})}
                readMarker={summary.attention.items.filter((it) => it.index === v.row.index).map((it) => marker(it.cursor))}
                onOpenWorkspace={props.onOpenWorkspace}
                onOpenContext={props.onOpenContext}
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
                  act(`discuss:${index}:${prompt}`, (request_id) => props.onDiscuss(index, prompt, { request_id }), () => {
                    setDiscussAt(null);
                    setNotice("Discussion started in a new conversation.");
                    setFocusAfter([`${rowSel} [data-action="discuss"]`]);
                  })
                }
              />
            );
          })}
        </ol>
      ) : (
        <p className="af-auto__empty">No runs yet.</p>
      )}
    </section>
  );
}

export default AutomationPanel;
