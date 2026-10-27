#!/usr/bin/env node
/**
 * One chat surface (backlog 0030, ADR 0001): the WorkflowChat additions that
 * let every app drop its local twin. Run after `npm run build`.
 *
 *  A. steer: while busy the send button becomes "Steer" (or "Queue"), posts
 *     through the host's onSteer, and says "Queued (seq N)" only for an
 *     accepted steer (accepted:false is a refusal, the draft stays);
 *  B. typed attachment chips + their states; Send refuses while a chip is
 *     not attached; useAttachmentUploads (refusal, failure, retry, remove,
 *     bounded concurrency);
 *  C. toolbar actions present only when injected; Copy/Export carry the
 *     transcript as Markdown;
 *  D. per-message renderFooter / variant("hint") slots;
 *  E. Stop aborts the in-flight send's AbortSignal and hands it to onCancel.
 *
 * No DOM: static markup over dist plus the hook harness (scripts/hook_harness.mjs).
 */
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { mount, find, byData, textOf } from "./hook_harness.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const pc = await import(join(here, "..", "dist", "index.js"));
const { WorkflowChat, ChatComposer, ChatMessageCard, ComposerAttachmentChips, useAttachmentUploads, unattachedSendBlock } = pc;
let failures = 0;
let checks = 0;
const check = (name, cond, detail) => {
  checks += 1;
  if (!cond) {
    failures += 1;
    console.error(`  FAIL ${name}${detail !== undefined ? ` — ${typeof detail === "string" ? detail : JSON.stringify(detail)}` : ""}`);
  }
};
const noop = () => {};
const base = { messages: [], draft: "", onDraftChange: noop, onSend: noop };
const composerOf = (tree) => find(tree, (n) => n.type === ChatComposer);
const html = (props) => renderToStaticMarkup(React.createElement(WorkflowChat, { ...base, ...props }));

// ---------------------------------------------------------------- A. steer
{
  const steers = [];
  const drafts = [];
  let sends = 0;
  let answer = { accepted: true, duplicate: false, seq: 7 };
  const props = {
    ...base,
    draft: "go right",
    busy: true,
    onDraftChange: (d) => drafts.push(d),
    onSend: () => void (sends += 1),
    steer: { onSteer: async (text, mode) => (steers.push([text, mode]), answer), modes: ["guide", "queue"] },
  };
  const h = mount(WorkflowChat, props);
  let composer = composerOf(h.tree);
  check("A busy + steer: the send button reads Steer", composer?.props.sendLabel === "Steer", composer?.props.sendLabel);
  check("A busy + steer: the composer stays usable", composer?.props.busy === false);
  check("A two modes: a mode switch while busy", Boolean(byData(h.tree, "data-steer-mode", "queue")) && Boolean(byData(h.tree, "data-steer-mode", "guide")));
  composer.props.onSubmit();
  await h.settle();
  check("A Steer posts through the host, not onSend", JSON.stringify(steers) === JSON.stringify([["go right", "guide"]]) && sends === 0, steers);
  const status = () => textOf(find(h.tree, (n) => n.props?.className === "pc-workflow-chat__steer-status"));
  check("A accepted steer says Queued (seq N) and when it delivers", status() === "Queued (seq 7). Delivers at the run's next loop boundary.", status());
  check("A accepted steer clears the draft", drafts.at(-1) === "");
  byData(h.tree, "data-steer-mode", "queue").props.onClick();
  h.render();
  composer = composerOf(h.tree);
  check("A queue mode: the button reads Queue", composer.props.sendLabel === "Queue", composer.props.sendLabel);
  answer = { accepted: true };
  composer.props.onSubmit();
  await h.settle();
  check("A queue mode posts with mode=queue", JSON.stringify(steers.at(-1)) === JSON.stringify(["go right", "queue"]));
  check("A queued for the next turn", status() === "Queued for the next turn.", status());
  // Refusal: accepted:false is never "Queued".
  answer = { accepted: false, duplicate: false, seq: 0 };
  drafts.length = 0;
  composerOf(h.tree).props.onSubmit();
  await h.settle();
  const alert = textOf(find(h.tree, (n) => n.props?.role === "alert"));
  check("A accepted:false is a refusal, not a queue", /did not accept/.test(alert) && !/Queued/.test(status()), `${alert} | ${status()}`);
  check("A a refused steer keeps the draft", drafts.length === 0);
  // Parked run: delivery at next wake.
  const p = mount(WorkflowChat, { ...props, steer: { ...props.steer, modes: undefined, parked: true, onSteer: async () => ({ accepted: true, seq: 3 }) } });
  check("A one mode: no mode switch", !byData(p.tree, "data-steer-mode", "guide"));
  composerOf(p.tree).props.onSubmit();
  await p.settle();
  check("A parked run: guidance delivers at its next wake", /Queued \(seq 3\)\. The run is waiting: your guidance delivers at its next wake/.test(textOf(find(p.tree, (n) => n.props?.className === "pc-workflow-chat__steer-status"))));
  // Not busy: plain Send; no steer: busy locks the composer.
  check("A not busy: plain Send", composerOf(mount(WorkflowChat, { ...props, busy: false }).tree).props.sendLabel === undefined);
  const locked = composerOf(mount(WorkflowChat, { ...props, steer: undefined }).tree);
  check("A no steer: busy locks the composer as before", locked.props.busy === true && locked.props.sendLabel === undefined);
  check("A no steer: no steer status line", !html({ busy: true }).includes("pc-workflow-chat__steer-status"));
}

// ---------------------------------------------------------------- B. typed attachments
{
  const items = [
    { id: "1", name: "notes.md", size: 2048, state: "attached" },
    { id: "2", name: "big.mov", size: 90 * 1024 * 1024, state: "refused", error: "big.mov is 90 MiB; the gateway accepts files up to 25 MiB." },
    { id: "3", name: "photo.png", size: 5000, state: "uploading", thumbnailUrl: "blob:http://x/thumb" },
    { id: "4", name: "data.csv", state: "failed", error: "Upload failed: quota" },
    { id: "5", name: "evil.png", state: "attached", thumbnailUrl: "javascript:alert(1)" },
  ];
  const chips = renderToStaticMarkup(React.createElement(ComposerAttachmentChips, { items, onRemove: noop, onRetry: noop }));
  for (const state of ["attached", "refused", "uploading", "failed"]) check(`B chip state ${state}`, chips.includes(`data-state="${state}"`));
  check("B attached chip shows its size", chips.includes("2.0 KiB"));
  check("B refused chip says why, with both numbers", chips.includes("the gateway accepts files up to 25 MiB"));
  check("B uploading chip says Uploading", chips.includes("Uploading · 4.9 KiB") && chips.includes('aria-busy="true"'));
  check("B thumbnail from the host src", chips.includes('src="blob:http://x/thumb"'));
  check("B unsafe thumbnail refused", !chips.includes("javascript:"));
  check("B Retry only on the failed chip", (chips.match(/data-action="retry"/g) || []).length === 1 && chips.includes('aria-label="Retry data.csv"'));
  check("B Remove on every chip", (chips.match(/data-action="remove"/g) || []).length === items.length);
  const bare = renderToStaticMarkup(React.createElement(ComposerAttachmentChips, { items }));
  check("B no Retry/Remove unless the host offers them", !bare.includes("data-action="));
  check("B WorkflowChat renders typed chips in the composer", html({ attachmentItems: items }).includes("pc-attachment-chips"));
  check("B the ReactNode slot still renders", html({ attachments: React.createElement("span", { id: "legacy-chip" }) }).includes('id="legacy-chip"'));
  check("B no chips, no chip list", !html({}).includes("pc-attachment-chips"));
  // Send refuses while a visible chip is not attached.
  let sent = 0;
  const h = mount(WorkflowChat, { ...base, draft: "hi", onSend: () => void (sent += 1), attachmentItems: [items[0], items[2]] });
  composerOf(h.tree).props.onSubmit();
  await h.settle();
  check("B send blocked while a file uploads", sent === 0 && /Wait for 1 file to finish uploading/.test(textOf(find(h.tree, (n) => n.props?.role === "alert"))));
  h.rerender({ attachmentItems: [items[0]] });
  composerOf(h.tree).props.onSubmit();
  await h.settle();
  check("B send proceeds once every chip is attached", sent === 1);
  check("B a refused chip blocks with Remove", unattachedSendBlock([items[1]]) === '"big.mov" was not attached. Remove it before sending.');

  // useAttachmentUploads: the lifted AbstractCode queue.
  let inFlight = 0;
  let peak = 0;
  const gates = [];
  const upload = (file) =>
    new Promise((resolve, reject) => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      gates.push({ file, ok: () => (inFlight -= 1, resolve({ $artifact: `a-${file.name}` })), fail: (m) => (inFlight -= 1, reject(new Error(m))) });
    });
  const u = mount((p) => useAttachmentUploads(p), { upload, maxBytes: 1000, concurrency: 2 });
  const f = (name, size) => new File([new Uint8Array(size)], name);
  u.tree.add([f("a.txt", 10), f("b.txt", 10), f("c.txt", 10), f("huge.bin", 5000)]);
  await u.settle();
  const st = () => Object.fromEntries(u.tree.items.map((i) => [i.name, i.state]));
  check("B hook: over-limit file refused before any request", st()["huge.bin"] === "refused" && /huge\.bin is 4\.9 KiB; the gateway accepts files up to 1000 B\./.test(u.tree.items.find((i) => i.name === "huge.bin").error), u.tree.items.find((i) => i.name === "huge.bin")?.error);
  check("B hook: bounded concurrency (2 in flight, 1 waiting)", peak === 2 && st()["c.txt"] === "queued", st());
  gates[0].ok();
  await u.settle();
  gates[1].fail("attachments_upload failed: quota exceeded");
  await u.settle();
  gates[2].ok();
  await u.settle();
  check("B hook: states after the batch", JSON.stringify(st()) === JSON.stringify({ "a.txt": "attached", "b.txt": "failed", "c.txt": "attached", "huge.bin": "refused" }), st());
  check("B hook: the gateway's words on a failure", u.tree.items.find((i) => i.name === "b.txt").error === "Upload failed: quota exceeded");
  check("B hook: attached refs in order", JSON.stringify(u.tree.attached) === JSON.stringify([{ $artifact: "a-a.txt" }, { $artifact: "a-c.txt" }]));
  check("B hook: sendBlock names what to fix", /2 files were not attached\. Retry or remove them before sending\./.test(u.tree.sendBlock || ""), u.tree.sendBlock);
  check("B hook: announcement", u.tree.announcement === "2 files attached, 1 file could not be attached", u.tree.announcement);
  u.tree.retry(u.tree.items.find((i) => i.name === "b.txt").id);
  await u.settle();
  check("B hook: retry re-uploads", st()["b.txt"] === "uploading" && gates.length === 4);
  u.tree.remove(u.tree.items.find((i) => i.name === "b.txt").id);
  await u.settle();
  gates[3].ok();
  await u.settle();
  check("B hook: a removed chip's late upload is dropped", !u.tree.items.some((i) => i.name === "b.txt") && u.tree.attached.length === 2);
  check("B hook: a removed chip's late upload is never announced as attached", u.tree.announcement === "2 files attached, 1 file could not be attached", u.tree.announcement);
  u.tree.clear();
  await u.settle();
  check("B hook: clear empties the queue", u.tree.items.length === 0 && u.tree.sendBlock === null);
}

// ---------------------------------------------------------------- C. toolbar
{
  check("C no toolbar unless injected", !html({}).includes("pc-workflow-chat__toolbar"));
  const onlyClear = html({ toolbar: { onClear: noop } });
  check("C only the injected action", onlyClear.includes('data-toolbar="clear"') && !/data-toolbar="(new|copy|export)"/.test(onlyClear));
  const none = html({ toolbar: { exportTranscript: false, copyTranscript: false } });
  check("C export:false / copy:false render nothing", !/data-toolbar=/.test(none));
  const messages = [
    { id: "u", role: "user", content: "What is 2+2?" },
    { id: "t", role: "tool", content: "", toolActivity: { id: "t1", name: "calc", status: "completed" } },
    { id: "a", role: "assistant", content: "4" },
  ];
  const full = html({ messages, header: React.createElement("b", null, "Title"), toolbar: { onNewSession: noop, onClear: noop, exportTranscript: { filename: "chat.md" }, copyTranscript: true } });
  check("C all four actions with the header", ["new", "clear", "copy", "export"].every((k) => full.includes(`data-toolbar="${k}"`)) && full.includes("<b>Title</b>"));
  let copied = "";
  Object.defineProperty(globalThis.navigator, "clipboard", { configurable: true, value: { writeText: async (t) => void (copied = t) } });
  let cleared = 0;
  const h = mount(WorkflowChat, { ...base, messages, toolbar: { onClear: () => void (cleared += 1), copyTranscript: true, exportTranscript: { filename: "chat.md", heading: "Chat" } } });
  byData(h.tree, "data-toolbar", "clear").props.onClick();
  await h.settle();
  check("C Clear calls the host", cleared === 1);
  // window stub only for the copy-state reset timer and the download path.
  const downloads = [];
  globalThis.window = { setTimeout: () => 0 };
  globalThis.document = { createElement: () => ({ click() { downloads.push(this.download); }, remove() {} }), body: { appendChild: noop } };
  byData(h.tree, "data-toolbar", "copy").props.onClick();
  await h.settle();
  check("C Copy puts the transcript as Markdown", copied.startsWith("# Chat") && copied.includes("What is 2+2?") && copied.includes("## assistant") && !copied.includes("## tool"), copied);
  check("C Copy confirms", textOf(byData(h.tree, "data-toolbar", "copy")) === "Copied");
  byData(h.tree, "data-toolbar", "export").props.onClick();
  check("C Export downloads the named file", JSON.stringify(downloads) === JSON.stringify(["chat.md"]), downloads);
  delete globalThis.window;
  delete globalThis.document;
}

// ---------------------------------------------------------------- D. per-message slots
{
  const msg = { id: "m", role: "assistant", content: "Hello" };
  const footer = (m) => React.createElement("button", { className: "turn-badge" }, `system · ${m.id}`);
  const card = renderToStaticMarkup(React.createElement(ChatMessageCard, { message: msg, renderFooter: footer }));
  check("D renderFooter renders under the card", card.includes('<div class="pc-chat-footer"><button class="turn-badge">system · m</button></div>'), card.slice(-200));
  check("D no renderFooter, no footer", !renderToStaticMarkup(React.createElement(ChatMessageCard, { message: msg })).includes("pc-chat-footer"));
  const hint = renderToStaticMarkup(React.createElement(ChatMessageCard, { message: { id: "s", role: "system", content: "Rejoined the open visit", level: "warn" }, variant: (m) => (m.role === "system" ? "hint" : undefined) }));
  check("D variant hint: one discreet line", hint.includes('class="pc-chat-hint pc-chat-hint--warn"') && hint.includes("Rejoined the open visit") && !hint.includes("pc-chat-header") && !hint.includes("Copy message"), hint);
  const chat = html({
    messages: [msg, { id: "s", role: "system", content: "note" }],
    messageProps: { renderFooter: footer, variant: (m) => (m.role === "system" ? "hint" : undefined) },
  });
  check("D WorkflowChat passes the slots to every message", chat.includes("turn-badge") && chat.includes('data-variant="hint"') && chat.includes("pc-chat-header"));
}

// ---------------------------------------------------------------- E. onCancel(signal)
{
  let sendSignal = null;
  let cancelSignal = null;
  const h = mount(WorkflowChat, {
    ...base,
    draft: "long question",
    onSend: (_draft, ctx) =>
      new Promise((_, reject) => {
        sendSignal = ctx?.signal;
        ctx?.signal?.addEventListener("abort", () => reject(new Error("aborted")));
      }),
    onCancel: (signal) => void (cancelSignal = signal),
  });
  composerOf(h.tree).props.onSubmit();
  await h.settle();
  check("E onSend receives an AbortSignal", sendSignal instanceof AbortSignal && !sendSignal.aborted);
  const stop = find(h.tree, (n) => n.props?.className === "pc-workflow-chat__stop");
  check("E Stop shows during a request/response send", Boolean(stop));
  stop.props.onClick();
  await h.settle();
  check("E Stop aborts the send's signal", sendSignal?.aborted === true);
  check("E onCancel receives that same AbortSignal", cancelSignal === sendSignal);
  check("E an aborted send is not reported as a failure", !find(h.tree, (n) => n.props?.role === "alert"));
  let ledgerSignal = null;
  const l = mount(WorkflowChat, { ...base, busy: true, onCancel: (signal) => void (ledgerSignal = signal) });
  find(l.tree, (n) => n.props?.className === "pc-workflow-chat__stop").props.onClick();
  await l.settle();
  check("E no send in flight: onCancel still gets an aborted AbortSignal", ledgerSignal instanceof AbortSignal && ledgerSignal.aborted);
}

if (failures) {
  console.error(`check_chat_surface: ${failures} of ${checks} failed`);
  process.exit(1);
}
console.log(`check_chat_surface: OK (${checks} checks: steer/queue + honest queued text, typed chips + upload queue, toolbar only when injected, renderFooter/hint slots, onCancel(signal))`);
