# Planned: the `readAloudStep` export ships, and its three consumers delete their inlined copies

## Metadata
- Created: 2026-10-29
- Status: Planned — the kit side lands with the next panel-chat release; the consumer side follows by pin bump
- Area: panel-chat (`src/read_aloud.ts`, `src/index.ts` exports, `package.json` version)
- Related: 0065 (the rule; panel-chat PR #26, merged 2026-10-29 unreleased); AbstractCode backlog 0008, AbstractEntity
  `planned/2026-10-29_adopt_panel_chat_read_aloud_export.md`, AbstractObserver backlog 0005 (the consumer-side items)

## Summary
PR #26 (0065) put the read-aloud rule in panel-chat (`src/read_aloud.ts`: `READ_ALOUD_INITIAL`, `readAloudStep`,
`readAloudPhase`, types `ReadAloudInput`, `ReadAloudPhase`, `ReadAloudReply`, `ReadAloudState`, exported from
`src/index.ts`) WITHOUT bumping `panel-chat/package.json` (still 0.6.4, the published version). Nothing is released
tonight, so the three hosts that needed the fix at once each merged a VERBATIM COPY of the file instead of importing
it — against the operator's standing rule that shared UI behaviour is reused from this kit and never re-implemented
locally (ADR 0001). The copies are dated debt, one item per host:

| Consumer | Inlined copy | Importers | Debt item | PR |
|---|---|---|---|---|
| AbstractCode web | `web/src/lib/read_aloud.ts` | `workspace/app.tsx`, `workspace/read_aloud_input.ts`, `lib/read_aloud.test.ts` | AbstractCode 0008 | #24 |
| AbstractEntity | `src/read_aloud.ts` (+ `entityReadAloudInput` adapter) | `chat_drawer.tsx`, `read_aloud.test.ts` | AbstractEntity `2026-10-29_adopt_panel_chat_read_aloud_export` | #9 |
| AbstractObserver | `src/ui/read_aloud.ts` | `observer_voice.tsx` (`use_read_aloud`), `automation_discussion.tsx`, `read_aloud.test.ts` | AbstractObserver 0005 | #8 |

## What to do
1. **Before the next panel-chat release: bump `panel-chat/package.json`** (0.6.4 -> 0.6.5 at least — a new public
   export is a feature). PR #26 added the export without the bump, so a release cut from main as-is would re-publish
   0.6.4's number with different contents. The release checklist must catch this.
2. Release panel-chat (and the AbstractUIC release that carries it); record the version here.
3. Open the three consumer items with that version: each bumps its `@abstractframework/panel-chat` pin, imports the
   rule from the kit, deletes its copy, and keeps its host adapter / hook and its tests.
4. Close this item when `grep -rn "function readAloudStep"` finds the kit file only across the three repos.

## Acceptance
- panel-chat published with `readAloudStep` at a version strictly above 0.6.4.
- The three consumer items completed; no copy of `read_aloud.ts` outside this repo.
