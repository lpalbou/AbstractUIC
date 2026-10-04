#!/usr/bin/env node
/**
 * The shared Docs assistant (panel-chat 0.4.0, round 8 R8.3) over dist:
 * - the docs-qa transport against a FAKE gateway (corpus → upload → run start
 *   → live llm.delta frames → poll → answer), including the refusals;
 * - the rendered drawer/panel: user right / assistant left, markdown, code,
 *   JSON, links, images, copy, icon-only New conversation + close, compact
 *   header, attachments, one-line grounding footer.
 * Run after `npm run build`: node scripts/check_docs_assistant.mjs
 */
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

const here = dirname(fileURLToPath(import.meta.url));
const api = await import(join(here, "..", "dist", "index.js"));
const { DocsAssistantDrawer, DocsAssistantPanel, DOCS_QA_WORKFLOW, docsAnswerFromRun, docsCorpusPath, docsQaStartBody, docsReplayNote, makeDocsQaAsk, newDocsSessionId, sseFrames } = api;
let failures = 0;
let checks = 0;
const check = (name, cond, detail) => {
  checks += 1;
  if (!cond) {
    failures += 1;
    console.error(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`);
  }
};
for (const [name, fn] of Object.entries({ DocsAssistantDrawer, DocsAssistantPanel, docsAnswerFromRun, docsCorpusPath, docsQaStartBody, docsReplayNote, makeDocsQaAsk, newDocsSessionId, sseFrames }))
  check(`export ${name}`, typeof fn === "function");

// --- pure helpers ------------------------------------------------------------
check("corpus path names the app", docsCorpusPath("code") === "api/gateway/docs/corpus?app=code", docsCorpusPath("code"));
check("workflow = the shipped docs-qa", DOCS_QA_WORKFLOW.bundle_id === "docs-qa" && DOCS_QA_WORKFLOW.flow_id === "docsqa001" && DOCS_QA_WORKFLOW.registry_scope === "tenant_catalog" && !("bundle_version" in DOCS_QA_WORKFLOW));
check("session id per app", /^flow-docs-assistant:[0-9a-f-]{36}$/.test(newDocsSessionId("flow")), newDocsSessionId("flow"));
const plain = docsQaStartBody({ question: "Q?", docs: "# Doc", appName: "AbstractFlow", sessionId: "s1" });
check("start body: docs-qa inputs + session history", plain.bundle_id === "docs-qa" && plain.session_id === "s1" && plain.input_data.prompt === "Q?" && plain.input_data.docs === "# Doc" && plain.input_data.app === "AbstractFlow" && plain.input_data.use_session_history === true, JSON.stringify(plain));
check("start body: no context without attachments, no forced streaming", !("context" in plain.input_data) && !("_runtime" in plain.input_data));
const withFiles = docsQaStartBody({ question: "Q", docs: "D", appName: "A", sessionId: "s", attachments: [{ $artifact: "art1", filename: "a.png" }] });
check("start body: attachments ride context.attachments", withFiles.input_data.context?.attachments?.[0]?.$artifact === "art1", JSON.stringify(withFiles.input_data));
check("answer = output.response", docsAnswerFromRun({ output: { response: " Hi " } }) === "Hi" && docsAnswerFromRun({ output: {} }) === "" && docsAnswerFromRun(null) === "");
check("replay note only when messages were dropped", docsReplayNote({ dropped_messages: 0 }) === "" && docsReplayNote({ dropped_messages: 4, replayed_messages: 1 }).includes("Earlier messages not replayed: 4") && docsReplayNote({ dropped_messages: 4, replayed_messages: 1 }).includes("newest 1 message."));

// --- SSE parsing ---------------------------------------------------------------
const enc = new TextEncoder();
function streamOf(chunks) {
  return new ReadableStream({
    start(c) {
      for (const ch of chunks) c.enqueue(enc.encode(ch));
      c.close();
    },
  });
}
{
  const frames = [];
  for await (const f of sseFrames(streamOf(["event: llm.delta\ndata: {\"a\":", "1}\n\n: ping\n\nid: 3\ndata: {\"step\":1}\n\n"]))) frames.push(f);
  check("sse: frames split across chunks, comments skipped", frames.length === 2 && frames[0].event === "llm.delta" && frames[0].data === '{"a":1}' && frames[1].event === "message", JSON.stringify(frames));
}

// --- the transport against a fake gateway -----------------------------------
const CORPUS = "# AbstractFlow\n\n## Run a flow\nPress Run.";
function delta(seq, text, extra = {}) {
  return `event: llm.delta\ndata: ${JSON.stringify({ kind: "llm.delta", run_id: "run-1", call_id: "c1", seq, text, channel: "content", snapshot: false, ...extra })}\n\n`;
}
function fakeGateway({ corpusStatus = 200, statuses = ["running", "completed"], answer = "Press **Run**.", deltas = [delta(0, "Press "), delta(1, "**Run**.")], runError = null } = {}) {
  const calls = [];
  let polls = 0;
  const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
  const fetchGateway = async (path, init = {}) => {
    calls.push({ path, method: init.method || "GET", body: init.body });
    if (path.startsWith("api/gateway/docs/corpus")) return corpusStatus === 200 ? json(200, { app: "AbstractFlow", text: CORPUS }) : json(corpusStatus, { detail: "AbstractFlow is not running on this gateway" });
    if (path === "api/gateway/attachments/upload") return json(200, { attachment: { $artifact: `art-${calls.length}`, filename: init.body.get("filename") } });
    if (path === "api/gateway/runs/start") return json(200, { run_id: "run-1" });
    if (path === "api/gateway/runs/run-1/ledger/stream?after=0") return new Response(streamOf(deltas), { status: 200, headers: { "Content-Type": "text/event-stream" } });
    if (path === "api/gateway/runs/run-1") {
      const status = statuses[Math.min(polls, statuses.length - 1)];
      polls += 1;
      return json(200, { run_id: "run-1", status, output: status === "completed" ? { response: answer } : null, error: runError, session_history: { dropped_messages: 0 } });
    }
    return json(404, { detail: `unexpected ${path}` });
  };
  return { calls, fetchGateway };
}
const source = { app: "flow", name: "AbstractFlow" };
{
  const gw = fakeGateway();
  const ask = makeDocsQaAsk({ fetchGateway: gw.fetchGateway, source, pollMs: 5 });
  const live = [];
  const file = new File([new Uint8Array([137, 80, 78, 71])], "shot.png", { type: "image/png" });
  const answer = await ask("How do I run a flow?", { signal: new AbortController().signal, sessionId: "flow-docs-assistant:s1", files: [file], onText: (t) => live.push(t) });
  check("answer from the completed run", answer === "Press **Run**.", answer);
  check("live text grows from the llm.delta frames", live.length >= 2 && live[0] === "Press " && live[live.length - 1] === "Press **Run**.", JSON.stringify(live));
  const paths = gw.calls.map((c) => c.path);
  check("order: corpus → upload → start", paths.indexOf("api/gateway/docs/corpus?app=flow") === 0 && paths.indexOf("api/gateway/attachments/upload") === 1 && paths.indexOf("api/gateway/runs/start") === 2, JSON.stringify(paths));
  const upload = gw.calls.find((c) => c.path === "api/gateway/attachments/upload");
  check("upload carries the conversation session", upload.method === "POST" && upload.body.get("session_id") === "flow-docs-assistant:s1" && upload.body.get("filename") === "shot.png" && upload.body.get("content_type") === "image/png");
  const start = JSON.parse(gw.calls.find((c) => c.path === "api/gateway/runs/start").body);
  check("start: docs = the corpus the gateway served", start.input_data.docs === CORPUS && start.input_data.app === "AbstractFlow" && start.input_data.prompt === "How do I run a flow?" && start.session_id === "flow-docs-assistant:s1", JSON.stringify(start).slice(0, 300));
  check("start: the uploaded attachment rides context.attachments", start.input_data.context?.attachments?.[0]?.$artifact === "art-2", JSON.stringify(start.input_data.context));
  // The corpus is read once per assistant (cached on success).
  await ask("Again?", { signal: new AbortController().signal, sessionId: "flow-docs-assistant:s1" });
  check("corpus cached after the first success", gw.calls.filter((c) => c.path.startsWith("api/gateway/docs/corpus")).length === 1);
}
{
  const gw = fakeGateway({ corpusStatus: 404 });
  const ask = makeDocsQaAsk({ fetchGateway: gw.fetchGateway, source, pollMs: 5 });
  let err = null;
  try {
    await ask("Q", { signal: new AbortController().signal, sessionId: "s" });
  } catch (e) {
    err = e;
  }
  check("no corpus → an honest error, nothing asked", err && /AbstractFlow documentation could not be read, so nothing was asked \(HTTP 404\): AbstractFlow is not running/.test(err.message) && !gw.calls.some((c) => c.path === "api/gateway/runs/start"), err && err.message);
}
{
  const gw = fakeGateway({ statuses: ["failed"], runError: { message: "No model is configured" } });
  const ask = makeDocsQaAsk({ fetchGateway: gw.fetchGateway, source, pollMs: 5 });
  let err = null;
  try {
    await ask("Q", { signal: new AbortController().signal, sessionId: "s" });
  } catch (e) {
    err = e;
  }
  check("failed run → its reason", err && err.message === "The docs-qa run failed: No model is configured.", err && err.message);
}
{
  const gw = fakeGateway({ statuses: ["running"] });
  const ask = makeDocsQaAsk({ fetchGateway: gw.fetchGateway, source, pollMs: 5 });
  const ctrl = new AbortController();
  const p = ask("Q", { signal: ctrl.signal, sessionId: "s" });
  setTimeout(() => ctrl.abort(), 20);
  let err = null;
  try {
    await p;
  } catch (e) {
    err = e;
  }
  check("stop aborts the poll", err && err.name === "AbortError", err && String(err));
}

// --- rendering -----------------------------------------------------------------
const noop = () => {};
const messages = [
  { id: "u1", role: "user", content: "How do I run a flow?", attachments: [{ id: "f1", label: "shot.png", disabled: true }], media: [{ kind: "image", src: "blob:http://x/1", label: "shot.png" }] },
  {
    id: "a1",
    role: "assistant",
    title: "AbstractFlow",
    content: "Press **Run**. See [the guide](https://example.org/guide).\n\n```bash\nabstractflow run demo\n```\n\n```json\n{\"ok\": true}\n```",
  },
];
const panel = renderToStaticMarkup(React.createElement(DocsAssistantPanel, { source, messages, draft: "", onDraftChange: noop, onSend: noop, onAddFiles: noop, files: [{ id: "p1", name: "notes.txt" }], onRemoveFile: noop }));
check("user message on the right (user card)", panel.includes("pc-chat-item--user"));
check("assistant message on the left", panel.includes("pc-chat-item--assistant"));
check("markdown rendered (bold)", panel.includes("<strong>Run</strong>"), panel.slice(0, 400));
check("link rendered", /<a [^>]*href="https:\/\/example.org\/guide"/.test(panel));
check("code block rendered", panel.includes("abstractflow run demo") && /<pre/.test(panel));
check("JSON rendered", panel.includes("ok") && /pc-json|json/i.test(panel));
check("user image attachment rendered", panel.includes('src="blob:http://x/1"'));
check("attachment chip on the question", panel.includes("shot.png") && panel.includes("pc-chat-attachment-chip"));
check("copy on every message", (panel.match(/aria-label="Copy message"/g) || []).length === 2);
check("attach control + pending file chip", panel.includes('aria-label="Attach files"') && panel.includes("notes.txt") && panel.includes('aria-label="Remove notes.txt"'));
check("one-line grounding footer", panel.includes("pc-docs-assistant__footer") && panel.includes("Grounded on AbstractFlow’s documentation (llms.txt) · docs-qa"));
const blocked = renderToStaticMarkup(React.createElement(DocsAssistantPanel, { source, messages: [], draft: "", onDraftChange: noop, onSend: noop, blockedNotice: "Connect to the gateway to use the docs assistant.", suggestions: ["How do I run a flow?"] }));
check("blocked: notice + disabled composer", blocked.includes("Connect to the gateway to use the docs assistant.") && /<textarea[^>]*disabled/.test(blocked));
check("empty state names the app + suggestions", blocked.includes("Ask anything about AbstractFlow.") && blocked.includes("pc-docs-assistant__suggestion"));
const drawer = renderToStaticMarkup(React.createElement(DocsAssistantDrawer, { open: true, onClose: noop, source, fetchGateway: async () => new Response("{}"), connected: true }));
check("drawer: compact header titled Docs assistant", drawer.includes("af-drawer__header") && drawer.includes("Docs assistant") && drawer.includes("pc-docs-assistant-drawer"));
const newBtn = drawer.match(/<button[^>]*aria-label="New conversation"[^>]*>([\s\S]*?)<\/button>/);
check("drawer: New conversation is an ICON button (no text label)", newBtn && /<svg/.test(newBtn[1]) && !/New conversation/.test(newBtn[1].replace(/<[^>]+>/g, "")), newBtn && newBtn[0]);
check("drawer: close icon", drawer.includes('aria-label="Close panel"'));
check("drawer: no legacy 'New conversation' text button", !/>New conversation</.test(drawer));
const closed = renderToStaticMarkup(React.createElement(DocsAssistantDrawer, { open: false, onClose: noop, source, fetchGateway: async () => new Response("{}"), connected: true }));
check("drawer: keep-alive (closed = hidden, still rendered)", closed.includes("display:none") && closed.includes("pc-docs-assistant"));

if (failures) {
  console.error(`check_docs_assistant: ${failures}/${checks} FAILED`);
  process.exit(1);
}
console.log(`check_docs_assistant: OK (${checks} checks)`);
