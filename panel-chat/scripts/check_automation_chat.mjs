#!/usr/bin/env node
/**
 * `AutomationChat` (operator 2026-11-27: "AN AUTOMATION MUST READ LIKE A CHAT"): an automation's
 * runs as the shared chat thread. No DOM; the compiled dist. Run after `npm run build`.
 * - the messages (`automationChatMessages`): per run a user message (the task, stamped when it
 *   fired, never the runtime's frame line) then its answer (stamped when it finished); a run in
 *   progress is the card's working state; a failed run the card's error level (the answer's words
 *   when there are some, else the served reason); a run waiting on the person has no answer yet
 *   (the thread's question panel, `automationWaitInteraction`); stopped / no answer a hint line;
 * - the markup: nothing above the thread but the host's header; "Run #N · on schedule" and Context
 *   in the task's footer; "New" in an unseen answer's footer; the message that was sent only when
 *   it differs from the answer; a composer only with `onTalk`; the thread's "load earlier" control
 *   only when older runs exist and the host loads them;
 * - `ChatThread.earlier`: absent = the markup as before; present = the control first, the opening
 *   still lands on its message, the person's scroll to the top asks once, and the place is kept
 *   when the earlier messages arrive.
 */
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { mount } from "./hook_harness.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const pc = await import(join(here, "..", "dist", "index.js"));
const { AutomationChat, ChatThread, automationChatMessages, automationWaitInteraction } = pc;
let failures = 0;
let checks = 0;
const check = (name, cond, detail) => {
  checks += 1;
  if (!cond) {
    failures += 1;
    console.error(`  FAIL ${name}${detail !== undefined ? ` — ${typeof detail === "string" ? detail : JSON.stringify(detail)}` : ""}`);
  }
};
const h = React.createElement;

const fired = (i) => `2026-11-${String(10 + i).padStart(2, "0")}T08:00:00Z`;
const done = (i) => `2026-11-${String(10 + i).padStart(2, "0")}T08:05:00Z`;
const row = (i, extra = {}) => ({
  run_id: `run-${i}`,
  index: i,
  attempts: 1,
  fired_at: fired(i),
  finished_at: done(i),
  status: "completed",
  trigger: { source_id: "schedule", summary: "schedule: every 24h" },
  user_turn: `[Trigger schedule@1 · occurrence ${i} · fired ${fired(i)}]\nSummarise the news (old wording).`,
  task: "Summarise the news (old wording).",
  answer: `## Briefing ${i}\n\nThe news of day ${i}, in markdown.`,
  notify: null,
  artifacts: [],
  waits: [],
  ledger_url: `/api/gateway/runs/run-${i}/ledger`,
  ...extra,
});
const rows = [
  row(1),
  row(2, { status: "failed", answer: "The agent failed: model not found.", failure: { reason_code: "occurrence_failed", message: "The run finished without success and gave no reason.", attempts: 1 } }),
  row(3, { status: "failed", answer: "", failure: { reason_code: "occurrence_failed", message: "The gateway could not start the run.", attempts: 3 } }),
  row(4, { status: "cancelled", answer: "" }),
  row(5, { answer: "", task: "" , user_turn: "" }),
  row(6, { notify: { title: "Briefing 6", body: "A different, shorter message." } }),
  row(7, { notify: { title: "Briefing 7", body: "## Briefing 7\n\nThe news of day 7, in markdown." } }),
  row(8, { status: "running", finished_at: undefined, answer: "" }),
];

// --- the messages ---------------------------------------------------------------------------------
{
  const m = automationChatMessages([...rows].reverse(), { current: { index: 8, run_id: "run-8", attempt: 1, status: "running" } });
  const byId = Object.fromEntries(m.map((x) => [x.id, x]));
  check("messages: oldest first, a task then its answer", m[0].id === "run:run-1:asked" && m[1].id === "run:run-1" && m[2].id === "run:run-2:asked", m.slice(0, 3).map((x) => x.id));
  check("messages: the task is the served task, a user message stamped when it fired", byId["run:run-1:asked"].role === "user" && byId["run:run-1:asked"].content === "Summarise the news (old wording)." && byId["run:run-1:asked"].ts === fired(1));
  check("messages: no message starts with the runtime's frame line", m.every((x) => !String(x.content).startsWith("[Trigger")));
  check("messages: the answer is an assistant message stamped when it finished", byId["run:run-1"].role === "assistant" && byId["run:run-1"].ts === done(1) && byId["run:run-1"].content.startsWith("## Briefing 1"));
  check("messages: a failed run with words is the error-level card with its words", byId["run:run-2"].role === "system" && byId["run:run-2"].level === "error" && byId["run:run-2"].title === "Failed" && byId["run:run-2"].content === "The agent failed: model not found.");
  check("messages: a failed run without words shows the served reason", byId["run:run-3"].level === "error" && byId["run:run-3"].content === "The gateway could not start the run.");
  check("messages: a stopped run is a hint line, not invented answer text", byId["run:run-4"].kind === pc.AUTOMATION_NOTE_KIND && byId["run:run-4"].content === "It was stopped before it answered.");
  check("messages: a run with no task says what its trigger is, as served", byId["run:run-5:asked"].content === "schedule: every 24h");
  check("messages: the run in progress is the card's working state (no text, live)", byId["run:run-8"].role === "assistant" && byId["run:run-8"].content === "" && Boolean(byId["run:run-8"].live) && !byId["run:run-8"].ts);
  const waitRow = row(9, { status: "waiting", answer: "", finished_at: undefined, waits: [{ run_id: "run-9", wait_key: "w9", kind: "ask_user", reason: "user", prompt: "Which region?", choices: ["EU", "US"] }] });
  const waiting = automationChatMessages([waitRow], { asked: "run-9" });
  check("messages: the run the question panel asks about has its task and no answer yet", waiting.length === 1 && waiting[0].id === "run:run-9:asked");
  const unasked = automationChatMessages([waitRow]);
  check("messages: a run waiting with no question panel for it is the card's working state, 'waiting for you'", unasked.length === 2 && Boolean(unasked[1].live) && unasked[1].live.label === "waiting for you", unasked[1]);
  const queued = automationChatMessages([row(10, { status: "admitted", answer: "", finished_at: undefined })]);
  check("messages: a queued (admitted) run is in flight, not 'finished without a written answer'", Boolean(queued[1].live) && queued[1].kind !== pc.AUTOMATION_NOTE_KIND, queued[1]);
  check("messages: no message carries a runId (the shared chat's attachment recovery by run never applies)", m.every((x) => x.runId === undefined));
  const files = automationChatMessages([row(10, { artifacts: [{ artifact_id: "a".repeat(32), name: "report.pdf", mime_type: "application/pdf", url: "/x" }, { artifact_id: "b".repeat(32), name: "input.txt", mime_type: "text/plain", url: "/y" }] })], { inputs: new Map([["run-10", [{ id: "b".repeat(32), runId: "run-10", name: "input.txt" }]]]) });
  check("messages: the run's files are the answer's chips, less the ones it was handed (the task's)", files[0].artifactRefs?.length === 1 && files[0].artifactRefs[0].name === "input.txt" && files[1].artifactRefs?.length === 1 && files[1].artifactRefs[0].name === "report.pdf", files.map((x) => x.artifactRefs));
}

// --- the question / approval ----------------------------------------------------------------------
{
  const sent = [];
  const answer = (w, payload) => (sent.push([w.wait_key, payload]), Promise.resolve());
  const ask = automationWaitInteraction([row(9, { status: "waiting", waits: [{ run_id: "run-9", wait_key: "w9", kind: "ask_user", reason: "user", prompt: "Which region?", choices: ["EU", "US"] }] })], answer);
  ask.onSubmit("EU");
  const tool = automationWaitInteraction([row(9, { status: "waiting", waits: [{ run_id: "run-9", wait_key: "t9", kind: "tool_approval", reason: "tool", details: [{ name: "web_search", arguments: { query: "news" } }] }] })], answer);
  tool.onApprove();
  tool.onDeny();
  check("waits: a question is the thread's ask-user panel answering {response}", ask.kind === "ask-user" && ask.choices.length === 2 && JSON.stringify(sent[0]) === JSON.stringify(["w9", { response: "EU" }]));
  check("waits: an approval is the thread's tool-approval panel answering {approved}", tool.kind === "tool-approval" && tool.toolName === "web_search" && JSON.stringify(sent.slice(1)) === JSON.stringify([["t9", { approved: true }], ["t9", { approved: false }]]));
  check("waits: none when nothing waits", automationWaitInteraction(rows, answer) === null);
}

// --- the markup ---------------------------------------------------------------------------------
const summary = {
  automation_id: "auto-1",
  title: "International news",
  status: "active",
  occurrence_count: 12,
  current_occurrence: null,
  attention: { pending_waits: 0, unread: true, unseen_count: 1, cursor: "att1:7", items: [{ kind: "notify", automation_id: "auto-1", run_id: "run-7", index: 7, at: done(7), title: "Briefing 7", cursor: "att1:7" }], waits: [] },
};
const done8 = rows.slice(0, 7);
const html = (extra = {}) => renderToStaticMarkup(h(AutomationChat, { summary, occurrences: done8, ...extra }));
{
  const plain = html();
  check("markup: the shared chat (WorkflowChat), the run cards are chat message cards", plain.startsWith('<section class="pc-workflow-chat pc-automation-chat"') && (plain.match(/class="pc-chat-item pc-chat-item--user"/g) || []).length === 7);
  check("markup: nothing above the thread without the host's header", !plain.includes("pc-workflow-chat__header"));
  check("markup: no text starts with the frame line", !plain.includes("[Trigger"));
  check("markup: the task's footer: Run #1 · on schedule", plain.includes('data-foot="task" data-run-id="run-1" data-run-index="1"><span class="pc-auto-foot__run">Run #1 · on schedule</span>'));
  check("markup: no Context without the host's reader", !plain.includes('data-action="open-context"'));
  check("markup: Context in every task's footer with the reader", (html({ readRunContext: { input_data: async () => ({}), run: async () => ({}) } }).match(/data-action="open-context"/g) || []).length === 7);
  check("markup: the unseen answer says New in its footer, once", (plain.match(/class="pc-auto-foot__new" data-unseen="7"/g) || []).length === 1 && (plain.match(/pc-auto-foot__new/g) || []).length === 1);
  check("markup: the message that was sent only when it differs from the answer", (plain.match(/data-notify="true"/g) || []).length === 1 && plain.includes("A different, shorter message."));
  // A failed run: with an answer the answer is the message and the failure sentence is never
  // appended; without one the failure sentence is the message. Both at the card's error level.
  // The error cards in order: run 2 (failed, an answer), run 3 (failed, no answer).
  const errorCards = plain.split('<div class="pc-chat-item ').filter((c) => c.startsWith("pc-chat-item--error"));
  check("markup: the two failed runs are the card's error level", errorCards.length === 2, String(errorCards.length));
  check("markup: a failed run with an answer shows the answer, no failure sentence after it", (errorCards[0] || "").includes("The agent failed: model not found.") && !plain.includes("The run finished without success and gave no reason."), (errorCards[0] || "").slice(0, 400));
  check("markup: a failed run without an answer shows its failure sentence", (errorCards[1] || "").includes("The gateway could not start the run."), (errorCards[1] || "").slice(0, 400));
  check("markup: no composer without onTalk", !plain.includes("pc-workflow-chat__composer"));
  check("markup: a composer with onTalk, 'Talk about its latest run'", html({ onTalk: async () => {} }).includes('placeholder="Talk about its latest run"'));
  check("markup: no 'load earlier' without the host's loader", !plain.includes('data-action="load-earlier"'));
  check("markup: 'load earlier' names the older runs when the host loads them", html({ onLoadEarlier() {} }).includes('data-action="load-earlier">Earlier runs (5 more)</button>'));
  check("markup: no run frame, unseen block, After the run or Discuss", !/af-auto-occ|af-auto__attention|after-the-run|data-action="discuss"/.test(plain));
  check("markup: the host's header goes in the chat's header", html({ header: h("div", { className: "spy-head" }) }).includes('<div class="pc-workflow-chat__header-main"><div class="spy-head"></div></div>'));
}

// --- ChatThread.earlier -------------------------------------------------------------------------
const msg = (id, role, content) => ({ id, role, content });
const runs = [msg("run:r1:asked", "user", "Task one"), msg("run:r1", "assistant", "Answer one"), msg("run:r2:asked", "user", "Task two"), msg("run:r2", "assistant", "Answer two")];
check("thread: without earlier, no control (the markup as before)", !renderToStaticMarkup(h(ChatThread, { messages: runs })).includes("pc-chat-earlier"));
check("thread: with earlier, the control is the surface's first child", /^<div class="pc-chat-thread"><div class="pc-chat-earlier"><button type="button" class="pc-chat-earlier__button" data-action="load-earlier">Earlier runs \(3 more\)<\/button><\/div><div class="pc-chat-item/.test(renderToStaticMarkup(h(ChatThread, { messages: runs, earlier: { label: "Earlier runs (3 more)", onLoad() {} } }))));
function surface(count, { rowHeight = 200, clientHeight = 300 } = {}) {
  const listeners = [];
  const list = {
    scrollTop: 0,
    clientHeight,
    get scrollHeight() {
      return count() * rowHeight;
    },
    getBoundingClientRect: () => ({ top: 50 }),
    addEventListener: (type, fn) => type === "scroll" && listeners.push(fn),
    removeEventListener() {},
    get children() {
      return Array.from({ length: count() }, (_, i) => ({ getBoundingClientRect: () => ({ top: 50 + i * rowHeight - list.scrollTop }) }));
    },
    scrollBy(top) {
      list.scrollTop = top;
      for (const fn of listeners) fn();
    },
  };
  return list;
}
{
  // The control + four groups: the opening lands on its message (group 2 = child 3).
  let n = 5;
  const list = surface(() => n);
  let asked = 0;
  const earlier = { label: "Earlier runs (2 more)", onLoad: () => (asked += 1) };
  const t = mount(ChatThread, { messages: [], autoScroll: false, openAt: { key: "a", messageId: "run:r2:asked" }, earlier });
  t.tree.ref.current = list;
  t.rerender({ autoScroll: true });
  t.rerender({ messages: runs });
  check("thread: the opening lands on its message below the control", list.scrollTop === 600, String(list.scrollTop));
  list.scrollBy(10); // the person scrolls to the top
  check("thread: the person's scroll to the top asks for the earlier messages, once", asked === 1, String(asked));
  t.rerender({ earlier: { ...earlier, loading: true } });
  list.scrollBy(0);
  check("thread: never asks again while they load", asked === 1, String(asked));
  // Two earlier messages arrive above: what the person read (10 px from the top when they asked)
  // stays where it was: two rows further down the content.
  n = 7;
  t.rerender({ messages: [msg("run:r0:asked", "user", "Task zero"), msg("run:r0", "assistant", "Answer zero"), ...runs], earlier: null });
  check("thread: the place is kept when the earlier messages arrive", list.scrollTop === 410, String(list.scrollTop));
}

if (failures) {
  console.error(`check_automation_chat: ${failures} of ${checks} checks FAILED`);
  process.exit(1);
}
console.log(`check_automation_chat: OK (${checks} checks: a run is a task and an answer, its states the card's own, footers small, load earlier keeps the place)`);
