# Proposed: abstractcode's tool_picker consumes ToolPolicyEditor (fourth tool-selection surface)

## Metadata
- Created: 2026-07-12
- Status: Proposed
- Completed: N/A

## ADR status
- Governing ADRs: None
- ADR impact: None

## Context
Census gap-check (2026-07-12): `abstractcode/web/src/ui/tool_picker.tsx`
(119 lines, one consumer at app.tsx:1848) re-implements the ToolPolicyEditor
shape — toolset grouping, filter input, checkbox allowlist, empty state —
without the approve/ask column, tool-mode banner, or defaults. It also does
not reuse abstractcode's own multi_select.tsx in the same directory. That
makes four tool-selection UIs across the framework; ToolPolicyEditor
(ui-kit, 312 lines) is a strict superset and was extracted to end exactly
this duplication.

## Proposed direction
abstractcode consumes ToolPolicyEditor (it already imports ui-kit for
Icon/ProviderModelSelect/ThemeSelect, so no new dependency). If the approval
column is unwanted there, add a display option to the kit component
(allowlist-only mode) rather than keeping the fork — one small additive prop
vs 119 duplicated lines.

## Why it might matter
Tool selection is a security surface; four implementations means four places
approval semantics can drift (see 0015 for the defaults half of the same
story).

## Promotion criteria
abstractcode seat opts in (their tree carries the swap + deletion); decision
on allowlist-only display mode.

## Non-goals
Unifying the generic multi_select components (rejected in the census:
deliberately different UX per app).
