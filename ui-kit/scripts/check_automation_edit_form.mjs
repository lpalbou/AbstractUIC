/**
 * The automation Edit form (AutomationEditForm.tsx, spec E), driven under the kit's hook harness:
 *  A. Schedule: the kind is a select without "Once"; a change of kind writes `schedule@2` with the
 *     kept `time_zone` / `count` / `until` and never `start_at` / `anchor`, both directions; the
 *     create dialog's "When" radios come from the same extracted control (its checks stay as they were).
 *  B. Tools: the three-choice rule, every row; `automationToolModes` (the kit reader).
 *  C. A flow that is not installed: "(not installed)", the sentence, Save disabled until another flow.
 *  D. Save disabled until something changed; Cancel / Escape with changes ask Discard / Keep editing;
 *     the dialog presentation (the kit modal, a backdrop click does not close it); host-held
 *     Title / Task; `hostChanged`.
 * Every save is read back through `reviseChanges` (a save sends only what changed).
 */
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { mountHook, findAll } from "./hook_harness.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const kit = await import(join(here, "..", "dist", "index.js"));
const { AutomationReviseForm, AfScheduleKind, AfEveryFields, AfSegmented, AfSwitch, AfModal, ToolModeEditor, AutomationWorkflowPicker, reviseChanges, reviseFormFrom, AUTOMATION_EDIT_WORDS: WORDS, SCHEDULE_TEXT } = kit;
const W = WORDS.edit;

let failures = 0;
let checks = 0;
function check(name, cond, detail) {
  checks += 1;
  if (cond) return;
  failures += 1;
  console.error(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`);
}
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const fx = (f) => JSON.parse(readFileSync(join(here, "fixtures", "automations", f), "utf8"));
const list = fx("list.json").items;
const news = list.find((s) => s.title === "AI news monitor"); // schedule@1, every 8h
const brief = list.find((s) => s.title === "Morning briefing"); // schedule@2, daily 08:00, Europe/Paris

const def = (input = {}, policy = {}) => ({ context: { mode: "independent", growing: {} }, target: { bundle_ref: "agent@1", flow_id: "main", input_data: { prompt: "Do it.", ...input } }, policy: { tool_approval: "auto", ...policy } });

/** One mounted form; its element tree is shallow (function components are asserted by props). */
function mount(props) {
  const submitted = [];
  let cancelled = 0;
  const base = { busy: false, errors: [], previewSchedule: async () => ({}), onSubmit: (f) => submitted.push(f), onCancel: () => (cancelled += 1), ...props };
  const h = mountHook(AutomationReviseForm, base);
  const tree = () => h.current;
  const el = (pred) => findAll(tree(), pred)[0];
  const api = {
    submitted,
    get cancelled() { return cancelled; },
    tree,
    el,
    all: (pred) => findAll(tree(), pred),
    action: (a) => el((n) => n.props["data-action"] === a),
    form: () => el((n) => n.type === "form"),
    saveDisabled: () => api.action("edit-save").props.disabled === true,
    type(name, value) { el((n) => n.props.name === name).props.onChange({ target: { value } }); h.render(); },
    kind(k) { el((n) => n.type === AfScheduleKind).props.onChange(k); h.render(); },
    tools(choice) { el((n) => n.type === AfSegmented && n.props.action === "tool-choice").props.onChange(choice); h.render(); },
    save() { api.form().props.onSubmit({ preventDefault() {} }); h.render(); return submitted.at(-1); },
    key(key, defaultPrevented = false) { api.form().props.onKeyDown({ key, defaultPrevented, preventDefault() {} }); h.render(); },
    render: (next) => h.rerender(next),
    unmount: () => h.unmount(),
    /** What a save would send: null while Save is disabled (nothing changed: not busy, no missing flow here). */
    changes: () => (api.saveDisabled() ? null : reviseChanges(base.summary, api.current(), base.definition)),
    /** What a save would hand over now (submits on a copy of the state, then forgets it). */
    current() { const n = submitted.length; api.form().props.onSubmit({ preventDefault() {} }); const f = submitted[n]; submitted.length = n; return f; },
  };
  return api;
}

// --- A. Schedule -------------------------------------------------------------------------------
{
  const kinds = kit.editScheduleKinds("every").map((o) => o.value);
  check("Edit kinds: Repeat, Daily, Weekly, Monthly — never Once", eq(kinds, ["every", "daily", "weekly", "monthly"]), kinds.join());
  const once = kit.editScheduleKinds("once");
  check("a stored Once rule shows as the chosen option, not choosable", once[0].value === "once" && once[0].disabled === true && once.slice(1).every((o) => !o.disabled));
  const f = mount({ summary: news, definition: def() });
  const sel = f.el((n) => n.type === AfScheduleKind);
  check("the kind is a select (the extracted control), on Repeat", sel && sel.props.presentation === "select" && sel.props.value === "every");
  check("the Repeat interval is the shared Every control", f.el((n) => n.type === AfEveryFields)?.props.amount === "8" && f.el((n) => n.type === AfEveryFields)?.props.unit === "h");
  check("nothing changed: Save disabled", f.saveDisabled());
  f.kind("daily");
  check("Repeat -> Daily enables Save", !f.saveDisabled());
  const sent = reviseChanges(news, f.save(), def());
  check("Repeat (schedule@1) -> Daily writes schedule@2 daily at 08:00, nothing else", eq(sent, { trigger: { source_id: "schedule", source_version: 2, config: { kind: "daily", at: "08:00" } } }), JSON.stringify(sent));
  f.unmount();
}
{
  // Kept limits and zone; never start_at / anchor (both directions, pure rule).
  const v1 = { ...news, trigger: { ...news.trigger, config: { ...news.trigger.config, count: 5, until: "2026-12-31T23:00:00Z" } } };
  const toDaily = reviseChanges(v1, { ...reviseFormFrom(v1), every: null, calendar: { kind: "weekly", days: ["fri", "mon"], at: "07:30" } });
  check("Repeat -> Weekly keeps count / until, drops start_at / anchor", eq(toDaily, { trigger: { source_id: "schedule", source_version: 2, config: { kind: "weekly", days: ["mon", "fri"], at: "07:30", count: 5, until: "2026-12-31T23:00:00Z" } } }), JSON.stringify(toDaily));
  const limited = { ...brief, trigger: { ...brief.trigger, config: { ...brief.trigger.config, count: 3, until: "2027-01-01T00:00:00Z", anchor: "2026-09-01T06:00:00Z", start_at: "2026-09-01T06:00:00Z" } } };
  const toEvery = reviseChanges(limited, { ...reviseFormFrom(limited), calendar: null, every: "6h" });
  check("Daily -> Repeat writes schedule@2 every with the kept zone, count, until", eq(toEvery, { trigger: { source_id: "schedule", source_version: 2, config: { kind: "every", every: "6h", time_zone: "Europe/Paris", count: 3, until: "2027-01-01T00:00:00Z" } } }), JSON.stringify(toEvery));
  check("…and never carries start_at or anchor", !/start_at|anchor/.test(JSON.stringify(toEvery)));
  check("Daily -> Repeat with a bad interval says why", "errors" in reviseChanges(limited, { ...reviseFormFrom(limited), calendar: null, every: "0h" }));
  const onceRow = { ...brief, trigger: { ...brief.trigger, config: { kind: "once", at: "2026-12-24T09:00", time_zone: "Europe/Paris" } } };
  const fromOnce = reviseChanges(onceRow, { ...reviseFormFrom(onceRow), calendar: { kind: "daily", at: "09:00" } });
  check("Once -> Daily keeps the zone", eq(fromOnce, { trigger: { source_id: "schedule", source_version: 2, config: { kind: "daily", at: "09:00", time_zone: "Europe/Paris" } } }), JSON.stringify(fromOnce));
  const mail = { ...news, trigger: { binding_id: "b", source_id: "email.received", source_version: 1, config: { every: "1h", account: "a" } } };
  check("an email trigger never converts (a calendar on it changes nothing)", reviseChanges(mail, { ...reviseFormFrom(mail), calendar: { kind: "daily", at: "08:00" } }) === null);
  check("…and keeps its check interval rule", reviseChanges(mail, { ...reviseFormFrom(mail), every: "2h" }).trigger.config.every === "2h");
  // Through the form: Daily -> Repeat.
  const f = mount({ summary: limited, definition: def() });
  check("a Daily automation opens on Daily, its time in the calendar fields", f.el((n) => n.type === AfScheduleKind).props.value === "daily");
  f.kind("every");
  f.el((n) => n.type === AfEveryFields).props.onAmount("6");
  f.render();
  check("through the form: Daily -> Repeat every 6 h", eq(reviseChanges(limited, f.save(), def()), toEvery));
  f.unmount();
  // The served sentence: unchanged = the summary's; changed = the gateway's preview of what is written.
  const asked = [];
  const g = mount({ summary: brief, definition: def(), previewSchedule: async (t) => { asked.push(t); return { trigger: t, time_zone: "Europe/Paris", schedule_rule_text: "R", schedule_text: "R · next", next_run_at: null, next_run_local: null, first_run_sentence: "x" }; } });
  check("unchanged: the served schedule_text, no preview asked", g.el((n) => n.props["data-preview"] === "current")?.props.children === brief.schedule_text);
  g.kind("every");
  await new Promise((r) => setTimeout(r, 320));
  g.render();
  check("changed: the gateway is asked about the trigger the save writes", asked.length >= 1 && eq(asked.at(-1), reviseChanges(brief, g.current(), def()).trigger), JSON.stringify(asked.at(-1)));
  g.unmount();
  const ev = { ...news, trigger: { binding_id: "b", source_id: "connection.event", source_version: 1, config: {} } };
  const e = mount({ summary: ev, definition: def() });
  check("an event-started automation shows the words file's sentence, no kind select", !e.el((n) => n.type === AfScheduleKind) && e.el((n) => n.props["data-schedule"] === "event")?.props.children === W.no_schedule);
  e.unmount();
}
{
  // The create dialog uses the SAME select as Edit (spec H: six kinds = a select; no radio row).
  const src = readFileSync(join(here, "..", "src", "automations", "AfScheduleDialog.tsx"), "utf8");
  check("the create dialog renders the extracted kind control as the Edit form's select (no radio row, no copy)", /<AfScheduleKind\s+presentation="select"/.test(src) && !/presentation="radios"/.test(src) && !/type="radio" name=\{id\("kind"\)\}/.test(src));
  const whenSrc = readFileSync(join(here, "..", "src", "automations", "schedule_when.tsx"), "utf8");
  check("the kind control has no radio presentation left", !/role="radiogroup" aria-label="Schedule kind"/.test(whenSrc) && !/type="radio"/.test(whenSrc));
  const select = renderToStaticMarkup(React.createElement(AfScheduleKind, { presentation: "select", name: "k", value: "weekly", options: kit.editScheduleKinds("every"), onChange() {} }));
  check("select: labelled When, the chosen kind selected, no Once", select.includes(`<span>${SCHEDULE_TEXT.legend}</span>`) && select.includes('<option value="weekly" selected="">Weekly</option>') && !select.includes("once"));
}

// --- B. Tools ----------------------------------------------------------------------------------
const catalog = ["web_search", "fetch_url", "read_file", "write_file"].map((name) => ({ name, toolset: "t", offered: true, gatewayDefault: name === "read_file" ? "auto" : "ask" }));
catalog.push({ name: "not_offered", toolset: "t", offered: false, gatewayDefault: "off" });
const listed = ["web_search", "fetch_url", "read_file"];
const listDef = (policy = {}) => def({ tools: listed, _runtime: { allowed_tools: listed } }, policy);
const policyDef = (extra = {}) => listDef({ tool_approval: "ask", tool_policy: { auto_approve_tools: ["web_search"], require_approval_tools: ["fetch_url"] }, ...extra });
/** The per-tool editor: what it shows (its layer over the gateway's modes) and one tool set like a click. */
const editorOf = (f) => f.el((n) => n.type === ToolModeEditor);
const shown = (f) => { const e = editorOf(f); return Object.fromEntries(catalog.map((t) => [t.name, t.offered ? e.props.value[t.name] ?? e.props.inherited[t.name] : "off"])); };
const setTool = (f, name, mode) => { const e = editorOf(f); e.props.onChange({ ...e.props.value, [name]: mode }); f.render(); };
{
  const modes = kit.automationToolModes(catalog, policyDef());
  check("reader: listed Auto / Ask as listed, unmentioned = Ask, not in the list = Off, not offered = Off", eq(modes, { web_search: "auto", fetch_url: "ask", read_file: "ask", write_file: "off", not_offered: "off" }), JSON.stringify(modes));
  check("reader: without a policy, every tool of the list as the approval says (or all Ask / all Auto asked for)", eq(kit.automationToolModes(catalog, listDef()), { web_search: "auto", fetch_url: "auto", read_file: "auto", write_file: "off", not_offered: "off" }) && kit.automationToolModes(catalog, listDef(), "ask").fetch_url === "ask");
  check("automationToolChoice", kit.automationToolChoice(policyDef()) === "per_tool" && kit.automationToolChoice(def()) === "auto");
}
{
  // A tool list: auto -> ask writes only tool_approval; per tool starts from the current choice.
  const f = mount({ summary: news, definition: listDef(), toolCatalog: catalog });
  check("three choices with the catalog, auto chosen", eq(f.el((n) => n.type === AfSegmented).props.options.map((o) => o.value), ["auto", "ask", "per_tool"]) && f.el((n) => n.type === AfSegmented).props.value === "auto");
  f.tools("ask");
  check("auto -> Ask before each: only policy.tool_approval", eq(f.changes(), { policy: { tool_approval: "ask" } }), JSON.stringify(f.changes()));
  f.tools("auto");
  check("…and back to auto: nothing written, Save disabled", f.changes() === null && f.saveDisabled());
  f.tools("per_tool");
  check("Choose per tool: the kit's ToolModeEditor, pre-filled all Auto over the list (the current choice)", eq(shown(f), { web_search: "auto", fetch_url: "auto", read_file: "auto", write_file: "off", not_offered: "off" }), JSON.stringify(shown(f)));
  check("the editor's defaults are the gateway's own (its Default chips tell the truth)", editorOf(f).props.layer === "session" && eq(editorOf(f).props.inherited, kit.inheritedToolModes(catalog, {}, "session")));
  check("with a tool list there is no 'replaces the flow's own tools' line", !f.el((n) => n.props["data-tools-replace-flow"] !== undefined));
  check("opened, untouched: nothing written", f.changes() === null && f.saveDisabled());
  setTool(f, "fetch_url", "ask");
  const one = f.changes();
  check("one tool set to Ask: the named policy, tool_approval ask; the tool list untouched", eq(one, { policy: { tool_policy: { auto_approve_tools: ["read_file", "web_search"], require_approval_tools: ["fetch_url"] }, tool_approval: "ask" } }), JSON.stringify(one));
  setTool(f, "read_file", "off");
  const off = f.changes();
  check("a tool turned Off: the tool lists written too (narrowed)", eq(off.target?.input_data?.tools, ["fetch_url", "web_search"]) && eq(off.target?.input_data?._runtime?.allowed_tools, ["fetch_url", "web_search"]) && eq(off.policy.tool_policy.auto_approve_tools, ["web_search"]), JSON.stringify(off));
  f.unmount();
  const g = mount({ summary: news, definition: listDef(), toolCatalog: catalog });
  g.tools("ask");
  g.tools("per_tool");
  check("pre-filled all Ask after choosing Ask", eq(shown(g), { web_search: "ask", fetch_url: "ask", read_file: "ask", write_file: "off", not_offered: "off" }));
  check("…untouched: nothing written", g.changes() === null);
  g.unmount();
}
{
  // No tool list: the run uses its flow's own tools, which no host can read (the agent node's own
  // `tools`, visual executor: input_data.tools absent -> the node config). Pre-filled as the
  // Assistant's New form does (the gateway's defaults), with ONE line saying a choice replaces them.
  const f = mount({ summary: news, definition: def(), toolCatalog: catalog });
  f.tools("per_tool");
  check("no tool list: pre-filled with the gateway's defaults", eq(shown(f), kit.inheritedToolModes(catalog, {}, "session")), JSON.stringify(shown(f)));
  check("…and the line says a choice replaces the flow's own tools", f.el((n) => n.props["data-tools-replace-flow"] !== undefined)?.props.children?.[1]?.props.children === W.tools_replace_flow);
  check("…untouched: nothing written", f.changes() === null);
  setTool(f, "fetch_url", "auto");
  check("…even an approval-only change writes the selection as the tool list (the flow's own set is replaced, never kept unseen)", eq(f.changes()?.target?.input_data?.tools, ["fetch_url", "read_file", "web_search", "write_file"]), JSON.stringify(f.changes()));
  setTool(f, "fetch_url", "ask");
  setTool(f, "write_file", "off");
  const ch = f.changes();
  check("…one change writes the selection as the tool list (replacing, as said)", eq(ch.target?.input_data?.tools, ["fetch_url", "read_file", "web_search"]) && eq(ch.policy.tool_policy, { auto_approve_tools: ["read_file"], require_approval_tools: ["fetch_url", "web_search"] }), JSON.stringify(ch));
  f.unmount();
}
{
  // A stored named policy.
  const f = mount({ summary: news, definition: policyDef(), toolCatalog: catalog });
  check("a named policy opens on Choose per tool, pre-filled from it", f.el((n) => n.type === AfSegmented).props.value === "per_tool" && eq(shown(f), kit.automationToolModes(catalog, policyDef())));
  check("untouched: nothing written", f.changes() === null);
  f.tools("auto");
  check("-> Run without asking: tool_approval auto and the named policy removed", eq(f.changes(), { policy: { tool_approval: "auto", tool_policy: null } }), JSON.stringify(f.changes()));
  f.tools("ask");
  check("-> Ask before each: tool_approval ask (as stored) and the named policy removed", eq(f.changes(), { policy: { tool_approval: "ask", tool_policy: null } }), JSON.stringify(f.changes()));
  f.tools("per_tool");
  check("back to Choose per tool, as it was: nothing written", f.changes() === null);
  setTool(f, "fetch_url", "auto");
  setTool(f, "read_file", "auto");
  check("every tool Auto: the policy and tool_approval auto", eq(f.changes(), { policy: { tool_policy: { auto_approve_tools: ["fetch_url", "read_file", "web_search"], require_approval_tools: [] }, tool_approval: "auto" } }), JSON.stringify(f.changes()));
  f.unmount();
  const g = mount({ summary: news, definition: policyDef() });
  check("without the catalog: two choices, none chosen, nothing written", eq(g.el((n) => n.type === AfSegmented).props.options.map((o) => o.value), ["auto", "ask"]) && g.el((n) => n.type === AfSegmented).props.value === null && g.changes() === null);
  g.tools("auto");
  check("…a choice there removes the policy", eq(g.changes(), { policy: { tool_approval: "auto", tool_policy: null } }));
  g.unmount();
  check("pure: a host that never touches tools keeps a stored policy (title-only edit)", eq(reviseChanges(news, { ...reviseFormFrom(news, policyDef()), title: "X" }, policyDef()), { title: "X" }));
}
{
  // Escape in the tools search box clears it and goes no further.
  const h = mountHook(ToolModeEditor, { catalog, layer: "session", value: {}, inherited: kit.inheritedToolModes(catalog, {}, "session"), onChange() {}, compact: true });
  const search = () => findAll(h.current, (n) => n.props && n.props.type === "search")[0];
  search().props.onChange({ target: { value: "web" } });
  h.render();
  let prevented = 0;
  let stopped = 0;
  search().props.onKeyDown({ key: "Escape", preventDefault: () => (prevented += 1), stopPropagation: () => (stopped += 1) });
  h.render();
  check("ToolModeEditor: Escape in a typed search clears it and stops there", search().props.value === "" && prevented === 1 && stopped === 1);
  h.unmount();
  const f = mount({ summary: news, definition: listDef(), toolCatalog: catalog });
  f.type("title", "Other");
  f.form().props.onKeyDown({ key: "Escape", defaultPrevented: false, target: { type: "search" }, preventDefault() {} });
  f.render();
  check("the form ignores an Escape from a search box (no Discard question, no close)", !f.action("edit-discard") && f.cancelled === 0);
  f.unmount();
}

// --- C. A flow that is not installed -------------------------------------------------------------
{
  const workflowPickerOptions = { interfaceId: "abstractcode.agent.v1", workflows: { status: "ready", error: "", reload() {}, data: { interfaceId: "abstractcode.agent.v1", entries: [], gatewayDefault: { status: "unavailable", reason: "x" } } } };
  for (const status of ["active", "paused"]) {
    const f = mount({ summary: { ...news, status, flow_missing: true }, definition: def(), workflowPickerOptions });
    const picker = f.el((n) => n.type === AutomationWorkflowPicker);
    check(`flow_missing (${status}): the flow shows "(not installed)"`, picker?.props.currentSuffix === W.flow_not_installed_suffix && W.flow_not_installed_suffix === "(not installed)");
    check(`flow_missing (${status}): the sentence`, f.el((n) => n.props["data-flow-missing"] === "true")?.props.children?.[1]?.props.children === W.flow_not_installed);
    f.type("title", "Renamed");
    check(`flow_missing (${status}): Save stays disabled after another change`, f.saveDisabled());
    picker.props.onChange({ bundle_ref: "other@1", flow_id: "main" });
    f.render();
    check(`flow_missing (${status}): another flow enables Save; the suffix and the note go`, !f.saveDisabled() && f.el((n) => n.type === AutomationWorkflowPicker).props.currentSuffix === undefined && !f.el((n) => n.props["data-flow-missing"]));
    f.unmount();
  }
  const noPicker = mount({ summary: { ...news, flow_missing: true }, definition: def() });
  check("flow_missing without a flow picker: only the fact, never 'choose another' (nothing to choose with)", noPicker.el((n) => n.props["data-flow-missing"] === "true")?.props.children?.[1]?.props.children === W.flow_not_installed_short && W.flow_not_installed_short === "This flow is no longer installed.");
  noPicker.unmount();
  const ok = mount({ summary: news, definition: def(), workflowPickerOptions });
  check("an installed flow: no suffix, no sentence", ok.el((n) => n.type === AutomationWorkflowPicker).props.currentSuffix === undefined && !ok.el((n) => n.props["data-flow-missing"]));
  ok.unmount();
}

// --- D. Save, Cancel, Discard, dialog, host values -------------------------------------------------
{
  const f = mount({ summary: news, definition: def() });
  check("Save disabled until something changed", f.saveDisabled());
  f.form().props.onSubmit({ preventDefault() {} });
  check("…and a submit then sends nothing", f.submitted.length === 0);
  f.type("title", "Other");
  check("a change enables Save", !f.saveDisabled());
  f.type("title", news.title);
  check("changing it back disables Save again", f.saveDisabled());
  f.action("edit-cancel").props.onClick();
  check("Cancel without changes closes at once", f.cancelled === 1);
  f.type("prompt", "Do it twice.");
  f.action("edit-cancel").props.onClick();
  f.render();
  check("Cancel with changes asks Discard changes / Keep editing", f.cancelled === 1 && f.action("edit-discard") && f.action("edit-keep") && f.el((n) => n.props.role === "alert" && n.props.children === W.discard_question));
  check("…in the words file", W.discard_question === "Discard your changes?" && W.discard_changes === "Discard changes" && W.keep_editing === "Keep editing");
  f.action("edit-keep").props.onClick();
  f.render();
  check("Keep editing returns to the form, the change kept", f.cancelled === 1 && !f.action("edit-discard") && !f.saveDisabled());
  f.key("Escape", true);
  check("Escape a dropdown handled does nothing", !f.action("edit-discard"));
  f.key("Escape");
  check("Escape with changes asks too", !!f.action("edit-discard") && f.cancelled === 1);
  f.key("Escape");
  check("Escape again keeps editing", !f.action("edit-discard"));
  // After Keep editing, focus goes back to Cancel (a control inside the form: Escape keeps working).
  // The Cancel button's ref (React attaches it before effects run; the harness does it by hand).
  const focused = [];
  f.action("edit-cancel").ref.current = { focus: () => focused.push("cancel") };
  f.key("Escape");
  check("(asking)", !!f.action("edit-keep"));
  f.action("edit-keep").props.onClick();
  f.render();
  check("Keep editing: focus returns to Cancel", focused.length === 1);
  f.key("Escape");
  f.action("edit-discard").props.onClick();
  check("Discard changes closes", f.cancelled === 2);
  f.unmount();
  const busy = mount({ summary: news, definition: def(), busy: true });
  busy.type("title", "Other");
  check("busy: Save disabled", busy.saveDisabled());
  busy.unmount();
  const host = mount({ summary: news, definition: def(), hostChanged: true });
  check("hostChanged: Save enabled with no change in the form", !host.saveDisabled());
  host.action("edit-cancel").props.onClick();
  host.render();
  check("hostChanged: Cancel asks", !!host.action("edit-discard"));
  host.unmount();
}
{
  const f = mount({ summary: news, definition: def(), presentation: "dialog" });
  const modal = f.tree();
  check("dialog: the kit modal wraps the form; a backdrop click and its own Escape do not close it", modal.type === AfModal && modal.props.closeOnBackdrop === false && modal.props.closeOnEscape === false && modal.props.title === W.heading && modal.props.className === "af-edit-dialog");
  check("dialog: the form is labelled by the dialog title", f.form().props["aria-labelledby"] === `${modal.props.id}-title`);
  check("dialog: the title field takes the first focus", f.el((n) => n.props.name === "title").props["data-af-autofocus"] === "");
  modal.props.onClose();
  check("dialog: × without changes closes", f.cancelled === 1);
  f.type("title", "Other");
  f.tree().props.onClose();
  f.render();
  check("dialog: × with changes asks", !!f.action("edit-discard") && f.cancelled === 1);
  f.unmount();
  let threw = false;
  try { mount({ summary: news, definition: def(), presentation: "dialog", onCancel: undefined }); } catch { threw = true; }
  check("dialog without onCancel fails loudly", threw);
  const inline = mount({ summary: news, definition: def(), heading: null, onCancel: undefined, submitLabel: "Save" });
  check("inline (Code web): no Cancel, Save labelled Save, heading hidden", !inline.action("edit-cancel") && inline.action("edit-save").props.children.props.label === "Save" && inline.tree().type === "form");
  inline.unmount();
}
{
  // Host-held Title / Task (the Assistant's title-follows-task rule).
  const seen = { title: [], task: [] };
  const f = mount({ summary: news, definition: def(), title: "Held title", task: "Held task", onTitleChange: (v) => seen.title.push(v), onTaskChange: (v) => seen.task.push(v) });
  check("controlled: the fields show the host's values", f.el((n) => n.props.name === "title").props.value === "Held title" && f.el((n) => n.props.name === "prompt").props.value === "Held task");
  f.type("prompt", "New task");
  f.type("title", "New title");
  check("controlled: typing reports to the host", eq(seen, { title: ["New title"], task: ["New task"] }));
  check("controlled: the host's values are what a save sends", eq(reviseChanges(news, f.current(), def()), { title: "Held title", target: { bundle_ref: "agent@1", flow_id: "main", input_data: { prompt: "Held task" } } }), JSON.stringify(reviseChanges(news, f.current(), def())));
  f.unmount();
}
{
  // Plain words, sections in order, the vocabulary classes.
  const html = renderToStaticMarkup(React.createElement(AutomationReviseForm, { summary: news, definition: { ...def(), notify: { channels: ["console"] } }, busy: false, errors: [], previewSchedule: async () => ({}), onSubmit() {}, onCancel() {}, modelPickerOptions: { fetchProviders: async () => [], fetchModels: async () => [] }, toolCatalog: catalog, emailStatus: { effective_enabled: true } }));
  const order = [...html.matchAll(/data-section="([a-z]+)"/g)].map((m) => m[1]);
  check("sections in order: What it does, Model, Schedule, Memory, Tools, Results", eq(order, ["what", "model", "schedule", "memory", "tools", "results"]), order.join());
  const labels = [...html.matchAll(/<(?:span|label|h3)[^>]*>([^<]+)</g)].map((m) => m[1]).join(" | ");
  check("plain words: no (UTC) label, no definition / revision / input / pin / occurrence", !/\(UTC\)|definition|revision|\binput\b|\bpin\b|occurrence/i.test(labels), labels.slice(0, 300));
  check("actions are .af-btn (primary filled for Save, secondary for Cancel)", /class="af-btn af-btn--primary" data-action="edit-save"/.test(html) && /class="af-btn af-btn--secondary" data-action="edit-cancel"/.test(html));
  check("each section: an icon and a title, at most one hint", [...html.matchAll(/<section class="af-edit__section"[^]*?<\/section>/g)].every((m) => /af-edit__section-icon/.test(m[0]) && (m[0].match(/<p class="af-edit__hint">/g) || []).length <= 1));
  check("Memory is the switch Builds on earlier runs", findAll(mount({ summary: news, definition: def() }).tree(), (n) => n.type === AfSwitch && n.props.action === "memory")[0]?.props.label === W.fields.memory_switch);
}

// --- E. Review fixes (gate 3) -----------------------------------------------------------------------
{
  // M6: a mail check without a stored interval starts on the email default and sends what is set.
  const mail = { ...news, trigger: { binding_id: "b", source_id: "email.received", source_version: 1, config: { account: "self", uses_model: true } } };
  const f = mount({ summary: mail, definition: def() });
  const every = () => f.el((n) => n.type === AfEveryFields);
  check("mail check without an interval: the fields show the email default (hourly with a model)", every().props.amount === "1" && every().props.unit === "h" && kit.emailDefaultEvery(true) === "1h");
  check("…untouched: nothing written", f.changes() === null);
  every().props.onAmount("2");
  f.render();
  check("…a new interval is sent", eq(f.changes(), { trigger: { source_id: "email.received", source_version: 1, config: { account: "self", uses_model: true, every: "2h" } } }), JSON.stringify(f.changes()));
  f.unmount();
  const noModel = mount({ summary: { ...mail, trigger: { ...mail.trigger, config: { account: "self", uses_model: false } } }, definition: def() });
  check("…a check that runs no model starts on 60 seconds", noModel.el((n) => n.type === AfEveryFields).props.amount === "60" && noModel.el((n) => n.type === AfEveryFields).props.unit === "s");
  noModel.unmount();
  // L3: plain words from the words file.
  const m = mount({ summary: { ...news, context_mode: "growing" }, definition: def(), modelPickerOptions: { fetchProviders: async () => [], fetchModels: async () => [] } });
  check("the memory budget's hint is the words file's plain sentence", !!m.el((n) => n.props.children === W.fields.memory_budget_hint) && !/turn|oversized|context/i.test(W.fields.memory_budget_hint));
  const picker = m.el((n) => n.type === kit.ProviderModelPicker);
  check("the picker's labels come from the words file", picker.props.providerLabel === W.fields.provider && picker.props.modelLabel === W.fields.model && picker.props.optionsLabel === W.fields.reasoning_and_speed);
  m.unmount();
  const manual = mount({ summary: { ...news, trigger: { binding_id: "b", source_id: "manual", source_version: 1, config: {} } }, definition: def() });
  check("an automation run by hand says so (not 'starts on an event')", manual.el((n) => n.props["data-schedule"] === "manual")?.props.children === W.no_schedule_manual);
  manual.unmount();
  check("errors from the words file", eq(reviseChanges(news, { ...reviseFormFrom(news), every: "0h" }), { errors: [W.interval_invalid] }));
  // G1: a title has no length cap (the runtime accepts any length); a long stored title is shown whole
  // and an untouched form is unchanged.
  check("no title length word any more", !("title_too_long" in W));
  const long = { ...news, title: "L".repeat(150) };
  check("a 150-character stored title, untouched: no changes", reviseChanges(long, reviseFormFrom(long), def()) === null);
  const lf = mount({ summary: long, definition: def() });
  const titleInput = lf.el((n) => n.props.name === "title");
  check("…the input shows it whole, with no maxLength", titleInput.props.value === long.title && !("maxLength" in titleInput.props));
  check("…Save disabled", lf.saveDisabled());
  lf.action("edit-cancel").props.onClick();
  check("…Cancel leaves at once", lf.cancelled === 1 && !lf.action("edit-discard"));
  lf.type("prompt", "Do it twice.");
  const other = lf.changes();
  check("…editing another field saves without touching the title", !!other && !("errors" in other) && !("title" in other) && other.target?.input_data?.prompt === "Do it twice.", JSON.stringify(other));
  lf.unmount();
  const created = kit.buildCreateRequest({ prompt: "Do it.", title: "L".repeat(150), when: { kind: "every", amount: 5, unit: "m" }, context: "independent" }, { target: { bundle_ref: "agent@1", flow_id: "main" }, requestId: "r" });
  check("a create with a 150-character title is built, the title whole", created.ok === true && created.body.title === "L".repeat(150), JSON.stringify(created.errors ?? null));
  check("failed.reason_prefix is gone (the gateway serves a whole sentence)", !("reason_prefix" in WORDS.failed));
  // L1: the Details row says the third choice for a named per-tool policy.
  const fullDef = { schema_version: 2, revision: 1, title: "t", controller: { bundle_ref: "c@1", flow_id: "controller" }, target: { workflow_id: "w", ...policyDef().target }, trigger: news.trigger, context: { mode: "independent", growing: {} }, policy: { serial: true, misfire: "coalesce", failure: "continue", retry: { max_attempts: 1, backoff: { initial: "30s", factor: 2, max: "10m" } }, tool_approval: "ask", tool_policy: policyDef().policy.tool_policy }, session_id: "s", workspace_root: "/w", created_at: "x", archived_at: null };
  const parts = await import(join(here, "..", "dist", "automations", "AutomationPanel.js"));
  const block = renderToStaticMarkup(React.createElement(parts.AutomationDefinitionBlock, { definition: fullDef }));
  check("Details: a named per-tool policy reads 'Choose per tool', never 'Ask before each tool call'", block.includes(`data-def="tool_approval">${W.tools.per_tool}</dd>`) && !block.includes("Ask before each tool call"));
}
{
  // M2 / M3 / L4: theme.css.
  const css = readFileSync(join(here, "..", "src", "theme.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  const block = (sel) => [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].filter((m) => m[1].split(",").map((x) => x.trim()).includes(sel)).map((m) => m[2]).join(";");
  check("a disabled primary stays a filled button, dimmed (no special empty-box rule)", block(".af-btn--primary:disabled") === "" && /opacity:\s*0\.4/.test(block(".af-btn:disabled")) && /background:\s*var\(--accent\)/.test(block(".af-btn--primary")));
  check("focus is --info in the form (never the accent): buttons, segments, fields", /var\(--info\)/.test(block(".af-btn:focus-visible")) && /var\(--info\)/.test(block(".af-seg__opt:focus-visible")) && /border-color:\s*var\(--info\)/.test(block(".af-auto__revise textarea:focus")) && !/var\(--accent\)/.test(block(".af-auto__revise textarea:focus")));
  check("a narrow form keeps the choice ONE connected row (never a stacked list)", !/\.af-seg[^{]*\{[^}]*flex-direction:\s*column/.test(css));
}

if (failures) {
  console.error(`check_automation_edit_form: ${failures}/${checks} FAILED`);
  process.exit(1);
}
console.log(`check_automation_edit_form: OK (${checks} checks)`);
process.exit(0);
