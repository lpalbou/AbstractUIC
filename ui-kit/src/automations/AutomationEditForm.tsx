// The Edit form of an automation (spec E): ONE form for every app — the panel opens it in the
// kit's modal, a host that shows it permanently (a settings pane) renders it inline.
//
// Three kinds of things never look alike: FIELDS are inset (`.af-edit__field`), CHOICES are a
// switch (yes/no), an AfSegmented (2-4 options) or a select (5+), ACTIONS are buttons
// (`.af-btn--primary` filled with the accent, `--secondary` raised, `--quiet`). Sections are
// cards in a fixed order — What it does · Model · Schedule · Memory · Tools · Results — each a
// title row and at most one hint line; a section whose options the host does not pass is absent.
// The action bar sticks to the bottom of the form; Save is disabled until something changed.
//
// The form is controlled: every value lives in state and the `ReviseForm` it would submit is
// rebuilt on each render, so "changed" is exactly `reviseChanges(...) !== null` — the same rule
// the save sends (only what the person changed).
import React, { useEffect, useRef, useState } from "react";
import { AfModal } from "../af_modal.js";
import { AfSegmented } from "../af_segmented.js";
import { AfSwitch } from "../af_switch.js";
import { Icon, type IconName } from "../icon.js";
import { ProviderModelPicker, type ProviderModelPickerProps } from "../provider_model_picker.js";
import { normalizeSpeculationValue } from "../speculation_control.js";
import { ToolModeEditor } from "../tool_mode_editor.js";
import { inheritedToolModes, type ToolCatalogItem, type ToolMode, type ToolModeLayer } from "../tool_plan.js";
import { automationToolModes, perToolRevise, type AutomationToolChoice } from "./automation_tool_choice.js";
import { AutomationWorkflowPicker, type AutomationWorkflowPickerOptions } from "./automation_workflow_picker.js";
import { AUTOMATION_EDIT_WORDS } from "./automation_words.js";
import { AfEmailSetupNotice } from "./email_fields.js";
import {
  EMAIL_TEXT,
  emailDefaultEvery,
  emailUsable,
  isEmailTrigger,
  parseDuration,
  reviseChanges,
  reviseFormFrom,
  SCHEDULE_TEXT,
  type AutomationModelValue,
  type CalendarKind,
  type ReviseDefinition,
  type ReviseForm,
} from "./panel_core.js";
import {
  AfCalendarRuleFields,
  AfEveryFields,
  AfScheduleKind,
  AfTimeZoneLine,
  calendarRuleOf,
  calendarStateOf,
  DEFAULT_CALENDAR_STATE,
  EVERY_UNIT_SECONDS,
  EVERY_UNITS,
  useSchedulePreview,
  withCalendarRule,
  type CalendarRuleState,
  type EveryUnit,
  type PreviewSchedule,
  type PreviewState,
} from "./schedule_when.js";
import type { AutomationSummary, ContextMode, MyEmailStatus, TriggerSpec } from "./types.js";

const W = AUTOMATION_EDIT_WORDS.edit;

/**
 * The transport and wording of the Edit form's Model field: a `GatewayModelTransport`
 * (`createGatewayModelTransport`) provides the four fetchers as is. `defaultModeLabel` says what runs when no model is
 * chosen (default "Workflow / Gateway default": the workflow's own model when it declares one, else
 * the gateway default); a host that knows its workflows declare none can say "Gateway default".
 * `reasoningLadder` is a list: pass the transport's `fetchReasoningLadder()` result.
 */
export type AutomationModelPickerOptions = Pick<
  ProviderModelPickerProps,
  "fetchProviders" | "fetchModels" | "fetchModelCapabilities" | "fetchGatewayDefault" | "reasoningLadder" | "defaultModeLabel" | "defaultHint"
>;

/** What runs when an automation chooses no model and the host does not say (provider_defaults.py cascade). */
export const AUTOMATION_MODEL_DEFAULT_LABEL = W.model_default;

/** "ollama / qwen3 · reasoning high · MTP depth 3" (`gatewayDefaultSummary`'s wording), or the default
 * label with any reasoning/MTP choice. A stored MTP value is read through `normalizeSpeculationValue`. */
export function automationModelWords(value: AutomationModelValue, defaultLabel?: string): string {
  const speculation = normalizeSpeculationValue(value.speculation);
  const parts = [value.provider && value.model ? `${value.provider} / ${value.model}` : defaultLabel || AUTOMATION_MODEL_DEFAULT_LABEL];
  if (value.reasoning) parts.push(`reasoning ${value.reasoning}`);
  if (speculation === false) parts.push("MTP off");
  else if (speculation) parts.push(`MTP depth ${speculation.num_draft_tokens}`);
  return parts.join(" · ");
}

export type AutomationReviseFormProps = {
  workflowPickerOptions?: AutomationWorkflowPickerOptions;
  /** With a definition: the form also offers the Model field (provider, model, reasoning, MTP), and
   * the submitted `ReviseForm.model` carries its value. Absent = no Model section. */
  modelPickerOptions?: AutomationModelPickerOptions;
  summary: AutomationSummary;
  /** The committed definition: with it the form also edits the task (`input_data.prompt`), the flow,
   * the model, the tools and the results. */
  definition?: ReviseDefinition | null;
  busy: boolean;
  /** Shown above the action bar (the host's `reviseChanges` errors, a refused save). */
  errors: string[];
  /** The values as edited (`reviseChanges(summary, form, definition)` is what to send). */
  onSubmit(form: ReviseForm): void;
  /** Absent = no Cancel button (a host that shows the form permanently, e.g. a Settings panel).
   * With unsaved changes, Cancel and Escape first ask "Discard changes" / "Keep editing". */
  onCancel?(): void;
  /** The form heading (default "Edit automation"); null hides it (the host titles the card). In
   * the dialog it is the dialog's title. */
  heading?: string | null;
  /** The submit label (default "Save changes"). */
  submitLabel?: string;
  /** The gateway's tool catalog (`normalizeToolCatalog` of discovery/tools): offers "Choose per tool". */
  toolCatalog?: readonly ToolCatalogItem[];
  /** See `AutomationPanelProps.emailStatus`. */
  emailStatus?: MyEmailStatus | null;
  onOpenMyEmail?: () => void;
  /** The gateway's dry-run schedule description (a changed rule's sentence and next run are served). */
  previewSchedule: PreviewSchedule;
  /** "inline" (default): the form where the host puts it. "dialog": the form inside the kit's modal
   * (needs `onCancel`; a backdrop click does not close it). */
  presentation?: "inline" | "dialog";
  /** Controlled Title: the host holds the value (with `onTitleChange`). Absent = the form's own. */
  title?: string;
  onTitleChange?(title: string): void;
  /** Controlled Task (`input_data.prompt`): the host holds the value (with `onTaskChange`). */
  task?: string;
  onTaskChange?(task: string): void;
  /** The host has an unsaved change of its own around the form (an Active switch): Save is enabled
   * and leaving asks, as for a change inside the form. */
  hostChanged?: boolean;
  /**
   * Opens the form at this section (the header's chip that was clicked): it is scrolled to the top
   * of the form and its first field takes the focus. It must be one the form shows for this
   * automation (`automationEditSections`); another one throws.
   */
  openSection?: AutomationEditSection;
};

/** A section of the Edit form ("what": title, task and flow). */
export type AutomationEditSection = "what" | "model" | "schedule" | "memory" | "tools" | "results";

/**
 * The sections the Edit form shows for this automation, with these props (the same conditions as
 * the form): What it does, Schedule and Memory always; Model with a definition and
 * `modelPickerOptions`; Tools with a definition; Results when the automation's results can go by
 * email (`reviseFormFrom` reads them).
 */
export function automationEditSections(summary: AutomationSummary, definition: ReviseDefinition | null | undefined, opts: { modelPicker: boolean }): Set<AutomationEditSection> {
  const out = new Set<AutomationEditSection>(["what", "schedule", "memory"]);
  if (definition && opts.modelPicker) out.add("model");
  if (definition) out.add("tools");
  const initial = reviseFormFrom(summary, definition);
  if (typeof initial.notifyEmail === "boolean" && initial.emailRecipients) out.add("results");
  return out;
}

type EditKind = "every" | CalendarKind | "once";

/** The kinds the Edit form offers ("Once" never; a stored Once rule shows as the chosen, disabled option). */
export function editScheduleKinds(current: EditKind | null): Array<{ value: string; label: string; disabled?: boolean }> {
  return [
    ...(current === "once" ? [{ value: "once", label: SCHEDULE_TEXT.kind_once, disabled: true }] : []),
    { value: "every", label: SCHEDULE_TEXT.kind_every },
    { value: "daily", label: SCHEDULE_TEXT.kind_daily },
    { value: "weekly", label: SCHEDULE_TEXT.kind_weekly },
    { value: "monthly", label: SCHEDULE_TEXT.kind_monthly },
  ];
}

type SectionId = keyof typeof W.sections;
const SECTION_ICONS: Record<SectionId, IconName> = { what: "compose", model: "sparkle", schedule: "clock", memory: "book", tools: "wrench", results: "inbox" };

function EditSection(props: { id: SectionId; base: string; children: React.ReactNode; note?: React.ReactNode }): React.ReactElement {
  const words = W.sections[props.id];
  const headId = `${props.base}-section-${props.id}`;
  return (
    <section className="af-edit__section" data-section={props.id} aria-labelledby={headId}>
      <div className="af-edit__section-head">
        <Icon name={SECTION_ICONS[props.id]} size={16} className="af-edit__section-icon" />
        <h3 className="af-edit__section-title" id={headId}>
          {words.title}
        </h3>
      </div>
      {words.hint ? <p className="af-edit__hint">{words.hint}</p> : null}
      {props.note}
      <div className="af-edit__section-body">{props.children}</div>
    </section>
  );
}

function ButtonLabel(props: { icon: IconName; label: string }): React.ReactElement {
  return (
    <>
      <Icon name={props.icon} size={15} className="af-btn__icon" />
      <span>{props.label}</span>
    </>
  );
}

/** The line under a changed schedule: the served rule and its next run (Daily/Weekly/Monthly), or
 * the served rule and "one interval after you save" (Repeat). */
function ChangedScheduleLine(props: { state: PreviewState; kind: EditKind }): React.ReactElement {
  const st = props.state;
  if (st.phase === "ok") {
    const calendar = props.kind !== "every";
    return (
      <>
        {calendar ? <AfTimeZoneLine timeZone={st.description.time_zone} whose="automation" /> : null}
        <p className="af-edit__served" aria-live="polite" data-preview="served">
          {calendar ? st.description.schedule_text : st.description.schedule_rule_text}
        </p>
        {calendar ? null : <p className="af-edit__hint" data-first-run="after-save">{W.first_run_after_save}</p>}
      </>
    );
  }
  if (st.phase === "error")
    return (
      <p className="af-edit__served af-auto__warn" role="alert" data-preview="error">
        {st.message}
      </p>
    );
  return (
    <p className="af-edit__served" aria-live="polite" data-preview={st.phase}>
      {st.phase === "loading" ? SCHEDULE_TEXT.describing : SCHEDULE_TEXT.incomplete}
    </p>
  );
}

/** The Edit form: everything `PATCH /automations/{id}` can change that this kit knows how to show, prefilled. */
export function AutomationReviseForm(p: AutomationReviseFormProps): React.ReactElement {
  const initial = reviseFormFrom(p.summary, p.definition);
  const def = p.definition ?? null;
  const base = `af-auto-revise-${p.summary.automation_id}`;
  const trig = p.summary.trigger;
  const scheduleTrigger = trig.source_id === "schedule";
  const emailTrigger = isEmailTrigger(trig);
  const storedOnce = scheduleTrigger && (trig.config as { kind?: unknown }).kind === "once";
  const initialKind: EditKind | null = initial.calendar ? initial.calendar.kind : initial.every !== null ? "every" : storedOnce ? "once" : null;
  // A mail check without a stored interval runs on the email default (one that runs a model: hourly).
  const seedEvery = initial.every ?? (emailTrigger ? emailDefaultEvery((trig.config as { uses_model?: unknown }).uses_model !== false) : null);
  const d = seedEvery ? parseDuration(seedEvery) : null;

  // --- state (the form is controlled) ---
  const [ownTitle, setOwnTitle] = useState(initial.title);
  const [ownTask, setOwnTask] = useState(typeof initial.prompt === "string" ? initial.prompt : "");
  const [target, setTarget] = useState<ReviseForm["target"]>();
  const [model, setModel] = useState<AutomationModelValue>(initial.model ?? { provider: "", model: "" });
  // The model is sent only once the person changed it: on mount the picker may clear a stored reasoning
  // level or MTP depth the model's capabilities rule out (an `automatic` onChange), and that alone must
  // not turn a title-only edit into a model change.
  const [modelChosen, setModelChosen] = useState(false);
  const [kind, setKind] = useState<EditKind | null>(initialKind);
  const [amount, setAmount] = useState(d ? String(d.amount) : "24");
  const [unit, setUnit] = useState<EveryUnit>(d ? d.unit : "h");
  // The calendar fields, kept across kind switches.
  const [calState, setCalState] = useState<CalendarRuleState>(initial.calendar ? calendarStateOf(initial.calendar) : DEFAULT_CALENDAR_STATE);
  const [contextMode, setContextMode] = useState<ContextMode>(initial.context);
  const [budget, setBudget] = useState(String(initial.growingMaxTokens ?? ""));
  const catalog = def ? p.toolCatalog : undefined;
  const initialChoice: AutomationToolChoice | null = def ? (initial.toolPolicy ? (catalog ? "per_tool" : null) : def.policy.tool_approval) : null;
  const [choice, setChoice] = useState<AutomationToolChoice | null>(initialChoice);
  // "Choose per tool": the modes shown and what they started from (untouched = nothing written).
  const [perTool, setPerTool] = useState<{ prefill: Record<string, ToolMode>; modes: Record<string, ToolMode> } | null>(() => {
    if (initialChoice !== "per_tool" || !catalog || !def) return null;
    const prefill = automationToolModes(catalog, def);
    return { prefill, modes: prefill };
  });
  const [emailResult, setEmailResult] = useState(Boolean(initial.notifyEmail));
  const [recipients, setRecipients] = useState(initial.emailRecipients ?? { mode: "self" as const, addresses: "" });
  const [asking, setAsking] = useState(false);
  // After "Keep editing", focus goes back to Cancel (inside the form: Escape keeps working).
  const cancelRef = useRef<HTMLButtonElement | null>(null);
  const [refocus, setRefocus] = useState(false);
  useEffect(() => {
    if (!refocus || asking) return;
    setRefocus(false);
    cancelRef.current?.focus();
  }, [refocus, asking]);
  const keepEditing = () => {
    setAsking(false);
    setRefocus(true);
  };
  // Opened at a section (a header chip): that section at the top, its first field focused. Once,
  // after the dialog placed its own first focus.
  const formRef = useRef<HTMLFormElement | null>(null);
  const openSection = p.openSection;
  useEffect(() => {
    if (!openSection) return;
    const el = formRef.current?.querySelector<HTMLElement>(`[data-section="${openSection}"]`);
    if (!el) throw new Error(`AutomationReviseForm: this automation's Edit form has no "${openSection}" section (automationEditSections).`);
    (el as { scrollIntoView?: (o: object) => void }).scrollIntoView?.({ block: "start" });
    el.querySelector<HTMLElement>(".af-edit__section-body input:not([type=hidden]), .af-edit__section-body textarea, .af-edit__section-body select, .af-edit__section-body button")?.focus({ preventScroll: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const title = p.title ?? ownTitle;
  const setTitle = (v: string) => {
    if (p.title === undefined) setOwnTitle(v);
    p.onTitleChange?.(v);
  };
  const hasTask = typeof initial.prompt === "string";
  const task = p.task ?? ownTask;
  const setTask = (v: string) => {
    if (p.task === undefined) setOwnTask(v);
    p.onTaskChange?.(v);
  };
  const modelOptions = def ? p.modelPickerOptions : undefined;
  const calendar = kind === "daily" || kind === "weekly" || kind === "monthly" ? calendarRuleOf(kind, calState) : null;

  // --- the ReviseForm these values make ---
  const tools = ((): Pick<ReviseForm, "toolApproval" | "toolPolicy" | "tools"> => {
    if (!def) return { toolApproval: initial.toolApproval, tools: initial.tools };
    if (choice === "per_tool" && perTool && catalog) return perToolRevise(perTool.modes, perTool.prefill, { toolApproval: def.policy.tool_approval, tools: initial.tools ?? null });
    if (choice === "auto" || choice === "ask") return { toolApproval: choice, toolPolicy: null, tools: initial.tools };
    return { toolApproval: initial.toolApproval, tools: initial.tools };
  })();
  const current: ReviseForm = {
    title,
    every: emailTrigger
      ? initial.every === null && `${amount.trim()}${unit}` === seedEvery
        ? null
        : `${amount.trim()}${unit}`
      : kind === "every"
        ? `${amount.trim()}${unit}`
        : kind === null
          ? initial.every
          : null,
    calendar: calendar ?? (kind === null ? initial.calendar : null),
    context: contextMode,
    growingMaxTokens: contextMode === "growing" ? Number(budget) : initial.growingMaxTokens,
    prompt: hasTask ? task : initial.prompt,
    ...tools,
    notifyEmail: typeof initial.notifyEmail === "boolean" ? emailResult : initial.notifyEmail,
    emailRecipients: initial.emailRecipients ? recipients : initial.emailRecipients,
    ...(target ? { target } : {}),
    ...(modelOptions ? { model: modelChosen ? model : initial.model } : {}),
  };
  const changes = reviseChanges(p.summary, current, def);
  const dirty = changes !== null || p.hostChanged === true;
  const flowMissing = p.summary.flow_missing === true && !target;
  const canSave = dirty && !p.busy && !flowMissing;

  // A changed schedule is described by the gateway (the trigger the save would write).
  const writtenTrigger = changes && !("errors" in changes) && changes.trigger && scheduleTrigger ? (changes.trigger as TriggerSpec) : null;
  const scheduleChanged = Boolean(writtenTrigger);
  const described = useSchedulePreview(writtenTrigger, p.previewSchedule);

  const requestCancel = () => {
    if (!p.onCancel) return;
    if (dirty) setAsking(true);
    else p.onCancel();
  };
  // The gateway's own modes: what the ToolModeEditor's "Default: …" chips truthfully compare with.
  const gatewayModes = catalog ? inheritedToolModes(catalog, {}, "session") : null;
  // No tool list = the flow's own tools, which no host can read: pre-fill as the Assistant's New form
  // does (the gateway's defaults) and say that a choice replaces the flow's own set.
  const flowOwnTools = def !== null && initial.tools === null;
  const pickChoice = (next: AutomationToolChoice) => {
    if (next === "per_tool" && catalog && def && gatewayModes && !perTool) {
      // From the named policy when there is one; else, with a tool list, all Auto / all Ask from the
      // current choice; else the gateway's defaults.
      const prefill = initial.toolPolicy
        ? automationToolModes(catalog, def)
        : flowOwnTools
          ? gatewayModes
          : automationToolModes(catalog, def, choice === "ask" ? "ask" : choice === "auto" ? "auto" : def.policy.tool_approval);
      setPerTool({ prefill, modes: prefill });
    }
    setChoice(next);
  };
  /** The automation's modes as a sparse layer over the gateway's (the editor's value). */
  const perToolLayer = (): ToolModeLayer => {
    const out: Record<string, ToolMode> = {};
    if (!perTool || !catalog || !gatewayModes) return out;
    for (const item of catalog) if (item.offered && perTool.modes[item.name] !== gatewayModes[item.name]) out[item.name] = perTool.modes[item.name];
    return out;
  };
  const setLayer = (layer: ToolModeLayer) => {
    if (!perTool || !catalog || !gatewayModes) return;
    const next: Record<string, ToolMode> = {};
    for (const item of catalog) {
      const m = layer[item.name];
      next[item.name] = !item.offered ? "off" : m === "off" || m === "ask" || m === "auto" ? m : gatewayModes[item.name];
    }
    setPerTool({ ...perTool, modes: next });
  };

  const usable = emailUsable(p.emailStatus);
  const units = d && d.unit === "s" ? [EVERY_UNIT_SECONDS, ...EVERY_UNITS] : EVERY_UNITS;
  const dialog = p.presentation === "dialog";
  if (dialog && !p.onCancel) throw new Error("AutomationReviseForm presentation=\"dialog\" needs onCancel (the dialog's only way out).");
  const dialogId = `${base}-dialog`;
  const headingText = p.heading ?? W.heading;

  const form = (
    <form
      ref={formRef}
      className="af-auto__revise"
      data-presentation={dialog ? "dialog" : "inline"}
      {...(openSection ? { "data-open-section": openSection } : {})}
      aria-labelledby={dialog ? `${dialogId}-title` : `${base}-heading`}
      aria-busy={p.busy}
      onSubmit={(e) => {
        e.preventDefault();
        if (canSave) p.onSubmit(current);
      }}
      onKeyDown={(e) => {
        // A control that handled Escape itself (an open dropdown closing) keeps the form open, and so
        // does a search box (its Escape clears the search, never the form).
        if (e.key !== "Escape" || !p.onCancel || e.defaultPrevented) return;
        if ((e.target as { type?: unknown } | null)?.type === "search") return;
        e.preventDefault();
        if (asking) keepEditing();
        else requestCancel();
      }}
    >
      {dialog ? null : p.heading === null ? (
        <span id={`${base}-heading`} hidden>
          {W.heading}
        </span>
      ) : (
        <h3 className="af-auto__form-title" id={`${base}-heading`}>
          <Icon name="edit" size={14} /> {headingText}
        </h3>
      )}

      <EditSection id="what" base={base}>
        <label className="af-edit__field" htmlFor={`${base}-title`}>
          <span className="af-edit__label">{W.fields.title}</span>
          <input id={`${base}-title`} name="title" value={title} required data-af-autofocus="" disabled={p.busy} onChange={(e) => setTitle(e.target.value)} />
        </label>
        {hasTask ? (
          <label className="af-edit__field" htmlFor={`${base}-prompt`}>
            <span className="af-edit__label">{W.fields.task}</span>
            <textarea id={`${base}-prompt`} name="prompt" value={task} rows={Math.min(10, Math.max(3, task.split("\n").length + 1))} required disabled={p.busy} onChange={(e) => setTask(e.target.value)} />
          </label>
        ) : null}
        {def && p.workflowPickerOptions ? (
          <div className="af-edit__field af-edit__flow" data-field="flow">
            <AutomationWorkflowPicker target={target || def.target} options={p.workflowPickerOptions} onChange={setTarget} currentSuffix={flowMissing ? W.flow_not_installed_suffix : undefined} />
          </div>
        ) : null}
        {flowMissing ? (
          // Without a flow picker the person cannot choose here: only the fact.
          <p className="af-edit__note is-warning" role="alert" data-flow-missing="true">
            <Icon name="warning" size={14} className="af-edit__note-icon" />
            <span>{def && p.workflowPickerOptions ? W.flow_not_installed : W.flow_not_installed_short}</span>
          </p>
        ) : null}
      </EditSection>

      {modelOptions ? (
        <EditSection id="model" base={base}>
          <div className="af-edit__field af-edit__model" data-field="model">
            <ProviderModelPicker
              {...modelOptions}
              layout="compact"
              optionsDisclosure
              enableSpeculation
              defaultModeLabel={modelOptions.defaultModeLabel || AUTOMATION_MODEL_DEFAULT_LABEL}
              inheritLabel={modelOptions.defaultModeLabel || AUTOMATION_MODEL_DEFAULT_LABEL}
              savedUnavailableText={W.model_not_listed}
              savedUnavailableSuffix={W.model_not_listed_suffix}
              errorWords={W.model_errors}
              providerLabel={W.fields.provider}
              modelLabel={W.fields.model}
              optionsLabel={W.fields.reasoning_and_speed}
              value={model}
              onChange={(next, meta) => {
                setModel(next);
                if (!meta?.automatic) setModelChosen(true);
              }}
              disabled={p.busy}
            />
          </div>
        </EditSection>
      ) : null}

      <EditSection id="schedule" base={base}>
        {emailTrigger ? (
          <div className="af-edit__field" data-field="interval">
            <AfEveryFields amount={amount} unit={unit} units={units} onAmount={setAmount} onUnit={setUnit} label={EMAIL_TEXT.every_label} disabled={p.busy} />
            <p className="af-edit__hint" data-email-rule="interval">{EMAIL_TEXT.interval_rule}</p>
          </div>
        ) : scheduleTrigger && kind !== null ? (
          <div className="af-edit__schedule" data-field="calendar" data-kind={kind}>
            <AfScheduleKind presentation="select" name={`${base}-kind`} value={kind} options={editScheduleKinds(initialKind)} onChange={(k) => setKind(k as EditKind)} disabled={p.busy} />
            {kind === "every" ? (
              <div className="af-edit__field" data-field="interval">
                <AfEveryFields amount={amount} unit={unit} units={units} onAmount={setAmount} onUnit={setUnit} disabled={p.busy} />
              </div>
            ) : calendar ? (
              <AfCalendarRuleFields value={calendar} onChange={(next) => setCalState((prev) => withCalendarRule(prev, next))} idBase={base} disabled={p.busy} />
            ) : null}
            {scheduleChanged ? (
              <ChangedScheduleLine state={described} kind={kind} />
            ) : (
              <>
                {kind !== "every" ? <AfTimeZoneLine timeZone={p.summary.time_zone} whose="automation" /> : null}
                <p className="af-edit__served" data-preview="current">
                  {p.summary.schedule_text}
                </p>
              </>
            )}
          </div>
        ) : trig.source_id === "manual" ? (
          <p className="af-edit__hint" data-schedule="manual">{W.no_schedule_manual}</p>
        ) : (
          <p className="af-edit__hint" data-schedule="event">{W.no_schedule}</p>
        )}
      </EditSection>

      <EditSection id="memory" base={base}>
        <AfSwitch
          variant="row"
          action="memory"
          label={W.fields.memory_switch}
          description={contextMode === "growing" ? W.fields.memory_on : W.fields.memory_off}
          checked={contextMode === "growing"}
          busy={p.busy}
          onChange={(on) => setContextMode(on ? "growing" : "independent")}
        />
        {contextMode === "growing" ? (
          <label className="af-edit__field" htmlFor={`${base}-budget`}>
            <span className="af-edit__label">{W.fields.memory_budget}</span>
            <input id={`${base}-budget`} name="growing_max_tokens" type="number" inputMode="numeric" min={1} step={1} value={budget} disabled={p.busy} onChange={(e) => setBudget(e.target.value)} />
            <span className="af-edit__hint">{W.fields.memory_budget_hint}</span>
          </label>
        ) : null}
      </EditSection>

      {def ? (
        <EditSection id="tools" base={base}>
          <AfSegmented<AutomationToolChoice>
            action="tool-choice"
            ariaLabel={W.sections.tools.title}
            value={choice}
            disabled={p.busy}
            onChange={pickChoice}
            options={[
              { value: "auto", label: W.tools.auto },
              { value: "ask", label: W.tools.ask },
              ...(catalog ? [{ value: "per_tool" as const, label: W.tools.per_tool }] : []),
            ]}
          />
          {choice === "per_tool" && perTool && catalog && gatewayModes ? (
            <>
              {flowOwnTools ? (
                <p className="af-edit__note" data-tools-replace-flow="">
                  <Icon name="info" size={14} className="af-edit__note-icon is-info" />
                  <span>{W.tools_replace_flow}</span>
                </p>
              ) : null}
              <div className="af-edit__tools" data-field="per-tool">
                <ToolModeEditor catalog={catalog} layer="session" value={perToolLayer()} inherited={gatewayModes} onChange={setLayer} compact disabled={p.busy} />
              </div>
            </>
          ) : null}
        </EditSection>
      ) : null}

      {typeof initial.notifyEmail === "boolean" && initial.emailRecipients ? (
        <EditSection id="results" base={base} note={!usable ? <AfEmailSetupNotice status={p.emailStatus} onOpenMyEmail={p.onOpenMyEmail} /> : undefined}>
          {/* Without a usable account an option already on can still be switched off, never on. */}
          <AfSwitch
            variant="row"
            action="notify-email"
            label={EMAIL_TEXT.notify_label}
            description={EMAIL_TEXT.notify_hint}
            checked={emailResult}
            busy={p.busy}
            unavailableReason={!usable && !initial.notifyEmail ? EMAIL_TEXT.not_set_up : null}
            onChange={setEmailResult}
          />
          {emailResult ? (
            <div className="af-edit__field" data-field="email-recipients">
              <span className="af-edit__label" id={`${base}-recipients`}>
                {EMAIL_TEXT.recipients_legend}
              </span>
              <AfSegmented<"self" | "list">
                action="email-recipients"
                labelledBy={`${base}-recipients`}
                value={recipients.mode}
                disabled={p.busy}
                onChange={(mode) => setRecipients((r) => ({ ...r, mode }))}
                options={[
                  { value: "self", label: EMAIL_TEXT.recipients_self },
                  { value: "list", label: EMAIL_TEXT.recipients_list, disabled: !usable && initial.emailRecipients.mode !== "list" },
                ]}
              />
              {recipients.mode === "list" ? (
                <>
                  <textarea
                    name="email_recipient_list"
                    aria-label={EMAIL_TEXT.recipients_list}
                    rows={2}
                    spellCheck={false}
                    value={recipients.addresses}
                    disabled={p.busy || (!usable && initial.emailRecipients.mode !== "list")}
                    onChange={(e) => {
                      const addresses = e.target.value;
                      setRecipients((r) => ({ ...r, addresses }));
                    }}
                  />
                  <span className="af-edit__hint">{EMAIL_TEXT.recipients_hint}</span>
                </>
              ) : null}
            </div>
          ) : null}
        </EditSection>
      ) : null}

      {p.errors.length ? (
        <ul className="af-auto__form-errors" role="alert">
          {p.errors.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      ) : null}

      <div className={`af-edit__bar${asking ? " is-asking" : ""}`} data-asking={asking ? "true" : "false"}>
        {asking ? (
          <>
            <p className="af-edit__bar-note af-edit__bar-question" role="alert">
              {W.discard_question}
            </p>
            <div className="af-edit__bar-actions">
              <button type="button" className="af-btn af-btn--secondary" data-action="edit-keep" autoFocus onClick={keepEditing}>
                <ButtonLabel icon="edit" label={W.keep_editing} />
              </button>
              <button type="button" className="af-btn af-btn--danger" data-action="edit-discard" onClick={() => p.onCancel?.()}>
                <ButtonLabel icon="trash" label={W.discard_changes} />
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="af-edit__bar-note">{W.apply_note}</p>
            <div className="af-edit__bar-actions">
              {p.onCancel ? (
                <button type="button" ref={cancelRef} className="af-btn af-btn--secondary" data-action="edit-cancel" onClick={requestCancel}>
                  <ButtonLabel icon="x" label={W.cancel} />
                </button>
              ) : null}
              <button type="submit" className="af-btn af-btn--primary" data-action="edit-save" disabled={!canSave} aria-busy={p.busy}>
                <ButtonLabel icon="check" label={p.submitLabel ?? W.save} />
              </button>
            </div>
          </>
        )}
      </div>
    </form>
  );

  if (!dialog) return form;
  return (
    <AfModal open onClose={requestCancel} title={headingText} id={dialogId} closeOnBackdrop={false} closeOnEscape={false} closeLabel={W.cancel} className="af-edit-dialog">
      {form}
    </AfModal>
  );
}

export default AutomationReviseForm;
