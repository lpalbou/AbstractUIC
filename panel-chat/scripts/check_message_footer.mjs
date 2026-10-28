#!/usr/bin/env node
/**
 * The message footer spec (operator QA 2026-10-28, AbstractUIC 0.8.4, backlog 0064;
 * `panel-chat/src/message_footer.ts`), each pinned so removing the fix is red:
 *  A. the stamp: the time today; "Yesterday · <time>"; "<Mon D> · <time>" earlier this year;
 *     "<Mon D, YYYY> · <time>" another year; the card renders the dated form for a message that
 *     is not from today (with the full date as the hover text), nothing for a malformed one;
 *  B. the speaker is on EVERY assistant message of a TTS host (an answer, a question, a warning,
 *     a reply with media, a reply that carries statistics, a streaming reply and one without text,
 *     the last two disabled with their reason), with a renderFooter slot too; never on a user or
 *     system message; never without a TTS host; copy is on every card;
 *  C. every stat chip of a workflow turn (tokens, tools, files changed, duration) opens the
 *     structured StatDetail panel: no chip carries a native `title`, the files chip included.
 * Run after `npm run build`.
 */
// A zone west of UTC, so a date parsed as UTC (a bare "2026-10-27") lands on the wrong day and goes red.
process.env.TZ = "America/Los_Angeles";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

const here = dirname(fileURLToPath(import.meta.url));
const pc = await import(join(here, "..", "dist", "index.js"));
const { ChatMessageCard, formatMessageStamp, messageStampTitle, messageStampIso, useLocalDay, statDetail, StatDetailPanel } = pc;
let failures = 0;
let checks = 0;
const check = (name, cond, detail) => {
  checks += 1;
  if (!cond) {
    failures += 1;
    console.error(`  FAIL ${name}${detail !== undefined ? ` — ${typeof detail === "string" ? detail.slice(0, 400) : JSON.stringify(detail)}` : ""}`);
  }
};
const quiet = console.error;
console.error = (...a) => {
  if (!String(a[0]).includes("useLayoutEffect does nothing on the server")) quiet(...a);
};
const render = (props) => renderToStaticMarkup(React.createElement(ChatMessageCard, props));

// ---------------------------------------------------------------- A. stamp (pure)
{
  const now = new Date(2026, 9, 28, 14, 5); // local Oct 28 2026, 2:05 PM
  const at = (y, mo, d, h, mi) => new Date(y, mo, d, h, mi).toISOString();
  const today = formatMessageStamp(at(2026, 9, 28, 0, 46), now, "en-US");
  check("A today is the time only", today === "12:46 AM", today);
  const yest = formatMessageStamp(at(2026, 9, 27, 22, 52), now, "en-US");
  check("A yesterday says Yesterday", yest === "Yesterday · 10:52 PM", yest);
  const older = formatMessageStamp(at(2026, 9, 21, 22, 52), now, "en-US");
  check("A earlier this year: month and day", older === "Oct 21 · 10:52 PM", older);
  const lastYear = formatMessageStamp(at(2025, 9, 21, 22, 52), now, "en-US");
  check("A another year carries the year", lastYear === "Oct 21, 2025 · 10:52 PM", lastYear);
  const future = formatMessageStamp(at(2026, 9, 30, 9, 0), now, "en-US");
  check("A a future day is dated", future === "Oct 30 · 09:00 AM", future);
  // Calendar days, not 24 h windows: 11:59 PM yesterday seen at 12:01 AM is "Yesterday".
  const justAfterMidnight = new Date(2026, 9, 28, 0, 1);
  check("A calendar yesterday, not 24 h", formatMessageStamp(at(2026, 9, 27, 23, 59), justAfterMidnight, "en-US") === "Yesterday · 11:59 PM");
  // Month boundary: Nov 1 sees Oct 31 as yesterday.
  check("A yesterday across a month", formatMessageStamp(at(2026, 9, 31, 8, 0), new Date(2026, 10, 1, 9, 0), "en-US") === "Yesterday · 08:00 AM");
  const fr = formatMessageStamp(at(2026, 9, 21, 22, 52), now, "fr-FR");
  check("A locale-aware (fr-FR)", fr === "21 oct. · 22:52", fr);
  check("A malformed is empty", formatMessageStamp("not-a-date", now) === "" && formatMessageStamp("", now) === "" && formatMessageStamp(undefined, now) === "");
  check("A epoch milliseconds are a timestamp", formatMessageStamp(new Date(2026, 9, 21, 22, 52).getTime(), now, "en-US") === "Oct 21 · 10:52 PM");
  check("A a bare date is the reader's local day, without a made-up time", formatMessageStamp("2026-10-27", now, "en-US") === "Yesterday" && formatMessageStamp("2026-10-21", now, "en-US") === "Oct 21", formatMessageStamp("2026-10-27", now, "en-US"));
  check("A the machine-readable form is ISO", messageStampIso("2026-10-21T22:52:00+02:00") === "2026-10-21T20:52:00.000Z" && messageStampIso("2026-10-27") === "2026-10-27" && messageStampIso("x") === "");
  check("A useLocalDay is exported (the card re-renders at local midnight)", typeof useLocalDay === "function");
  const title = messageStampTitle(at(2026, 9, 21, 22, 52), "en-US");
  check("A the hover text is the full date", /Wednesday, October 21, 2026/.test(title) && /10:52/.test(title), title);
}

// ---------------------------------------------------------------- A. stamp on the card
{
  const daysAgo = (n) => {
    const d = new Date();
    d.setDate(d.getDate() - n);
    d.setHours(10, 52, 0, 0);
    return d;
  };
  const old = daysAgo(7);
  const html = render({ message: { id: "a1", role: "assistant", content: "From last week.", ts: old.toISOString() }, onSpeakToggle: () => {} });
  const stamp = (html.match(/<time class="pc-chat-time"[^>]*>([^<]*)<\/time>/) || [])[1] || "";
  const want = formatMessageStamp(old);
  check("A card: a message not from today shows its date", stamp === want && / · /.test(stamp) && stamp.includes(old.toLocaleDateString(undefined, { month: "short", day: "numeric" })), { stamp, want });
  check("A card: the stamp has the full date as hover text", html.includes(`title="${messageStampTitle(old).replace(/"/g, "&quot;")}"`), html.slice(0, 600));
  const y = daysAgo(1);
  const yhtml = render({ message: { id: "a2", role: "assistant", content: "Yesterday's.", ts: y.toISOString() } });
  check("A card: yesterday's message says Yesterday", /<time class="pc-chat-time"[^>]*>Yesterday · /.test(yhtml), yhtml.slice(0, 600));
  const now = new Date();
  const thtml = render({ message: { id: "a3", role: "assistant", content: "Now.", ts: now.toISOString() } });
  const tstamp = (thtml.match(/<time class="pc-chat-time"[^>]*>([^<]*)<\/time>/) || [])[1] || "";
  check("A card: today's message shows the time only", tstamp && !tstamp.includes("·") && /\d{1,2}:\d{2}/.test(tstamp), tstamp);
  const offset = render({ message: { id: "a5", role: "assistant", content: "x", ts: "2026-10-21T22:52:00+02:00" } });
  check("A card: dateTime is ISO (UTC), whatever form the host sent", offset.includes('dateTime="2026-10-21T20:52:00.000Z"'), offset.slice(0, 600));
  const bad = render({ message: { id: "a4", role: "assistant", content: "x", ts: "garbage" } });
  check("A card: a malformed stamp renders nothing", !bad.includes("pc-chat-time") && !bad.includes("Invalid Date"), bad.slice(0, 400));
}

// ---------------------------------------------------------------- B. speaker permanence
{
  const tts = { onSpeakToggle: () => {}, getSpeakState: () => "idle" };
  const speaker = (html) => (html.match(/<button[^>]*data-speak-state="[^"]*"[^>]*>/) || [""])[0];
  const yesterday = new Date(Date.now() - 86400000).toISOString();
  const stats = { llmCalls: 1, toolCalls: 1, changedFiles: ["src/a.ts"], totalTokens: 120, inputTokens: 100, outputTokens: 20, durationMs: 4000 };
  const kinds = {
    answer: { id: "b1", role: "assistant", content: "Done." },
    "from history (yesterday)": { id: "b2", role: "assistant", content: "Older answer.", ts: yesterday },
    question: { id: "b3", role: "assistant", kind: "question", content: "Which file?" },
    warning: { id: "b4", role: "assistant", level: "warn", content: "The answer was empty." },
    "with media": { id: "b5", role: "assistant", content: "Here it is.", media: [{ kind: "image", src: "blob:x", label: "Generated image" }] },
    "with statistics": { id: "b6", role: "assistant", content: "Turn done.", statistics: stats, runId: "r1" },
    named: { id: "b7", role: "assistant", title: "Sisko", content: "Hello." },
  };
  for (const [name, message] of Object.entries(kinds)) {
    const html = render({ message, ...tts });
    const btn = speaker(html);
    check(`B speaker on an assistant ${name}`, Boolean(btn) && !/aria-disabled|\bdisabled=""/.test(btn), html.slice(0, 500));
    check(`B copy on an assistant ${name}`, html.includes('aria-label="Copy message"'));
  }
  const withFooter = render({ message: kinds.answer, ...tts, renderFooter: () => React.createElement("span", { className: "host-badge" }, "detail") });
  check("B speaker kept with a renderFooter slot", Boolean(speaker(withFooter)) && withFooter.includes("host-badge"));
  const live = render({ message: { id: "b8", role: "assistant", content: "Partial", live: { callId: "c1", reasoning: "" } }, ...tts });
  const liveBtn = speaker(live);
  check("B a streaming reply keeps the speaker, disabled with its reason", /aria-disabled="true"/.test(liveBtn) && !/\sdisabled=""/.test(liveBtn) && liveBtn.includes('title="Read aloud when the reply is finished"'), liveBtn || live.slice(0, 500));
  const empty = render({ message: { id: "b9", role: "assistant", content: "", media: [{ kind: "image", src: "blob:y" }] }, ...tts });
  const emptyBtn = speaker(empty);
  check("B a reply without text keeps the speaker, disabled with its reason", /aria-disabled="true"/.test(emptyBtn) && emptyBtn.includes('title="No text to read aloud"'), emptyBtn || empty.slice(0, 500));
  check("B no speaker on the user's message", !speaker(render({ message: { id: "u1", role: "user", content: "Hi" }, ...tts })));
  check("B no speaker on a system message", !speaker(render({ message: { id: "s1", role: "system", content: "Note" }, ...tts })));
  check("B no speaker without a TTS host", !speaker(render({ message: kinds.answer })));
  check("B copy off only when the host says so", !render({ message: kinds.answer, ...tts, showCopy: false }).includes('aria-label="Copy message"'));
}

// ---------------------------------------------------------------- C. structured chips
{
  const statistics = {
    llmCalls: 2,
    toolCalls: 3,
    changedFiles: ["src/app.ts", "docs/notes.md", "README.md"],
    inputTokens: 5996,
    outputTokens: 423,
    totalTokens: 6419,
    durationMs: 215000,
  };
  const html = render({ message: { id: "c1", role: "assistant", content: "Turn done.", runId: "r1", statistics }, onSpeakToggle: () => {} });
  const chips = [...html.matchAll(/<(?:span|button)[^>]*class="pc-chat-stat(?: [^"]*)?"[^>]*>/g)].map((m) => m[0]);
  check("C four chips (tokens, tools, files, duration)", chips.length === 4, chips);
  const kinds = chips.map((c) => (c.match(/data-stat-kind="([^"]+)"/) || [])[1]);
  check("C every chip opens the structured panel", kinds.join(",") === "tokens,tools,files,time", kinds);
  check("C no chip has a native title tooltip", chips.every((c) => !/\stitle="/.test(c)), chips.filter((c) => /\stitle="/.test(c)));
  check("C the files chip is labeled in words", html.includes(">3 files changed<"), html.slice(0, 200));
  const files = statDetail("files", statistics);
  check("C files detail: title, headline, one row per file (name, then folder)",
    files.kind === "files" && files.title === "Files changed" && files.headline === "3 files" &&
      JSON.stringify(files.sections[0].rows) === JSON.stringify([
        { label: "app.ts", value: "src" },
        { label: "notes.md", value: "docs" },
        { label: "README.md", value: "workspace folder" },
      ]),
    files);
  const win = statDetail("files", { ...statistics, changedFiles: ["src\\win\\a.ts"] });
  check("C files detail splits a Windows path too", win.sections[0].rows[0].label === "a.ts" && win.sections[0].rows[0].value === "src\\win", win.sections[0].rows[0]);
  const many = statDetail("files", { ...statistics, changedFiles: Array.from({ length: 33 }, (_, i) => `f${i}.txt`) });
  check("C files detail caps at 30 rows and says how many more", many.sections[0].rows.length === 30 && many.sections[0].note === "and 3 more files", many.sections[0].note);
  const panel = renderToStaticMarkup(React.createElement(StatDetailPanel, { detail: files }));
  check("C files panel renders as the structured card", panel.includes('role="tooltip"') && panel.includes("pc-stat-detail--files") && panel.includes(">Files changed<") && panel.includes("From the run ledger"), panel.slice(0, 400));
  const tokens = renderToStaticMarkup(React.createElement(StatDetailPanel, { detail: statDetail("tokens", statistics) }));
  check("C tokens panel: Usage with Input/Output/Total and the ledger footnote", /Usage · 2 model calls/.test(tokens) && />Input</.test(tokens) && />Output</.test(tokens) && />Total</.test(tokens) && tokens.includes("summed across this turn and its child runs"), tokens.slice(0, 400));
}

// ---------------------------------------------------------------- A. the shared midnight timer
{
  const { subscribeLocalDay } = await import(join(here, "..", "dist", "message_footer.js"));
  const realSet = globalThis.setTimeout, realClear = globalThis.clearTimeout;
  const timers = new Map();
  let nextId = 1;
  globalThis.setTimeout = (fn, ms) => { const id = nextId++; timers.set(id, { fn, ms }); return { id, unref() {} }; };
  globalThis.clearTimeout = (h) => { timers.delete(h && h.id); };
  try {
    let a = 0, b = 0;
    const offA = subscribeLocalDay(() => (a += 1));
    const offB = subscribeLocalDay(() => (b += 1));
    check("A timer: two cards share one timer", timers.size === 1, timers.size);
    const [[id, t]] = [...timers];
    check("A timer: armed for at most an hour", t.ms >= 1000 && t.ms <= 3600000, t.ms);
    timers.delete(id); t.fn();
    check("A timer: fires every card and re-arms", a === 1 && b === 1 && timers.size === 1, { a, b, n: timers.size });
    offA(); offB();
    check("A timer: the last card leaving clears it", timers.size === 0, timers.size);
    const offC = subscribeLocalDay(() => {});
    const [[id2, t2]] = [...timers];
    offC();
    timers.delete(id2); t2.fn();
    check("A timer: no re-arm without cards", timers.size === 0, timers.size);
  } finally {
    globalThis.setTimeout = realSet;
    globalThis.clearTimeout = realClear;
  }
}

// The dimmed, still-focusable speaker style exists (aria-disabled, so no `button:disabled` rule overrides it).
{
  const { readFileSync } = await import("node:fs");
  const css = readFileSync(join(here, "..", "src", "panel_chat.css"), "utf8");
  check("B the unavailable speaker has its own style", /\.pc-chat-header-actions \.pc-chat-icon-btn\[aria-disabled="true"\]/.test(css));
}

console.error = quiet;
if (failures) {
  console.error(`check_message_footer: ${failures}/${checks} FAILED`);
  process.exit(1);
}
console.log(`check_message_footer: ${checks} checks green (stamp with date, permanent speaker, structured chips)`);
