#!/usr/bin/env node
/**
 * Email automations in the shared form (framework backlog 0992 WP6), over the
 * compiled dist (renderToStaticMarkup + a minimal hooks harness, no jsdom):
 *
 * - `email.received@1` create body: typed filters (from_in, from_domain_in,
 *   to_in, subject_contains, has_attachment), `every` default 1h for a model
 *   target / 60s without a model, the 60 s floor, `max_batch` 1..1000;
 *   invalid addresses/domains refused with the entry named;
 * - "Email me the result" → `notify.channels ["console","email"]`; off sends
 *   no `notify` (server default); allowed recipients → `policy.
 *   email_allowed_recipients ["self", ...]`; only-me sends nothing;
 * - the dialog: "When an email arrives" disabled + "Connect a mailbox first — open
 *   My email" when `GET /me/email` is unknown or not usable; enabled and
 *   submitted when usable; nothing email-shaped is sent without a usable
 *   account;
 * - revise: email interval (start_at dropped, 60 s floor), notify and
 *   recipients round-trip through reviseFormFrom → reviseChanges; the Edit
 *   form reads its email fields; the definition block shows them;
 * - client: getMyEmail GETs api/gateway/me/email;
 * - wording IS automation_controls.json → email (vendored by the Assistant
 *   and the Code TUI).
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

const here = dirname(fileURLToPath(import.meta.url));
const kit = await import(join(here, "..", "dist", "index.js"));
const parts = await import(join(here, "..", "dist", "automations", "AutomationPanel.js"));
const spec = JSON.parse(readFileSync(join(here, "..", "src", "automations", "automation_controls.json"), "utf8"));
const fx = (f) => JSON.parse(readFileSync(join(here, "fixtures", "automations", f), "utf8"));

let failures = 0;
let checks = 0;
function check(name, cond, detail) {
  checks += 1;
  if (cond) return;
  failures += 1;
  console.error(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`);
}
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#x27;");

// --- exports ----------------------------------------------------------------------------
for (const name of ["AfEmailSetupNotice", "AfEmailTriggerFields", "AfEmailOptionsFields", "emailTriggerConfigFrom", "emailUsable", "emailAllowedRecipientsFrom", "notifyFor", "parseEntryList", "isEmailTrigger", "emailTriggerLabel"]) {
  check(`export ${name}`, typeof kit[name] === "function", typeof kit[name]);
}
if (failures) {
  console.error(`check_automation_email: ${failures}/${checks} FAILED (the email pieces are not exported)`);
  process.exit(1);
}

// --- wording = the canonical JSON ----------------------------------------------------------
check("EMAIL_TEXT is automation_controls.json → email", eq(kit.EMAIL_TEXT, spec.email));
check("the notice text (operator wording)", spec.email.not_set_up === "Connect a mailbox first — open My email" && spec.email.not_set_up.endsWith(spec.email.open_my_email));
check("trigger label", spec.email.trigger_label === "When an email arrives" && spec.email.notify_label === "Email me the result");
check("the 60 s rule and the hourly default are stated", /once an hour by default/.test(spec.email.interval_rule) && /every 60 s/.test(spec.email.interval_rule) && /shortest interval is 60 s/.test(spec.email.interval_rule));
check("trigger source id", kit.EMAIL_TRIGGER_SOURCE_ID === "email.received" && kit.EMAIL_TRIGGER_SOURCE_VERSION === 1 && spec.email.trigger_source === "email.received@1");

// --- pure rules ------------------------------------------------------------------------------
check("parseEntryList: commas, semicolons, spaces, new lines; lower-cased; deduped", eq(kit.parseEntryList(" A@x.test, b@x.test;\nA@X.test  c@y.test "), ["a@x.test", "b@x.test", "c@y.test"]));
check("isPlainAddress", kit.isPlainAddress("a@x.test") && !kit.isPlainAddress("a") && !kit.isPlainAddress("A <a@x.test>") && !kit.isPlainAddress("a@b@c") && !kit.isPlainAddress("@x.test"));
check("isPlainDomain", kit.isPlainDomain("x.test") && !kit.isPlainDomain("x") && !kit.isPlainDomain("*.x.test") && !kit.isPlainDomain("a@x.test") && !kit.isPlainDomain(".x.test"));
check("emailUsable: only effective_enabled true", kit.emailUsable({ configured: true, effective_enabled: true }) && !kit.emailUsable({ configured: true, effective_enabled: false }) && !kit.emailUsable(null) && !kit.emailUsable(undefined));

const D = kit.DEFAULT_EMAIL_TRIGGER_FORM;
{
  const r = kit.emailTriggerConfigFrom(D);
  check("default: uses_model true, every 1h, max_batch 100, no filter", eq(r, { config: { uses_model: true, every: "1h", max_batch: 100 }, errors: [] }), JSON.stringify(r));
  const nm = kit.emailTriggerConfigFrom({ ...D, usesModel: false });
  check("no model: every 60s", nm.config.every === "60s" && nm.errors.length === 0);
  const f = kit.emailTriggerConfigFrom({ ...D, fromIn: "Boss@Example.test, a@x.test", fromDomainIn: "Example.org", toIn: "me@example.test", subjectContains: "  invoice ", hasAttachment: "yes", every: { amount: 10, unit: "m" }, maxBatch: 20 });
  check("filters typed and normalized", eq(f.config, { uses_model: true, every: "10m", max_batch: 20, filter: { from_in: ["boss@example.test", "a@x.test"], from_domain_in: ["example.org"], to_in: ["me@example.test"], subject_contains: "invoice", has_attachment: true } }), JSON.stringify(f));
  check("has_attachment no → false", kit.emailTriggerConfigFrom({ ...D, hasAttachment: "no" }).config.filter.has_attachment === false);
  const bad = kit.emailTriggerConfigFrom({ ...D, fromIn: "not-an-address, ok@x.test", fromDomainIn: "*.x.test" });
  check("bad entries named", bad.errors.length === 2 && bad.errors[0].includes("not-an-address") && !bad.errors[0].includes("ok@x.test") && bad.errors[1].includes("*.x.test"), JSON.stringify(bad.errors));
  check("60 s floor (units are minutes+, so 0 is the floor case)", kit.emailTriggerConfigFrom({ ...D, every: { amount: 0, unit: "m" } }).errors.length === 1);
  check("max_batch range", kit.emailTriggerConfigFrom({ ...D, maxBatch: 1001 }).errors.length === 1 && kit.emailTriggerConfigFrom({ ...D, maxBatch: 0 }).errors.length === 1 && kit.emailTriggerConfigFrom({ ...D, maxBatch: 1000 }).errors.length === 0);
  check("subject: one line", kit.emailTriggerConfigFrom({ ...D, subjectContains: "a\nb" }).errors.length === 1);
  check("label", kit.emailTriggerLabel(f.config) === "when an email arrives · from boss@example.test, a@x.test, example.org · to me@example.test · subject contains “invoice” · with attachments · checked every 10 minutes · up to 20 per run", kit.emailTriggerLabel(f.config));
  check("triggerSummary knows email.received@1", kit.triggerSummary({ source_id: "email.received", source_version: 1, config: { every: "1h" } }).startsWith("when an email arrives · checked every hour"));
}
{
  check("recipients: only me", eq(kit.emailAllowedRecipientsFrom({ mode: "self", addresses: "x@y.test" }), { recipients: ["self"], errors: [] }));
  check("recipients: me and these", eq(kit.emailAllowedRecipientsFrom({ mode: "list", addresses: "Boss@example.test, self" }), { recipients: ["self", "boss@example.test"], errors: [] }));
  check("recipients: list needs one address", kit.emailAllowedRecipientsFrom({ mode: "list", addresses: " " }).errors.length === 1);
  check("recipients: invalid named", kit.emailAllowedRecipientsFrom({ mode: "list", addresses: "nope" }).errors[0].includes("nope"));
  check("recipients form from a stored list", eq(kit.emailRecipientsFormFrom(["self", "a@x.test"]), { mode: "list", addresses: "a@x.test" }) && eq(kit.emailRecipientsFormFrom(undefined), { mode: "self", addresses: "" }));
  check("notifyFor", eq(kit.notifyFor(true), { channels: ["console", "email"] }) && eq(kit.notifyFor(false), { channels: ["console"] }));
}

// --- create body ------------------------------------------------------------------------------
const target = { flow_id: "@default", interface: "abstractcode.agent.v1" };
{
  const r = kit.buildCreateRequest({ prompt: "Summarise new invoices", when: { kind: "every", amount: 24, unit: "h" }, context: "independent", trigger: "email", email: { ...D, fromDomainIn: "example.org" }, notifyEmail: true, emailRecipients: { mode: "list", addresses: "boss@example.test" } }, { target, requestId: "rq" });
  check("email create body", r.ok && eq(r.body, {
    request_id: "rq", title: "Summarise new invoices", target: { ...target, input_data: { prompt: "Summarise new invoices" } },
    trigger: { source_id: "email.received", source_version: 1, config: { uses_model: true, every: "1h", max_batch: 100, filter: { from_domain_in: ["example.org"] } } },
    context: { mode: "independent" },
    policy: { tool_approval: "auto", email_allowed_recipients: ["self", "boss@example.test"] },
    notify: { channels: ["console", "email"] },
  }), JSON.stringify(r));
  const plain = kit.buildCreateRequest({ prompt: "x", when: { kind: "every", amount: 5, unit: "m" }, context: "independent", notifyEmail: false, emailRecipients: { mode: "self", addresses: "" } }, { target, requestId: "r" });
  check("defaults send no notify and no recipients (server defaults)", plain.ok && !("notify" in plain.body) && eq(plain.body.policy, { tool_approval: "auto" }) && plain.body.trigger.source_id === "schedule");
  const invalid = kit.buildCreateRequest({ prompt: "x", when: { kind: "once", at: "" }, context: "independent", trigger: "email", email: { ...D, toIn: "bad" } }, { target, requestId: "r" });
  check("email trigger ignores `when`; its own errors block", !invalid.ok && invalid.errors.length === 1 && invalid.errors[0].includes("bad"), JSON.stringify(invalid));
}

// --- dialog --------------------------------------------------------------------------------------
function harness(Component) {
  const internals = React.__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED;
  const slots = [];
  let i = 0;
  const H = {
    useState(init) { const k = i++; if (!(k in slots)) slots[k] = { v: typeof init === "function" ? init() : init }; const c = slots[k]; return [c.v, (nv) => { c.v = typeof nv === "function" ? nv(c.v) : nv; }]; },
    useRef(init) { const k = i++; if (!(k in slots)) slots[k] = { current: init }; return slots[k]; },
    useId() { const k = i++; if (!(k in slots)) slots[k] = `:h${k}:`; return slots[k]; },
    useEffect() { i++; },
  };
  return {
    render(props) {
      i = 0;
      internals.ReactCurrentDispatcher.current = H;
      try { return Component(props); } finally { internals.ReactCurrentDispatcher.current = null; }
    },
  };
}
function walk(node, visit) {
  if (node === null || node === undefined || typeof node === "boolean") return;
  if (Array.isArray(node)) return node.forEach((n) => walk(n, visit));
  if (typeof node !== "object") return;
  if (typeof node.type === "function") return walk(node.type(node.props), visit);
  visit(node);
  walk(node.props && node.props.children, visit);
}
const find = (tree, pred) => {
  const out = [];
  walk(tree, (n) => pred(n) && out.push(n));
  return out;
};
const { AfScheduleDialog } = kit;
const dlg = (p) => renderToStaticMarkup(React.createElement(AfScheduleDialog, { open: true, onClose() {}, target: null, onSubmit() {}, newRequestId: () => "rid", ...p }));
const NOT_SET_UP_HTML = `Connect a mailbox first — `;
{
  const unknown = dlg({});
  check("dialog: email trigger offered", unknown.includes("When an email arrives"));
  check("dialog: unknown email status → trigger disabled", /<input type="radio" name="[^"]+" disabled="" value="email"\/> When an email arrives/.test(unknown), (/.{80}value="email".{40}/.exec(unknown) || [""])[0]);
  check("dialog: unknown email status → the notice", unknown.includes(NOT_SET_UP_HTML) && unknown.includes('data-email-setup="missing"'));
  check("dialog: unknown → Email me the result disabled", /<button type="button" role="switch" class="af-switch af-switch--row af-switch--unavailable" data-action="notify-email" aria-checked="false" aria-disabled="true"[^>]*>.*?Email me the result/.test(unknown));
  const notConfigured = dlg({ emailStatus: { configured: false, effective_enabled: false } });
  check("dialog: not configured → notice", notConfigured.includes(NOT_SET_UP_HTML));
  const off = dlg({ emailStatus: { configured: true, enabled: true, admin_enabled: false, effective_enabled: false, admin_disabled: { cause: "An administrator turned email off for your account.", fix: "Ask an administrator." } } });
  check("dialog: turned off by the admin → notice + cause", off.includes(NOT_SET_UP_HTML) && off.includes("An administrator turned email off for your account."));
  let opened = 0;
  const h0 = harness(AfScheduleDialog);
  const t0 = h0.render({ open: true, onClose() {}, target, onSubmit() {}, onOpenMyEmail: () => { opened += 1; } });
  const link = find(t0, (n) => n.props && n.props["data-action"] === "open-my-email");
  check("dialog: open My email is a button calling the host", link.length >= 1 && (link[0].props.onClick(), opened === 1));
  const ok = dlg({ emailStatus: { configured: true, effective_enabled: true } });
  check("dialog: usable → trigger enabled, no notice", /<input type="radio" name="[^"]+" value="email"\/> When an email arrives/.test(ok) && !ok.includes('data-email-setup="missing"'));
  check("dialog: usable → email options enabled", /<button type="button" role="switch" class="af-switch af-switch--row" data-action="notify-email" aria-checked="false"[^>]*>.*?Email me the result/.test(ok) && !/data-action="notify-email"[^>]*aria-disabled/.test(ok) && ok.includes(`> ${esc(spec.email.recipients_self)}`));
}
{
  const bodies = [];
  const h = harness(AfScheduleDialog);
  const usable = { configured: true, effective_enabled: true };
  const props = { open: true, onClose() {}, target, newRequestId: () => "rq", emailStatus: usable, onSubmit: (b) => { bodies.push(b); return Promise.resolve(); } };
  const tree = () => h.render(props);
  find(tree(), (x) => x.type === "textarea")[0].props.onChange({ target: { value: "Summarise new mail" } });
  find(tree(), (x) => x.type === "input" && x.props.value === "email")[0].props.onChange();
  const html = renderToStaticMarkup(tree());
  check("dialog: email chosen → filters, interval (1 hour shown), max batch, rule, untrusted note", html.includes('name="email_from_in"') && html.includes('name="email_from_domain_in"') && html.includes('name="email_to_in"') && html.includes('name="email_subject_contains"') && html.includes('name="email_has_attachment"') && /name="email_every_amount" value="1"/.test(html) && /<option value="h" selected="">hours<\/option>/.test(html) && html.includes('name="email_max_batch" type="number" min="1" max="1000" step="1" value="100"') && html.includes('data-email-rule="interval"') && html.includes('data-email-rule="untrusted"'), html.slice(0, 0));
  check("dialog: email chosen → no schedule presets", !html.includes(">every 5 minutes</button>"));
  check("dialog: preview says when an email arrives", html.includes("Runs when an email arrives · checked every hour · up to 100 per run."));
  find(tree(), (x) => x.type === "input" && x.props.name === "email_from_in")[0].props.onChange({ target: { value: "boss@example.test" } });
  find(tree(), (x) => x.props && x.props["data-action"] === "notify-email")[0].props.onClick({ preventDefault() {} });
  find(tree(), (x) => x.type === "input" && x.props.value === "list" && x.props.type === "radio")[0].props.onChange();
  find(tree(), (x) => x.type === "textarea" && x.props.name === "email_recipient_list")[0].props.onChange({ target: { value: "colleague@example.test" } });
  find(tree(), (x) => x.type === "form")[0].props.onSubmit({ preventDefault() {} });
  check("dialog: submits the email body", bodies[0] && eq(bodies[0].trigger, { source_id: "email.received", source_version: 1, config: { uses_model: true, every: "1h", max_batch: 100, filter: { from_in: ["boss@example.test"] } } }) && eq(bodies[0].notify, { channels: ["console", "email"] }) && eq(bodies[0].policy, { tool_approval: "auto", email_allowed_recipients: ["self", "colleague@example.test"] }), JSON.stringify(bodies[0]));
  // The account stops being usable: nothing email-shaped is sent.
  props.emailStatus = { configured: true, effective_enabled: false };
  find(tree(), (x) => x.type === "form")[0].props.onSubmit({ preventDefault() {} });
  check("dialog: without a usable account nothing email-shaped is sent", bodies[1] && bodies[1].trigger.source_id === "schedule" && !("notify" in bodies[1]) && eq(bodies[1].policy, { tool_approval: "auto" }), JSON.stringify(bodies[1]));
  // A model-free target: 60 s default.
  props.emailStatus = usable;
  props.targetUsesModel = false;
  find(tree(), (x) => x.type === "form")[0].props.onSubmit({ preventDefault() {} });
  check("dialog: targetUsesModel false → every 60s, uses_model false", bodies[2] && bodies[2].trigger.config.every === "60s" && bodies[2].trigger.config.uses_model === false, JSON.stringify(bodies[2] && bodies[2].trigger));
}

// --- revise ----------------------------------------------------------------------------------------
{
  const base = fx("list.json").items.find((s) => s.title === "AI news monitor");
  const summary = { ...base, trigger: { binding_id: "b1", source_id: "email.received", source_version: 1, config: { account: "self", folder: "INBOX", uses_model: true, every: "1h", max_batch: 100, start_at: "2026-09-30T00:00:00Z", filter: { from_in: ["a@x.test"] } } } };
  const def = { target: { bundle_ref: "basic-agent@0.1.0", flow_id: "main", input_data: { prompt: "Summarise." } }, policy: { tool_approval: "auto", email_allowed_recipients: ["self"] }, notify: { channels: ["console"] } };
  const f0 = kit.reviseFormFrom(summary, def);
  check("reviseFormFrom: email every, notify off, only me", f0.every === "1h" && f0.notifyEmail === false && eq(f0.emailRecipients, { mode: "self", addresses: "" }));
  check("no change → null", kit.reviseChanges(summary, f0, def) === null);
  const ch = kit.reviseChanges(summary, { ...f0, every: "2h", notifyEmail: true, emailRecipients: { mode: "list", addresses: "boss@example.test" } }, def);
  check("revise: interval keeps the filter, drops start_at; notify; recipients", eq(ch, { trigger: { source_id: "email.received", source_version: 1, config: { account: "self", folder: "INBOX", uses_model: true, every: "2h", max_batch: 100, filter: { from_in: ["a@x.test"] } } }, notify: { channels: ["console", "email"] }, policy: { email_allowed_recipients: ["self", "boss@example.test"] } }), JSON.stringify(ch));
  check("revise: 30 s refused", "errors" in kit.reviseChanges(summary, { ...f0, every: "30s" }, def));
  const back = kit.reviseChanges(summary, { ...f0, notifyEmail: false }, { ...def, notify: { channels: ["console", "email"] } });
  check("revise: turning email off → notify console only", eq(back, { notify: { channels: ["console"] } }), JSON.stringify(back));
  const v1 = { target: def.target, policy: { tool_approval: "auto" } };
  check("a v1 definition reads with the defaults (no change)", kit.reviseChanges(summary, kit.reviseFormFrom(summary, v1), v1) === null);
  check("without a definition no email fields", kit.reviseFormFrom(summary).notifyEmail === null && kit.reviseFormFrom(summary).emailRecipients === null);
  // The Edit form's own fields.
  const html = renderToStaticMarkup(React.createElement(parts.AutomationReviseForm, { summary, definition: def, busy: false, errors: [], onSubmit() {}, onCancel() {}, emailStatus: { configured: true, effective_enabled: true } }));
  check("edit form: email interval legend + rule, notify, recipients", html.includes(`<legend>${spec.email.every_label}</legend>`) && html.includes('data-email-rule="interval"') && html.includes('name="notify_email"') && html.includes('name="email_recipients"') && !html.includes('data-email-setup="missing"'));
  const locked = renderToStaticMarkup(React.createElement(parts.AutomationReviseForm, { summary, definition: def, busy: false, errors: [], onSubmit() {}, onCancel() {} }));
  check("edit form without a usable account: notice; turning on is disabled", locked.includes(NOT_SET_UP_HTML) && /<input type="checkbox" role="switch" class="af-switch__input" name="notify_email" disabled=""/.test(locked));
  const onAlready = renderToStaticMarkup(React.createElement(parts.AutomationReviseForm, { summary, definition: { ...def, notify: { channels: ["console", "email"] } }, busy: false, errors: [], onSubmit() {}, onCancel() {} }));
  check("edit form without a usable account: an option already on can be turned off", /<input type="checkbox" role="switch" class="af-switch__input" name="notify_email" checked=""/.test(onAlready) && !/name="notify_email"[^>]*disabled/.test(onAlready));
  const els = { title: { value: summary.title }, every_amount: { value: "3" }, every_unit: { value: "h" }, context: { value: summary.context_mode }, prompt: { value: "Summarise." }, tool_approval: { value: "auto" }, notify_email: { checked: true }, email_recipients: { value: "list" }, email_recipient_list: { value: "c@x.test" } };
  const read = parts.readReviseForm({ elements: { namedItem: (k) => els[k] ?? null } }, f0);
  check("readReviseForm reads the email fields", read.every === "3h" && read.notifyEmail === true && eq(read.emailRecipients, { mode: "list", addresses: "c@x.test" }), JSON.stringify(read));
  // Definition block.
  const block = renderToStaticMarkup(React.createElement(parts.AutomationDefinitionBlock, { definition: { schema_version: 2, revision: 2, title: "t", controller: { bundle_ref: "c@1", flow_id: "controller" }, target: { workflow_id: "w", ...def.target }, trigger: summary.trigger, context: { mode: "independent", growing: {} }, policy: { serial: true, misfire: "coalesce", failure: "continue", retry: { max_attempts: 3, backoff: { initial: "30s", factor: 2, max: "10m" } }, tool_approval: "auto", email_allowed_recipients: ["self", "boss@example.test"] }, notify: { channels: ["console", "email"] }, session_id: "s", workspace_root: "/w", created_at: "2026-09-30T00:00:00Z", archived_at: null } }));
  check("definition block: notify + may email + email trigger label", block.includes('data-def="notify">In the console and by email') && block.includes('data-def="email_allowed_recipients">Me and boss@example.test') && block.includes("email.received@1 · when an email arrives"));
}

// --- client ---------------------------------------------------------------------------------------
{
  const calls = [];
  const c = kit.createAutomationsClient({ fetch: async (url, init) => { calls.push([url, init.method]); return new Response(JSON.stringify({ configured: false, effective_enabled: false }), { status: 200 }); }, newId: () => "x" });
  const got = await c.getMyEmail();
  check("client: getMyEmail GETs api/gateway/me/email", eq(calls, [["api/gateway/me/email", "GET"]]) && got.effective_enabled === false && kit.MY_EMAIL_PATH === "api/gateway/me/email");
  const c403 = kit.createAutomationsClient({ fetch: async () => new Response(JSON.stringify({ detail: { reason_code: "email_principal_refused", message: "Entities have no mailbox." } }), { status: 403 }), newId: () => "x" });
  const err = await c403.getMyEmail().catch((x) => x);
  check("client: a refusal throws the typed error", err instanceof kit.AutomationApiError && err.code === "email_principal_refused" && err.status === 403);
}

// --- CSS -------------------------------------------------------------------------------------------
const css = readFileSync(join(here, "..", "src", "theme.css"), "utf8");
for (const cls of [".af-email__notice", ".af-email__check", ".af-email__trigger", ".af-email__filters"]) check(`css ${cls}`, css.includes(`${cls} {`) || css.includes(`${cls},`));

if (failures) {
  console.error(`check_automation_email: ${failures}/${checks} FAILED`);
  process.exit(1);
}
console.log(`check_automation_email: OK (${checks} checks)`);
