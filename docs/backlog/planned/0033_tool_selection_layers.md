# Planned: tool selection — gateway-authorized → app → session, one helper and one editor

## Metadata
- Created: 2026-10-27
- Status: Planned — kit half MERGED (PR #6, 1aaba7e): `tool_plan.ts`, `ToolModeEditor`, `createToolLayerStore`, `mountToolModeEditor`; NEXT: gateway-backed session layer over the session tool-policy contract on `feat/ui-primitives-session-policy-kit`; app adoption PRs pending
- Completed: N/A
- Area: ui-kit (`tool_plan.ts`, `ToolModeEditor`, `ToolPolicyEditor` adapter, `createToolLayerStore`, island)
- Root link: AbstractFramework backlog 1055
- Supersedes: 0015 (tool-approval defaults one source: the gateway already serves `approval_default`),
  0016 (abstractcode tool picker consumes the kit: the swap is done; what remains is this item)

## ADR status
- Governing ADRs: ADR 0001 (§2, §4, §5)
- ADR impact: §4 names the layering and the sparse-override rule

## Summary
The operator's model, as the Apple Watch implements it: the gateway says which tools are
authorized and their default approval; the app keeps my defaults; a session overrides within
what the gateway authorizes; every layer is a sparse set of differences; the states are
deny / approve / approve-all (`off` / `ask` / `auto` on the wire). One pure helper plans the
run's tool lists; one editor renders any layer.

## Why (audit `untracked/ui-primitives/audit/tools-and-models.md`, hazard box, §A, §C.1, §D)
- The gateway serves `approval_default: "auto"|"ask"` (`routes/gateway.py:15615-15640`); the kit reads
  `default_approval` (`tool_policy_editor.tsx:118-119`), so "server truth wins" never fires.
- "approve" means auto on the desktop and in the kit, ask on the iPhone and in the entity-visit wire format.
- iPhone sessions are full replacement maps (a tool the gateway adds later is off); the watch stores sparse
  differences (`watch/.../AppModel.swift:827-847`): the watch is the reference.
- Code: on/off × approve/ask plus a global tier, no session layer, copy says "Gateway account" for localStorage.
  Observer and Flow: allow-lists only, no approval column, no gateway default shown. Assistant web: gateway
  layer only. Nothing in the monorepo calls `GET /tool-grants`.

## Kit half
1. `tool_plan.ts`: `ToolMode`, `normalizeToolMode(v, dialect)`, `normalizeToolCatalog`, sparse `ToolModeLayer`,
   `resolveToolModes`, `setToolMode`, `BULK_AUTO_MAX_RANK = 2`, `bulkAutoReaches`, `planRunTools(catalog, layers, {ceiling})`,
   `withRunTools`, `toWorkflowApprovalPolicy` (panel-chat shape), `trustAfterApproveAll` (watch rule).
   Five rules, each with a red-able check: a layer never offers what the gateway did not; layers are sparse;
   a diff equal to the inherited mode is deleted; `tool_policy` is always sent once a layer exists; with no
   layers it is omitted so the gateway's grant applies.
2. `ToolModeEditor` (`layer: "app"|"session"`, sparse `value`, `inherited`, three-segment rows, Mixed group
   control with the rank-2 cap explained, search, risk/state badges, `whyDisabled`, "Default: X" chip,
   `allowListOnly`, `AfOverrideRow` with "this app" / "this conversation"); `ToolPolicyEditor` becomes an
   adapter for one minor; `normalize_tools` reads `approval_default` now.
3. `createToolLayerStore(identityKey)`: `af.tools.app.<interface>.<identity>`, `af.tools.session.<identity>.<session_id>`
   (newest 100) until the gateway has routes; the UI never says "saved for this Gateway account".
4. Island `mountToolModeEditor` (the console has no page for the authorized set or the `/tool-grants` ceiling).

## What the apps delete
Code `ui/tool_picker.tsx` (120, no importer), `ui/multi_select.tsx` (83, no importer), `tool_permissions.ts` (47),
Permissions select + disabled list (~60), automation approval mapping (~12); Observer launch `tools` MultiSelect
and `available_tool_names` (~18); Flow `tool_calls` checkbox list (~117), approve-all session/root sets (~140);
Assistant web `lib/tool_policy.ts` (50) + tool part of `run_input.ts` (~10); Entity `ToolGrantsView` (~130 → kit
`PhaseCapabilityMatrix`); console `renderMatrix` (~85 → island); Continuum `ui/multi_select.tsx` (128, dead).

## Gateway routes relied on
`GET discovery/tools`, `GET tool-grants`, `POST runs/start` (`input_data.tools`, `_runtime.allowed_tools`,
`_runtime.tool_policy`), `POST commands` resume, entity `GET/PUT entities/{name}/tool-policy`,
`PUT entities/{name}/visit/{run_id}/tool-policy`.

## Gateway gaps (audit §E.3; raised to the gateway seat)
No per-tool `default_mode` / `available` field; no run-start clamp to the authorized set (tool_grants.py:18-22);
no per-app or per-session tool layer on the server; one wire vocabulary (`off|ask|auto`, "approve" as alias);
no admin UI for `/tool-grants`; automations drop `_runtime.tool_policy` (automation_defaults.py:46-54);
no toolset metadata (labels/order).

## Acceptance
- [ ] `check_tool_plan.mjs` (five rules), `check_tool_mode_editor.mjs`; each confirmed red once.
- [ ] `ToolPolicyEditor` reads the served `approval_default`; `TOOL_POLICY_DEFAULTS` demoted to a labeled fallback or deleted.
- [ ] Docs: api.md, adoption-guide row "Tool allowlist + approval editor" → `ToolModeEditor` + `planRunTools`.
- [ ] 0015 and 0016 moved to deprecated/completed with a pointer here.
- [ ] App adoption PRs (Assistant web and Code first, then Flow and Observer, then Entity and the console).

## Non-goals
Gateway enforcement (the clamp); the entity phase grants (a different axis, kit `PhaseCapabilityMatrix` covers it).
