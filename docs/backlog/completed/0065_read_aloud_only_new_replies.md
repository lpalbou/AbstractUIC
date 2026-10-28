# 0065: Read aloud speaks only a reply generated while the conversation is open

**Status**: completed 2026-10-29 in panel-chat (unreleased; ships with the next AbstractUIC release).
**Found by**: operator, 2026-10-29: "when read aloud is on, opening or re-opening a session immediately starts
speaking the existing messages." Expected: speech starts by itself only when a NEW reply is generated while the
session is open, or when the person presses a message's speaker; never on opening, reloading or switching.

## Cause

Each host kept its own effect: "remember the newest reply when the conversation changes; speak any later one".
The newest reply was read before the conversation had loaded (empty, or the previous conversation's), so the first
reply the load brought in counted as new and was spoken (AbstractCode web `workspace/app.tsx`, Observer
`use_read_aloud`, Entity `chat_drawer.tsx`).

## Fix

`panel-chat/src/read_aloud.ts`: one pure rule, `readAloudStep(state, { scope, live, reply })` — armed only when a run
of this conversation is seen in progress; then the first reply that was not there when the run started is spoken
once. A conversation whose run is over when it is shown was never seen live: nothing is spoken. `runIsLive(status)`
maps the controller's status (loading / idle / over are not live).

## Evidence

`scripts/check_read_aloud.mjs` (A open / reload, B switch, C new reply once, D old reply never, E failed run, F
statuses); dropping the "armed" condition makes A red.

## Adoption (each host, its own PR; no kit release in this wave)

- AbstractCode web, Observer, Entity: the same rule inlined in their effect now (they pin the published kit), the
  import on the next kit release.
- AbstractAssistant desktop: its own path (a recovered run's final answer was spoken on reattach); fixed there.
