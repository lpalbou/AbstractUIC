# 1161 — A running tool row shows how long it has been running, and says when that is unusual

> Package: AbstractUIC panel-chat (tool rows in the replay view projection and the tool group component)
> Type: defect (root ADR 0053 §3: a waiting state says what it waits for)
> Status: proposed (2026-11-08: the operator did not ask for it; a display aid only, no budget and no interrupt anywhere)
> Created: 2026-11-08 (operator incident 2026-11-08 03:31, Code web: two `search_files` spinners read "Running" for eight minutes with no figure; "you would think it works and it's just slow? no it isn't")
> Priority: P1
> Labels: panel-chat, tool-calls, waiting-state

## Summary

A completed tool row shows its duration ("Done 0.0s"); a running one shows a spinner and the word "Running"
only. After a minute the reader cannot tell a slow search from a hung one, and the operator read it as a
crash. The record knows when the call started (the ledger's `tool_calls started` entry; runtime 1159 was deprecated the same day; the row would use the
ledger's started timestamp only).

## Scope

- While a call runs, the row's right side reads the live elapsed time ("Running 1m 12s"), ticking once a
  second from the started timestamp the projection already has (fall back to the row's first-seen time
  when the ledger carries none).
- Past 60 s the row adds one plain cue, from the runtime's progress note when present: "still running
  (searching 48,000 files…)", else "still running; a search over a large folder can take minutes".
- No layout change on phones (400 px): the time replaces "Running", the cue wraps under the name.
- Tests: a row with a started timestamp 75 s old renders "1m 15s" and the cue; a completed row is unchanged;
  removing the started timestamp falls back to first-seen; the projection test fails without `elapsed_ms`.
- Consumers: Code, Assistant web, Entity chat, Observer board request line at their next kit bump.

## Related

Runtime 1159 (the budget and the progress notes), root 1160 (the search deadline in core), uic 1155
(whole tool-call values behind a reveal).
