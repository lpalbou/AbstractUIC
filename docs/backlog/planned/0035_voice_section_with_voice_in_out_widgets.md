# Planned: the voice section with standalone voice-in / voice-out widgets

## Metadata
- Created: 2026-10-27
- Status: Planned — kit half MERGED (PR #7, 0c486cf): `AfVoiceInput`, `AfVoiceOutput`, `AfVoiceLevelMeter`/`useVoiceLevel`, `AfVoiceMicButton`, `useVoiceDefaults`, `useVoicePreferences`, voice library panel, Record tab, `mountVoiceSection`; deferred: cloning languages from the gateway in Create a voice, `tts_level` meter; app adoption PRs pending
- Completed: N/A
- Area: ui-kit (`AfVoiceInput`, `AfVoiceOutput`, `AfVoiceSection`, `AfVoiceMicButton`, `useGatewayVoice`, hooks, island)
- Root link: AbstractFramework backlog 1055 (voice library track)

## ADR status
- Governing ADRs: ADR 0001 (§4, §5, §8)
- ADR impact: §8 names the standalone widgets

## Summary
Voice IN (input device, live level, mic test, gain) and voice OUT (output device, volume, mute,
test chime) become standalone composable components adopted everywhere voice settings appear;
`AfVoiceSection` is recomposed from them and gains the props the apps forked for (row hiding,
a host-owned TTS slot, served languages, a sample preview, the voice library with
rename/delete/share, capture mode, auto-send); one mic button and two hooks replace three app
copies each.

## Why (audit `untracked/ui-primitives/audit/voice.md` §A, §C, §D, §E1)
- The level meter only moves during the Test (`af_voice_section.tsx:220`); `watchLevel` exists but the hook never
  uses it; there is no mute, no capture-mode preference; Code discards taps, Observer/Entity latch, Assistant web toggles.
- Entity's listener section always renders a TTS override the entity ignores (`entity_voice.tsx:21-22` vs
  `af_voice_section.tsx:265`); its prefs sync misses same-tab changes.
- Continuum has a 323-line local `VoiceSettingsPanel` (TTS only, default from capability-defaults not
  `voice/defaults`); Assistant web has a 125-line local voice module; Flow an inline ~200-line recorder; the
  console's defaults modal ~170 lines of voice select; Note nothing.
- Wording drift: "Hold to talk" / "Hold to dictate" / "Dictate" / "Record"; "Test voice" / "Hear a sample" / "Test";
  "Gateway default" / "Gateway default voice" / "Use provider default voice" / "Engine default voice".
- The hardcoded 10-language list (`af_voice_section.tsx:87-99`) vs 15 labels in `voice_settings.tsx:67-70`;
  the gateway serves `GET voice/languages`.

## Kit half
1. `AfVoiceOutput` (device + Safari note, volume, `reply_muted`, Test chime) and `AfVoiceInput` (device, live
   meter via `level`, mic Test, gain, show names); `AfVoiceSection` renders them; standalone render pinned.
2. `AfVoiceSection` props: `rows`, `ttsSlot`, `fetchLanguages`, `previewVoice` (Play sample), `voiceLibrary`
   (`list/rename/remove/share` over `voice/clones[/{id}]`, `voice/clones/{id}/deploy`; `createVoice` alias);
   prefs `capture_mode`, `auto_send`, `reply_muted`; Capture rows.
3. `useGatewayVoice`: `voice_ptt_level`, `reply_muted`, `capture_mode`.
4. `AfVoiceMicButton`, `useVoiceDefaults`, `useVoicePreferences` (same-tab + cross-tab).
5. `CreateVoicePanel` "From a recording": Record from the chosen mic with a live meter.
6. `mountVoiceSection`; `voiceLibrary` through `mountVoiceSettings`; voice paths in `gateway_paths.ts`.

## What the apps delete
Code mic button `voice_tools.tsx:236-424` (~190), defaults/prefs copies (~31), unused `voice_tts` (~17); Observer mic
button (~120), defaults/prefs (~52), unused `voice_tts` (~39); Entity mic button (~110), defaults/prefs (~47), the
ignored TTS row via `rows={{tts:false}}` + `ttsSlot`; Continuum `voice_settings_panel.tsx` (323), most of
`voice_settings.ts` (~125), its test (101), voice client methods (~60); Assistant web `lib/voice.ts` (125) + test,
`Workspace.tsx:274-330`, `Composer.tsx:27-52`, `client.ts:209-240` (~115); Flow inline recorder (~200);
console defaults-modal voice select (~170).

## Gateway routes relied on
`GET voice/defaults`, `GET voice/voices`, `GET voice/languages`, `GET/POST/PATCH/DELETE voice/clones[/{id}]`,
`POST voice/clones/{id}/deploy`, `POST voice/design`, `GET voice/compatibility`, `POST runs/{id}/voice/tts[/stream]`,
`POST runs/{id}/audio/transcribe`, `GET/PUT entities/{name}/voice`, `POST entities/{name}/voice/tts[/stream]`.
The voice library routes are gateway 0.16.0 (unreleased on 2026-10-27).

## Gateway gaps
No account-level voice preference (`account_preferences.py:50-60`); no run-less preview route (every TTS route needs
a run or an entity); `voice/compatibility` unconsumed; created-voice `engine` not guaranteed on POST.

## Acceptance
- [ ] `check_voice_widgets.mjs`; `check_voice_section.mjs` extended (meter during real recording, mute, rows,
      capture mode, standalone render); `check_voice_library.mjs` extended (Record tab); each confirmed red once;
      the 0.8.9 checks stay green.
- [ ] Docs: api.md (AfVoiceSection `createVoice` gap closed, new props, two widgets), adoption-guide rows.
- [ ] App adoption PRs with the deletions above (Assistant web needs the assistant seat: dirty checkout).
- [x] 0.9.1 (2026-10-27, operator): choosing a voice plays it; one play/stop toggle at the right of the voice
      select replaces **Play sample**; `previewVoice(prefs, text?, {signal})` aborts the older sample;
      `check_voice_library.mjs` 0947 checks (mutation-checked red: no abort, no stop, no play on choice).
      The console's capability editor (output.voice) adopts the picker: AbstractGateway backlog 0947.

## Non-goals
VAD / hands-free capture (iPhone, desktop `wait`/`full` modes) in this slice; server-side voice preferences.
