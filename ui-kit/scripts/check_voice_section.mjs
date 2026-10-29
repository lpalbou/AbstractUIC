#!/usr/bin/env node
/**
 * ui-kit 0.7.1 (round 6 R6.1): AfVoiceSection is truthful to the gateway.
 *
 * - "Gateway default · supertonic / supertonic-3" and "· faster-whisper /
 *   large-v3" come from the gateway's voice/defaults answer, even when the
 *   catalog's engine-side fields say "openai" (the operator's bug: Code showed
 *   "Gateway default · openai" for both).
 * - "not set" / "unknown" instead of guessing; the unset note is shown.
 * - Output: device picker + Test + reply volume; Safari states it cannot
 *   choose a speaker. Microphone: picker + Test + live meter (+ input level
 *   where Web Audio allows).
 * - Pure helpers: route text, transcribing line, error sentences.
 * Mutation-checked: reading the catalog for the summary, dropping a Test
 * button, the meter or the Safari note turns this red.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

const here = dirname(fileURLToPath(import.meta.url));
const kit = await import(join(here, "..", "dist", "index.js"));
const src = readFileSync(join(here, "..", "src", "af_voice_section.tsx"), "utf8");

let failures = 0;
let checks = 0;
function check(name, cond, detail) {
  checks += 1;
  if (cond) return;
  failures += 1;
  console.error(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`);
}

const { AfVoiceSection, voiceDefaultSummary, voiceRouteText, sttRouteText, transcribingLine, microphoneErrorSentence, voiceErrorSentence, clampVolume } = kit;
for (const [name, fn] of Object.entries({ AfVoiceSection, voiceDefaultSummary, voiceRouteText, sttRouteText, transcribingLine, microphoneErrorSentence, voiceErrorSentence, clampVolume })) {
  check(`export ${name}`, typeof fn === "function", typeof fn);
}

const ROUTES = {
  tts: { route: "output.voice", configured: true, provider: "supertonic", model: "supertonic-3", voice: "M3" },
  stt: { route: "input.voice", configured: true, provider: "faster-whisper", model: "large-v3" },
};
const OPENAI_CATALOG = { active_tts_provider: "openai", active_stt_provider: "openai", tts_providers: ["openai", "supertonic"], stt_providers: ["openai", "faster-whisper"] };

const render = (props) =>
  renderToStaticMarkup(
    React.createElement(AfVoiceSection, {
      value: {},
      onChange: () => undefined,
      fetchCatalog: async () => OPENAI_CATALOG,
      fetchDefaults: async () => ROUTES,
      outputSelectable: true,
      ...props,
    }),
  );

// --- summaries come from the gateway's routes --------------------------------
const html = render({ defaults: ROUTES });
check("tts summary = output.voice route", html.includes("Gateway default · supertonic / supertonic-3"), html.match(/Gateway default[^<]*/g)?.join(" | "));
check("stt summary = input.voice route", html.includes("Gateway default · faster-whisper / large-v3"));
check("a supertonic gateway never renders openai", !/openai/i.test(html));
check("summary never read from the catalog (source pin)", !/catalog\.active_(tts|stt)_provider/.test(src) && !/names\(catalog\.(tts|stt)_providers\)\[0\]/.test(src));
check("fetchDefaults is a required prop", /fetchDefaults: \(\) => Promise<VoiceDefaults>;/.test(src));

const unset = render({ defaults: { tts: { configured: false, note: "No gateway default is set for text to speech. An administrator sets it in the console under Defaults." }, stt: { configured: false } } });
check("unset route says not set", unset.includes("Gateway default · not set"));
check("unset note shown", unset.includes("No gateway default is set for text to speech."));

// Round 16: the gateway's served hint for a CONFIGURED route is shown verbatim, once.
const HINT = "Runs on the processor: faster-whisper has no Apple GPU backend. mlx-whisper runs large-v3 on this Mac's GPU, about 15 times faster: about 1.4 s instead of about 20 s for a 17 s clip on an M5 Max.";
const hinted = render({ defaults: { ...ROUTES, stt: { ...ROUTES.stt, hint: { code: "apple_gpu_engine", sentence: HINT, route: { key: "input.voice", provider: "mlx-whisper", model: "large-v3" } } } } });
check("served hint shown verbatim", hinted.includes('data-voice-note="hint"') && hinted.includes("mlx-whisper runs large-v3 on this Mac&#x27;s GPU"));
check("no hint, no hint line", !html.includes('data-voice-note="hint"'));
check("an unset route never shows a hint", !render({ defaults: { stt: { configured: false, hint: { sentence: HINT } } } }).includes('data-voice-note="hint"'));
check("helper: failed = unknown", voiceDefaultSummary(null, "tts", true) === "unknown");
check("helper: loading = empty", voiceDefaultSummary(null, "stt") === "");
check("helper: route text", voiceRouteText({ provider: "faster-whisper", model: "large-v3" }) === "faster-whisper / large-v3");
check("helper: stt route = override first", sttRouteText({ stt_provider: "openai", stt_model: "whisper-1" }, ROUTES) === "openai / whisper-1");
check("helper: stt route = gateway default", sttRouteText({}, ROUTES) === "faster-whisper / large-v3");
check("helper: transcribing line", transcribingLine(1000, 13_400, "faster-whisper / large-v3") === "Transcribing… 12 s · faster-whisper / large-v3", transcribingLine(1000, 13_400, "faster-whisper / large-v3"));

// --- output: picker + Test + volume; Safari says why -------------------------
check("output device picker", html.includes('aria-label="Output device"'));
check("speaker Test button", html.includes('data-action="test-speaker"'));
check("reply volume slider", /data-setting="reply-volume"[\s\S]*type="range"/.test(html));
check("volume shows 100 % by default", html.includes("100 %"));
const vol = render({ defaults: ROUTES, value: { reply_volume: 0.4 } });
check("volume value reflects the preference", vol.includes('value="40"') && vol.includes("40 %"));
const safari = render({ defaults: ROUTES, outputSelectable: false });
check("Safari: cannot choose a speaker, stated", safari.includes("Safari does not let a page choose the output device") && /aria-label="Output device"[^>]*disabled|disabled[^>]*aria-label="Output device"/.test(safari));

// --- microphone: picker + Test + live meter ----------------------------------
check("input device picker", html.includes('aria-label="Input device"'));
check("microphone Test button", html.includes('data-action="test-microphone"'));
check("live level meter", html.includes('role="meter"') && html.includes('aria-label="Microphone level"'));

// --- spoken language: sent only when named (skips detection) ----------------
check("spoken language row", html.includes('aria-label="Spoken language"'));
check("language rides on the STT request", JSON.stringify(kit.voiceSttRequest({ stt_language: "en" })) === '{"language":"en"}');
check("no language = engine detects", JSON.stringify(kit.voiceSttRequest({})) === "{}");

// --- input level: 100 % sits at the centre of the range (adversary R6 nit) ----
// (0035: the Input level row moved into AfVoiceInput, which the section renders.)
{
  const src2 = readFileSync(join(here, "..", "src", "af_voice_input.tsx"), "utf8");
  check("input level range centres 100 %", /min=\{50\}\s*max=\{150\}/.test(src2));
}

// --- sentences ----------------------------------------------------------------
check("denied → sentence", microphoneErrorSentence({ name: "NotAllowedError" }).startsWith("The browser blocked the microphone."));
check("no device → sentence", microphoneErrorSentence({ name: "NotFoundError" }) === "No microphone was found. Connect one, then try again.");
check("gone device → sentence", microphoneErrorSentence({ name: "OverconstrainedError" }).includes("not connected"));
check("busy device → sentence", microphoneErrorSentence({ name: "NotReadableError" }).includes("Another app"));
check("voice error sentence", voiceErrorSentence("Transcription failed", new Error("STT failed: No STT engine is available.")) === "Transcription failed: STT failed: No STT engine is available.");
check("volume clamp", clampVolume(undefined) === 1 && clampVolume(1.7) === 1 && clampVolume(-1) === 0 && clampVolume(0.25) === 0.25);

// --- the hook: chosen mic, short recording, empty transcript, elapsed ---------
const hook = readFileSync(join(here, "..", "src", "use_gateway_voice.ts"), "utf8");
check("hook records from the chosen microphone", hook.includes('openMicrophone(opts_ref.current.input_device_id || "")'));
check("hook applies reply volume", hook.includes("gain.gain.value = clampVolume(opts_ref.current.volume)"));
check("hook: too-short recording is a sentence", hook.includes("The recording was too short."));
check("hook: empty transcript is a sentence", hook.includes("Nothing was heard."));
check("hook: tap-to-toggle hosts can turn off the pointerup stop", hook.includes("opts_ref.current.stop_on_pointerup === false"));
check("hook exposes voice_ptt_since", /return \{[\s\S]*\n    voice_ptt_since,\n[\s\S]*\n  \};\n\}/.test(hook));
check("hook exposes subscribe_level (the live level as a subscription)", /\n    subscribe_level,\n/.test(hook));

// ===================== ui-primitives 0035: recomposed on the voice widgets =====================
const { mount, find, findAll, byAria } = await import("./voice_harness.mjs");
const { AfVoiceOutput, AfVoiceInput, VoiceSettings, VOICE_LANGUAGE_LABELS, VOICE_LANGUAGE_OPTIONS, gatewayVoiceOptions, voiceLanguagesFromAnswer } = kit;
for (const [name, fn] of Object.entries({ AfVoiceOutput, AfVoiceInput, gatewayVoiceOptions, voiceLanguagesFromAnswer })) check(`export ${name}`, typeof fn === "function", typeof fn);
{
  // The section's Output and Microphone groups ARE the two widgets.
  const levelSource = { subscribe_level: () => () => undefined };
  const h = mount(AfVoiceSection, { value: { reply_volume: 0.4, input_device: "mic-1" }, onChange: () => undefined, fetchCatalog: async () => ({}), fetchDefaults: async () => ROUTES, defaults: ROUTES, outputSelectable: true, levelSource });
  const groups = findAll(h.tree, (n) => typeof n.props.title === "string");
  const groupOf = (title) => groups.find((g) => g.props.title === title);
  const out = find(groupOf("Output"), (n) => n.type === AfVoiceOutput);
  const inp = find(groupOf("Microphone"), (n) => n.type === AfVoiceInput);
  check("0035 Output group renders AfVoiceOutput", Boolean(out));
  check("0035 Microphone group renders AfVoiceInput", Boolean(inp));
  check("0035 the section passes the live level source to AfVoiceInput", inp?.props.levelSource === levelSource);
  check("0035 the widgets get the whole preferences", out?.props.value?.input_device === "mic-1" && inp?.props.value?.reply_volume === 0.4);
  check("0035 Test plays back on the chosen speaker at the reply volume", inp?.props.playOn?.volume === 0.4);
  check("0035 the section shows no Mute unless the host honours it", out?.props.showMute === false);
  h.unmount();
  const muted = mount(AfVoiceSection, { value: {}, onChange: () => undefined, fetchCatalog: async () => ({}), fetchDefaults: async () => ROUTES, defaults: ROUTES, rows: { mute: true } });
  check("0035 rows.mute shows the Mute toggle", find(muted.tree, (n) => n.type === AfVoiceOutput)?.props.showMute === true);
  muted.unmount();
  // M2 (review 2026-10-27): a muted preference always offers Unmute, even with the row hidden.
  const mutedHtml = render({ defaults: ROUTES, value: { reply_muted: true, reply_volume: 0.5 } });
  check("M2 the section offers Unmute while muted (Mute row not opted in)", mutedHtml.includes('data-action="mute-replies"') && mutedHtml.includes(">Unmute<"));
  check("M2 the section shows no Mute while not muted (row not opted in)", !render({ defaults: ROUTES, value: { reply_volume: 0.5 } }).includes('data-action="mute-replies"'));
  const html2 = render({ defaults: ROUTES });
  check("0035 rendered markup carries both widgets", html2.includes("data-voice-output") && html2.includes("data-voice-input"));
}
{
  // Each widget renders alone: no section, no group around it.
  const out = renderToStaticMarkup(React.createElement(AfVoiceOutput, { value: { reply_volume: 0.6 }, onChange: () => undefined, outputSelectable: true }));
  check("0035 AfVoiceOutput standalone: no section around it", !out.includes("af-voice-section") && !out.includes("af-settings-group") && out.includes("data-voice-output"));
  check("0035 AfVoiceOutput standalone: device, Test, volume, Mute", out.includes('aria-label="Output device"') && out.includes('data-action="test-speaker"') && /data-setting="reply-volume"[\s\S]*type="range"/.test(out) && out.includes("60 %") && out.includes('data-action="mute-replies"'));
  const inp = renderToStaticMarkup(React.createElement(AfVoiceInput, { value: {}, onChange: () => undefined, level: 0.3 }));
  check("0035 AfVoiceInput standalone: no section around it", !inp.includes("af-voice-section") && !inp.includes("af-settings-group") && inp.includes("data-voice-input"));
  check("0035 AfVoiceInput standalone: device, Test, live meter", inp.includes('aria-label="Input device"') && inp.includes('data-action="test-microphone"') && inp.includes('role="meter"') && inp.includes('aria-valuenow="30"'));
}
{
  // rows + ttsSlot: the entity's bug (a TTS override row it ignores) has a fix.
  const noTts = render({ defaults: ROUTES, rows: { tts: false } });
  check("0035 rows.tts=false hides the Text → speech override", !noTts.includes('data-setting="tts"') && noTts.includes('data-setting="stt"'));
  const slot = render({ defaults: ROUTES, rows: { tts: false }, ttsSlot: React.createElement("div", { "data-entity-voice": "yes" }, "Entity voice") });
  check("0035 ttsSlot renders in Engines in place of the TTS row", slot.includes('data-voice-slot="tts"') && slot.includes("data-entity-voice") && !slot.includes('data-setting="tts"'));
  const slotOnly = render({ defaults: ROUTES, ttsSlot: React.createElement("span", null, "Mine") });
  check("0035 ttsSlot replaces the TTS row even without rows.tts", !slotOnly.includes('data-setting="tts"') && slotOnly.includes("Mine"));
  check("0035 rows.output=false hides Output", !render({ defaults: ROUTES, rows: { output: false } }).includes('aria-label="Output device"'));
  check("0035 rows.microphone=false hides Microphone", !render({ defaults: ROUTES, rows: { microphone: false } }).includes('aria-label="Input device"'));
  check("0035 rows.replies=false hides Replies", !render({ defaults: ROUTES, rows: { replies: false } }).includes('data-setting="read-aloud"'));
  check("0035 Engines hidden when nothing is in it", !render({ defaults: ROUTES, rows: { tts: false, stt: false } }).includes("Which engines speak and listen."));
  // Capture rows: opt-in (shown only where the host honours them), one wording.
  check("0035 capture rows are opt-in", !html.includes("Microphone button") && !html.includes("Send what you say automatically"));
  const cap = render({ defaults: ROUTES, rows: { capture: true } });
  check("0035 capture rows: Microphone button + auto-send", cap.includes("Microphone button") && cap.includes("Send what you say automatically"));
  const changes = [];
  const h = mount(AfVoiceSection, { value: { read_aloud: true }, onChange: (v) => changes.push(v), fetchCatalog: async () => ({}), fetchDefaults: async () => ROUTES, defaults: ROUTES, rows: { capture: true }, captureDefaults: { auto_send: true } });
  const mode = byAria(h.tree, "Microphone button");
  check("0035 capture wording: Hold to talk / Tap to talk", JSON.stringify(mode?.props.options.map((o) => o.label)) === JSON.stringify(["Hold to talk", "Tap to talk"]), JSON.stringify(mode?.props.options));
  check("0035 capture mode defaults to hold", mode?.props.value === "hold");
  mode.props.onChange("toggle");
  check("0035 picking Tap to talk stores capture_mode toggle (other prefs kept)", changes.at(-1)?.capture_mode === "toggle" && changes.at(-1)?.read_aloud === true, JSON.stringify(changes.at(-1)));
  const auto = find(h.tree, (n) => n.props.label === "Send what you say automatically");
  check("0035 an unset auto_send shows the host's default", auto?.props.checked === true);
  auto.props.onChange(false);
  check("0035 auto-send stores auto_send", changes.at(-1)?.auto_send === false);
  h.unmount();
}
{
  // Spoken language: the transcription engine's languages from the gateway, one label table.
  check("0035 one label table: every kit language is a Spoken language choice", Object.keys(VOICE_LANGUAGE_LABELS).every((c) => VOICE_LANGUAGE_OPTIONS.some((o) => o.value === c)) && VOICE_LANGUAGE_OPTIONS.length === Object.keys(VOICE_LANGUAGE_LABELS).length + 1);
  check("0035 Spoken language labels come from voiceLanguageLabel", VOICE_LANGUAGE_OPTIONS.find((o) => o.value === "hi")?.label === "Hindi");
  const asked = [];
  const h = mount(AfVoiceSection, { value: { stt_language: "ja" }, onChange: () => undefined, fetchCatalog: async () => ({}), fetchDefaults: async () => ROUTES, defaults: ROUTES, fetchLanguages: async (kind, provider) => (asked.push([kind, provider]), ["fr", "en"]) });
  await h.settle();
  check("0035 languages asked for the transcription engine (the gateway default's)", JSON.stringify(asked[0]) === JSON.stringify(["stt", "faster-whisper"]), JSON.stringify(asked));
  const spoken = byAria(h.tree, "Spoken language");
  check("0035 Spoken language lists the engine's languages", JSON.stringify(spoken?.props.options.map((o) => o.value)) === JSON.stringify(["", "fr", "en", "ja"]), JSON.stringify(spoken?.props.options));
  check("0035 a saved language the engine does not list stays visible", spoken?.props.options.at(-1)?.label === "Japanese (saved)");
  h.rerender({ value: { stt_provider: "mlx-whisper" } });
  await h.settle();
  check("0035 an override asks for its own engine's languages", JSON.stringify(asked.at(-1)) === JSON.stringify(["stt", "mlx-whisper"]), JSON.stringify(asked));
  h.unmount();
  const failing = mount(AfVoiceSection, { value: {}, onChange: () => undefined, fetchCatalog: async () => ({}), fetchDefaults: async () => ROUTES, defaults: ROUTES, fetchLanguages: async () => { throw new Error("404"); } });
  await failing.settle();
  check("0035 a failed language list falls back to the kit table", byAria(failing.tree, "Spoken language")?.props.options.length === VOICE_LANGUAGE_OPTIONS.length);
  failing.unmount();
  const before = VOICE_LANGUAGE_OPTIONS.length;
  const saved = render({ defaults: ROUTES, value: { stt_language: "sv" } });
  render({ defaults: ROUTES, value: { stt_language: "sv" } });
  check("0035 a saved language outside the kit table stays visible", saved.includes("sv (saved)"));
  check("0035 the kit table is never mutated by a render", VOICE_LANGUAGE_OPTIONS.length === before && !VOICE_LANGUAGE_OPTIONS.some((o) => o.value === "sv"), String(VOICE_LANGUAGE_OPTIONS.length));
  const answer = { languages: { stt: { "faster-whisper": { provider: "faster-whisper", languages: ["en", "fr", "de"], open: false, declared: true }, openai: { provider: "openai", languages: [], open: true, declared: false } }, tts: { piper: { languages: ["es"] } } } };
  check("0035 voiceLanguagesFromAnswer: one provider", JSON.stringify(voiceLanguagesFromAnswer(answer, "stt", "faster-whisper")) === '["de","en","fr"]');
  check("0035 voiceLanguagesFromAnswer: every provider of a kind", JSON.stringify(voiceLanguagesFromAnswer(answer, "tts")) === '["es"]');
  check("0035 voiceLanguagesFromAnswer: an open engine lists none", JSON.stringify(voiceLanguagesFromAnswer(answer, "stt", "openai")) === "[]" && JSON.stringify(voiceLanguagesFromAnswer({}, "stt")) === "[]");
}
{
  // previewVoice and voiceLibrary reach the voice picker; createVoice stays an alias.
  const previews = [];
  const lib = { list: async () => [], design: async () => ({ voice_id: "d" }) };
  const create = { clone: async () => ({ voice_id: "c" }) };
  const h = mount(AfVoiceSection, { value: { provider: "qwen3-tts", reply_volume: 0.5, output_device: "spk-1", input_device: "mic-1" }, onChange: () => undefined, fetchCatalog: async () => ({}), fetchDefaults: async () => ROUTES, defaults: ROUTES, outputSelectable: true, voiceLibrary: lib, createVoice: create, previewVoice: async (prefs, t) => (previews.push([prefs, t]), new ArrayBuffer(1)) });
  const vs = find(h.tree, (n) => n.type === VoiceSettings);
  check("0035 voiceLibrary wins over the createVoice alias", vs?.props.voiceLibrary === lib);
  check("0035 Play sample plays on the chosen speaker at the reply volume", vs?.props.previewOn?.deviceId === "spk-1" && vs?.props.previewOn?.volume === 0.5);
  check("0035 Create a voice records from the chosen microphone", vs?.props.recordFrom?.deviceId === "mic-1");
  await vs.props.previewVoice({ provider: "qwen3-tts", voice: "v1" });
  check("0035 previewVoice gets the whole preferences with the picked voice", previews[0]?.[0]?.voice === "v1" && previews[0][0].reply_volume === 0.5, JSON.stringify(previews[0]));
  h.rerender({ voiceLibrary: undefined });
  check("0035 createVoice alone still creates (alias)", find(h.tree, (n) => n.type === VoiceSettings)?.props.voiceLibrary === create);
  h.rerender({ previewVoice: undefined });
  check("0035 no previewVoice, no Play sample", find(h.tree, (n) => n.type === VoiceSettings)?.props.previewVoice === undefined);
  h.unmount();
}
{
  const o = gatewayVoiceOptions({ output_device: "spk-1", reply_volume: 0.3, reply_muted: true, input_device: "mic-1", input_gain: 9, capture_mode: "toggle" });
  check("0035 gatewayVoiceOptions maps every hook option", JSON.stringify(o) === JSON.stringify({ output_device_id: "spk-1", volume: 0.3, muted: true, input_device_id: "mic-1", input_gain: 1.5, capture_mode: "toggle", tts_voice: {} }), JSON.stringify(o));
  // The voice fields ride as tts_voice (the hook ties kept audio to them; operator 2026-10-29).
  const withVoice = gatewayVoiceOptions({ provider: "qwen3-tts", voice: "sisko", speed: 1.1, reply_volume: 0.5 });
  check("gatewayVoiceOptions: the speech fields become tts_voice", JSON.stringify(withVoice.tts_voice) === JSON.stringify({ provider: "qwen3-tts", voice: "sisko", speed: 1.1 }), JSON.stringify(withVoice.tts_voice));
  check("0035 gatewayVoiceOptions defaults", JSON.stringify(gatewayVoiceOptions({})) === JSON.stringify({ output_device_id: "", volume: 1, muted: false, input_device_id: "", input_gain: 1, capture_mode: "hold", tts_voice: {} }));
}

if (failures) {
  console.error(`check_voice_section: ${failures}/${checks} FAILED`);
  process.exit(1);
}
console.log(`check_voice_section: ${checks} checks green`);
