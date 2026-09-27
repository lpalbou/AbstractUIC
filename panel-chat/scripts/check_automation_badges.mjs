// Automations v1 panel-chat pieces: ScheduleThisAction + FromAutomationBadge.
// Run after `npm run build`: node scripts/check_automation_badges.mjs
//
// Both are standalone (no requests): the action hands the host its seed, the
// badge names the automation and occurrence, and is a button only when the
// host can open the automation.
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import * as pc from "../dist/index.js";

const { ScheduleThisAction, FromAutomationBadge, fromAutomationText } = pc;
for (const [n, v] of Object.entries({ ScheduleThisAction, FromAutomationBadge, fromAutomationText })) assert.equal(typeof v, "function", `export ${n}`);

// ScheduleThisAction
const seed = { prompt: "Check ACME shares", target: { flow_id: "@default", interface: "abstractcode.agent.v1" } };
const got = [];
const el = ScheduleThisAction({ seed, onSchedule: (s) => got.push(s) });
el.props.onClick();
assert.deepEqual(got, [seed], "click hands the exact seed to the host");
const html = renderToStaticMarkup(React.createElement(ScheduleThisAction, { seed, onSchedule() {} }));
assert.match(html, /^<button type="button" class="pc-btn pc-schedule-this" aria-label="Schedule this…"/, html);
assert.ok(html.includes("<span>Schedule this…</span>") && html.includes("<svg"), "label + icon");
const off = renderToStaticMarkup(React.createElement(ScheduleThisAction, { seed, onSchedule() {}, disabled: true, label: "Automate" }));
assert.ok(off.includes('disabled=""') && off.includes('aria-label="Automate"'), "disabled + custom label");

// FromAutomationBadge
assert.equal(fromAutomationText("Inbox triage", 7), "from automation Inbox triage · #7");
assert.equal(fromAutomationText("Inbox triage"), "from automation Inbox triage");
const span = renderToStaticMarkup(React.createElement(FromAutomationBadge, { title: "Inbox triage", index: 7 }));
assert.ok(span.startsWith('<span class="pc-from-automation">') && span.includes("<span>from automation Inbox triage · #7</span>") && !span.includes("<button"), span);
let opened = 0;
const btn = FromAutomationBadge({ title: "AI news monitor", onOpen: () => opened++ });
assert.equal(btn.type, "button");
btn.props.onClick();
assert.equal(opened, 1, "onOpen fires");
const bhtml = renderToStaticMarkup(React.createElement(FromAutomationBadge, { title: "<b>x</b>", onOpen() {} }));
assert.ok(bhtml.includes('type="button" class="pc-from-automation pc-from-automation--button"') && bhtml.includes("&lt;b&gt;x&lt;/b&gt;"), "button + escaped title");

// CSS ships
const { readFileSync } = await import("node:fs");
const css = readFileSync(new URL("../src/panel_chat.css", import.meta.url), "utf8");
for (const cls of [".pc-schedule-this {", ".pc-from-automation {", ".pc-from-automation--button {"]) assert.ok(css.includes(cls), `css ${cls}`);

console.log("check_automation_badges: OK");
