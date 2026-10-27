# Planned: hosts move "allow all / this kind" to the gateway's session tool policy

## Metadata
- Created: 2026-10-27 (written by the gateway seat's session-tool-policy worker in PR #10; carried here when #11 became the base)
- Status: Planned (kit half DONE on main: ui-kit PR #9 22f2ec0, panel-chat PR #11 b6db5fe, released in 0.7.0; host halves open)
- Completed: N/A
- Area: panel-chat consumers (AbstractAssistant web and AbstractCode web first, then Flow, Observer, Continuum, Note, Entity, the console)
- Depends on: abstractgateway + abstractruntime `feat/session-tool-policy` (session tool policy contract v1, revised 2026-10-27)
- Related: 0032 (questions and approvals), 0033 (tool selection layers); root backlog 1055, 1061

## ADR status
- Governing ADRs: ADR 0001 (§1, §2, §4, §5)
- ADR impact: none beyond implementation

## Summary
"Allow all" (and "allow this kind") is decided in the client today: the server is told to ask for
every tool, the wait is recorded and shown, and the granting client answers it a moment later, so
every client (and the replayable ledger) flashes an approval gate that was never a question. The
gateway's session tool policy (`/api/gateway/sessions/{session_id}/tool-policy`, capability
`capabilities.session_tool_policy.supported`) moves the grant to the server, where the runtime
consults it BEFORE it emits a wait. The kit now carries the whole client path; the hosts still use
the local one.

## What the kit ships (0.7.0)
- ui-kit: `createSessionToolPolicyClient(request, sessionId, capability, {client})`,
  `sessionToolPolicyCapability`, the layer↔policy bridge (`sessionPolicyFromLayer`,
  `layerFromSessionPolicy`), the gateway-backed session layer of `createToolLayerStore`
  (revision-guarded PUT/DELETE, never an unguarded write), `ToolModeEditor` `storage` / `policy`.
- panel-chat: controller `approveAllForSession` / `approveKindForSession` / `denyKindForSession` /
  `denyToolForSession` / `resetSessionPolicy` (write the policy FIRST, then answer the shown wait;
  root session only; `ask` on every write; 409 → re-read), `snapshot.sessionPolicyMode`
  (`"gateway" | "local-fallback" | "unavailable"`) + reason, `presentInteraction({ sessionPolicy })`
  (Allow for this chat, Allow all <toolset> tools for this chat, Always deny under "More", the
  labeled local fallback "Allow for this run", `scope` as served, clamped as "Not covered: …"),
  and the `abstract.tool_policy_decision` record folded as an activity line, never an interaction.

## Why
- AbstractCode web passes `onPermissionsAll` to `presentInteraction` (`abstractcode/web/src/workspace/app.tsx`
  ~l.451-456): "Allow all" flips a per-browser preference (`permissions: "all"`) and the controller's
  standing permission answers each wait after it arrived. It also sends
  `_runtime.tool_policy.require_approval_tools = <every enabled tool>` (~l.821-825) so the server always asks.
- AbstractAssistant web, Flow, Observer carry their own approve-all (audit `chat-media-approvals.md` §A3).
- The desktop Assistant, iPhone and watch keep client-side trust lists (contract §1).

## Host halves (one PR per app, in the adoption order)
For each host: build the kit client from `GET discovery/capabilities` + the app's gateway fetch and the
ROOT run's `session_id`; pass it to `useWorkflowSession` / the controller; pass `sessionPolicy: { ask, toolsetOf }`
to `presentInteraction` (the Ask list from the app's tool layer, the toolset map from `discovery/tools`);
delete the local approve-all preference and the standing-permission answering; stop sending
`require_approval_tools = <every enabled tool>` once the gateway stores the grant; keep the one-off
"Allow once" path. On an older gateway the kit's labeled fallback applies; the host adds nothing.

| Host | Deletes |
|---|---|
| abstractcode/web | `permissions: "all"` preference + `onPermissionsAll` wiring (app.tsx ~451-456), the every-tool `require_approval_tools` (~821-825), the "Saved for this Gateway account" copy (settings_panel.tsx:233) |
| abstractassistant/web | local `WaitCard` approval (already replaced by 0032's panel), nothing else to delete: it never had approve-all |
| abstractflow | approve-all session/root sets (useWebSocket.ts:34,115-175,322; RunFlowModal.tsx:2145-2146,4634-4715) |
| abstractobserver | "Approve and execute" local MCP path stays (a different job); approve-all through the kit |
| desktop / iPhone / watch (native, reference) | their trust lists become policy writes — separate items in abstractassistant |

## Acceptance
- [ ] Each host PR: the gate no longer flashes for a chat-wide grant (a ledger of a covered call shows the
      `abstract.tool_policy_decision` activity and no `waiting` record); on a 0.15.x gateway the fallback is labeled.
- [ ] The host sends `ask` = its explicit Ask tools on every write; `toolsetOf` wired from `discovery/tools`.
- [ ] Deletion list executed; app tests green.
- [ ] Release gate keeps `scripts/check_cross_dist_types.mjs` (ui-kit dist and panel-chat dist agree on the client shape).

## Non-goals
Answering waits that already exist when a policy is written (the client answers the shown one); per-argument
scopes; covering tools enabled after an `all` write (contract §7).
