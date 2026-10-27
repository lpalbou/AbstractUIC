# Planned: hosts move "allow all / this kind" to the gateway's session tool policy

## Metadata
- Created: 2026-10-27
- Status: Planned (kit half done on `feat/session-tool-policy`; host halves open)
- Completed: N/A
- Area: panel-chat consumers (AbstractCode web first), panel-chat approval card
- Depends on: abstractgateway + abstractruntime `feat/session-tool-policy` (session tool policy contract v1)
- Related: 0032 (questions and approvals), 0033 (tool selection layers)

## ADR status
- Governing ADRs: ADR 0001 (§1, §2)
- ADR impact: none beyond implementation

## Summary
"Allow all" (and "allow this kind") is decided in the client today: the server is told to ask
for every tool, the wait is recorded and shown, and the granting client answers it a moment
later, so every client (and the replayable ledger) flashes an approval gate that was never a
question. The gateway's session tool policy (`/api/gateway/sessions/{session_id}/tool-policy`,
capability `session_tool_policy`) moves the grant to the server, where the runtime consults it
BEFORE it emits a wait. panel-chat now offers the route (`approveForSession`,
`snapshot.sessionToolPolicy`, `presentInteraction({ sessionPolicy })`); the hosts still use the
local path.

## Why
- AbstractCode web passes `onPermissionsAll` to `presentInteraction`
  (`abstractcode/web/src/workspace/app.tsx` ~l.451-456): "Allow all" flips a per-browser
  preference (`permissions: "all"`) and the controller's standing permission answers each wait
  after it arrived. It also sends `_runtime.tool_policy.require_approval_tools = <every enabled
  tool>` (~l.821-825) so the server always asks.
- Without the host passing `sessionPolicy: { ask }`, panel-chat keeps the old behaviour on
  purpose: only the host knows its explicit per-tool Ask settings, and a server grant without
  them would auto-approve tools the person asked to be asked about.

## Host half (AbstractCode web)
1. Transport (`workspace/session_transport.ts`): implement `getCapabilities` (GET
   `discovery/capabilities`), `setSessionToolPolicy` (POST merge / PUT) and
   `clearSessionToolPolicy` (DELETE) with `gatewayApiPath`.
2. `presentInteraction(..., { sessionPolicy: { ask: <tools set to Ask> }, onPermissionsAll })`:
   on `sessionToolPolicy === "server"` the card reads "Allow all tools in this conversation" and
   the grant is written on the gateway; on `local-fallback` the old switch still runs.
3. Show `snapshot.sessionToolPolicyClamped` (names the gateway did not approve) next to the
   grant; offer "Reset this conversation's permissions" through `resetSessionToolPolicy()`.
4. Settings copy: the conversation grant is per conversation on the gateway, not "this Gateway
   account"; the account-wide `permissions: all` preference stays a separate, local setting.

## Kit follow-up: "Allow this kind" on the card
Wait details carry no toolset (`details.tool_calls[*]` = name, arguments, call_id) and
panel-chat holds no tool catalog, so the card does not offer it yet. The gateway's
`GET /discovery/tools` rows carry `toolset` and `risk_rank`: add a host-supplied
`sessionPolicy.toolsetOf(name)` (from the host's catalog), a second approve button in
`WorkflowInteractionPanel` ("Allow <kind> tools in this conversation") and an
`approve-kind` submission kind, calling `approveForSession(target, { kinds })`.

## Acceptance
- [ ] AbstractCode web: a covered call after "Allow all tools in this conversation" shows no
      approval gate (no `waiting` record in the ledger); the decision shows as a "Tool policy" row.
- [ ] Explicit Ask tools still ask under the grant (sent as `ask`).
- [ ] An older gateway keeps the local behaviour and the UI says it is local.
- [ ] "Allow this kind" card button pinned by `check_present_interaction.mjs`, confirmed red once.
- [ ] Other hosts that grant approvals (desktop Assistant web views, Observer if it ever offers
      approve-all; automations are outside the session policy) reviewed.

## Non-goals
Answering waits that already exist when a policy is written (the client answers the shown one);
per-argument scopes; iPhone/watch wiring (other repos).
