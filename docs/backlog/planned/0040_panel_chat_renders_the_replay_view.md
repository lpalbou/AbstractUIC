# Planned: panel-chat renders a conversation from the gateway's replay view

## Metadata
- Created: 2026-10-28
- Status: Planned, in progress — kit released (panel-chat 0.6.0, AbstractUIC v0.8.0, PR #17); hosts: AbstractObserver 0.10.0, AbstractEntity 0.9.0, AbstractCode web 0.13.0 released on the view; AbstractContinuum 0.7.2 released (pin only: no own run reads); AbstractNote 0.3.0 merged, unreleased (npm publishing blocked, Note backlog 0038); AbstractAssistant web PR #12 open (ships with desktop 0.16.0)
- Completed: N/A
- Area: panel-chat (`replay_view.ts`, `replay_view_projection.ts`, `WorkflowSessionController`, `presentInteraction`)
- Root link: AbstractFramework backlog 0993 (one ledger, many views; client migration step); AbstractRuntime backlog 0854 (replay view: "panel-chat and AbstractCode web render the view and pass the fixtures")
- Depends on: AbstractGateway 0.17.0 (`GET runs/{id}/view`, `/view/stream`), AbstractRuntime 0.15.0 (`replay_view_v1`, `apply_delta`, 15 conformance cases)
- Related: 0030 (chat surface; message mapping), 0032 (`ReplayInteraction` seam), ADR 0001 §7 ("designed for the replay view": the transport swaps, the components do not change)

## ADR status
- Governing ADRs: ADR 0001 (§1, §7)
- ADR impact: none beyond implementation (§7's transport swap, done)

## Summary
Every panel-chat host rebuilt the run from raw ledger records in the browser
(`WorkflowSessionController`: history bundle, ledger pages and streams per run, `foldRecord`,
`adoptDurableWait`, `resolvedWaits`, `foldWorkflowTools`, a 2 s `GET runs/{id}` poll). Runtime
0854 inventoried where that fold disagrees with the runtime's reducer (which wait is the
interaction, when a wait ends, `$slim`, the final answer, index cursors). The gateway now serves
the reducer's view; panel-chat renders it.

## Done (kit half)
1. `replay_view.ts`: `applyDelta` (port of `apply_delta`, python ordering rules), `ReplayViewFold`
   (refuses a repeated or older frame after a reconnect), `SseParser`, `parseCursorToken`,
   `createReplayViewTransport({ fetch })` (GET with ETag/304, the stream with `Last-Event-ID`,
   route-missing vs run-missing 404s told apart).
2. `replay_view_projection.ts`: view -> transcript (messages, tool rows, policy lines, in the
   view's order), interaction (with the view's `command`), status, Stop evidence, statistics.
3. `WorkflowSessionController`: with `transport.replayView` it renders from the view (one GET +
   the stream), answers with the view's command (`answerEvent` for event waits), opens the ledger
   stream only for live reply text. Bypassed in view mode (kept as the labeled fallback for
   gateways before 0.17.0): `ingestHistory`, `hydrateHistoricalSessionRuns`, `ingestSessionTurn`,
   `catchUpAndWatch` / `catchUp` / `followStream` per run, `ingestItem`, `foldRecord`,
   `foldStopEvidence`, `foldWorkflowTools`, `adoptDurableWait`, `resolvedWaits`,
   `interactionWith`, `updateRunState`, `upsertFinal`, `refreshRunState`, `pollRootLifecycle`
   (the 2 s poll), the ledger catch-up in `followStop`.
4. Capability gate: AbstractGateway 0.17.0 does not list the view in `discovery/capabilities`;
   the controller probes `GET /view` once per transport, falls back only on the route-missing
   answer, and labels it (`snapshot.source`, `sourceReason`, `workflowSourceLabel`).

## Validation
- `panel-chat/scripts/check_replay_view.mjs`: the 15 conformance cases appended record by record
  to a real AbstractGateway 0.17.0 (`regen_replay_view_fixtures.py`); the folded stream equals
  the bytes of `GET /view` at all 283 steps; 268/268 skipped deltas are caught at their step; a
  repeated frame is a no-op and an older one is refused (and moves the view back without the
  guard); 74 reconnect frames bring a held view to the GET; the HTTP transport's 200/304/404/
  stream paths.
- `panel-chat/scripts/check_replay_view_session.mjs`: the delegated child approval is the gate,
  answered with the view's command; the stream drives the snapshot; final shown once with
  statistics; policy-denied calls not shown as completed; event and ask_user answers; live text
  replaced by the ended call; reconnect at the last applied frame; fallback labeled, probed once,
  never on a 500; Stop "stopping" until the view shows the model call ended; no history, ledger
  pages or timed poll.
- Adversarial review (Opus, read-only): 6 findings (duplicate approval on a step id gained late; `workflowProgress` blind in view mode; a slow re-read overwriting a newer view; reconnect hot loop; per-frame run reads on >32-run trees; stale source label), all fixed with regression checks.
- Mutation check: 14 mutants of the fold, the projection, the controller and the progress helper, all red.
- Measured (2,997-record tree, AbstractGateway 0.17.0 scratch, SQLite, loopback): 3 requests /
  1.21 MB with the view vs 509 requests / 5.60 MB with the ledger fold; first render 17 ms vs
  147 ms warm (median of 5), 123 ms vs 166 ms on a fresh gateway. The 509 requests are mostly
  the fold's `GET runs/{child}` after each `resume` record.

## Hosts (2026-10-28)
| App | State | Version |
|---|---|---|
| AbstractObserver (automation discussions) | migrated: `replayView` on its transport, source label | 0.10.0 (released) |
| AbstractCode web | migrated: Activity panel reads `view.activities` (parity checked on the 15 cases), status bar from the view | web 0.13.0 (released) |
| AbstractEntity | migrated: its own run follows (`flow_lane.ts`) read the view; a waiting run is shown | 0.9.0 (released) |
| AbstractNote web | migrated: Capture/Remember read the view; mock gateway serves it | 0.3.0 (merged; release blocked by Note 0038) |
| AbstractContinuum | pin only (no own run reads; its run views are panel-chat's) | 0.7.2 (released) |
| AbstractAssistant web | migrated on PR #12 (open, ships with desktop 0.16.0) | with desktop 0.16.0 |

## Open (follow-ups and upstream gaps)
- panel-chat `docs_assistant.tsx` (`DocsAssistantDrawer`) still reads runs itself: move it to the view.
- The route-missing probe is remembered per transport, and hosts memoize the transport per page: a gateway upgraded while a tab is open stays on the ledger fold until reload. Re-probe after a while, or key the memory on the gateway.
- Upstream: AbstractRuntime backlog 0860 (how a run was stopped + `capabilities.replay_view`), 0861 (tool sandbox, per-call model timings).
- Each controller host adds `replayView: createReplayViewTransport({ fetch })` to its transport:
  AbstractCode web (first move its Activity panel from `snapshot.records` to `snapshot.view.activities`:
  view mode folds no records), AbstractObserver (automation discussions), AbstractAssistant web.
  Entity, Continuum and AbstractNote web use presentation components only; their own run reads
  (`flow_lane.ts`, `runs.ts`) move to the view in their repos.
- Delete the ledger fold from the controller once every supported gateway serves the view (the
  hosts' gateway floor is >= 0.17.0).
- Upstream (runtime/gateway): the view has no kill-switch attribution (`killed_by`), no tool
  sandbox, no per-call model timings; `discovery/capabilities` does not advertise `replay_view`.
