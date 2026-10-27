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
  const local = presentInteraction(wait, h.controller, { sessionPolicy: { mode: "local-fallback", toolsetOf: () => "web" } });
  check("C fallback: labeled line (run scope)", local.scopeNote === L.localRunPolicyNote && /gateway cannot store conversation policies/.test(local.scopeNote), local.scopeNote);
  check("C fallback: no kind buttons", !local.approveKinds?.length);
  const hostChat = presentInteraction(wait, h.controller, { onAllowForSession: async () => {}, sessionPolicy: { mode: "local-fallback" } });
  check("C fallback with the host's chat grant: labeled chat line", hostChat.scopeNote === L.localChatPolicyNote && typeof hostChat.onApproveForSession === "function");
  const html = renderToStaticMarkup(React.createElement(WorkflowInteractionPanel, { interaction: local }));
  check("C the panel renders the labeled line", html.includes('data-scope-note="">Allowed until this run ends, in this browser only — the gateway cannot store conversation policies.<'), html.slice(-600));
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
  const control = presentInteraction(h.controller.getSnapshot().interaction, h.controller, { sessionPolicy: { mode: "gateway" } });
  const result = await control.onApproveForSession();
  check("D clamped reaches the snapshot", JSON.stringify(h.controller.getSnapshot().sessionPolicyClamped) === JSON.stringify(clamped));
  check("D clamped reaches the host callback", JSON.stringify(seen.at(-1)) === JSON.stringify(clamped));
  check("D the decision reports what is not covered", result?.outcomeNote === "Not covered: send_email (not authorized); nope (unknown kind)", result);
  check("D clamped text", sessionPolicyClampedText([]) === "");
  h.emit(approvalRecord("approve:2", [{ name: "send_email", call_id: "c2" }]));
  const next = presentInteraction(h.controller.getSnapshot().interaction, h.controller, { sessionPolicy: { mode: "gateway", clamped: h.controller.getSnapshot().sessionPolicyClamped } });
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
  const control = presentInteraction(h.controller.getSnapshot().interaction, h.controller, { sessionPolicy: { mode: "gateway", toolsetOf: (name) => toolsets[name] } });
  check("E one kind per toolset present; the call's own toolset wins; unknown never guessed", JSON.stringify(control.approveKinds.map((k) => k.kind)) === JSON.stringify(["web", "files", "search"]), control.approveKinds.map((k) => k.kind));
  check("E kind label", control.approveKinds[0].label === "Allow all web tools for this chat");
  check("E gateway mode: no local scope line", control.scopeNote === undefined);
  check("E Allow for this chat offered", control.approveForSessionLabel === "Allow for this chat" && /stores a policy for this conversation on the gateway/.test(control.approveForSessionDescription));
  await control.approveKinds[1].onApprove();
  check("E the kind button writes that kind, then answers", f.calls.at(-1)[1].approve.kinds[0] === "files" && h.commands.at(-1).payload.payload.approved === true);
  const none = presentInteraction(h.controller.getSnapshot().interaction, h.controller, { sessionPolicy: { mode: "gateway" } });
  check("E no toolsetOf and no call toolset: only the call's own", JSON.stringify(none.approveKinds.map((k) => k.kind)) === JSON.stringify(["search"]));
  const html = renderToStaticMarkup(React.createElement(WorkflowInteractionPanel, { interaction: control }));
  check("E the panel renders a kind button per toolset", (html.match(/data-decision="approve-kind"/g) || []).length === 3 && html.includes('data-kind="web">Allow all web tools for this chat<'));
  const bare = renderToStaticMarkup(React.createElement(WorkflowInteractionPanel, { interaction: { id: "y", kind: "tool-approval", toolName: "t", onApprove: () => {}, onDeny: () => {} } }));
  check("E no kinds unless injected", !bare.includes("approve-kind"));
  let threw = false;
  try { presentInteraction(h.controller.getSnapshot().interaction, { approve: async () => {}, approveWithPolicyChange: async () => {}, resume: async () => {}, emitEvent: async () => {} }, { sessionPolicy: { mode: "gateway" } }); } catch { threw = true; }
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
  check("F an allowed decision is an activity line with provenance", lines[0] === `Allowed by this conversation's policy (set by admin at ${at})`, lines);
  check("F a denied decision is an activity line", lines[1] === "Denied by this conversation's policy", lines);
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

for (const controller of controllers) controller.dispose();
if (failures) {
  console.error(`check_session_policy: ${failures} of ${checks} failed`);
  process.exit(1);
}
console.log(`check_session_policy: OK (${checks} checks: write-then-answer order, kinds/denials, labeled local fallback, clamped surfaced, kinds only for toolsets present, policy record = activity, parser locality)`);
