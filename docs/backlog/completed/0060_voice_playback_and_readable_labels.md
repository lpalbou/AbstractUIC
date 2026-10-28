# Completed: read-aloud shows a spinner only while loading; voices are named, never shown by id

## Metadata
- Created: 2026-10-28
- Status: Completed (AbstractUIC 0.8.3: panel-chat 0.6.3, ui-kit 0.9.5)
- Completed: 2026-10-28
- Area: panel-chat (`chat_message_card.tsx` speaker button, `panel_chat.css` toolbar), ui-kit (`voice_settings.tsx`, `af_voice_section.tsx`)
- Found by: operator QA of the redeployed set, 2026-10-28, items (h), (i), (k)
- Root link: AbstractFramework ADR 0043 (readable labels, never computer ids)

## ADR status
- Governing ADRs: ADR 0001 §1 (one component per job: the fix is the kit's, adopted by pin bump), §10 (readable labels, amended 2026-10-28), AbstractFramework ADR 0043
- ADR impact: ADR 0001 amended with §10 (docs-only PR)

## Summary
(h) The message toolbar (speaker, copy) was hover-only in panel-chat's CSS; AbstractCode web overrode it locally,
every other host hid it, and the playback state with it. It is always visible now; the speaker button's states are one
table (`speakButtonView`): spinner only while loading, Pause while playing, Play when paused. The kit hook already
turned `playing` on the first streamed segment (verified in AbstractCode web, Qwen3-TTS on a scratch gateway: spinner
0.2 s, Pause for the whole 38 s reply); the spinner-while-speaking report traces to the AbstractAssistant desktop's own
Qt bubble (`app.py` `_apply_voice_button_state`, `synthesizing` until the player's `on_speech_start`), owned by that app.
(i) AbstractCode's Engines row (the kit's `AfVoiceSection`) showed a cloned voice's 32-hex id: it shows the voice's name
from the catalog of the override's route; an unlisted saved voice is "Saved voice (not listed)"; the speech model list is
one row per id with its role label. The doubled Qwen3-TTS model list and the warning-styled "voice 41576236…" banner are
the AbstractAssistant desktop's (`gateway_service.py` `_model_items_from_catalog` reads `provider_models[].id` =
"qwen3-tts/<model>" beside the plain ids; `ui/settings/route_editor.py` `_route_value_summary`).
(k) A cloned voice is bound to the cloning model that made it (AbstractVoice `meta.model_id`, `_get_engine_for_voice`):
the picker says so under the selected clone.

## Follow-ups
- A Qwen3-TTS clone made before `meta.model_id` existed is spoken with the 0.6B Base (`manager.py` `_get_engine_for_voice`
  default) but the catalog serves no model for it, so the picker shows no binding line: AbstractVoice/the gateway should
  serve the resolved model (media seat); the kit does not guess it.
- An unnamed clone is stored as `voice_<first 8 hex of its id>` (AbstractVoice `store.py`): a readable-looking label
  that is part of an id (ADR 0043); AbstractVoice should name it in words ("Voice of 28 Oct, 15:12") (media seat).
- 0061 (proposed): hide or disable "Create a voice" when the gateway has no cloning / design engine; needs a served
  capability (AbstractVoice's `controls.voice_clone.supported` is a static `true`).

## Evidence
- `panel-chat/scripts/check_voice_playback.mjs` (25 checks); `ui-kit/scripts/check_voice_stream.mjs` (loading → playing
  on first audio → paused → playing); `ui-kit/scripts/check_voice_library.mjs` C6-C9. Mutants (spinner while playing,
  hover-only rule back, paused without Play, no `playing` on the first segment, no model dedupe, no clone line, id as the
  saved label, the summary without the name, the id in the summary) all red.
- Scratch AbstractGateway 0.17.0 (:18531, AbstractVoice 0.19.2, Qwen3-TTS MLX) + AbstractCode web on the kit packs
  (:18533): Engines row "qwen3-tts · Qwen/Qwen3-TTS-12Hz-1.7B-Base · Sisko" (was "· 91f02e9338dc…"), toolbar visible
  without hover (opacity 1, was 0 with the kit rule alone). Screenshots: `untracked/release-closing/aesthetic/qa/h-*`, `i-*`.
- Adversarial review (Opus, read-only): no blocker; confirmed and fixed: the Engines row kept a stale name after a rename
  (now re-read when the editor opens/closes; C9 rename, mutant red), a name request where the row is hidden (C9, mutant
  red), the id lookup ignoring the provider (C8, mutant red), the clone-line check only exercising a top-level `model`
  (C7 now also from `tags.model_id` / `params.meta.model_id`), the toolbar check missing `opacity: .0` and
  `.pc-chat-icon-btn` (mutant red). Not adopted in the kit: legacy clones and default names (follow-ups above).
- `npm test`, `npm run build` green.
