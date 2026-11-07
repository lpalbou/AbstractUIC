# Proposed: one shared module for slow per-entity reads (cards three at a time, kept)

## Metadata
- Created: 2026-11-07
- Status: Proposed
- Area: ui-kit (a new framework-free module); adopters: AbstractObserver (Board Entities strip), AbstractEntity (home grid)
- Found by: operator report 2026-11-07 ("reading the cards is extremely slow"), fixed client-side twice the same day

## Summary
Two apps read a large, slow card per entity next to a quick roster (`GET /entities/{name}/card`: 88 KB and 1-6 s
for a long life such as ephemeral, 10-20 ms for most). Both now apply the same rules, each in its own copy:
draw from the roster at once, read cards at most three at a time, keep them between refreshes, read again only after
five minutes or when the roster row's `state.changed_at` moves, never queue an item twice, keep the older value
through a failed read.

- AbstractObserver 0.12.2: `src/ui/entity_tiles.ts` (`create_entity_tiles_loader`), the rules inlined in its loader.
- AbstractEntity 0.11.2: `src/card_reads.ts` (`createCardReads`, written without any app type so it can move here
  verbatim) used by `src/roster_tiles.ts`.

Move `createCardReads` into the kit (`ui-kit/src/card_reads.ts`, exported with `CARD_READ_CONCURRENCY` and
`CARD_READ_TTL_MS`), with its tests as a kit check; then both apps import it and delete their copy.

## Why not in the same release
Entity's copy shipped with its 0.11.2 grid fix; moving it needs Observer's loader to be rewritten on top of it (a
released app) and a kit release first. One module, two adopters: a small, separate wave.

## Done when
- `createCardReads` (or its final name) is exported by ui-kit with a check that fails when the concurrency limit, the
  TTL, the version rule or the no-double-queue rule is removed (mutation-checked).
- AbstractObserver's `entity_tiles.ts` and AbstractEntity's `roster_tiles.ts` use it; `card_reads.ts` is deleted from
  Entity; their existing loader tests stay green unchanged.
- The server side stays separate: AbstractGateway backlog 1012 (a light roster card) removes the need for most of it.
