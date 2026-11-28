// The automation's header as ONE detached card (operator 2026-11-27: "a clear top header well
// detached that shows the parameters and enable changing them"): the kit's `AutomationHeader`
// (title + state, the `AutomationControlsBar`, the parameter chips) with the dialogs it opens —
// the Edit form (at the section of the chip that was clicked) and Details — and the line that says
// a refused action. The runs are NOT here: they are the shared chat thread under it (panel-chat
// `AutomationChat`). The same actions, ids and notices as `AutomationPanel`'s header.
import React, { useEffect, useId, useRef, useState } from "react";
import { Icon } from "../icon.js";
import type { ToolCatalogItem } from "../tool_plan.js";
import { AutomationReviseForm, automationEditSections, type AutomationEditSection, type AutomationModelPickerOptions } from "./AutomationEditForm.js";
import {
  AutomationControlsBar,
  AutomationDefinitionBlock,
  AutomationDetailsDialog,
  AutomationHeader,
  COMMAND_NOTICES,
  NOTICE_MS,
  plainTextRenderer,
  useAutomationNoticeAction,
  type AutomationHeaderChip,
  type RenderText,
} from "./AutomationPanel.js";
import type { AutomationWorkflowPickerOptions } from "./automation_workflow_picker.js";
import { ActionIds, CONTROL_COMMANDS, apiErrorText, automationControls, isApiError, mintUuid, pickFocusTarget, reviseChanges } from "./panel_core.js";
import { prepareAutomationTarget } from "./prepare_target.js";
import type { PreviewSchedule } from "./schedule_when.js";
import type {
  ApiError,
  AutomationChanges,
  AutomationDefinition,
  AutomationSummary,
  CommandReceipt,
  JsonObject,
  Mailbox,
  MyEmailStatus,
  OccurrenceRow,
  TriggerConnection,
  TriggerSource,
  TriggerSourceEntry,
} from "./types.js";

export type AutomationHeaderCardProps = {
  summary: AutomationSummary;
  definition?: AutomationDefinition;
  /** The loaded runs (the controls read them: Run now is refused while one is in flight). */
  occurrences: OccurrenceRow[];
  triggerSources: Array<TriggerSource | TriggerSourceEntry>;
  busy: boolean;
  /** The host's last refused request (shown under the header until the next action). */
  error?: ApiError;
  /** See `AutomationPanelProps.onRevise` (one id per action, reused on a retry). */
  onRevise(changes: AutomationChanges, expectedRevision: number | null, meta?: { command_id: string }): Promise<CommandReceipt>;
  /** See `AutomationPanelProps.onCommand`. */
  onCommand(type: string, payload?: JsonObject, meta?: { command_id: string }): Promise<CommandReceipt>;
  newId?: () => string;
  prepareTarget?(target: NonNullable<AutomationChanges["target"]>): Promise<NonNullable<AutomationChanges["target"]>>;
  workflowPickerOptions?: AutomationWorkflowPickerOptions;
  modelPickerOptions?: AutomationModelPickerOptions;
  toolCatalog?: readonly ToolCatalogItem[];
  emailStatus?: MyEmailStatus | null;
  onOpenMyEmail?: () => void;
  previewSchedule: PreviewSchedule;
  triggerConnections?: readonly TriggerConnection[] | null;
  mailboxes?: readonly Mailbox[] | null;
  /** The flow's name for a person: the Flow chip. */
  workflowName?: string;
  /** The host's chip (Observer: Workspaces, opening its chooser). */
  headerChip?: AutomationHeaderChip;
  /** The Files chip: the host's folder browser for the automation's own folder. */
  onOpenWorkspace?(runId: string): void;
  nowMs?: number;
  /** Controlled Edit dialog (a list row's Edit opens it at once); see `AutomationPanelProps.editOpen`. */
  editOpen?: boolean;
  /**
   * The card asks to open or close the Edit form. A chip asks `(true, section)`: the section it
   * stands for, so a host that edits on its own page opens its editor there; the Edit button,
   * Cancel and a save ask with `open` alone.
   */
  onEditOpenChange?(open: boolean, section?: AutomationEditSection): void;
  /** The shared chat renderer for the Details' task (panel-chat `renderAutomationText`). */
  renderText?: RenderText;
  className?: string;
};

function toApiError(e: unknown): ApiError {
  if (isApiError(e)) return e;
  const message = e && typeof e === "object" && "message" in e ? String((e as { message: unknown }).message) : String(e);
  return { status: 0, code: "client_error", message };
}

/** The header card: its own surface and border, a gap below it; the host keeps it at the top of the pane. */
export function AutomationHeaderCard(props: AutomationHeaderCardProps): React.ReactElement {
  const { summary, busy } = props;
  const render = props.renderText ?? plainTextRenderer;
  const titleId = useId();
  const rootRef = useRef<HTMLElement | null>(null);
  const [ownEditOpen, setOwnEditOpen] = useState(false);
  const controlled = props.editOpen !== undefined;
  const editable = automationControls(summary, props.occurrences, false).revise.enabled;
  const reviseOpen = editable && (controlled ? props.editOpen === true : ownEditOpen);
  // The section a chip opened the form at (null: from the Edit button, the top).
  const [section, setSection] = useState<AutomationEditSection | null>(null);
  // The automation as the form opened it: values, diff base and expected_revision (a concurrent
  // change is then a 409, never a silent revert).
  const editBaseRef = useRef<{ summary: AutomationSummary; definition?: AutomationDefinition } | null>(null);
  if (!reviseOpen) editBaseRef.current = null;
  else if (!editBaseRef.current || editBaseRef.current.summary.automation_id !== summary.automation_id)
    editBaseRef.current = { summary, definition: props.definition };
  const editBase = editBaseRef.current;
  const onEditOpenChangeRef = useRef(props.onEditOpenChange);
  onEditOpenChangeRef.current = props.onEditOpenChange;
  const setReviseOpen = (open: boolean, at: AutomationEditSection | null = null) => {
    setSection(open ? at : null);
    if (!controlled) setOwnEditOpen(open);
    if (open && at) onEditOpenChangeRef.current?.(open, at);
    else onEditOpenChangeRef.current?.(open);
  };
  const [reviseErrors, setReviseErrors] = useState<string[]>([]);
  const [confirmingArchive, setConfirmingArchive] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [localError, setLocalError] = useState<ApiError | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), NOTICE_MS);
    return () => clearTimeout(t);
  }, [notice]);
  useEffect(() => {
    if (reviseOpen) setReviseErrors([]);
    // Closed by any way (Cancel, a save, the automation archived meanwhile): the next opening starts
    // at the top unless a chip asks for a section again.
    else setSection(null);
  }, [reviseOpen, summary.automation_id]);
  const [focusAfter, setFocusAfter] = useState<string[] | null>(null);
  useEffect(() => {
    if (!focusAfter) return;
    pickFocusTarget(rootRef.current, [...focusAfter, ".af-auto__notice", ".af-auto__title"])?.focus();
    setFocusAfter(null);
  }, [focusAfter]);

  const idsRef = useRef<ActionIds | null>(null);
  if (!idsRef.current) idsRef.current = new ActionIds(props.newId ?? mintUuid);
  const ids = idsRef.current;
  // The header notice's button: Restart (a stopped automation), Turn back on, Unarchive, or Edit at the Flow section.
  const noticeAction = useAutomationNoticeAction(summary, ids, props.onCommand, (at) => {
    setReviseErrors([]);
    setReviseOpen(true, at);
  }, props.nowMs);
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
        setLocalError(toApiError(error));
      },
    );
  };

  const sections = editable ? automationEditSections(summary, props.definition, { modelPicker: Boolean(props.modelPickerOptions) }) : new Set<AutomationEditSection>();
  const shownError = localError ?? props.error ?? null;
  const errText = shownError ? apiErrorText(shownError) : null;

  return (
    <section ref={rootRef} className={`af-auto af-auto-headcard${props.className ? ` ${props.className}` : ""}`} aria-labelledby={titleId} aria-busy={busy} data-automation-id={summary.automation_id}>
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
        editSections={sections}
        onNoticeAction={noticeAction.onAction}
        noticeState={noticeAction.state}
        busy={busy}
        onEditSection={(at) => {
          setReviseErrors([]);
          setReviseOpen(true, at);
        }}
        {...(props.modelPickerOptions?.defaultModeLabel ? { defaultModelLabel: props.modelPickerOptions.defaultModeLabel } : {})}
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
      {props.definition ? (
        <AutomationDetailsDialog open={detailsOpen} onClose={() => setDetailsOpen(false)} summary={summary}>
          <AutomationDefinitionBlock definition={props.definition} renderText={render} served={summary} triggerConnections={props.triggerConnections} mailboxes={props.mailboxes} defaultModelLabel={props.modelPickerOptions?.defaultModeLabel} {...(props.headerChip ? { workspaces: props.headerChip.label } : {})} />
        </AutomationDetailsDialog>
      ) : null}
      {reviseOpen && editBase ? (
        <AutomationReviseForm
          // A new section is a new opening (the form scrolls once, when it opens).
          key={section ?? "top"}
          presentation="dialog"
          summary={editBase.summary}
          definition={editBase.definition}
          busy={busy}
          errors={localError ? [...reviseErrors, `${apiErrorText(localError).title} ${apiErrorText(localError).detail}`.trim()] : reviseErrors}
          toolCatalog={props.toolCatalog}
          workflowPickerOptions={props.workflowPickerOptions}
          modelPickerOptions={props.modelPickerOptions}
          emailStatus={props.emailStatus}
          onOpenMyEmail={props.onOpenMyEmail}
          previewSchedule={props.previewSchedule}
          {...(section ? { openSection: section } : {})}
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
    </section>
  );
}

export default AutomationHeaderCard;
