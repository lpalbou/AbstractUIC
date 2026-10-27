// Session tool policy (gateway contract v1): "allow all / this kind" for a
// conversation is written on the gateway BEFORE the shown wait is answered,
// and never becomes a client-side auto-approver; an older gateway keeps the
// local standing permission and says so; the decision record is activity.
// Build panel-chat first. node scripts/check_session_tool_policy.mjs
import assert from "node:assert/strict";
import { test } from "node:test";
import { WorkflowSessionController, workflowPendingInteraction } from "../dist/workflow_runtime.js";

const flush = () => new Promise(resolve => setTimeout(resolve, 0));
const target = (runId, waitKey) => ({ runId, waitKey });
const approval = (waitKey, names = ["fetch_url"]) => ({
  step_id: `step:${waitKey}`, status: "waiting",
  effect: { type: "tool_calls", payload: { tool_calls: names.map((name, index) => ({ name, runtime_call_id: `${waitKey}:${index}`, arguments: {} })) } },
  result: { wait: { reason: "user", wait_key: waitKey, details: { mode: "approval_required", kind: "tool_approval", tool_calls: names.map(name => ({ name })) } } },
});
const decision = (decisionName, names) => {
  const payload = { name: "abstract.tool_policy_decision", scope: "run", payload: {
    decision: decisionName, source: "session_policy", session_id: "s-1", node_id: "agent",
    tool_calls: names.map((name, i) => ({ call_id: `c${i}`, name, matched: "all" })),
    policy: { revision: 2, set_by: { tenant_id: "default", user_id: "admin", client: "panel-chat" }, set_at: "2026-10-27T10:00:00+00:00" },
  } };
  return { status: "completed", effect: { type: "emit_event", payload }, result: { emitted: true, tool_policy_decision: { decision: decisionName, count: names.length } } };
};

/** `capability`: undefined = transport without the session-policy calls;
 * false = older gateway (key absent); true = supported. */
async function harness(t, { capability, sessionId = "s-1" } = {}) {
  const calls = [], streams = new Map(), cursors = new Map();
  const transport = {
    getRun: async id => ({ run_id: id, status: "waiting", ...(sessionId ? { session_id: sessionId } : {}) }),
    getHistory: async () => ({}),
    getLedger: async (_id, after) => ({ items: [], next_after: after }),
    streamLedger: async (id, after, onStep, signal, onOpen) => {
      streams.set(id, { onStep });
      cursors.set(id, after);
      onOpen?.();
      await new Promise(resolve => signal.addEventListener("abort", resolve, { once: true }));
    },
    submitCommand: async command => { calls.push(["command", command.run_id, command.payload]); return { accepted: true }; },
  };
  if (capability !== undefined) {
    Object.assign(transport, {
      getCapabilities: async () => { calls.push(["capabilities"]); return { capabilities: capability ? { session_tool_policy: { supported: true, version: 1 } } : { streaming: { supported: true } } }; },
      setSessionToolPolicy: async (sid, body, options) => {
        calls.push(["policy", options.merge ? "POST" : "PUT", sid, body]);
        return { session_id: sid, policy: { version: 1, session_id: sid, revision: 2, approve: { fetch_url: "all" }, clamped: [{ selector: "tools", name: "send_email", reason: "not_authorized" }] } };
      },
      clearSessionToolPolicy: async sid => { calls.push(["policy", "DELETE", sid]); return { session_id: sid, policy: null, revision: 3 }; },
    });
  }
  const controller = new WorkflowSessionController(transport, { clientId: "session-policy-test" });
  t.after(() => controller.dispose());
  await controller.load("root");
  await flush();
  return {
    controller, calls,
    emit(record) {
      const cursor = (cursors.get("root") || 0) + 1;
      cursors.set("root", cursor);
      streams.get("root").onStep({ cursor, record: { run_id: "root", ...record } });
    },
  };
}

test("with the capability: approve-all POSTs the policy first, then answers the shown wait; nothing auto-answers later", async t => {
  const h = await harness(t, { capability: true });
  assert.equal(h.controller.getSnapshot().sessionToolPolicy, "server");
  assert.equal(h.controller.getSnapshot().sessionToolPolicyReason, "");
  h.emit(approval("batch:1"));
  const grant = await h.controller.approveForSession(target("root", "batch:1"), { all: true }, { ask: ["send_email"] });
  const after = h.calls.filter(call => call[0] !== "capabilities");
  assert.deepEqual(after, [
    ["policy", "POST", "s-1", { approve: { all: true }, ask: ["send_email"], client: "session-policy-test" }],
    ["command", "root", { wait_key: "batch:1", payload: { approved: true } }],
  ], "policy write (merge) strictly before the one-off answer");
  assert.equal(grant.path, "server");
  assert.deepEqual(grant.clamped, [{ selector: "tools", name: "send_email", reason: "not_authorized" }], "clamped names are returned");
  assert.deepEqual(h.controller.getSnapshot().sessionToolPolicyClamped, grant.clamped, "and kept in the snapshot");
  assert.notEqual(h.controller.getSnapshot().autoApproveTools, true, "no client-side standing permission");
  // The runtime no longer emits covered waits. One that does arrive (a tool
  // outside the grant) is a real question: never auto-answered here.
  h.emit({ status: "completed", effect: { type: "resume", payload: { wait_key: "batch:1" } }, result: { resumed: true } });
  h.emit(approval("batch:2", ["execute_command"]));
  await flush();
  assert.equal(h.calls.filter(call => call[0] === "command").length, 1, "the later wait was not auto-approved");
  assert.equal(h.controller.getSnapshot().toolApprovalGranted, false);
  assert.ok(workflowPendingInteraction(h.controller.getSnapshot()), "it is presented as a question");
});

test("with the capability: approve-kind sends kinds; reset sends DELETE", async t => {
  const h = await harness(t, { capability: true });
  h.emit(approval("batch:1"));
  await h.controller.approveForSession(target("root", "batch:1"), { kinds: ["web", "web", " "] });
  assert.deepEqual(h.calls.find(call => call[0] === "policy").slice(1), ["POST", "s-1", { approve: { kinds: ["web"] }, client: "session-policy-test" }]);
  await h.controller.resetSessionToolPolicy();
  assert.deepEqual(h.calls.at(-1), ["policy", "DELETE", "s-1"]);
  assert.deepEqual(h.controller.getSnapshot().sessionToolPolicyClamped, []);
});

test("a stale target writes no policy", async t => {
  const h = await harness(t, { capability: true });
  h.emit(approval("batch:1"));
  await assert.rejects(() => h.controller.approveForSession(target("root", "old"), { all: true }), /changed/);
  assert.equal(h.calls.filter(call => call[0] === "policy" || call[0] === "command").length, 0);
});

test("older gateway (capability absent): the local standing permission still works and the snapshot says local-fallback", async t => {
  const h = await harness(t, { capability: false });
  const snap = h.controller.getSnapshot();
  assert.equal(snap.sessionToolPolicy, "local-fallback");
  assert.match(snap.sessionToolPolicyReason, /does not advertise capabilities\.session_tool_policy/);
  h.emit(approval("batch:1"));
  const grant = await h.controller.approveForSession(target("root", "batch:1"), { all: true });
  assert.equal(grant.path, "local-fallback");
  assert.equal(h.calls.filter(call => call[0] === "policy").length, 0, "nothing written on an older gateway");
  assert.equal(h.controller.getSnapshot().autoApproveTools, true, "the client-side grant is installed");
  h.emit({ status: "completed", effect: { type: "resume", payload: { wait_key: "batch:1" } }, result: { resumed: true } });
  h.emit(approval("batch:2"));
  await flush();
  assert.equal(h.calls.filter(call => call[0] === "command").length, 2, "the next covered wait is auto-answered locally, as before");
  await assert.rejects(() => h.controller.approveForSession(target("root", "batch:2"), { kinds: ["web"] }), /session tool policy/, "no local kind grant exists: refused, not guessed");
  await assert.rejects(() => h.controller.resetSessionToolPolicy(), /no gateway tool policy/);
});

test("a transport without the calls, or a sessionless run, is local-fallback too, with its reason", async t => {
  const bare = await harness(t, {});
  assert.equal(bare.controller.getSnapshot().sessionToolPolicy, "local-fallback");
  assert.match(bare.controller.getSnapshot().sessionToolPolicyReason, /transport does not implement/);
  const sessionless = await harness(t, { capability: true, sessionId: "" });
  assert.equal(sessionless.controller.getSnapshot().sessionToolPolicy, "local-fallback");
  assert.match(sessionless.controller.getSnapshot().sessionToolPolicyReason, /no session_id/);
});

test("a failed capability read is unavailable: a grant fails loudly, Allow once still works", async t => {
  const controller = new WorkflowSessionController({
    getRun: async id => ({ run_id: id, status: "running", session_id: "s-1" }), getHistory: async () => ({}),
    getLedger: async (_id, after) => ({ items: [], next_after: after }),
    streamLedger: async (_id, _after, _onStep, signal) => new Promise(resolve => signal.addEventListener("abort", resolve, { once: true })),
    submitCommand: async () => ({ accepted: true }),
    getCapabilities: async () => { throw new Error("502 Bad Gateway"); },
    setSessionToolPolicy: async () => { throw new Error("must not be called"); },
    clearSessionToolPolicy: async () => { throw new Error("must not be called"); },
  });
  t.after(() => controller.dispose());
  await controller.load("root");
  await flush();
  assert.equal(controller.getSnapshot().sessionToolPolicy, "unavailable");
  assert.match(controller.getSnapshot().sessionToolPolicyReason, /502 Bad Gateway/);
});

test("the policy-decision record is activity, never an interaction", async t => {
  const h = await harness(t, { capability: true });
  h.emit(decision("auto_approved", ["fetch_url", "web_search"]));
  h.emit(decision("denied", ["execute_command"]));
  await flush();
  const snap = h.controller.getSnapshot();
  assert.equal(snap.interaction, null, "no interaction");
  assert.equal(workflowPendingInteraction(snap), null);
  assert.equal(h.calls.filter(call => call[0] === "command").length, 0, "nothing answered");
  const rows = snap.messages.filter(message => message.title === "Tool policy").map(message => message.content);
  assert.deepEqual(rows, [
    "Allowed by this conversation's policy (set by admin at 2026-10-27T10:00:00+00:00): fetch_url, web_search",
    "Denied by this conversation's policy (set by admin at 2026-10-27T10:00:00+00:00): execute_command",
  ]);
  assert.ok(!snap.messages.some(message => /approval|permission/i.test(message.content)), "never worded as a question");
});

