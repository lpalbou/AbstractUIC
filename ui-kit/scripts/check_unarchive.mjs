#!/usr/bin/env node
/**
 * ui-kit 0.7.0: the Unarchive control (`automation.unarchive`). An archived
 * automation shows Unarchive in place of Archive, enabled only with the
 * `unarchive` capability; it sends `automation.unarchive`; a live automation
 * never shows it. Labels/hints come from automation_controls.json.
 * Mutation-checked (removing the control or its gate turns this red).
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
const list = JSON.parse(readFileSync(join(here, "fixtures", "automations", "list.json"), "utf8")).items;

let failures = 0;
let checks = 0;
function check(name, cond, detail) {
  checks += 1;
  if (cond) return;
  failures += 1;
  console.error(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`);
}

const { automationControls, CONTROL_COMMANDS, CONTROL_LABELS, CONTROL_HINTS, CONTROL_ICONS } = kit;
const { AutomationControlsBar } = parts;
check("command", CONTROL_COMMANDS.unarchive === "automation.unarchive", CONTROL_COMMANDS.unarchive);
check("label from the spec", CONTROL_LABELS.unarchive === "Unarchive" && spec.labels.unarchive === "Unarchive");
check("hint says it comes back paused", /paused/.test(CONTROL_HINTS.unarchive), CONTROL_HINTS.unarchive);
check("icon", CONTROL_ICONS.unarchive === "unarchive");

const base = list.find((s) => !s.legacy && s.status === "active");
const archived = { ...base, status: "archived", capabilities: [...base.capabilities, "unarchive"] };
const archivedNoCap = { ...base, status: "archived", capabilities: base.capabilities.filter((c) => c !== "unarchive") };
check("gate: archived + capability = enabled", automationControls(archived).unarchive.enabled === true);
check("gate: archived without capability = disabled", automationControls(archivedNoCap).unarchive.enabled === false && /Not permitted/.test(automationControls(archivedNoCap).unarchive.reason));
check("gate: live automation = disabled", automationControls({ ...base, capabilities: [...base.capabilities, "unarchive"] }).unarchive.enabled === false);
check("gate: busy = disabled", automationControls(archived, [], true).unarchive.enabled === false);
check("gate: legacy = disabled", automationControls({ ...archived, legacy: true }).unarchive.enabled === false);

const bar = (summary, sink) =>
  AutomationControlsBar({ summary, occurrences: [], busy: false, confirmingArchive: true, reviseOpen: false, onCommand: (t) => sink.push(t), onToggleRevise: () => {}, onAskArchive: () => {}, onCancelArchive: () => {} });
const html = (summary) => renderToStaticMarkup(bar(summary, []));
const button = (h, action) => (new RegExp(`<button[^>]*data-action="${action}"[^>]*>`).exec(h) || [null])[0];
{
  const h = html(archived);
  check("archived: Unarchive button", !!button(h, "unarchive") && !/ disabled=""/.test(button(h, "unarchive")), h);
  check("archived: no Archive button", button(h, "archive") === null);
  check("archived: no archive confirmation", !h.includes('data-action="archive-confirm"'));
  const hn = html(archivedNoCap);
  check("archived without cap: Unarchive disabled", / disabled=""/.test(button(hn, "unarchive") || ""));
  const live = html(base);
  check("live: Archive shown, no Unarchive", !!button(live, "archive") && button(live, "unarchive") === null);
}
// Wiring: clicking Unarchive sends automation.unarchive.
{
  const sink = [];
  const tree = bar(archived, sink);
  const found = [];
  const walk = (n) => {
    if (!n || typeof n !== "object") return;
    if (Array.isArray(n)) return n.forEach(walk);
    if (typeof n.type === "function") return walk(n.type(n.props));
    if (n.props && n.props["data-action"] === "unarchive") found.push(n);
    walk(n.props && n.props.children);
  };
  walk(tree);
  check("wiring: one Unarchive element", found.length === 1, String(found.length));
  found[0]?.props.onClick();
  check("wiring: sends automation.unarchive", sink.length === 1 && sink[0] === "automation.unarchive", JSON.stringify(sink));
}

if (failures) {
  console.error(`check_unarchive: ${failures}/${checks} FAILED`);
  process.exit(1);
}
console.log(`check_unarchive: ${checks} checks passed`);
