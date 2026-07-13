# Planned: panel-chat robustness sweep (composer gate, IME, stream stick, date guard)

## Metadata
- Created: 2026-07-11
- Status: Planned
- Completed: N/A
- Area: panel-chat (chat_composer.tsx, chat_thread.tsx, chat_message_card.tsx)

## ADR status
- Governing ADRs: None
- ADR impact: None

## Context
2026-07-11 adversary findings F5, F16, F17. panel-chat renders every chat
surface in observer (5 composers) and abstractcode/web.

## Current code reality (verified in source 2026-07-11)
- `chat_composer.tsx:44-49` — Enter-without-shift calls `props.onSubmit()`
  unconditionally while the Send button honors `can_submit` (busy/empty
  excluded). No `isComposing` guard: committing a CJK/IME composition with
  Enter sends mid-composition. Observer re-guards inside its own `send` —
  consumer-side patching of a component-contract hole.
- `chat_thread.tsx:41-45` — auto-scroll effect deps on `msgs.length` only; a
  streaming answer that mutates the LAST message's content grows below the
  fold without re-sticking.
- `chat_message_card.tsx:76` — no `Number.isFinite(d.getTime())` guard →
  "Invalid Date" renders for malformed timestamps (monitor-flow's sibling
  does this right — inconsistent family); `:126` copy-state timeout can
  setState after unmount.

## Problem
The composer's contract (disabled/busy) is enforceable only by every consumer
re-implementing it; streaming threads lose the bottom-stick; malformed data
renders literal "Invalid Date".

## What we want to do
Gate composer Enter on `can_submit` + skip when `e.nativeEvent.isComposing`;
re-stick on content growth (track last-message content length or use a
ResizeObserver on the scroll content); guard date formatting; clear the copy
timer on unmount.

## Scope / Non-goals
Non-goals: redesigning composer API; virtualized threads (no evidence needed
at current scales).

## Validation
- Pure-function extraction where possible + node tests (submit-gate decision).
- Manual: IME composition (macOS Japanese input), streaming scroll behavior
  in observer chat, garbage timestamp fixture.

## Progress checklist
- [ ] Composer submit gate + IME guard
- [ ] Thread re-stick on content growth
- [ ] Date guard + timer cleanup
