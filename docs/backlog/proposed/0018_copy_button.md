# Proposed: CopyButton / useCopied — one copied-state affordance

## Metadata
- Created: 2026-07-12
- Status: Proposed
- Completed: N/A

## ADR status
- Governing ADRs: None
- ADR impact: None

## Context
Census gap-check (2026-07-12): the copy-to-clipboard button with transient
"copied" feedback is hand-rolled 7+ times across all three apps (flow:
AuthoringAssistantDrawer, RunFlowModal, ArtifactListInputField; observer:
turn_detail_modal, ui/app.tsx, backlog_browser; abstractcode: app.tsx) — plus
the kit's own internals (panel-chat message card, both JSON viewers) which
carry their own setCopied/timeout logic. The 0004 wave just fixed a
timer-after-unmount bug in ONE of these; the same bug class likely exists in
the app copies.

## Proposed direction
Tiny kit exports: `useCopied(timeoutMs)` hook (state + safe timer with
unmount cleanup) and a `CopyButton` wrapping it with the kit icon; panel-chat
utils' `copyText` (clipboard API + execCommand fallback) becomes the one copy
primitive (already exported). Apps migrate opportunistically — low risk, high
spread.

## Why it might matter
Smallest possible drift-killer: one timer bug class, one clipboard fallback,
one visual language for "copied".

## Promotion criteria
Any consumer opts in; candidate to ride the 0011 ModalShell wave (same
"new-surfaces-first" adoption shape).

## Non-goals
Redesigning existing button styling per app (the hook alone is the win where
a custom look must stay).
