#!/usr/bin/env node
/**
 * ui-primitives 0035 (ADR 0001 §5, §8): the standalone voice composables, executed.
 *
 * - AfVoiceOutput: Mute keeps the volume; the Test chime plays on the chosen speaker (none on
 *   Safari, where the picker says why); a host's devicesKey re-reads the device list.
 * - AfVoiceInput: the meter shows the host's live level (real recording) and the Test's own level
 *   while the Test records; the Test records from the chosen microphone and plays back on the
 *   chosen speaker; "Show names" unlocks labels and tells the host; Input level merges.
 * - AfVoiceMicButton: one wording (Hold to talk / Tap to talk, Recording — release to send /
 *   Recording — tap to stop); hold sends on release and discards a tap; toggle starts and stops on
 *   two presses; the live meter while recording; a hook in the other mode is refused; onTranscript
 *   hears transcripts; unmounting while recording cancels.
 * - useVoicePreferences: same-tab and cross-tab sync, per-key, in-memory without a key.
 * - useVoiceDefaults: one fetch per key, none without a gateway, failure stated, reload.
 * - The gateway's voice routes in gateway_paths.ts.
 * Runs on the built dist with fake media APIs (scripts/voice_harness.mjs); no DOM.
 */
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { mount, find, byAria, byData, text, installFakeBrowser, sleep } from "./voice_harness.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const kit = await import(join(here, "..", "dist", "index.js"));
let failures = 0;
let checks = 0;
function check(name, cond, detail) {
  checks += 1;
  if (cond) return;
  failures += 1;
  console.error(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`);
}

const {
  AfVoiceOutput,
  AfVoiceInput,
  AfVoiceMicButton,
  AfVoiceLevelMeter,
  useVoiceLevel,
  VOICE_MIC_TEXT,
  useVoicePreferences,
  useVoiceDefaults,
  loadVoicePreferences,
  saveVoicePreferences,
  GATEWAY_VOICE_ROUTES,
  voiceClonePath,
  voiceCloneDeployPath,
  runVoiceTtsPath,
  runTranscribePath,
  entityVoicePath,
  gatewayApiPath,
} = kit;
for (const [name, fn] of Object.entries({ AfVoiceOutput, AfVoiceInput, AfVoiceMicButton, useVoicePreferences, useVoiceDefaults, loadVoicePreferences, saveVoicePreferences, voiceClonePath, runVoiceTtsPath }))
  check(`export ${name}`, typeof fn === "function", typeof fn);

const env = installFakeBrowser();
try {
  // ------------------------------------------------------------------ AfVoiceOutput
  {
    const changes = [];
    const h = mount(AfVoiceOutput, { value: { reply_volume: 0.6, read_aloud: true, output_device: "spk-1" }, onChange: (v) => changes.push(v), outputSelectable: true });
    await h.settle();
    const mute = byData(h.tree, "data-action", "mute-replies");
    check("Output: Mute toggle", Boolean(mute) && text(mute) === "Mute");
    check("L4 Mute flips its label, so it carries no aria-pressed", mute.props["aria-pressed"] === undefined);
    mute.props.onClick();
    const muted = changes.at(-1) || {};
    check("Output: Mute sets reply_muted and keeps the volume and the other preferences", muted.reply_muted === true && muted.reply_volume === 0.6 && muted.read_aloud === true, JSON.stringify(muted));
    h.rerender({ value: muted });
    check("Output: muted reads Muted, offers Unmute", text(byData(h.tree, "data-voice-volume", "muted")) === "Muted" && text(byData(h.tree, "data-action", "mute-replies")) === "Unmute");
    const range = find(h.tree, (n) => n.type === "input" && n.props.type === "range");
    check("Output: the slider still shows the kept volume", range?.props.value === 60, String(range?.props.value));
    range.props.onChange({ currentTarget: { value: "35" } });
    check("Output: moving the slider stores reply_volume", changes.at(-1)?.reply_volume === 0.35 && changes.at(-1)?.reply_muted === true);
    const devices = byAria(h.tree, "Output device");
    check("Output: speakers listed", devices?.props.options.some((o) => o.value === "spk-1" && o.label === "Desk speakers"), JSON.stringify(devices?.props.options));
    env.log.sinks.length = 0;
    byData(h.tree, "data-action", "test-speaker").props.onClick();
    await sleep(560);
    h.render();
    check("Output: the Test chime plays on the chosen speaker", env.log.sinks.includes("spk-1"), JSON.stringify(env.log.sinks));
    check("Output: the Test says the replies are muted", text(byData(h.tree, "data-voice-note", "speaker")).includes("Replies are muted"));
    const before = env.log.enumerate;
    h.rerender({ devicesKey: 1 });
    await h.settle();
    check("Output: a new devicesKey re-reads the devices", env.log.enumerate === before + 1, `${before} → ${env.log.enumerate}`);
    h.rerender({ showMute: false });
    check("M2 muted: Unmute stays even with showMute=false", text(byData(h.tree, "data-action", "mute-replies")) === "Unmute");
    h.rerender({ value: { ...muted, reply_muted: false } });
    check("Output: showMute=false hides Mute while not muted", !byData(h.tree, "data-action", "mute-replies"));
    h.unmount();
    const safari = mount(AfVoiceOutput, { value: { output_device: "spk-1" }, onChange: () => undefined, outputSelectable: false });
    await safari.settle();
    env.log.sinks.length = 0;
    byData(safari.tree, "data-action", "test-speaker").props.onClick();
    await sleep(560);
    check("Output (Safari): the picker is disabled on System default", byAria(safari.tree, "Output device")?.props.disabled === true && byAria(safari.tree, "Output device")?.props.value === "");
    check("Output (Safari): the Test uses the system output", env.log.sinks.length === 0, JSON.stringify(env.log.sinks));
    safari.unmount();
  }

  // ------------------------------------------------------------------ AfVoiceInput
  {
    const changes = [];
    let devicesChanged = 0;
    const source = { subscribe_level: () => () => undefined };
    const h = mount(AfVoiceInput, { value: { input_device: "mic-1", input_gain: 1.2, stt_language: "fr" }, onChange: (v) => changes.push(v), levelSource: source, playOn: { deviceId: "spk-1", volume: 0.5 }, onDevicesChanged: () => (devicesChanged += 1) });
    await h.settle();
    const meter = () => find(h.tree, (n) => n.type === AfVoiceLevelMeter);
    check("Input: the meter follows the host's live recording (levelSource)", meter()?.props.source === source && meter()?.props.origin === "live" && meter()?.props.level === undefined);
    h.rerender({ level: 0.42 });
    check("Input: a level the host holds wins", meter()?.props.level === 0.42);
    h.rerender({ level: undefined });
    env.amplitude = 0.15;
    env.log.getUserMedia.length = 0;
    env.log.sinks.length = 0;
    byData(h.tree, "data-action", "test-microphone").props.onClick();
    await sleep(140);
    h.render();
    check("Input: the Test records from the chosen microphone", JSON.stringify(env.log.getUserMedia[0]) === JSON.stringify({ audio: { deviceId: { exact: "mic-1" } } }), JSON.stringify(env.log.getUserMedia));
    check("Input: the meter follows the Test while it records", meter()?.props.origin === "test" && meter()?.props.source === null && meter()?.props.level > 0.5, String(meter()?.props.level));
    check("Input: Test is busy while recording", byData(h.tree, "data-action", "test-microphone")?.props.disabled === true);
    await sleep(3000);
    await h.settle(10);
    await sleep(20);
    await h.settle(10);
    check("Input: the Test plays back on the chosen speaker", env.log.sinks.includes("spk-1"), JSON.stringify(env.log.sinks));
    check("Input: the Test reports the microphone works", text(byData(h.tree, "data-voice-note", "microphone")).startsWith("The microphone works"), text(byData(h.tree, "data-voice-note", "microphone")));
    check("Input: after the Test the host re-reads its devices", devicesChanged === 1, String(devicesChanged));
    const gain = find(h.tree, (n) => n.type === "input" && n.props.type === "range");
    check("Input: Input level 50–150 % where Web Audio allows", gain?.props.min === 50 && gain?.props.max === 150 && gain?.props.value === 120);
    gain.props.onChange({ currentTarget: { value: "80" } });
    check("Input: Input level merges into the preferences", changes.at(-1)?.input_gain === 0.8 && changes.at(-1)?.stt_language === "fr", JSON.stringify(changes.at(-1)));
    byAria(h.tree, "Input device").props.onChange("");
    check("Input: picking a microphone merges", changes.at(-1)?.input_device === "" && changes.at(-1)?.input_gain === 1.2);
    h.unmount();
    // Unlabelled devices: Show names asks once, re-reads, tells the host.
    env.devices = [{ kind: "audioinput", deviceId: "mic-1", label: "" }];
    devicesChanged = 0;
    const u = mount(AfVoiceInput, { value: {}, onChange: () => undefined, onDevicesChanged: () => (devicesChanged += 1) });
    await u.settle();
    const show = byData(u.tree, "data-action", "show-device-names");
    check("Input: unlabelled devices offer Show names", Boolean(show));
    env.devices = [{ kind: "audioinput", deviceId: "mic-1", label: "Desk microphone" }];
    env.log.getUserMedia.length = 0;
    show.props.onClick();
    await u.settle(10);
    check("Input: Show names asks for the microphone once", JSON.stringify(env.log.getUserMedia) === JSON.stringify([{ audio: true }]));
    check("Input: Show names re-reads the labels and tells the host", !byData(u.tree, "data-action", "show-device-names") && devicesChanged === 1);
    u.unmount();
  }

  // ------------------------------------------------------------------ AfVoiceMicButton
  {
    const fakeVoice = (over = {}) => {
      const calls = [];
      const listeners = new Set();
      const v = {
        tts_supported: true,
        tts_playback: { key: "", status: "idle" },
        toggle_tts: async () => undefined,
        stop_tts: () => undefined,
        voice_ptt_supported: true,
        voice_ptt_recording: false,
        voice_ptt_busy: false,
        voice_ptt_since: 0,
        voice_ptt_level: 0,
        voice_capture_mode: "hold",
        start_voice_ptt_recording: async () => void calls.push("start"),
        stop_voice_ptt_recording: () => void calls.push("stop"),
        cancel_voice_ptt_recording: () => void calls.push("cancel"),
        add_transcript_listener: (fn) => (listeners.add(fn), () => listeners.delete(fn)),
        ...over,
      };
      return { v, calls, listeners };
    };
    const button = (tree) => byData(tree, "data-action", "voice-mic");
    // Hold to talk.
    {
      const { v, calls } = fakeVoice();
      const h = mount(AfVoiceMicButton, { voice: v, mode: "hold" });
      check("Mic hold: idle wording", button(h.tree)?.props["aria-label"] === "Hold to talk" && VOICE_MIC_TEXT.hold === "Hold to talk");
      button(h.tree).props.onPointerDown({ button: 0 });
      await sleep(400);
      env.dispatch("pointerup");
      check("Mic hold: press records, a release after a word sends", JSON.stringify(calls) === '["start","stop"]', JSON.stringify(calls));
      calls.length = 0;
      button(h.tree).props.onPointerDown({ button: 0 });
      await sleep(20);
      env.dispatch("pointerup");
      h.render();
      check("Mic hold: a tap is discarded (cancel, never sent)", JSON.stringify(calls) === '["start","cancel"]', JSON.stringify(calls));
      check("Mic hold: a tap teaches the hold", text(byData(h.tree, "data-voice-status", true)) === VOICE_MIC_TEXT.holdHint);
      calls.length = 0;
      button(h.tree).props.onPointerDown({ button: 0 });
      env.dispatch("blur");
      check("Mic hold: leaving the page mid-hold sends nothing", JSON.stringify(calls) === '["start","cancel"]', JSON.stringify(calls));
      calls.length = 0;
      button(h.tree).props.onKeyDown({ key: " ", repeat: false, preventDefault() {} });
      await sleep(400);
      button(h.tree).props.onKeyUp({ key: " ", preventDefault() {} });
      check("Mic hold: Space holds too", JSON.stringify(calls) === '["start","stop"]', JSON.stringify(calls));
      // Recording: wording, live meter, elapsed time.
      const recordingVoice = { ...v, voice_ptt_recording: true, voice_ptt_since: Date.now() - 3200 };
      h.rerender({ voice: recordingVoice });
      check("Mic hold: recording wording", button(h.tree)?.props["aria-label"] === "Recording — release to send" && button(h.tree)?.props["aria-pressed"] === true);
      const meter = find(h.tree, (n) => n.type === AfVoiceLevelMeter);
      check("Mic: a live meter subscribed to the hook while recording", meter?.props.source === recordingVoice);
      check("Mic: elapsed time while recording", text(byData(h.tree, "data-voice-status", true)) === "Recording… 3 s", text(byData(h.tree, "data-voice-status", true)));
      calls.length = 0;
      h.unmount();
      check("Mic: unmounting while recording cancels it", calls.includes("cancel"), JSON.stringify(calls));
      const idle = mount(AfVoiceMicButton, { voice: v, mode: "hold" });
      check("Mic: no meter when not recording", !find(idle.tree, (n) => n.type === AfVoiceLevelMeter));
      idle.rerender({ voice: { ...v, voice_ptt_busy: true, voice_ptt_since: Date.now() - 4100 }, routeText: "faster-whisper / large-v3" });
      check("Mic: transcribing line names the route", text(byData(idle.tree, "data-voice-status", true)) === "Transcribing… 4 s · faster-whisper / large-v3", text(byData(idle.tree, "data-voice-status", true)));
      check("Mic: busy disables the button", button(idle.tree)?.props.disabled === true);
      idle.unmount();
    }
    // Tap to talk.
    {
      const { v, calls } = fakeVoice({ voice_capture_mode: "toggle" });
      const h = mount(AfVoiceMicButton, { voice: v, mode: "toggle" });
      check("Mic toggle: idle wording", button(h.tree)?.props["aria-label"] === "Tap to talk");
      check("Mic toggle: a click handler, no pointer handlers", typeof button(h.tree)?.props.onClick === "function" && !button(h.tree)?.props.onPointerDown);
      button(h.tree).props.onClick();
      env.dispatch("pointerup");
      check("Mic toggle: one press starts, a release does not stop", JSON.stringify(calls) === '["start"]', JSON.stringify(calls));
      h.rerender({ voice: { ...v, voice_ptt_recording: true, voice_ptt_since: Date.now() } });
      check("Mic toggle: recording wording", button(h.tree)?.props["aria-label"] === "Recording — tap to stop");
      button(h.tree).props.onClick();
      check("Mic toggle: the next press stops", JSON.stringify(calls) === '["start","stop"]', JSON.stringify(calls));
      h.unmount();
    }
    // B2 (review 2026-10-27): never throw at render on data. An unknown stored mode is hold; a
    // hook in the other mode, or onTranscript without the hook's listener, renders a labelled
    // disabled button with the reason (and a console error for the developer).
    {
      const { v } = fakeVoice();
      const { voiceCaptureMode } = kit;
      check("B2 voiceCaptureMode normalises", typeof voiceCaptureMode === "function" && voiceCaptureMode("toggle") === "toggle" && voiceCaptureMode("hold") === "hold" && ["tap", "TOGGLE", 1, null, undefined, {}].every((x) => voiceCaptureMode(x) === "hold") && voiceCaptureMode({ capture_mode: "toggle" }) === "toggle");
      const errors = [];
      const realError = console.error;
      console.error = (...a) => {
        const line = a.join(" ");
        if (line.startsWith("  FAIL")) realError(...a);
        else errors.push(line);
      };
      try {
        for (const stored of ["tap", "TOGGLE", 1, null]) {
          let threw = "";
          let m = null;
          try {
            m = mount(AfVoiceMicButton, { voice: v, mode: stored });
          } catch (e) {
            threw = String(e?.message || e);
          }
          check(`B2 a stored mode ${JSON.stringify(stored)} never throws`, !threw, threw);
          check(`B2 a stored mode ${JSON.stringify(stored)} is hold`, m && button(m.tree)?.props["aria-label"] === "Hold to talk" && button(m.tree)?.props.disabled === false);
          m?.unmount();
        }
        let threw = "";
        let mm = null;
        try {
          mm = mount(AfVoiceMicButton, { voice: v, mode: "toggle" });
        } catch (e) {
          threw = String(e?.message || e);
        }
        check("B2 a hook in the other mode does not throw", !threw, threw);
        check("B2 a hook in the other mode: disabled, with the reason shown", mm && button(mm.tree)?.props.disabled === true && text(byData(mm.tree, "data-voice-status", true)) === VOICE_MIC_TEXT.modeMismatch && byData(mm.tree, "data-voice-mic-error", "mode"));
        check("B2 a hook in the other mode tells the developer", errors.some((e) => e.includes('capture_mode: "toggle"')), errors.join(" | "));
        mm?.unmount();
        let threw2 = "";
        let nt = null;
        try {
          nt = mount(AfVoiceMicButton, { voice: { ...v, add_transcript_listener: undefined }, mode: "hold", onTranscript: () => undefined });
        } catch (e) {
          threw2 = String(e?.message || e);
        }
        check("B2 onTranscript without the hook's listener does not throw", !threw2, threw2);
        check("B2 onTranscript without the hook's listener: disabled, reason shown, developer told", nt && button(nt.tree)?.props.disabled === true && byData(nt.tree, "data-voice-mic-error", "transcript") && errors.some((e) => e.includes("add_transcript_listener")));
        nt?.unmount();
      } finally {
        console.error = realError;
      }
      const heard = [];
      const { v: v2, listeners } = fakeVoice();
      const h = mount(AfVoiceMicButton, { voice: v2, mode: "hold", onTranscript: (t, i) => heard.push([t, i?.model]) });
      for (const fn of listeners) fn("bonjour", { text: "bonjour", model: "large-v3" });
      check("Mic: onTranscript hears the transcript", JSON.stringify(heard) === '[["bonjour","large-v3"]]', JSON.stringify(heard));
      h.unmount();
      check("Mic: unmount unsubscribes", listeners.size === 0);
      const blocked = mount(AfVoiceMicButton, { voice: { ...v, voice_ptt_supported: false }, mode: "hold" });
      check("Mic: unsupported is disabled and says why", button(blocked.tree)?.props.disabled === true && text(byData(blocked.tree, "data-voice-status", true)) === VOICE_MIC_TEXT.unavailable);
      blocked.unmount();
      const custom = mount(AfVoiceMicButton, { voice: v, mode: "hold", unavailableReason: "Open this page over https." });
      check("Mic: the host's reason is shown", text(byData(custom.tree, "data-voice-status", true)) === "Open this page over https.");
      custom.unmount();
    }
  }

  // ------------------------------------------------------------------ AfVoiceLevelMeter (M1)
  {
    const subs = new Set();
    const source = { subscribe_level: (fn) => (subs.add(fn), fn(0), () => subs.delete(fn)) };
    const m = mount(AfVoiceLevelMeter, { source });
    check("Meter: subscribes to the source", subs.size === 1 && m.tree.props.role === "meter" && m.tree.props["aria-valuenow"] === 0);
    for (const fn of subs) fn(0.35);
    m.render();
    check("Meter: moves with the source (only the meter re-renders)", m.tree.props["aria-valuenow"] === 35, String(m.tree.props["aria-valuenow"]));
    m.rerender({ level: 0.8 });
    check("Meter: a level the host holds wins, and the source is released", m.tree.props["aria-valuenow"] === 80 && subs.size === 0);
    m.rerender({ level: undefined });
    check("Meter: back to the source", subs.size === 1);
    m.unmount();
    check("Meter: unmount unsubscribes", subs.size === 0);
    const lvl = mount((p) => useVoiceLevel(p.source), { source: null });
    check("useVoiceLevel: no source = 0", lvl.tree === 0);
    lvl.unmount();
  }

  // ------------------------------------------------------------------ useVoicePreferences
  {
    env.store.clear();
    env.store.set("app.voice", JSON.stringify({ reply_volume: 0.5 }));
    check("prefs: load", loadVoicePreferences("app.voice").reply_volume === 0.5 && JSON.stringify(loadVoicePreferences("nothing")) === "{}");
    env.store.set("broken", "{not json");
    check("prefs: unreadable = {}", JSON.stringify(loadVoicePreferences("broken")) === "{}");
    const usePrefs = (p) => useVoicePreferences(p.storageKey);
    const settings = mount(usePrefs, { storageKey: "app.voice" });
    const composer = mount(usePrefs, { storageKey: "app.voice" });
    check("prefs: initial value from storage", settings.tree[0].reply_volume === 0.5);
    settings.tree[1]({ reply_volume: 0.2, reply_muted: true });
    composer.render();
    settings.render();
    check("prefs: same-tab sync (Settings → the composer)", composer.tree[0].reply_volume === 0.2 && composer.tree[0].reply_muted === true, JSON.stringify(composer.tree[0]));
    check("prefs: stored", JSON.parse(env.store.get("app.voice")).reply_muted === true);
    env.dispatch("storage", { key: "app.voice", newValue: JSON.stringify({ reply_volume: 0.9 }) });
    composer.render();
    settings.render();
    check("prefs: cross-tab sync (storage event)", composer.tree[0].reply_volume === 0.9 && settings.tree[0].reply_volume === 0.9);
    env.dispatch("storage", { key: "other", newValue: JSON.stringify({ reply_volume: 0.1 }) });
    composer.render();
    check("prefs: another key's event is ignored", composer.tree[0].reply_volume === 0.9);
    // L5: another tab cleared the storage (a storage event with key null).
    env.store.clear();
    env.dispatch("storage", { key: null, newValue: null });
    composer.render();
    check("L5 a storage clear in another tab resets the preferences", JSON.stringify(composer.tree[0]) === "{}", JSON.stringify(composer.tree[0]));
    env.store.set("app.voice:bob", JSON.stringify({ read_aloud: true }));
    composer.rerender({ storageKey: "app.voice:bob" });
    check("prefs: a new key loads its preferences", composer.tree[0].read_aloud === true && composer.tree[0].reply_volume === undefined, JSON.stringify(composer.tree[0]));
    settings.tree[1]({ reply_volume: 0.3 });
    composer.render();
    check("prefs: keys are separate", composer.tree[0].reply_volume === undefined);
    const memory = mount(usePrefs, { storageKey: null });
    const before = env.store.size;
    memory.tree[1]({ reply_volume: 0.7 });
    memory.render();
    check("prefs: no key = in memory, nothing stored", memory.tree[0].reply_volume === 0.7 && env.store.size === before);
    settings.unmount();
    composer.unmount();
    memory.unmount();
    saveVoicePreferences("app.voice", { reply_volume: 0.1 });
    check("prefs: unmounted users no longer listen (no late set)", settings.stats.lateSets === 0 && composer.stats.lateSets === 0);
  }

  // ------------------------------------------------------------------ useVoiceDefaults
  {
    let calls = 0;
    let fail = false;
    const fetchDefaults = async () => {
      calls += 1;
      if (fail) throw new Error("down");
      return { tts: { configured: true, provider: "supertonic" } };
    };
    const useDefaults = (p) => useVoiceDefaults(p.fetch, p.gateway);
    const h = mount(useDefaults, { fetch: fetchDefaults, gateway: "a" });
    await h.settle();
    check("defaults: fetched once", calls === 1 && h.tree.value?.tts?.provider === "supertonic" && h.tree.failed === false);
    h.rerender({ fetch: async () => fetchDefaults() });
    await h.settle();
    check("defaults: a new function identity does not refetch", calls === 1, String(calls));
    h.rerender({ gateway: "b" });
    await h.settle();
    check("defaults: another gateway refetches", calls === 2, String(calls));
    fail = true;
    h.tree.reload();
    h.render();
    await h.settle();
    check("defaults: a failure is stated (unknown)", calls === 3 && h.tree.failed === true && h.tree.value === null);
    h.rerender({ fetch: null });
    await h.settle();
    check("defaults: no gateway, no fetch, empty state", calls === 3 && h.tree.value === null && h.tree.failed === false);
    h.unmount();
  }

  // ------------------------------------------------------------------ gateway voice routes
  {
    check("routes: defaults/voices/languages/clones/design/compatibility", JSON.stringify(GATEWAY_VOICE_ROUTES) === JSON.stringify({ defaults: "voice/defaults", voices: "voice/voices", languages: "voice/languages", clones: "voice/clones", design: "voice/design", compatibility: "voice/compatibility" }));
    check("routes: one clone, encoded", voiceClonePath("my voice/1") === "voice/clones/my%20voice%2F1");
    check("routes: deploy", voiceCloneDeployPath("v1") === "voice/clones/v1/deploy");
    check("routes: run TTS / stream / transcribe", runVoiceTtsPath("r1") === "runs/r1/voice/tts" && runVoiceTtsPath("r1", true) === "runs/r1/voice/tts/stream" && runTranscribePath("r1") === "runs/r1/audio/transcribe");
    check("routes: entity voice", entityVoicePath("ada") === "entities/ada/voice" && entityVoicePath("ada", "tts/stream") === "entities/ada/voice/tts/stream");
    check("routes: relative through gatewayApiPath", gatewayApiPath(GATEWAY_VOICE_ROUTES.defaults) === "api/gateway/voice/defaults");
    let threw = false;
    try {
      voiceClonePath("");
    } catch {
      threw = true;
    }
    check("routes: an empty id is refused, never a collection path", threw);
  }
} finally {
  env.restore();
}

console.log(`check_voice_widgets: ${checks - failures}/${checks} passed`);
if (failures) process.exit(1);
