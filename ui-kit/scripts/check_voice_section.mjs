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
{
  const src2 = readFileSync(join(here, "..", "src", "af_voice_section.tsx"), "utf8");
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
check("hook exposes voice_ptt_since", /voice_ptt_since,\n  };/.test(hook));

if (failures) {
  console.error(`check_voice_section: ${failures}/${checks} FAILED`);
  process.exit(1);
}
console.log(`check_voice_section: ${checks} checks green`);
