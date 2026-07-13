# Proposed: ModalShell — one backdrop/Escape/dismissal contract

## Metadata
- Created: 2026-07-11
- Status: Proposed
- Completed: N/A

## ADR status
- Governing ADRs: None
- ADR impact: None

## Context
Adversary A #4 (2026-07-11): four hand-rolled modal dialects with genuinely
different dismissal semantics — flow `modal-overlay` in 12 files
(click-anywhere close, several with NO Escape, e.g. GatewayConnectionModal);
observer `src/ui/modal.tsx` (Escape + mousedown-target) AND the entity app
re-hand-rolling ev_backdrop/ev_panel in 5+ files; abstractcode/web
modal_overlay/modal_card with per-file Escape effects. This is a
consistency-bug class (users get different dismissal behavior per surface),
not just aesthetics.

## Current code reality
CriticalActionDialog (ui-kit) already implements the correct behaviors
(Escape, inner-click stop, focus trap + restore) and could sit on the shell.
~20 call sites across three apps.

## Proposed direction
`ModalShell({ open, onClose, labelled, children })`: portal, backdrop
mousedown-TARGET check (not click — drag-out must not mis-close), Escape,
aria-modal, focus containment. Adopt opportunistically: new modals first,
CriticalActionDialog refactors onto it, existing modals migrate as touched —
never a big-bang rewrite.

## Why it might matter
Every escape-less modal is a small usability failure; per-file Escape effects
keep re-implementing (and re-missing) the same three behaviors.

## Promotion criteria
First two consumers agree (flow's next new modal + observer entity app's
next); the dismissal semantics table (Escape/backdrop/drag) is signed by both.

## Validation ideas
Behavior tests: Escape closes, inner click doesn't, mousedown-inside +
mouseup-outside doesn't close, focus returns to opener.

## Non-goals
No served-console shell (console keeps its tiny backdrop — not worth a shared
core); no forced migration of working modals.
