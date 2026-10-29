# 0072 — The automation panel says everything in words: trigger, failure, event answer, times

**Status**: completed (2026-10-29, unreleased; in a PR, not done until merged, released and verified) · **Priority**: P1
· **Created**: 2026-10-29
**Cross-package**: found by the cross-app audit of "automations shown as a conversation" (Code web and the Observer
render this panel; no other app has its own automation view). They get it with the next ui-kit release.

## Why (operator, 2026-10-29)
The audit found raw text in the kit panel itself:
- the trigger as `source@version` plus its configuration as JSON under Details;
- a failure's reason code in bold;
- an event wait asking for a JSON payload;
- UTC stamps in "Needs attention" and in tooltips.

## What shipped (`ui-kit/src/automations/AutomationPanel.tsx`, `panel_core.ts`)
- **Details → Trigger:** the trigger in words only (`triggerSummary`). The exact configuration sits behind an
  "Exact configuration" disclosure (`.af-auto__exact`). Tools reads "Ask before each tool call" / "Run without
  asking", without the code in parentheses.
- **Failure:** `failureReasonWords(code)` gives "The run failed", "The run timed out", "A tool call was denied", and
  so on; an unknown code reads as words, never as `snake_case`. The message follows when it adds something. The code
  stays a `data-failure` attribute.
- **Event wait:** "What happened, in a few words". `eventPayloadFromWords` sends words as the event's `{text}`.
  Input that starts like JSON is sent as that data, or refused with a sentence when invalid. Empty input asks for
  words. `parseEventPayload` stays exported.
- **Times:** "Needs attention" reads "Run #N · today 14:13", and the run tooltips use the person's zone (`whenWords`,
  the kit's date rule). No UTC stamp is left on the panel.
- **Checks:** `check_automation_panel.mjs` (416), `check_automation_email.mjs`, `check_trigger_words.mjs`. They
  include a panel-wide "no UTC stamp" check. Mutation-checked: the old failure markup fails it.
