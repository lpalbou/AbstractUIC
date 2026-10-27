#!/usr/bin/env node
/**
 * Session tool policy (contract v1, 2026-10-27; gateway branch feat/session-tool-policy):
 * "Allow for this chat" / "Allow all <toolset> tools for this chat" WRITE the conversation's
 * policy on the gateway, then answer the shown wait, so the gate never flashes again.
 *
 *  A. order: the policy write resolves BEFORE the resume is sent (a resume first is red);
 *  B. kinds / deny selectors and their answers;
 *  C. supported=false or no client → local fallback (the client-side grant) + labeled line;
 *  D. `clamped` is surfaced (snapshot, callback, "Not covered: …"), never dropped;
 *  E. presentInteraction offers a kind button only for toolsets present (call.toolset or the
 *     host's toolsetOf from GET discovery/tools), never guessed;
 *  F. `abstract.tool_policy_decision` folds to an ACTIVITY line + tool-row provenance, never an
 *     interaction;
 *  G. locality is decided by the URL parser: "\u0000blob:…" is local (download, no new tab).
 * Run after `npm run build`.
 */
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { mount, byData, textOf } from "./hook_harness.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const pc = await import(join(here, "..", "dist", "index.js"));
const { formatExactTime } = await import("@abstractframework/ui-kit");
const { WorkflowSessionController, presentInteraction, WorkflowInteractionPanel, ChatMessageCard, ToolActivity, WORKFLOW_INTERACTION_LABELS: L, isLocalObjectUrl, sessionPolicyClampedText } = pc;
let failures = 0;
let checks = 0;
const check = (name, cond, detail) => {
  checks += 1;
  if (!cond) {
    failures += 1;
    console.error(`  FAIL ${name}${detail !== undefined ? ` — ${typeof detail === "string" ? detail : JSON.stringify(detail)}` : ""}`);
  }
};
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
const approvalRecord = (waitKey, calls) => ({
  step_id: `step:${waitKey}`, status: "waiting",
  effect: { type: "tool_calls", payload: { tool_calls: calls.map((call, index) => ({ runtime_call_id: `${waitKey}:${index}`, arguments: {}, ...call })) } },
  result: { wait: { reason: "user", wait_key: waitKey, details: { mode: "approval_required", kind: "tool_approval", tool_calls: calls } } },
});
const policyOf = (extra = {}) => ({ version: 1, session_id: "s-1", revision: 5, approve: { fetch_url: "kind:web" }, deny: {}, ask: [], set_by: { user_id: "admin", client: "panel-chat" }, set_at: "2026-10-27T10:00:00+00:00", ...extra });

const controllers = [];
async function harness({ client, onSessionPolicy } = {}) {
  const commands = [], streams = new Map(), cursors = new Map();
  const transport = {
    getRun: async (id) => ({ run_id: id, status: "waiting" }),
    getHistory: async () => ({ ledgers: {} }),
    getLedger: async (_id, after) => ({ items: [], next_after: after }),
    streamLedger: async (id, after, onStep, signal, onOpen) => {
      const pending = deferred();
      streams.set(id, { onStep });
      cursors.set(id, after);
      onOpen?.();
      signal.addEventListener("abort", pending.resolve, { once: true });
      await pending.promise;
    },
    submitCommand: async (command) => { commands.push(command); return { accepted: true, duplicate: false, seq: commands.length }; },
  };
  const controller = new WorkflowSessionController(transport, { clientId: "session-policy-check", ...(client !== undefined ? { sessionToolPolicy: client } : {}), ...(onSessionPolicy ? { onSessionPolicy } : {}) });
  controllers.push(controller);
  await controller.load("root");
  await flush();
  return {
    controller, commands,
    emit(record) {
      const cursor = (cursors.get("root") || 0) + 1;
      cursors.set("root", cursor);
      streams.get("root").onStep({ cursor, record: { run_id: "root", ...record } });
    },
  };
}
const fakeClient = (merge) => {
  const calls = [];
  return {
    calls,
    client: {
      supported: true, sessionId: "s-1",
      get: async () => { calls.push(["get"]); return policyOf(); },
      replace: async (body) => { calls.push(["replace", body]); return policyOf(); },
      merge: async (body) => { calls.push(["merge", body]); return merge ? merge(body) : policyOf(); },
      reset: async () => { calls.push(["reset"]); return { revision: 6 }; },
    },
  };
};
const target = { runId: "root", waitKey: "approve:1", stepId: "step:approve:1" };

// ------------------------------------------------------------- A. write FIRST, then answer
{
  const gate = deferred();
  const f = fakeClient(() => gate.promise);
  const h = await harness({ client: f.client });
  check("A gateway mode with a supported client", h.controller.getSnapshot().sessionPolicyMode === "gateway", h.controller.getSnapshot().sessionPolicyMode);
  h.emit(approvalRecord("approve:1", [{ name: "fetch_url", call_id: "c1" }]));
  const pending = h.controller.approveAllForSession(target);
  await flush(); await flush();
  check("A the policy write is sent", JSON.stringify(f.calls) === JSON.stringify([["merge", { approve: { all: true }, client: "panel-chat" }]]), f.calls);
  check("A no resume before the policy write resolves", h.commands.length === 0, h.commands);
  gate.resolve(policyOf({ approve: { fetch_url: "all" } }));
  await pending;
  check("A then the shown wait is answered {approved:true}", h.commands.length === 1 && h.commands[0].type === "resume" && h.commands[0].payload.payload.approved === true && h.commands[0].payload.wait_key === "approve:1", h.commands);
  check("A the stored policy reaches the snapshot", h.controller.getSnapshot().sessionPolicy?.revision === 5);
  // A failed write answers nothing.
  const bad = fakeClient(async () => { throw new Error("revision_conflict"); });
  const hb = await harness({ client: bad.client });
  hb.emit(approvalRecord("approve:1", [{ name: "fetch_url", call_id: "c1" }]));
  let rejected = false;
  await hb.controller.approveAllForSession(target).catch(() => (rejected = true));
  check("A a failed policy write rejects and sends no resume", rejected && hb.commands.length === 0, hb.commands);
  // A stale target writes nothing.
  const stale = fakeClient();
  const hs = await harness({ client: stale.client });
  hs.emit(approvalRecord("approve:2", [{ name: "fetch_url", call_id: "c1" }]));
  let staleRejected = false;
  await hs.controller.approveAllForSession(target).catch(() => (staleRejected = true));
  check("A a changed request writes no policy", staleRejected && stale.calls.length === 0 && hs.commands.length === 0);
  // maxRiskRank is passed through as the contract's max_risk_rank.
  const ranked = fakeClient();
  const hr = await harness({ client: ranked.client });
  hr.emit(approvalRecord("approve:1", [{ name: "fetch_url", call_id: "c1" }]));
  await hr.controller.approveAllForSession(target, { maxRiskRank: 2 });
  check("A max_risk_rank", ranked.calls[0][1].approve.max_risk_rank === 2);
}

// ------------------------------------------------------------- B. kinds and denials
{
  const f = fakeClient();
  const h = await harness({ client: f.client });
  h.emit(approvalRecord("approve:1", [{ name: "fetch_url", call_id: "c1" }]));
  await h.controller.approveKindForSession(target, "web");
  check("B kind: merge {approve:{kinds}} then approve", JSON.stringify(f.calls.at(-1)) === JSON.stringify(["merge", { approve: { kinds: ["web"] }, client: "panel-chat" }]) && h.commands.at(-1).payload.payload.approved === true);
  const d = fakeClient();
  const hd = await harness({ client: d.client });
  hd.emit(approvalRecord("approve:1", [{ name: "execute_command", call_id: "c1" }]));
  await hd.controller.denyToolForSession(target, "execute_command");
  check("B deny tool: merge {deny:{tools}} then {approved:false}", JSON.stringify(d.calls.at(-1)[1].deny) === JSON.stringify({ tools: ["execute_command"] }) && hd.commands.at(-1).payload.payload.approved === false);
  const k = fakeClient();
  const hk = await harness({ client: k.client });
  hk.emit(approvalRecord("approve:1", [{ name: "execute_command", call_id: "c1" }]));
  await hk.controller.denyKindForSession(target, "system");
  check("B deny kind: merge {deny:{kinds}} then {approved:false}", JSON.stringify(k.calls.at(-1)[1].deny) === JSON.stringify({ kinds: ["system"] }) && hk.commands.at(-1).payload.payload.approved === false);
  await hk.controller.resetSessionPolicy();
  check("B reset deletes the policy", k.calls.at(-1)[0] === "reset" && hk.controller.getSnapshot().sessionPolicy === null);
}

// ------------------------------------------------------------- C. local fallback, labeled
{
  for (const [label, client] of [["supported=false", { ...fakeClient().client, supported: false }], ["no client", undefined]]) {
    const h = await harness({ client });
    check(`C ${label}: local-fallback mode`, h.controller.getSnapshot().sessionPolicyMode === "local-fallback", h.controller.getSnapshot().sessionPolicyMode);
    h.emit(approvalRecord("approve:1", [{ name: "fetch_url", call_id: "c1" }]));
    await h.controller.approveAllForSession(target);
    check(`C ${label}: the client-side grant answers and auto-approves this run`, h.commands.at(-1)?.payload.payload.approved === true && h.controller.getSnapshot().autoApproveTools === true);
    let refused = false;
    h.emit(approvalRecord("approve:3", [{ name: "fetch_url", call_id: "c3" }]));
    await h.controller.approveKindForSession({ runId: "root", waitKey: "approve:3" }, "web").catch((e) => (refused = /cannot store/.test(e.message)));
    check(`C ${label}: a kind grant is refused loudly (no local equivalent)`, refused);
  }
  const unsupported = { ...fakeClient().client, supported: false };
  const h = await harness({ client: unsupported });
  h.emit(approvalRecord("approve:1", [{ name: "fetch_url", call_id: "c1" }]));
  const wait = h.controller.getSnapshot().interaction;
  const local = presentInteraction(wait, h.controller, { sessionPolicy: { toolsetOf: () => "web" } });
  check("C fallback: labeled line (run scope)", local.scopeNote === L.localRunPolicyNote && /gateway cannot store chat policies/.test(local.scopeNote), local.scopeNote);
  // Review F2: the button says what it does (the grant ends with the run).
  check("C fallback: the run-scoped button says so", local.approveForSessionLabel === "Allow for this run" && L.allowForRun === "Allow for this run", local.approveForSessionLabel);
  // Review F1: the mode comes from the controller, never from a host prop.
  const claimed = presentInteraction(wait, h.controller, { sessionPolicy: { mode: "gateway", toolsetOf: () => "web" } });
  check("C a host claiming gateway mode cannot override the controller", claimed.scopeNote === L.localRunPolicyNote && claimed.approveForSessionLabel === "Allow for this run" && !claimed.approveKinds?.length && !/on the gateway/.test(claimed.approveForSessionDescription || ""), claimed);
  check("C fallback: no kind buttons", !local.approveKinds?.length);
  const hostChat = presentInteraction(wait, h.controller, { onAllowForSession: async () => {}, sessionPolicy: {} });
  check("C fallback with the host's chat grant: labeled chat line", hostChat.scopeNote === L.localChatPolicyNote && typeof hostChat.onApproveForSession === "function");
  const html = renderToStaticMarkup(React.createElement(WorkflowInteractionPanel, { interaction: local }));
  check("C the panel renders the labeled line", html.includes('data-scope-note="">Allowed until this run ends, in this browser only — the gateway cannot store chat policies.<') && html.includes('data-decision="approve-session"') && html.includes(">Allow for this run<"), html.slice(-700));
  const legacy = presentInteraction(wait, h.controller, {});
  check("C without sessionPolicy nothing changes", legacy.scopeNote === undefined && legacy.approveKinds === undefined && legacy.onApproveForSession === undefined);
}

// ------------------------------------------------------------- D. clamped surfaced
{
  const seen = [];
  const clamped = [{ selector: "tools", name: "send_email", reason: "not_authorized" }, { selector: "kinds", name: "nope", reason: "unknown_kind" }];
  const f = fakeClient(async () => policyOf({ clamped }));
  const h = await harness({ client: f.client, onSessionPolicy: (policy, list) => seen.push(list) });
  h.emit(approvalRecord("approve:1", [{ name: "fetch_url", call_id: "c1" }]));
  const control = presentInteraction(h.controller.getSnapshot().interaction, h.controller, { sessionPolicy: {} });
  const result = await control.onApproveForSession();
  check("D clamped reaches the snapshot", JSON.stringify(h.controller.getSnapshot().sessionPolicyClamped) === JSON.stringify(clamped));
  check("D clamped reaches the host callback", JSON.stringify(seen.at(-1)) === JSON.stringify(clamped));
  check("D the decision reports what is not covered", result?.outcomeNote === "Not covered: send_email (not authorized); nope (unknown kind)", result);
  check("D clamped text", sessionPolicyClampedText([]) === "");
  h.emit(approvalRecord("approve:2", [{ name: "send_email", call_id: "c2" }]));
  const next = presentInteraction(h.controller.getSnapshot().interaction, h.controller, { sessionPolicy: {} });
  const html = renderToStaticMarkup(React.createElement(WorkflowInteractionPanel, { interaction: next }));
  check("D the next approval says what the policy does not cover", html.includes('data-not-covered="">Not covered: send_email (not authorized); nope (unknown kind)<'), html.slice(-500));
  // The panel shows the note after the decision.
  const p = mount(WorkflowInteractionPanel, { interaction: { id: "x", kind: "tool-approval", toolName: "t", onApprove: () => {}, onDeny: () => {}, onApproveForSession: async () => ({ outcomeNote: "Not covered: a (not authorized)" }) } });
  byData(p.tree, "data-decision", "approve-session").props.onClick();
  await p.settle();
  check("D the panel outcome carries the note", /Not covered: a \(not authorized\)/.test(textOf(p.tree)), textOf(p.tree));
}

// ------------------------------------------------------------- E. kinds offered only for toolsets present
{
  const f = fakeClient();
  const h = await harness({ client: f.client });
  h.emit(approvalRecord("approve:1", [{ name: "fetch_url", call_id: "c1" }, { name: "read_file", call_id: "c2" }, { name: "mystery", call_id: "c3" }, { name: "web_search", call_id: "c4", toolset: "search" }]));
  const toolsets = { fetch_url: "web", read_file: "files", web_search: "web" };
  const control = presentInteraction(h.controller.getSnapshot().interaction, h.controller, { sessionPolicy: { toolsetOf: (name) => toolsets[name] } });
  check("E one kind per toolset present; the call's own toolset wins; unknown never guessed", JSON.stringify(control.approveKinds.map((k) => k.kind)) === JSON.stringify(["web", "files", "search"]), control.approveKinds.map((k) => k.kind));
  check("E kind label", control.approveKinds[0].label === "Allow all web tools for this chat");
  check("E gateway mode: no local scope line", control.scopeNote === undefined);
  check("E Allow for this chat offered", control.approveForSessionLabel === "Allow for this chat" && /stores a policy for this chat on the gateway/.test(control.approveForSessionDescription));
  await control.approveKinds[1].onApprove();
  check("E the kind button writes that kind, then answers", f.calls.at(-1)[1].approve.kinds[0] === "files" && h.commands.at(-1).payload.payload.approved === true);
  const none = presentInteraction(h.controller.getSnapshot().interaction, h.controller, { sessionPolicy: {} });
  check("E no toolsetOf and no call toolset: only the call's own", JSON.stringify(none.approveKinds.map((k) => k.kind)) === JSON.stringify(["search"]));
  const html = renderToStaticMarkup(React.createElement(WorkflowInteractionPanel, { interaction: control }));
  check("E the panel renders a kind button per toolset", (html.match(/data-decision="approve-kind"/g) || []).length === 3 && html.includes('data-kind="web">Allow all web tools for this chat<'));
  const bare = renderToStaticMarkup(React.createElement(WorkflowInteractionPanel, { interaction: { id: "y", kind: "tool-approval", toolName: "t", onApprove: () => {}, onDeny: () => {} } }));
  check("E no kinds unless injected", !bare.includes("approve-kind"));
  let threw = false;
  try { presentInteraction(h.controller.getSnapshot().interaction, { approve: async () => {}, approveWithPolicyChange: async () => {}, resume: async () => {}, emitEvent: async () => {} }, { sessionPolicy: {} }); } catch { threw = true; }
  check("E a controller without the policy methods fails loudly", threw);
}

// ------------------------------------------------------------- F. the ledger record is an activity
{
  const h = await harness({ client: fakeClient().client });
  const decision = (decisionName, callId) => ({
    status: "completed", step_id: "agent",
    effect: { type: "emit_event", payload: { name: "abstract.tool_policy_decision", scope: "run", payload: {
      decision: decisionName, source: "session_policy", session_id: "s-1", node_id: "agent",
      tool_calls: [{ call_id: callId, name: "fetch_url", matched: "kind:web" }],
      policy: { revision: 5, set_by: { tenant_id: "default", user_id: "admin", client: "panel-chat" }, set_at: "2026-10-27T10:00:00+00:00" },
    } } },
    result: { emitted: true, tool_policy_decision: { decision: decisionName, count: 1 } },
  });
  // Record BEFORE the tool row (contract: written before the tools run).
  h.emit(decision("auto_approved", "c1"));
  h.emit({ status: "completed", step_id: "tools-1", effect: { type: "tool_calls", payload: { tool_calls: [{ name: "fetch_url", call_id: "c1", runtime_call_id: "r1", arguments: { url: "https://x" } }] } }, result: { results: [{ runtime_call_id: "r1", call_id: "c1", name: "fetch_url", success: true, output: "ok" }] } });
  // Record AFTER the tool row.
  h.emit({ status: "completed", step_id: "tools-2", effect: { type: "tool_calls", payload: { tool_calls: [{ name: "execute_command", call_id: "c2", runtime_call_id: "r2", arguments: {} }] } }, result: { results: [{ runtime_call_id: "r2", call_id: "c2", name: "execute_command", success: false, error: "Denied by this conversation's tool policy" }] } });
  h.emit(decision("denied", "c2"));
  const snap = h.controller.getSnapshot();
  const lines = snap.messages.filter((m) => m.kind === "tool_policy_decision").map((m) => m.content);
  const at = formatExactTime("2026-10-27T10:00:00+00:00");
  check("F an allowed decision is an activity line with provenance", lines[0] === `Allowed by this chat's policy (set by admin at ${at})`, lines);
  check("F a denied decision is an activity line", lines[1] === "Denied by this chat's policy", lines);
  check("F never an interaction", snap.interaction === null);
  const row = (callId) => snap.messages.find((m) => m.toolActivity?.callId === callId)?.toolActivity;
  check("F the covered call's row carries the provenance (record first)", row("c1")?.policy?.decision === "auto_approved" && row("c1")?.policy?.matched === "kind:web" && row("c1")?.policy?.setBy === "admin", row("c1"));
  check("F the refused call's row carries it too (record after)", row("c2")?.policy?.decision === "denied", row("c2"));
  const card = renderToStaticMarkup(React.createElement(ChatMessageCard, { message: snap.messages.find((m) => m.kind === "tool_policy_decision") }));
  check("F the card renders it as one discreet line, not a card", card.includes('class="pc-chat-hint"') && !card.includes("pc-chat-header"), card);
  const toolHtml = renderToStaticMarkup(React.createElement(ToolActivity, { tool: row("c1") }));
  check("F the tool row says why it ran", toolHtml.includes('data-policy="auto_approved"') && toolHtml.includes("matched kind:web"), toolHtml.slice(0, 600));
}

// ------------------------------------------------------------- G. locality by the URL parser
{
  check("G a leading C0 control before blob: is local", isLocalObjectUrl("\u0000blob:http://app/x") === true && isLocalObjectUrl("\u0001data:text/plain,hi") === true);
  check("G a gateway path is not local", isLocalObjectUrl("/api/gateway/runs/r/artifacts/a/content") === false && isLocalObjectUrl("") === false);
  const pdf = renderToStaticMarkup(React.createElement(ChatMessageCard, { message: { id: "m", role: "assistant", content: "", media: [{ kind: "file", src: "", href: "\u0000blob:http://app/x", name: "r.pdf", contentType: "application/pdf" }] } }));
  check("G a control-prefixed blob raw link downloads, never a new tab", /download="r.pdf"/.test(pdf) && !/target="_blank"[^>]*>Raw file/.test(pdf) && pdf.includes(">Raw file<"), pdf.slice(-400));
  const page = renderToStaticMarkup(React.createElement(ChatMessageCard, { message: { id: "h", role: "assistant", content: "", media: [{ kind: "file", src: "", href: "\u0000blob:http://app/x", name: "p.html", contentType: "text/html" }] } }));
  check("G a control-prefixed blob link for HTML is refused", !page.includes(">Raw file<"), page.slice(-400));
}


// ------------------------------------------------------------- H. review round (PR #11)
{
  // Port from #10: `ask` (the person's explicit Ask tools) travels on every write.
  const f = fakeClient();
  const h = await harness({ client: f.client });
  h.emit(approvalRecord("approve:1", [{ name: "fetch_url", call_id: "c1" }]));
  await h.controller.approveAllForSession(target, { ask: ["send_email", "execute_command"] });
  check("H approve-all carries the person's Ask tools", JSON.stringify(f.calls.at(-1)[1]) === JSON.stringify({ approve: { all: true }, ask: ["send_email", "execute_command"], client: "panel-chat" }), f.calls.at(-1));
  h.emit(approvalRecord("approve:2", [{ name: "fetch_url", call_id: "c2" }]));
  const control = presentInteraction(h.controller.getSnapshot().interaction, h.controller, { sessionPolicy: { ask: ["send_email"], toolsetOf: () => "web" } });
  await control.approveKinds[0].onApprove();
  check("H a kind grant from the panel carries ask", JSON.stringify(f.calls.at(-1)[1].ask) === JSON.stringify(["send_email"]), f.calls.at(-1));
  h.emit(approvalRecord("approve:3", [{ name: "fetch_url", call_id: "c3" }]));
  const chatControl = presentInteraction(h.controller.getSnapshot().interaction, h.controller, { sessionPolicy: { ask: ["delete_file"] } });
  await chatControl.onApproveForSession();
  check("H Allow for this chat from the panel carries ask", JSON.stringify(f.calls.at(-1)[1]) === JSON.stringify({ approve: { all: true }, ask: ["delete_file"], client: "panel-chat" }), f.calls.at(-1));

  // Port from #10: a failed capability read is "unavailable" with a reason (not "local-fallback").
  const u = await harness({ client: undefined });
  u.controller.setSessionToolPolicyClient(null, { reason: "Could not read the gateway's capabilities (HTTP 502)." });
  const snap = u.controller.getSnapshot();
  check("H failed capability read → unavailable + reason", snap.sessionPolicyMode === "unavailable" && snap.sessionPolicyReason === "Could not read the gateway's capabilities (HTTP 502).", { mode: snap.sessionPolicyMode, reason: snap.sessionPolicyReason });
  u.emit(approvalRecord("approve:1", [{ name: "fetch_url", call_id: "c1" }]));
  let refusal = "";
  await u.controller.approveAllForSession(target).catch((e) => (refusal = e.message));
  check("H unavailable: a chat grant refuses with the reason", /HTTP 502/.test(refusal) && /Allow once still works/.test(refusal) && u.commands.length === 0 && u.controller.getSnapshot().autoApproveTools !== true, refusal);
  const unavailable = presentInteraction(u.controller.getSnapshot().interaction, u.controller, { sessionPolicy: { toolsetOf: () => "web" }, onAllowForSession: async () => {} });
  check("H unavailable: no chat or kind grant offered; the reason is shown", unavailable.onApproveForSession === undefined && !unavailable.approveKinds?.length && /HTTP 502/.test(unavailable.scopeNote || ""), unavailable.scopeNote);
  await unavailable.onApprove();
  check("H unavailable: Allow once still works", u.commands.at(-1)?.payload.payload.approved === true);
  u.controller.setSessionToolPolicyClient(fakeClient().client);
  check("H a later supported client turns gateway mode on", u.controller.getSnapshot().sessionPolicyMode === "gateway" && !u.controller.getSnapshot().sessionPolicyReason);

  // #10 scenario: controller disposed mid-write. Written, nothing answered, and the person is told it was saved.
  const gate = deferred();
  const d = fakeClient(() => gate.promise);
  const hd = await harness({ client: d.client });
  hd.emit(approvalRecord("approve:1", [{ name: "fetch_url", call_id: "c1" }]));
  let disposedError = "";
  const pending = hd.controller.approveAllForSession(target).catch((e) => (disposedError = e.message));
  await flush();
  hd.controller.dispose();
  gate.resolve(policyOf());
  await pending;
  check("H disposed mid-write: nothing answered", hd.commands.length === 0, hd.commands);
  check("H disposed mid-write: says the policy was saved", /tool policy was saved/.test(disposedError), disposedError);

  // Review F3: a new request mid-write → the error says the policy WAS saved.
  const g2 = deferred();
  const c2 = fakeClient(() => g2.promise);
  const h2 = await harness({ client: c2.client });
  h2.emit(approvalRecord("approve:1", [{ name: "fetch_url", call_id: "c1" }]));
  let changedError = "";
  const p2 = h2.controller.approveAllForSession(target).catch((e) => (changedError = e.message));
  await flush();
  h2.emit(approvalRecord("approve:9", [{ name: "send_email", call_id: "c9" }]));
  g2.resolve(policyOf());
  await p2;
  check("H changed request mid-write: says the policy was saved and why the new one asks", /tool policy was saved/.test(changedError) && /changed/.test(changedError) && h2.commands.length === 0, changedError);

  // Review F4: reset + reload of the same run mid-write → the stored policy is adopted.
  const g3 = deferred();
  const c3 = fakeClient(() => g3.promise);
  const h3 = await harness({ client: c3.client });
  h3.emit(approvalRecord("approve:1", [{ name: "fetch_url", call_id: "c1" }]));
  const p3 = h3.controller.approveAllForSession(target).catch(() => {});
  await flush();
  h3.controller.reset();
  await h3.controller.load("root");
  await flush();
  h3.emit(approvalRecord("approve:1", [{ name: "fetch_url", call_id: "c1" }]));
  g3.resolve(policyOf({ revision: 7 }));
  await p3;
  check("H reset + reload mid-write: the stored policy is adopted", h3.controller.getSnapshot().sessionPolicy?.revision === 7, h3.controller.getSnapshot().sessionPolicy);

  // Review F5: decoration gaps.
  check("H an unparseable URL is local (fail closed)", isLocalObjectUrl("http://[") === true);
  const hm = await harness({ client: fakeClient().client });
  const decisionRecord = (payload) => ({ status: "completed", step_id: "x", effect: { type: "emit_event", payload: { name: "abstract.tool_policy_decision", payload } } });
  hm.emit(decisionRecord({ decision: "maybe", tool_calls: [{ call_id: "c1", name: "t" }] }));
  // Review F6: a decision with no valid calls adds no line.
  hm.emit(decisionRecord({ decision: "denied", tool_calls: "nope" }));
  hm.emit(decisionRecord({ decision: "denied", tool_calls: [{ call_id: null, name: "t" }] }));
  check("H an unknown decision value and a decision with no calls add no line", !hm.controller.getSnapshot().messages.some((m) => m.kind === "tool_policy_decision"), hm.controller.getSnapshot().messages.map((m) => m.content));
}

for (const controller of controllers) controller.dispose();
if (failures) {
  console.error(`check_session_policy: ${failures} of ${checks} failed`);
  process.exit(1);
}
console.log(`check_session_policy: OK (${checks} checks: write-then-answer order, kinds/denials, labeled local fallback, clamped surfaced, kinds only for toolsets present, policy record = activity, parser locality)`);
