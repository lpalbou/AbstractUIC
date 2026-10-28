# Completed: one message footer spec (stamp with the date, permanent speaker, copy, structured stat chips)

## Metadata
- Created: 2026-10-28
- Status: Completed (AbstractUIC 0.8.4: panel-chat 0.6.4)
- Completed: 2026-10-28
- Area: panel-chat (`message_footer.ts`, `chat_message_card.tsx`, `stat_detail.tsx`, `panel_chat.css`)
- Found by: operator QA of 2026-10-28, item 2 ("we wanted both the speaker and copy icons permanent; where is the
  speaker? Show the date when the message is not from today.")
- Root link: AbstractFramework ADR 0043 (readable labels); AbstractUIC ADR 0001 (kit first, never fork)

## ADR status
- Governing ADRs: ADR 0001 §1 (one component per job; the apps adopt by pin bump), §10 / AbstractFramework ADR 0043
- ADR impact: none (a component spec, not a new rule)

## Summary
The card's meta line showed the time only (`toLocaleTimeString`), so a reply from last week read like one from this
morning; the operator's screenshots compared it with the desktop, which dates older messages. The speaker was
already always visible on the web (0.6.3) but appeared only once a reply finished and was dropped from an assistant
message without text; the "files changed" chip still used a native multi-line `title`. The spec is now written once
(`panel-chat/src/message_footer.ts`, docs/api.md "Message footer", README, adoption guide):
stamp (`formatMessageStamp`: time today, "Yesterday · 10:52 PM", "Oct 21 · 10:52 PM", "Oct 21, 2025 · 10:52 PM";
the full date on hover), speaker on every assistant message of a TTS host (disabled with its reason while streaming
or without text, never dropped), copy, and stat chips that each open the structured `StatDetailPanel`.

The missing speaker in the operator's second screenshot ("Oct 21 · 10:52 PM · copy") is the AbstractAssistant
desktop's Qt bubble (its own `_format_message_timestamp`, `app.py`); every web consumer renders the kit card and
showed the speaker on history replies (verified in AbstractCode web on a scratch gateway). The desktop worker mirrors
this spec natively; on 2026-10-28 its words differ in four places, which the desktop's owner aligns (ask addressed to
the AbstractAssistant desktop worker through the lead): "Yesterday 10:52 PM" (no separator), a zero-padded day
("Oct 01", `%d`), no year form for another year, the raw text for a malformed timestamp; and its speaker tooltip
reads "Listen to this response / Toggle voice output" where the kit says "Speak (TTS)".

## Consumers (pin bump to panel-chat ^0.6.4; none renders a local twin of the card)
- AbstractCode web, Observer, Entity, Continuum (advisor drawer on `ChatThread`), Assistant web: `ChatMessageCard`
  through `WorkflowChat` / `ChatThread`.
- AbstractNote web renders no chat message card (composer, Markdown, replay-view projection only): pin bump for
  currency, no footer.
- Continuum's Team page speaker (`team_page.tsx`, agora hub messages with reactions / reply / retract) is a different
  surface, not a chat card; it could reuse `speakButtonView` (recorded in Continuum's backlog).

## Follow-ups
- 0063 (proposed): the Docs assistant (`DocsAssistantDrawer` / panel) has no read-aloud path, so its answers carry no
  speaker even in an app with TTS; it needs a `messageProps`-style passthrough and each host's voice.

## Evidence
- `panel-chat/scripts/check_message_footer.mjs` (52 checks, in `npm test`). Mutants, each red: M1 the helper drops the
  date (12 fails), M2 the card back to `toLocaleTimeString` (4), M3 the speaker dropped while streaming / without text
  (3), M4 dropped on history messages (2), M5 the files chip back to a `title` (3), M6 dropped on questions (2), M7 the
  speaker back to a native `disabled` (3).
- AbstractCode web 0.13.2 on a scratch AbstractGateway 0.17.0 (:18921, a copied data dir with real runs from
  2026-10-28, browser clock +7 days): before "12:31 PM", after "Oct 28 · 12:31 PM", speaker and copy present, tokens
  panel structured. Screenshots `untracked/release-closing/design/footer/code-footer-{1440,390}-{before,after}-{light,dark}.png`
  and `code-tokens-tooltip-*`.
- Adversarial review (Opus, read-only, given the diff): no blocker. Fixed: (1) inside `WorkflowChat` the disabled
  speaker lost to `.pc-workflow-chat button:disabled` (0.6 opacity, not-allowed, brightened on hover): now
  `aria-disabled` (focusable, reason reachable) with its own rule, pinned; (2) the docs promised a re-derived stamp at
  midnight that nothing triggered: `useLocalDay` (one shared timer, capped at an hour); (3) the desktop differences
  listed; (4) the Docs assistant exception written into the spec; (6) epoch milliseconds and a bare date accepted,
  ISO `dateTime`; (7) doc comment moved back; (8) Windows paths split. Not changed: (9) a check crossing midnight
  between two lines (negligible).
- `npm test` (root) green.
