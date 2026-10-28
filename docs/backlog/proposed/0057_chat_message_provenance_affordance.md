# Proposed: "where this came from" on a chat message

## Metadata
- Created: 2026-10-28
- Status: Proposed (found by the release-closing aesthetic pass)
- Completed: N/A
- Area: panel-chat (`chat_message_card.tsx`, `replay_view_projection.ts`)
- Found by: release-closing W2 aesthetic pass
- Root link: AbstractFramework backlog 0993 (one ledger, many views)

## ADR status
- Governing ADRs: ADR 0001 §7 (designed for the replay view)
- ADR impact: none

## Current understanding
The replay view serves each message's provenance (`messages[].run_id`, `seqs`, `step_ids`,
`source`: `run_input` / `ledger`), but the chat card shows none of it; `workflowSourceLabel`
("Live view from the gateway (replay view)" / "Rebuilt in this client from the run ledger: …")
is rendered by one host only (Observer's automation discussion). In Code a person sees a bare
"Run da86f241" in the status bar and cannot tell which run or ledger record produced an answer.

## Chosen route
A provenance section in the message's stat panel (run id with copy, ledger seq, source label),
one implementation for every host.

## Acceptance criteria
- [ ] Every assistant message from the view shows run, seq and source in its details; a check.
