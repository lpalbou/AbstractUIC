// One primary round button: Send (arrow), or Stop (square) while a run is active and nothing can be sent.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { WorkflowChat } from "../dist/workflow_chat.js";

const mic = React.createElement("button", { type: "button", "aria-label": "Voice" }, "Mic");
const render = (props) => renderToStaticMarkup(React.createElement(WorkflowChat, { messages: [], draft: "", onDraftChange() {}, onSend() {}, onCancel() {}, composerTrailingActions: mic, ...props }));
const buttons = (html) => (html.match(/<button\b/g) || []).length;
const primary = (html) => html.match(/<button[^>]*pc-composer__send--compact[^>]*>/)?.[0] || "";
const steer = { onSteer() {}, modes: ["guide"] };

const cases = {
  idle: render({ draft: "hi" }),
  "running, empty": render({ busy: true }),
  "running, typed (steer)": render({ busy: true, draft: "more", steer }),
  stopping: render({ busy: true, stopState: { phase: "stopping", label: "Stopping…" } }),
};
for (const [name, html] of Object.entries(cases)) assert.equal(buttons(html), 2, `${name}: exactly two buttons (microphone + primary), got ${buttons(html)}`);
assert.match(primary(cases.idle), /aria-label="Send"/);
assert.match(primary(cases.idle), /data-mode="send"/);
assert.match(primary(cases["running, empty"]), /aria-label="Stop"/);
assert.match(primary(cases["running, empty"]), /data-mode="stop"/);
assert(!/disabled=""/.test(primary(cases["running, empty"])), "Stop is enabled");
assert.match(primary(cases["running, typed (steer)"]), /aria-label="Steer"/, "typed text while running: the button is Send again");
assert.match(primary(cases["running, typed (steer)"]), /data-mode="send"/);
assert.match(primary(cases.stopping), /aria-busy="true"/);
assert.match(primary(cases.stopping), /data-mode="stopping"/);
assert(!/Stopping…<\/span>|pc-workflow-chat__stop"/.test(cases.stopping), "no separate Stopping… button");
// A queue/guide choice keeps working: its buttons are not trailing buttons of the composer (two modes -> the group is in the actions slot).
const two = render({ busy: true, draft: "more", steer: { onSteer() {}, modes: ["guide", "queue"] } });
assert.equal((two.match(/data-steer-mode=/g) || []).length, 2, "Guide this run / Queue next turn untouched");

const css = readFileSync(new URL("../src/panel_chat.css", import.meta.url), "utf8");
const reduced = css.split("@media (prefers-reduced-motion: reduce)").slice(1).join("\n");
assert(/\.pc-composer__morph > svg \{ transition: none; \}/.test(reduced), "reduced motion: the morph is static");
assert(/data-mode="stopping"\][^}]*animation: none/.test(reduced), "reduced motion: the stopping spinner is static");
assert(/transition: opacity 170ms/.test(css), "the morph lasts about 170 ms");
console.log("composer stop: two buttons in idle / running-empty / running-typed / stopping, Send<->Stop label, reduced motion OK");
