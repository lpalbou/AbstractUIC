#!/usr/bin/env node
// Source-level pins for useGatewayVoice's STABILITY CONTRACT (entity c2584
// P0, 2026-07-16): fresh-per-render function identities + an unconditional
// idle setState turned the textbook consumer dep-array shape into a
// synchronous commit loop (measured 105,449 commits/10s — the operator's
// page-wide "blinking"). These pins fail if either half regresses.
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const src = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "../src/use_gateway_voice.ts"), "utf8");

let n = 0;
const ok = (name) => console.log(`  ok ${++n} — ${name}`);
const fail = (msg) => {
  console.error(`check_voice_hook: FAIL — ${msg}`);
  process.exit(1);
};

// 1) Every returned function must have a stable identity (useCallback).
for (const fn of ["stop_tts", "toggle_tts", "start_voice_ptt_recording", "stop_voice_ptt_recording", "stop_tts_source", "apply_tts_playback", "apply_recording", "apply_level", "subscribe_level", "add_transcript_listener"]) {
  const re = new RegExp(`const ${fn} = useCallback`);
  if (!re.test(src)) fail(`${fn} is not wrapped in useCallback — fresh identity per render makes every dep-array consumer a loop risk`);
}
ok("all returned + helper functions are useCallback-stable");

// 2) Playback state writes must go through the shallow-equal guard: the ONLY
// raw set_tts_playback( call is the guard's own functional write.
const rawPlaybackWrites = [...src.matchAll(/set_tts_playback\(/g)].length;
if (rawPlaybackWrites !== 1) fail(`expected exactly 1 set_tts_playback( call (the guard's functional write), found ${rawPlaybackWrites} — unguarded writes schedule renders for unchanged state`);
if (!src.includes("prev.key === next.key && prev.status === next.status ? prev : next")) fail("the playback write guard (idle→idle no-op) is missing");
ok("playback writes route through the shallow-equal guard (idle stop is a no-op)");

// 3) Recording writes: same single-write-path rule.
const rawRecWrites = [...src.matchAll(/set_voice_ptt_recording\(/g)].length;
if (rawRecWrites !== 1) fail(`expected exactly 1 set_voice_ptt_recording( call (apply_recording's), found ${rawRecWrites}`);
ok("recording writes route through apply_recording");

// 4) Stable callbacks must read live state through ref twins, never render
// closures (a frozen closure over tts_playback would read stale state).
for (const marker of ["tts_playback_ref.current", "voice_ptt_recording_ref.current", "voice_ptt_supported_ref.current", "opts_ref.current.tts"]) {
  if (!src.includes(marker)) fail(`missing ref-twin read: ${marker}`);
}
ok("stable callbacks read state through ref twins");

// 5) ui-primitives 0035, executed on the real hook (fake media APIs, no DOM):
// the live level moves during a REAL recording, mute silences replies at once,
// capture_mode "toggle" never stops on a pointer release, transcripts reach listeners.
{
  // L1: a leaked level timer must fail this check, not hang `npm test`.
  setTimeout(() => {
    console.error("check_voice_hook: FAIL — timed out (a timer or stream was left running)");
    process.exit(1);
  }, 30_000).unref();
  const { mount, installFakeBrowser, sleep } = await import("./voice_harness.mjs");
  const { useGatewayVoice } = await import("../dist/use_gateway_voice.js");
  const env = installFakeBrowser();
  try {
    const transcripts = [];
    const errors = [];
    const h = mount((props) => useGatewayVoice(props), {
      transcribe: async () => ({ text: "hello there", provider: "faster-whisper", model: "large-v3" }),
      tts: async () => new ArrayBuffer(8),
      on_error: (m) => m && errors.push(m),
      input_device_id: "mic-1",
    });
    const first = h.tree;
    if (first.voice_capture_mode !== "hold") fail(`default capture mode is hold (got ${first.voice_capture_mode})`);
    // M1 (review 2026-10-27): the live level is a subscription, not hook state: only a meter
    // that subscribes re-renders, never the hook's owner (in Code: the whole workspace).
    if (typeof first.subscribe_level !== "function") fail("subscribe_level is returned");
    const levels = [];
    const unsubscribe = first.subscribe_level((v) => levels.push(v));
    if (levels.at(-1) !== 0) fail(`a new subscriber hears the current level at once (0 idle), got ${levels.at(-1)}`);
    const off = first.add_transcript_listener((t, info) => transcripts.push([t, info?.provider]));
    env.amplitude = 0.1;
    await first.start_voice_ptt_recording();
    h.render();
    if (!h.tree.voice_ptt_recording) fail("recording did not start");
    if (!env.log.windowAdd.includes("pointerup")) fail("hold mode: a pointer release must stop the recording (no window pointerup listener)");
    const setsBefore = h.stats.sets;
    env.amplitude = 0.1;
    await sleep(130);
    const live = levels.at(-1);
    if (!(live > 0.3 && live <= 1)) fail(`the level must move during a real recording (RMS 0.1 × 4 = 0.4), got ${live}`);
    env.amplitude = 0.05;
    await sleep(110);
    if (!(Math.abs(levels.at(-1) - 0.2) < 0.03)) fail(`the level follows the voice (expected ~0.2, got ${levels.at(-1)})`);
    if (h.stats.sets !== setsBefore) fail(`level ticks must not change the hook owner's state (${h.stats.sets - setsBefore} state changes in 240 ms)`);
    if (levels.some((v, i) => i && v === levels[i - 1])) fail(`an unchanged level step is not re-sent (${levels.join(",")})`);
    // Hold for more than MIN_RECORDING_MS, then stop: the transcript reaches the listener.
    await sleep(260);
    h.tree.stop_voice_ptt_recording();
    await h.settle(10);
    await sleep(5);
    await h.settle(10);
    if (levels.at(-1) !== 0) fail(`the level returns to 0 when recording stops (got ${levels.at(-1)})`);
    const reads = env.log.analyserReads;
    await sleep(120);
    if (env.log.analyserReads !== reads) fail(`L1: the level meter keeps reading after the recording stopped (${env.log.analyserReads - reads} reads)`);
    unsubscribe();
    const heardBefore = levels.length;
    await h.tree.start_voice_ptt_recording();
    await sleep(80);
    if (levels.length !== heardBefore) fail("an unsubscribed meter hears nothing");
    h.tree.cancel_voice_ptt_recording();
    if (JSON.stringify(transcripts) !== JSON.stringify([["hello there", "faster-whisper"]])) fail(`transcript listener: ${JSON.stringify(transcripts)} ${errors.join(" | ")}`);
    off();
    if (h.tree.add_transcript_listener !== first.add_transcript_listener) fail("add_transcript_listener identity changed across renders");
    // Mute: a playing reply goes silent at once; unmuting restores the kept volume.
    h.rerender({ volume: 0.4, muted: false });
    await h.tree.toggle_tts("m1", "Read me");
    await h.settle();
    const gain = env.log.gains.find((g) => g.gain.value === 0.4);
    if (!gain) fail(`reply volume 0.4 applied to the playback gain (gains: ${env.log.gains.map((g) => g.gain.value).join(",")})`);
    h.rerender({ muted: true });
    if (gain.gain.value !== 0) fail(`muted: the playback gain must be 0 at once (got ${gain.gain.value})`);
    h.rerender({ muted: false });
    if (gain.gain.value !== 0.4) fail(`unmuted: the kept volume comes back (got ${gain.gain.value})`);
    h.rerender({ muted: true });
    await h.tree.toggle_tts("m2", "Again");
    await h.settle();
    if (gain.gain.value !== 0) fail(`muted: a new reply starts silent (got ${gain.gain.value})`);
    h.unmount();

    // B1 (review 2026-10-27): a stop or cancel while the microphone is still opening (a permission
    // prompt) is honoured when the stream arrives: tracks stopped, nothing recorded.
    for (const how of ["stop", "cancel"]) {
      env.gumDelay = 80;
      const p = mount((props) => useGatewayVoice(props), { transcribe: async () => "x" });
      const started = p.tree.start_voice_ptt_recording();
      await sleep(10);
      if (how === "stop") p.tree.stop_voice_ptt_recording();
      else p.tree.cancel_voice_ptt_recording();
      await Promise.race([started, sleep(300)]);
      const stream = env.log.streams.at(-1);
      if (!stream.getTracks().every((tr) => tr.stopped)) fail(`${how} before the microphone opened: its tracks must be stopped as it arrives`);
      p.render();
      if (p.tree.voice_ptt_recording) fail(`${how} before the microphone opened: the hook must not start recording`);
      p.unmount();
      env.gumDelay = 0;
    }

    // Tap to talk: no pointerup stop while recording.
    env.log.windowAdd.length = 0;
    const t = mount((props) => useGatewayVoice(props), { transcribe: async () => "x", capture_mode: "toggle" });
    if (t.tree.voice_capture_mode !== "toggle") fail("capture_mode toggle is reported");
    await t.tree.start_voice_ptt_recording();
    t.render();
    if (!t.tree.voice_ptt_recording) fail("toggle recording did not start");
    if (env.log.windowAdd.includes("pointerup")) fail("toggle mode must not stop on a pointer release (a window pointerup listener was added)");
    env.dispatch("pointerup");
    t.render();
    if (!t.tree.voice_ptt_recording) fail("toggle mode: a pointer release stopped the recording");
    t.tree.cancel_voice_ptt_recording();
    t.unmount();
    // An explicit stop_on_pointerup wins over the mode.
    env.log.windowAdd.length = 0;
    const e = mount((props) => useGatewayVoice(props), { transcribe: async () => "x", capture_mode: "toggle", stop_on_pointerup: true });
    await e.tree.start_voice_ptt_recording();
    e.render();
    if (!env.log.windowAdd.includes("pointerup")) fail("explicit stop_on_pointerup: true wins over capture_mode");
    e.tree.cancel_voice_ptt_recording();
    e.unmount();
  } finally {
    env.restore();
  }
  ok("live level during real recording, mute, capture mode, transcript listeners (executed)");
}

console.log("check_voice_hook: 5 pins green");
await import("./check_voice_stream.mjs");
