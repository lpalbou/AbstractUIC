#!/usr/bin/env node
/**
 * `ChatThread` jump buttons (operator 2026-11-28: "a small widget to rapidly get at the beginning and
 * end of a chat … 2 round buttons up & down whenever a person start scrolling"), in every chat:
 * - nothing before the person scrolls (the server markup is the same as before);
 * - the person's scroll shows them; the thread's own following and its opening never do;
 * - "Go to the beginning" is hidden at the very top, "Go to the latest" at the very bottom;
 * - a click jumps (smooth; instant with reduced motion); they hide a moment after the scrolling
 *   stops, and stay while pointed at or focused;
 * - `chatJumpLift`: lifted above a message's own actions they would cover, never above the thread.
 * No DOM: a stand-in scroll surface behind the thread's ref. Run after `npm run build`.
 */
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { mount, byData } from "./hook_harness.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const pc = await import(join(here, "..", "dist", "index.js"));
const { ChatThread, CHAT_JUMP_WORDS, CHAT_JUMP_HIDE_MS, chatJumpLift } = pc;
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
const msg = (id, role, content) => ({ id, role, content });
const runs = Array.from({ length: 6 }, (_, i) => msg(`m${i}`, i % 2 ? "assistant" : "user", `Message ${i}`));

check("words: the two tooltips", CHAT_JUMP_WORDS.start === "Go to the beginning" && CHAT_JUMP_WORDS.end === "Go to the latest");
check("markup: nothing before the person scrolls", !renderToStaticMarkup(h(ChatThread, { messages: runs })).includes("pc-chat-jump"));

function surface(rows, { rowHeight = 200, clientHeight = 300 } = {}) {
  const listeners = [];
  const list = {
    scrollTop: 0,
    clientHeight,
    scrolled: [],
    get scrollHeight() {
      return rows * rowHeight;
    },
    getBoundingClientRect: () => ({ top: 50, bottom: 50 + clientHeight }),
    addEventListener: (type, fn) => type === "scroll" && listeners.push(fn),
    removeEventListener() {},
    querySelectorAll: () => [],
    children: [],
    scrollTo(o) {
      list.scrolled.push(o);
      list.scrollTop = o.top;
    },
    scrollBy(top) {
      list.scrollTop = top;
      for (const fn of listeners) fn({ type: "scroll" });
    },
  };
  return list;
}
const jumpOf = (t) => byData(t.tree, "className", "pc-chat-jump");
const button = (t, action) => byData(t.tree, "data-action", action);

{
  const list = surface(6);
  const t = mount(ChatThread, { messages: runs, autoScroll: false });
  t.tree.ref.current = list;
  t.rerender({ autoScroll: true });
  // The thread follows the bottom by itself (its own scroll): no buttons.
  t.rerender({ messages: [...runs, msg("m6", "assistant", "More")] });
  list.scrollBy(list.scrollTop); // the event of that own scroll
  t.rerender({});
  check("own following: no jump buttons", !jumpOf(t), jumpOf(t)?.props);
  // The person scrolls to the middle: both buttons.
  list.scrollBy(400);
  t.rerender({});
  check("person's scroll: the buttons show", jumpOf(t)?.props["data-visible"] === "true");
  check("middle: both buttons", button(t, "jump-start")?.props.hidden === false && button(t, "jump-end")?.props.hidden === false);
  check("each button has its tooltip and name", button(t, "jump-start")?.props.title === CHAT_JUMP_WORDS.start && button(t, "jump-start")?.props["aria-label"] === CHAT_JUMP_WORDS.start && button(t, "jump-end")?.props.title === CHAT_JUMP_WORDS.end);
  list.scrollBy(0);
  t.rerender({});
  check("at the very top: no 'beginning'", button(t, "jump-start")?.props.hidden === true && button(t, "jump-end")?.props.hidden === false);
  list.scrollBy(list.scrollHeight - list.clientHeight);
  t.rerender({});
  check("at the very bottom: no 'latest'", button(t, "jump-end")?.props.hidden === true && button(t, "jump-start")?.props.hidden === false);
  button(t, "jump-start").props.onClick();
  check("'beginning' jumps to the top, smoothly", JSON.stringify(list.scrolled.at(-1)) === JSON.stringify({ top: 0, behavior: "smooth" }), list.scrolled.at(-1));
  button(t, "jump-end").props.onClick();
  check("'latest' jumps to the end", list.scrolled.at(-1)?.top === list.scrollHeight, list.scrolled.at(-1));
  // They hide a moment after the scrolling stops; pointed at, they stay.
  await new Promise((r) => setTimeout(r, CHAT_JUMP_HIDE_MS + 100));
  t.rerender({});
  check("a moment after the scrolling stops: hidden (still in the page for the keyboard)", jumpOf(t)?.props["data-visible"] === "false" && Boolean(button(t, "jump-start")));
  list.scrollBy(500);
  t.rerender({});
  byData(t.tree, "className", "pc-chat-jump__stack").props.onPointerEnter();
  await new Promise((r) => setTimeout(r, CHAT_JUMP_HIDE_MS + 100));
  t.rerender({});
  check("pointed at: they stay", jumpOf(t)?.props["data-visible"] === "true");
  t.unmount?.();
}
{
  // Reduced motion: an instant jump.
  const saved = globalThis.window;
  globalThis.window = { matchMedia: (q) => ({ matches: q.includes("reduce") }) };
  const list = surface(6);
  const t = mount(ChatThread, { messages: runs, autoScroll: false });
  t.tree.ref.current = list;
  t.rerender({ autoScroll: true });
  list.scrollBy(400);
  t.rerender({});
  button(t, "jump-end").props.onClick();
  check("reduced motion: the jump is instant", list.scrolled.at(-1)?.behavior === "auto", list.scrolled.at(-1));
  globalThis.window = saved;
}

// --- never over a message's own actions ---------------------------------------------------------
const stack = { top: 700, bottom: 772, left: 360, right: 392 };
check("lift: nothing under them → 0", chatJumpLift(stack, [{ top: 100, bottom: 130, left: 300, right: 392 }], 60) === 0);
check("lift: a card's copy/speaker under them → above it", chatJumpLift(stack, [{ top: 740, bottom: 770, left: 330, right: 390 }], 60) === 772 - 740 + 6);
check("lift: a second action just above → above both", chatJumpLift(stack, [{ top: 740, bottom: 770, left: 330, right: 390 }, { top: 690, bottom: 712, left: 350, right: 380 }], 60) === 772 - 690 + 6);
check("lift: an action beside them (not under) → 0", chatJumpLift(stack, [{ top: 740, bottom: 770, left: 100, right: 300 }], 60) === 0);
check("lift: never above the thread's top", chatJumpLift(stack, [{ top: 640, bottom: 770, left: 330, right: 390 }], 600) === 0);

if (failures) {
  console.error(`check_chat_jump: ${failures} of ${checks} checks FAILED`);
  process.exit(1);
}
console.log(`check_chat_jump: OK (${checks} checks: shown on the person's scroll only, hidden at their end, jump, fade, never over a message's actions)`);
