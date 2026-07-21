# Completed: small component fixes (matrix boolean strictness, dialog busy-escape, ToolPolicyEditor a11y + pruning, KG explorer theming)

## Metadata
- Created: 2026-07-11
- Status: Completed
- Completed: 2026-07-18 (items 1-3 on 07-17, items 4-5 on 07-18; receipts c2775 + this pass)
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
- [x] Matrix boolean strictness + op validation (+ tests) — 2026-07-17:
      `assigned`/`resolved_value`/`executable` refuse non-boolean presence
      loudly (absent keeps defaults); `reconcilePatches`/`serializeCellPatches`
      drop entries with op outside {grant,deny,clear} and malformed entries;
      seeded-bug checks added to check_matrix_core.mjs (fail on pre-fix code).
- [x] Dialog busy-escape gate — 2026-07-17: Escape AND scrim-click gated on
      `!busy` (both were side-doors around the disabled Cancel button).
- [x] ToolPolicyEditor a11y + no-prune-on-write — 2026-07-17: aria-labels on
      checkboxes (`Enable <tool>`), approval selects (`Approval mode for
      <tool>`) and the filter input; segmented control role="group" +
      aria-pressed (tablist misuse removed); writes preserve names for tools
      not yet discovered (Select none clears only visible selections).
- [x] KG explorer theming decision + fix — DECIDED 2026-07-18: the graph
      canvas is FORCED-DARK BY DECLARATION (the spec's offered option): the
      node/edge/label/minimap literals are one dark-space visual language,
      and the real defect was that the pane had NO ground of its own — white
      labels sat on the host's light surface on light themes. `.amx-graph`
      now carries its own dark background (#0c1222 + color-scheme: dark;
      comment at the rule names the decision), so the canvas reads correctly
      on every host theme. The panel chrome AROUND the canvas consumes
      tokens (error/warning text → var(--error)/var(--warning), divider →
      var(--ui-border-1); prior literals kept as fallbacks).
- [x] Matrix wrapper DOM smoke tests — 2026-07-18:
      `ui-kit/scripts/check_matrix_wrapper.mjs` wired into the kit gate
      (refusal view labeled + renders no grant state, approval control with
      accessible act label, blocked cell renders ZERO buttons, absent mark,
      tristate aria-pressed, pending-count note, orphaned patch never counts
      as an unsaved change). renderToStaticMarkup over compiled dist — the
      0006 rig pattern.

All five items closed; moved to completed/ in the same pass per the
backlog process (validation: full root gate green across all six
workspaces, 2026-07-18).
