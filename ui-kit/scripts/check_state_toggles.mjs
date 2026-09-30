#!/usr/bin/env node
/**
 * State-toggle checks (operator rule 2026-09-30, docs/state-toggles.md).
 *
 * 1. AfSwitch renders the markup contract: role=switch, aria-checked tracks `checked`, the
 *    label is the feature name in BOTH states (it never flips to a verb),
 *    unavailable = aria-disabled + aria-describedby naming a real reason node,
 *    and a click is ignored while unavailable or busy (afSwitchNextState).
 * 2. theme.css carries the af-switch block: the ON rule fills + glows the track, slides
 *    the thumb and draws the check mark (the non-colour cue), plus a
 *    touch rule at --tap-min.
 * 3. findVerbToggleLabels flags the verb-toggle shapes and passes state text.
 * 4. No kit component source contains a verb toggle.
 *
 * renderToStaticMarkup over the compiled dist (no jsdom), like check_about.mjs.
 */
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const kit = await import(join(root, "dist", "index.js"));
const { AfSwitch, afSwitchNextState, afSwitchIsActionable, findVerbToggleLabels } = kit;

let failures = 0;
let checks = 0;
function check(name, cond, detail) {
  checks += 1;
  if (cond) return;
  failures += 1;
  console.error(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`);
}
const render = (props) => renderToStaticMarkup(React.createElement(AfSwitch, props));
const attr = (html, name) => {
  const m = html.match(new RegExp(`<button[^>]*\\s${name}="([^"]*)"`));
  return m ? m[1] : null;
};
const label = (html) => (html.match(/<span class="af-switch__label">([^<]*)<\/span>/) || [])[1];

// 1) state rendering
const on = render({ label: "Email", checked: true });
const off = render({ label: "Email", checked: false });
check("root is a type=button role=switch with class af-switch", /^<button type="button" role="switch" class="af-switch"/.test(on), on);
check("checked=true -> aria-checked=true", attr(on, "aria-checked") === "true", on);
check("checked=false -> aria-checked=false", attr(off, "aria-checked") === "false", off);
check("no aria-pressed on a switch (one state attribute)", attr(on, "aria-pressed") === null);
check("label is the feature in both states", label(on) === "Email" && label(off) === "Email", `${label(on)} / ${label(off)}`);
check("track + thumb are aria-hidden decoration", /<span class="af-switch__track" aria-hidden="true"><span class="af-switch__thumb"><\/span><\/span>/.test(on));
check("available switch has no aria-disabled", attr(on, "aria-disabled") === null);
const row = render({ label: "Agent email tools", checked: false, description: "Off by default.", variant: "row" });
check("row variant + description", /class="af-switch af-switch--row"/.test(row) && row.includes('<span class="af-switch__desc">Off by default.</span>'));
check("sm variant", /class="af-switch af-switch--sm"/.test(render({ label: "Email", checked: true, variant: "sm" })));

const un = render({ label: "Agent email tools", checked: false, unavailableReason: "Needs a connected mailbox", id: "tools-admin" });
check("unavailable -> aria-disabled=true", attr(un, "aria-disabled") === "true", un);
check("unavailable is NOT the disabled attribute (stays focusable)", !/\sdisabled=""/.test(un), un);
const describedBy = attr(un, "aria-describedby");
check("unavailable -> aria-describedby points at the reason node", describedBy === "tools-admin-reason" && un.includes(`id="tools-admin-reason"`), un);
check("unavailable -> reason text rendered", un.includes(">Needs a connected mailbox<"));
check("unavailable -> title carries the reason for hover", attr(un, "title") === "Needs a connected mailbox");
check("unavailable -> class af-switch--unavailable", /class="af-switch af-switch--unavailable"/.test(un));
const unHidden = render({ label: "X", checked: false, unavailableReason: "why", reasonVisible: false });
check("reasonVisible=false keeps the reason for assistive tech only", /af-switch__reason af-switch__reason--hidden/.test(unHidden));
const unAuto = render({ label: "X", checked: false, unavailableReason: "why" });
const autoId = attr(unAuto, "aria-describedby");
check("auto reason id resolves", Boolean(autoId) && unAuto.includes(`id="${autoId}"`), unAuto);
const ext = render({ label: "X", checked: false, unavailableReason: "why", describedBy: "cell-7" });
check("describedBy: external reason node, none rendered", attr(ext, "aria-describedby") === "cell-7" && !ext.includes("af-switch__reason"));
const busy = render({ label: "Email", checked: true, busy: true });
check("busy -> aria-busy=true, state kept", attr(busy, "aria-busy") === "true" && attr(busy, "aria-checked") === "true");

check("click on OFF requests ON", afSwitchNextState({ checked: false }) === true);
check("click on ON requests OFF", afSwitchNextState({ checked: true }) === false);
check("click ignored while unavailable", afSwitchNextState({ checked: false, unavailableReason: "no mailbox" }) === null);
check("click ignored while busy", afSwitchNextState({ checked: true, busy: true }) === null);
check("blank reason is available", afSwitchIsActionable({ unavailableReason: "  " }) === true);
{
  const calls = [];
  const el = AfSwitch({ label: "Email", checked: false, onChange: (v) => calls.push(v) });
  const btn = el.type === "button" ? el : null;
  btn.props.onClick({ preventDefault() {} });
  const elU = AfSwitch({ label: "Email", checked: false, unavailableReason: "no", onChange: (v) => calls.push(v) });
  let prevented = false;
  elU.props.children[0].props.onClick({ preventDefault() { prevented = true; } });
  check("onChange gets the requested state; unavailable click is prevented and silent", JSON.stringify(calls) === "[true]" && prevented, JSON.stringify(calls));
}

// 2) styles
const css = readFileSync(join(root, "src", "theme.css"), "utf8");
const block = (css.match(/\/\* af-switch:begin[\s\S]*?\/\* af-switch:end \*\//) || [""])[0];
check("theme.css has one af-switch block", block.length > 0 && css.split("af-switch:begin").length === 2);
const rule = (sel) => {
  const i = block.indexOf(`${sel} {`);
  return i < 0 ? "" : block.slice(i, block.indexOf("}", i));
};
check("ON track fills with the accent", /background:\s*var\(--accent\)/.test(rule('.af-switch[aria-checked="true"] .af-switch__track')));
check("ON track glows (highlight)", /box-shadow:[^;]*var\(--accent\)/.test(rule('.af-switch[aria-checked="true"] .af-switch__track')));
check("ON thumb slides (position cue)", /transform:\s*translateX/.test(rule('.af-switch[aria-checked="true"] .af-switch__thumb')));
check("ON thumb draws a check mark (shape cue)", /border-width:\s*0 2px 2px 0/.test(rule('.af-switch[aria-checked="true"] .af-switch__thumb::after')));
check("ON label is bolder than OFF (weight cue, 600 = the type-scale cap)", /font-weight:\s*600/.test(rule('.af-switch[aria-checked="true"] .af-switch__label')) && /font-weight:\s*500/.test(rule(".af-switch")));
check("OFF track is not accent", !/var\(--accent\)/.test(rule(".af-switch__track")));
check("unavailable is dashed/hatched + not-allowed", /border-style:\s*dashed/.test(block) && /cursor:\s*not-allowed/.test(block));
check("touch target at --tap-min (both axes, sm included)", /@media \(pointer: coarse\)\s*\{\s*\.af-switch,\s*\.af-switch--sm\s*\{\s*min-height:\s*var\(--tap-min\);\s*min-width:\s*var\(--tap-min\)/.test(block));
{
  const rm = (block.match(/@media \(prefers-reduced-motion: reduce\)\s*\{([\s\S]*?)\n\}/) || [, ""])[1];
  const sels = (rm.match(/([^{}]+)\{[^}]*transition:\s*none/) || [, ""])[1].split(",").map((x) => x.trim());
  check("reduced motion drops the track + thumb transitions", sels.includes(".af-switch__track") && sels.includes(".af-switch__thumb"), sels.join(" | "));
  const moving = [...block.replace(/@media[^{]*\{[\s\S]*?\n\}/g, "").matchAll(/([^{}]+)\{[^}]*\btransition:/g)].map((m) => m[1].trim());
  check("every transitioning switch selector is silenced under reduced motion", moving.length > 0 && moving.every((sel) => sels.includes(sel)), moving.join(" | "));
}
check("switch label uses the body type scale (no heading font)", !/font-size:\s*(var\(--font-size-(lg|xl|2xl)\)|[2-9]\dpx)/.test(block) && /font:\s*inherit/.test(rule(".af-switch")));

// 3) the lint
const bad = [
  'x.textContent = mailOn ? "Email off" : "Email on";',
  "label={on ? 'Agent tools off' : 'Agent tools on'}",
  '{enabled ? "Disable" : "Enable"}',
  'b.textContent = s ? "Turn off" : "Turn on";',
  '<span>{paused ? "Resume" : "Pause"}</span>',
  'const t = active ? "Deactivate account" : "Activate account";',
  'x = on ? `Disable start at login` : `Enable start at login`;',
];
for (const src of bad) check(`lint flags: ${src}`, findVerbToggleLabels(src).length === 1, JSON.stringify(findVerbToggleLabels(src)));
const good = [
  'msg = on ? "Email is on for admin." : "Email is off for admin.";',
  'cell.textContent = on ? "on" : "off";',
  'state.textContent = u.enabled ? "enabled" : "disabled";',
  'b.textContent = open ? "Hide details" : "Show details";',
  'b.textContent = paused ? "Resume" : "Pause"; // state-toggle-lint: allow pausing a running run is a one-shot action',
  'x = ok ? "Save" : "Cancel";',
  'x = a ? `Email ${who} off` : `Email ${who} on`;',
];
for (const src of good) check(`lint passes: ${src}`, findVerbToggleLabels(src).length === 0, JSON.stringify(findVerbToggleLabels(src)));
check("lint reports 1-based line numbers", findVerbToggleLabels('a\nb = x ? "Email off" : "Email on"')[0]?.line === 2);

// 4) the kit's own components
const srcDir = join(root, "src");
const files = [];
const walk = (d) => {
  for (const e of readdirSync(d, { withFileTypes: true })) {
    const p = join(d, e.name);
    if (e.isDirectory()) walk(p);
    else if (/\.(tsx?|css)$/.test(e.name) && e.name !== "state_toggle_lint.ts") files.push(p);
  }
};
walk(srcDir);
walk(join(root, "islands"));
for (const f of files) {
  const hits = findVerbToggleLabels(readFileSync(f, "utf8"));
  check(`no verb toggle in ${f.slice(root.length + 1)}`, hits.length === 0, hits.map((h) => `${h.line}: ${h.text}`).join(" | "));
}

// Kit-owned per-item and form-state switches (2026-09-30): the tool policy's per-tool on/off and the edit form's
// "Email me the result" are switches labelled by the feature, never "Enable <tool>" checkboxes.
{
  const kitAll = await import(new URL("../dist/index.js", import.meta.url).href);
  const tools = [{ name: "write_file", description: "Write a file." }, { name: "read_file", description: "Read a file." }];
  const custom = renderToStaticMarkup(React.createElement(kitAll.ToolPolicyEditor, { tools, value: { mode: "custom", selected: ["read_file"] }, onChange() {} }));
  check("tool policy: per-tool control is a switch named by the tool", /role="switch"[^>]*data-action="tool-enabled" aria-checked="true"[^>]*aria-label="read_file"/.test(custom) && /data-action="tool-enabled" aria-checked="false"[^>]*aria-label="write_file"/.test(custom));
  check("tool policy: no verb-labelled checkbox", !/aria-label="Enable /.test(custom) && !/type="checkbox"/.test(custom));
  const all = renderToStaticMarkup(React.createElement(kitAll.ToolPolicyEditor, { tools, value: { mode: "all" }, onChange() {} }));
  check("tool policy: outside Custom the switches are unavailable with the reason", /data-action="tool-enabled"[^>]*aria-disabled="true"/.test(all) && all.includes("Choose Custom to pick tools one by one."));
  const native = renderToStaticMarkup(React.createElement(kitAll.AfSwitchInput, { label: "Email me the result", name: "notify_email", defaultChecked: true }));
  check("AfSwitchInput: native checkbox with role=switch inside the switch markup", /<label class="af-switch af-switch--native"[^>]*><input type="checkbox" role="switch" class="af-switch__input" name="notify_email" checked=""/.test(native) && native.includes('class="af-switch__track"'));
}

if (failures) {
  console.error(`check_state_toggles: ${failures}/${checks} FAILED`);
  process.exit(1);
}
console.log(`check_state_toggles: ${checks} checks green`);
