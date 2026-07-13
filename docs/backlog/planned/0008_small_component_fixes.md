# Planned: small component fixes (matrix boolean strictness, dialog busy-escape, ToolPolicyEditor a11y + pruning, KG explorer theming)

## Metadata
- Created: 2026-07-11
- Status: Planned
- Completed: N/A
- Area: ui-kit (matrix core, critical dialog, tool_policy_editor), monitor-active-memory

## ADR status
- Governing ADRs: None
- ADR impact: None

## Context
Remaining P1/P2 adversary findings (2026-07-11: F10, F14, F15, F20, F21) that
are individually small; grouped because each is a contained fix with its own
test, no cross-item dependency.

## Current code reality / fixes
1. `phase_capability_matrix_core.ts:152,156` — `assigned`/`executable` coerce
   silently (`raw.assigned === true`; a serializer emitting `"true"` reads as
   unassigned → the operator's stored word renders as "Default" and the
   no-op collapse misfires) while enums refuse loudly. Fix: booleans refuse
   non-boolean presence loudly like enums; `reconcilePatches`/
   `serializeCellPatches` validate `op ∈ {grant,deny,clear}` on externally
   supplied lists.
2. `critical_action_dialog.tsx:73-78` — Escape fires onCancel while `busy`
   though Cancel is disabled: gate Escape on `!busy` (irreversible-action
   surface must not have a keyboard side-door).
3. `tool_policy_editor.tsx` — checkbox rows and approval selects have no
   accessible names (F10: forty anonymous checkboxes); `role="tablist"` misuse
   on the segmented control; and `:162-165,187,195` silently DROP selection
   entries for tools not yet loaded — an early click before async tool
   discovery completes erases prior selections (F21). Fix: aria-labels from
   tool.name, aria-pressed buttons, and never prune unknown names on write.
4. `monitor-active-memory/src/KgActiveMemoryExplorer.tsx:295-303,861,915-920`
   — hardcoded dark inline styles (white labels on light canvas in flow's KG
   panel). Fix: tokens, or declare the canvas forced-dark deliberately.
5. Matrix WRAPPER DOM tests (core has 68 asserts; the wrapper's refusal view,
   approval button, act wiring have none) — smallest honest rig.

## Validation
Each fix lands with its regression test where the .mjs pattern reaches it;
manual pass for the a11y items (VoiceOver row announcement).

## Progress checklist
- [ ] Matrix boolean strictness + op validation (+ tests)
- [ ] Dialog busy-escape gate
- [ ] ToolPolicyEditor a11y + no-prune-on-write
- [ ] KG explorer theming decision + fix
- [ ] Matrix wrapper DOM smoke tests
