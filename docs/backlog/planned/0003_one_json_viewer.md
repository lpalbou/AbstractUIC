# Planned: one JsonViewer — collapse the fork family into a single kit source

## Metadata
- Created: 2026-07-11
- Status: Planned
- Completed: N/A
- Area: panel-chat/json_viewer.tsx, monitor-flow/JsonViewer.tsx; consumers flow + observer

## ADR status
- Governing ADRs: None
- ADR impact: None

## Context
Four sibling implementations of the same tree JSON viewer exist (2026-07-11
review, adversary A opportunity #2 + adversary B F4/F9/F18): panel-chat's
(kit, used by observer at 13 call sites), monitor-flow's (kit-internal fork
with flow-only class names baked in), abstractflow's local fork (the most
evolved — honors collapseAfterDepth, primitive-toolbar hiding, collapsible
rendered strings; 15+ call sites), and a DEAD copy in observer
(`src/ui/json_viewer.tsx`, imported by nothing).

## Current code reality
- `panel-chat/src/json_viewer.tsx:197-200` — `collapseAfterDepth` is declared
  in the props type, never read (destructure takes only value/className/
  showCopy; a local constant shadows it). Verified in source 2026-07-11.
  Observer passes `jsonCollapseAfterDepth: 4` through ChatThread today — the
  intent is silently swallowed (adversary B F4).
- `monitor-flow/src/JsonViewer.tsx:211-214` — same dead-prop bug (fork twin);
  `:222,240,247` hardcode flow vocabulary (`run-details-output`,
  `modal-button`) inside a kit component.
- `abstractflow/src/components/JsonViewer.tsx` — target behavior superset.
- `copyText` is implemented four times across the family (F18);
  `PanelChatMessage` type export is dead (zero importers).

## Problem
One component, four sources, two of which ship the identical accepted-but-
ignored prop bug; a kit component carries a consumer app's class names; and
every ledger/run surface in three apps depends on some member of the family.

## What we want to do
House flow's superset behavior once (panel-chat keeps ownership; monitor-flow
re-exports), honor `collapseAfterDepth`, remove flow-isms from kit code,
delete flow's fork and observer's dead copy (their trees, coordinated),
dedupe `copyText` into panel-chat utils, drop the dead type export.

## Scope / Non-goals
Non-goals: a served-console JSON core (console renders `<pre>`; no consumer).

## Validation
- Props-contract test: `collapseAfterDepth` measurably changes fold depth
  (the exact shipped bug class).
- Class-name stability assertions for each app's CSS hooks.
- Flow + observer suites green after migration.

## Progress checklist
- [ ] Superset merge into panel-chat viewer (+ tests) — collapseAfterDepth +
      string-fold + primitive-toolbar behavior already present in BOTH twins
      and CONTRACT-PINNED by the 07-18 rigs; the remaining merge question is
      structural (below).
- [ ] monitor-flow re-export — BLOCKED on a design decision with consumers
      (2026-07-19): a naive re-export of panel-chat's viewer CHANGES the
      rendered class vocabulary (pc-json-* vs json-token/json-viewer__*),
      breaking every consumer's CSS hooks — the exact class-name-stability
      axis this item's own validation demands. Options put to flow/observer/
      code-web in the receipt thread: (a) consumers migrate to the pc-*
      vocabulary in one wave (monitor-flow then re-exports and its viewer
      dies), or (b) the twins stay two RENDERERS over one CONTRACT, with the
      rigs pinning behavior parity (the 07-18 state, already live). Flow-isms
      + toolbar class: DONE earlier (json-viewer__btn package-owned).
- [ ] Flow fork deletion (flow seat), observer dead-file deletion (observer
      seat) — consumer trees, unblocked independently of the re-export
      question.
- [x] copyText dedupe + dead export removal — 2026-07-19: 4 copies → 2
      canonical (panel-chat json_viewer now imports utils.copyText — its
      private copy was the WEAKER variant, no off-screen positioning;
      monitor-flow's two byte-identical private copies collapsed into
      src/copy_text.ts with the canonical semantics). Cross-package
      unification to 1 deliberately NOT done — monitor-flow must not gain a
      panel-chat dependency for one function; it rides the re-export
      decision. Dead `PanelChatMessage` export dropped (types.ts deleted;
      zero importers verified across observer/flow/code-web).
