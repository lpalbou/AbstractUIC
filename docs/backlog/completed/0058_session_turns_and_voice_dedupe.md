# Completed: a reopened conversation shows every turn; the voice picker lists each voice once

## Metadata
- Created: 2026-10-28
- Status: Completed (AbstractUIC 0.8.2: panel-chat 0.6.2, ui-kit 0.9.4)
- Completed: 2026-10-28
- Area: panel-chat (`replay_view.ts` `listSessionTurns`, `WorkflowSessionController` view mode), ui-kit (`voice_settings.tsx`)
- Found by: release-closing end-to-end pass (W1, scratch AbstractGateway 0.17.0 on :18310), D1 and D4
- Root link: AbstractFramework backlog 0993 (one ledger, many views); 0040 (panel-chat renders the replay view)

## ADR status
- Governing ADRs: ADR 0001 §2 (the turn rule is the runtime's, never re-derived client-side), §7 (the transport swap must not change what the chat shows)
- ADR impact: none

## Summary
D1, release defect of panel-chat 0.6.0: in replay-view mode the controller rendered only the loaded
run's view, so a conversation of two turns or more reopened on its last turn (the ledger fold showed
every turn from the history bundle's `session.turns`). The view path now reads the same runtime
selection (`select_session_turns`, served as `session.turns` by a small `history_bundle` request)
and each earlier turn's view; finished turns are cached per conversation across loads; every gap is
labeled. D4: Qwen3-TTS lists each preset voice under each model; the picker shows it once.

## Evidence
- `panel-chat/scripts/check_replay_view_session.mjs`: two- and three-turn conversations (all turns,
  oldest first; status/interaction stay the loaded turn's; a new turn re-reads only the new run),
  an open earlier turn and an unreadable one labeled, a failed listing and a transport without the
  method labeled, the transport's request and dedupe. Mutants (no earlier load, no cache, no open
  label, no dedupe) all red.
- `ui-kit/scripts/check_voice_library.mjs` C5 (6 checks); mutants (no dedupe, model kept, no model
  filter) all red.
- Real gateway: AbstractCode web on the kit build, a 4-turn conversation on a scratch AbstractGateway
  0.17.0 reopened: 4 user turns shown (was 1). AbstractVoice 0.19.2 catalog on the E2E gateway: 90
  Qwen3-TTS entries, 9 voices doubled before, 0 duplicate options after.
- Adversarial reviews (Opus, read-only): the first found the client-side turn selection (runs listing
  + client sort) diverging from the runtime's rule, N² view re-reads per new turn, offset-paging
  duplicates and a silent drop when the loaded run was not listed: redesigned (runtime selection,
  per-conversation cache, dedupe, labels). The re-review: newer cached turns shown before an older
  loaded run, a cache shared across sign-ins, a false 200-turn note, four untested paths: fixed, each
  mutation-checked (6 more mutants red); the server-side cost of the listing is backlog 0059.
- `npm test`, `npm run build` green.
