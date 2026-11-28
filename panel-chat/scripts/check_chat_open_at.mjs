#!/usr/bin/env node
/**
 * `ChatThread` / `WorkflowChat` `openAt` (automations wave, spec B: the Assistant web opens an
 * automation on its newest run's first message, at the TOP of the thread):
 * - absent: the markup and the stick-to-bottom behaviour are exactly as before;
 * - present: the markup is the same; the first render that carries the message puts its group at
 *   the top of the scroll surface, ONCE per key; later growth, a later `messageId` and the
 *   thread's own scroll event never move it; the person's own scroll to the bottom brings the
 *   following back; a new key is a new opening.
 * No DOM: a stand-in scroll surface behind the thread's ref. Run after `npm run build`.
 */
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { mount, walk } from "./hook_harness.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const pc = await import(join(here, "..", "dist", "index.js"));
const { ChatThread, WorkflowChat } = pc;
let failures = 0;
let checks = 0;
const check = (name, cond, detail) => {
  checks += 1;
  if (!cond) {
    failures += 1;
    console.error(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`);
  }
};
const h = React.createElement;
const msg = (id, role, content) => ({ id, role, content, runId: id.split(":")[1] });
const runs = [msg("run:r1:asked", "user", "Task one"), msg("run:r1", "assistant", "Answer one"), msg("run:r2:asked", "user", "Task two"), msg("run:r2", "assistant", "Working…")];

// --- markup: identical with and without the prop ------------------------------------------------
{
  const plain = renderToStaticMarkup(h(ChatThread, { messages: runs }));
  const opened = renderToStaticMarkup(h(ChatThread, { messages: runs, openAt: { key: "a1", messageId: "run:r2:asked" } }));
  check("ChatThread: the markup is the same with openAt", plain === opened);
  const wc = (extra) => renderToStaticMarkup(h(WorkflowChat, { messages: runs, draft: "", onDraftChange() {}, onSend: async () => {}, ...extra }));
  check("WorkflowChat: the markup is the same with openAt", wc({}) === wc({ openAt: { key: "a1", messageId: "run:r2:asked" } }));
}

// A stand-in scroll surface: children = one element per group, at fixed offsets in the content.
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
    listeners,
  };
  return list;
}

// --- absent: sticks to the bottom as before -----------------------------------------------------
{
  let n = 2;
  const list = surface(() => n);
  const t = mount(ChatThread, { messages: runs.slice(0, 2), autoScroll: false });
  t.tree.ref.current = list;
  t.rerender({ autoScroll: true });
  n = 4;
  t.rerender({ messages: runs });
  check("absent: new content follows the bottom", list.scrollTop === list.scrollHeight, String(list.scrollTop));
  check("absent: the scroll listener is armed", list.listeners.length === 1);
}

// --- present: the message at the top, once ----------------------------------------------------
{
  let n = 0;
  const list = surface(() => n);
  const t = mount(ChatThread, { messages: [], autoScroll: false, openAt: { key: "auto-1", messageId: "run:r2:asked" } });
  t.tree.ref.current = list;
  t.rerender({ autoScroll: true });
  check("present: nothing moves while the message has not arrived", list.scrollTop === 0);
  n = 4;
  t.rerender({ messages: runs });
  check("present: the newest run's Task message is at the top", list.scrollTop === 400, String(list.scrollTop));
  list.scrollBy(400); // the thread's own scroll event
  n = 5;
  t.rerender({ messages: [...runs, msg("run:r2:tool", "assistant", "More text")] });
  check("present: growth after the opening does not follow the bottom", list.scrollTop === 400, String(list.scrollTop));
  t.rerender({ openAt: { key: "auto-1", messageId: "run:r1:asked" } });
  check("present: a later messageId for the same key never scrolls", list.scrollTop === 400);
  // The person scrolls to the bottom: the usual following comes back.
  list.scrollBy(list.scrollHeight - list.clientHeight);
  n = 6;
  t.rerender({ messages: [...runs, msg("run:r2:tool", "assistant", "More text"), msg("run:r3", "assistant", "Next")] });
  check("present: after the person's own scroll to the bottom, it follows again", list.scrollTop === list.scrollHeight, String(list.scrollTop));
  // A new key is a new opening.
  t.rerender({ openAt: { key: "auto-2", messageId: "run:r1:asked" } });
  check("present: a new key opens again at its message", list.scrollTop === 0, String(list.scrollTop));
}

// --- the prop arrives on a thread that already follows the bottom (no openAt at mount) -----------
{
  let n = 2;
  const list = surface(() => n);
  const t = mount(ChatThread, { messages: runs.slice(0, 2), autoScroll: false });
  t.tree.ref.current = list;
  t.rerender({ autoScroll: true });
  n = 4;
  t.rerender({ messages: runs, openAt: { key: "auto-3", messageId: "run:r2:asked" } });
  check("late prop: the message is at the top, not the bottom (the same commit's follow is held)", list.scrollTop === 400, String(list.scrollTop));
}

// --- WorkflowChat hands the prop to its thread --------------------------------------------------
{
  const openAt = { key: "a9", messageId: "run:r1:asked" };
  const w = mount(WorkflowChat, { messages: runs, draft: "", onDraftChange() {}, onSend: async () => {}, openAt });
  const thread = [...walk(w.tree)].find((n) => n.type === ChatThread);
  check("WorkflowChat: the thread receives openAt", thread?.props.openAt === openAt);
  const w2 = mount(WorkflowChat, { messages: runs, draft: "", onDraftChange() {}, onSend: async () => {} });
  check("WorkflowChat: without it the thread gets none", [...walk(w2.tree)].find((n) => n.type === ChatThread)?.props.openAt === undefined);
}

if (failures) {
  console.error(`check_chat_open_at: ${failures} of ${checks} checks FAILED`);
  process.exit(1);
}
console.log(`check_chat_open_at: OK (${checks} checks: markup unchanged, once per key, no following until the person scrolls)`);
