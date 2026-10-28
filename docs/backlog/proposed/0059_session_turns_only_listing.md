# Proposed: a turns-only listing of a conversation (ask to the gateway and runtime seats)

## Metadata
- Created: 2026-10-28
- Status: Proposed (needs AbstractRuntime + AbstractGateway; the kit consumes it)
- Completed: N/A
- Area: panel-chat `createReplayViewTransport.listSessionTurns`
- Found by: adversarial re-review of backlog 0058
- Root link: AbstractFramework backlog 0993

## ADR status
- Governing ADRs: ADR 0001 §2 (the turn rule is the runtime's)
- ADR impact: none

## Current understanding
panel-chat 0.6.2 lists a conversation's turns with `GET runs/{id}/history_bundle?include_session=true
&include_subruns=false&ledger_max_items=1&detail=replay&session_turn_limit=201`, the only route that
serves the runtime's `select_session_turns`. The client keeps only `run_id`/`created_at`, but the
runtime builds each turn row with its statistics and artifacts (`history_bundle.py:686`
`_best_effort_session_turns`, `include_stats=True`, `include_artifacts=True` by default), walking each
turn's child runs and ledgers: the same server cost the ledger fold paid on every load (it asks
`include_session=true&ledger_mode=full`). The kit lists only on a conversation's first open and on a
new turn (a reopened known turn uses its cache).

## Chosen route
A turns-only option on the bundle (e.g. `session_turn_detail=ids`, passing `include_stats=False,
include_artifacts=False` as `session_history.py:506` already does), or a `GET sessions/{id}/turns`
route; then `listSessionTurns` uses it.

## Acceptance criteria
- [ ] The listing does not read turn ledgers; measured on a 200-turn conversation.
- [ ] `listSessionTurns` switches to it; `check_replay_view_session.mjs` pins the request.
