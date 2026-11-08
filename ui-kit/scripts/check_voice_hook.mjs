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

    // Operator 2026-10-29: after a voice change, a paused message is spoken again in the NEW voice,
    // never resumed from audio synthesized in the old one. Same voice: resume, no new synthesis.
    {
      const calls = [];
      env.playMs = 5000; // a reply plays until paused (a 5 ms fake reply could end between two presses on a loaded machine)
      const v = mount((props) => useGatewayVoice(props), { tts: async (text) => (calls.push(text), new ArrayBuffer(8)), tts_voice: { provider: "qwen3-tts", voice: "sisko" } });
      const status = () => (v.render(), v.tree.tts_playback.status);
      await v.tree.toggle_tts("m1", "Read me"); await v.settle();
      await v.tree.toggle_tts("m1", "Read me"); await v.settle();
      if (status() !== "paused") fail(`a second press pauses (got ${status()})`);
      await v.tree.toggle_tts("m1", "Read me"); await v.settle();
      if (calls.length !== 1 || status() !== "playing") fail(`same voice: the paused audio resumes without a new synthesis (calls ${calls.length}, ${status()})`);
      await v.tree.toggle_tts("m1", "Read me"); await v.settle();
      v.rerender({ tts_voice: { provider: "qwen3-tts", voice: "ryan" } }); await v.settle();
      if (status() !== "idle") fail(`a voice change drops the paused audio (status ${status()})`);
      await v.tree.toggle_tts("m1", "Read me"); await v.settle();
      if (calls.length !== 2) fail(`after a voice change the message is synthesized again in the new voice (calls ${calls.length})`);
      // Same fields in another order: the same voice (no needless re-synthesis).
      await v.tree.toggle_tts("m1", "Read me"); await v.settle();
      v.rerender({ tts_voice: { voice: "ryan", provider: "qwen3-tts" } }); await v.settle();
      if (status() !== "paused") fail(`the same voice in another key order keeps the paused audio (status ${status()})`);
      v.unmount();
      // A host that names no voice: kept audio is never reused (a paused message starts over).
      const n = [];
      const u = mount((props) => useGatewayVoice(props), { tts: async (text) => (n.push(text), new ArrayBuffer(8)) });
      await u.tree.toggle_tts("m1", "Read me"); await u.settle();
      await u.tree.toggle_tts("m1", "Read me"); await u.settle();
      await u.tree.toggle_tts("m1", "Read me"); await u.settle();
      if (n.length !== 2) fail(`no voice known: a paused message is synthesized again, never resumed (calls ${n.length})`);
      u.tree.stop_tts();
      u.unmount();
      env.playMs = 5;
    }

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
  ok("live level during real recording, mute, capture mode, transcript listeners, kept audio tied to the voice (executed)");
}

// 6) Output changes (operator 2026-11-07: on Bluetooth headphones the reply AND the speaker Test
// stayed silent until the macOS output was switched away and back). WebKit mixes every context of
// the page into one output unit kept while any context lives, so the hook never keeps its reply
// player across a device change; a new player always starts synchronously inside the click that
// asked (Safari), on another sample rate than the one it replaces; at most one player per page is
// kept open, only for Read aloud (review 2026-11-08 R1, R2). Executed on the real hook.
{
  const { mount, installFakeBrowser, sleep } = await import("./voice_harness.mjs");
  const { useGatewayVoice, TTS_REOPEN_AFTER_IDLE_MS } = await import("../dist/use_gateway_voice.js");
  const { reopenAudioOutput } = await import("../dist/voice_devices.js");
  const env = installFakeBrowser();
  try {
    const errors = [];
    const tts = async () => new ArrayBuffer(8);
    const live = () => env.log.contexts.filter((c) => c.state !== "closed");
    // R2: without Read aloud the player is dropped once idle (a Play click opens a new one).
    {
      const p = mount((props) => useGatewayVoice(props), { tts });
      env.playMs = 60; // rendered while playing, then idle (as React renders each change)
      await p.tree.toggle_tts("p1", "Plain"); await p.settle();
      env.playMs = 5;
      const ctx = env.log.contexts.at(-1);
      for (let i = 0; i < 40 && (p.render(), p.tree.tts_playback.status) !== "idle"; i++) { await sleep(10); await p.settle(); }
      await p.settle();
      if (ctx.state !== "closed") fail("Read aloud off: the player is closed once the reply ended");
      p.unmount();
    }
    // The Read aloud hook (the page's one kept player).
    const v = mount((props) => useGatewayVoice(props), { tts, unlock_on_gesture: true, on_error: (m) => m && errors.push(m) });
    await v.settle();
    const status = () => (v.render(), v.tree.tts_playback.status);
    const untilIdle = async () => { for (let i = 0; i < 40 && status() !== "idle"; i++) { await sleep(10); await v.settle(); } await v.settle(); };
    // R2: a second hook asking for Read aloud keeps nothing (one gesture listener per page).
    env.log.windowAdd.length = 0;
    const docs = mount((props) => useGatewayVoice(props), { tts, unlock_on_gesture: true });
    await docs.settle();
    if (env.log.windowAdd.includes("pointerdown")) fail("a second Read aloud hook adds no gesture listener (one kept player per page)");
    docs.unmount();
    await v.tree.toggle_tts("m1", "Read me"); await v.settle();
    const first = env.log.contexts.at(-1);
    await untilIdle();
    if (first.state === "closed") fail("Read aloud on: the player stays open while idle (a reply arriving later can play)");
    // a) A device change while idle closes the player now; the next reply opens a new one.
    env.deviceChange(); await sleep(5);
    if (first.state !== "closed") fail("devicechange while idle: the reply player's context is closed");
    await v.tree.toggle_tts("m2", "Again"); await v.settle();
    const second = env.log.contexts.at(-1);
    if (second === first || second.state === "closed") fail("after a device change the next reply plays on a new context");
    if (second.sampleRate === first.sampleRate) fail(`the new player uses another sample rate than the one it replaces (${first.sampleRate} → ${second.sampleRate})`);
    await untilIdle();
    // b) A device change mid-reply never cuts it: the player is dropped once the reply ends.
    env.playMs = 80;
    await v.tree.toggle_tts("m3", "A longer reply"); await v.settle();
    if (status() !== "playing") fail(`the long reply plays (got ${status()})`);
    env.deviceChange(); await sleep(5);
    if (second.state === "closed") fail("devicechange mid-reply: the playing context is kept until the reply ends");
    await untilIdle(); await sleep(5);
    if (second.state !== "closed") fail("devicechange mid-reply: the stale context is closed once idle");
    env.playMs = 5;
    // c) A Play click on a player the browser holds back opens a new one SYNCHRONOUSLY, inside the
    // click: the new context exists and was asked to resume before toggle_tts yields (R1).
    await v.tree.toggle_tts("m4", "x"); await v.settle(); await untilIdle();
    const held = env.log.contexts.at(-1);
    held.state = "suspended";
    env.gesture = true;
    const before = env.log.contexts.length;
    const pending = v.tree.toggle_tts("m5", "y");
    const fresh = env.log.contexts.at(-1);
    env.gesture = false;
    if (env.log.contexts.length !== before + 1 || fresh === held || fresh.resumes < 1) fail(`a Play click on a held-back player opens and resumes a new one inside the click (new: ${env.log.contexts.length - before}, resumes: ${fresh.resumes})`);
    await pending; await v.settle();
    if (held.state !== "closed") fail("the held-back player is closed after the new one started");
    await untilIdle();
    // ... and so does a Play click after TTS_REOPEN_AFTER_IDLE_MS of silence. Without a click the
    // player is reused (none could start).
    if (TTS_REOPEN_AFTER_IDLE_MS !== 30_000) fail(`TTS_REOPEN_AFTER_IDLE_MS is 30 s (got ${TTS_REOPEN_AFTER_IDLE_MS})`);
    const quiet = env.log.contexts.at(-1);
    await v.tree.toggle_tts("m6", "z"); await v.settle(); await untilIdle();
    if (env.log.contexts.at(-1) !== quiet) fail("no click, no device change: the reply player is reused");
    const realNow = Date.now;
    Date.now = () => realNow() + TTS_REOPEN_AFTER_IDLE_MS + 1000;
    env.gesture = true;
    await v.tree.toggle_tts("m7", "later"); await v.settle();
    env.gesture = false;
    Date.now = realNow;
    if (quiet.state !== "closed" || env.log.contexts.at(-1) === quiet) fail("a Play click after a long silence opens a new reply player");
    await untilIdle();
    // d) Re-open audio: playback stops and a new context opens synchronously, the old one closes.
    const current = env.log.contexts.at(-1);
    const count = env.log.contexts.length;
    const reopening = reopenAudioOutput();
    if (env.log.contexts.length !== count + 1 || env.log.contexts.at(-1).resumes < 1) fail("Re-open audio opens and resumes the new player inside the click");
    await reopening; await sleep(1);
    if (current.state !== "closed") fail("Re-open audio closes the old player");
    // e) WebKit never rejects a resume it refuses: after 1.5 s the person is told, not left with a dead Play.
    const blocked = env.log.contexts.at(-1);
    blocked.state = "suspended";
    blocked.resume = () => new Promise(() => undefined);
    errors.length = 0;
    env.playMs = 5000; // a suspended context plays nothing: the fake source must not end by itself
    await v.tree.toggle_tts("m8", "blocked"); await v.settle();
    await sleep(1600);
    env.playMs = 5;
    if (!errors.includes("Audio playback is paused by the browser. Press Play to try again.")) fail(`a refused resume is said within 1.5 s (errors: ${JSON.stringify(errors)})`);
    v.tree.stop_tts(); await v.settle();
    // f) The gesture unlock: a click while idle replaces a held-back player; a fresh one is reused.
    blocked.state = "suspended";
    const n0 = env.log.contexts.length;
    env.dispatch("pointerdown");
    if (env.log.contexts.length !== n0 + 1) fail(`a click replaces a held-back player synchronously (new contexts: ${env.log.contexts.length - n0})`);
    env.dispatch("keydown"); await sleep(5);
    if (env.log.contexts.length !== n0 + 1) fail("a running, fresh player is reused on the next key press");
    // g) Read aloud off: the kept player is released, and clicks open nothing (R2).
    const kept = env.log.contexts.at(-1);
    v.rerender({ unlock_on_gesture: false }); await v.settle(); await sleep(1);
    if (kept.state !== "closed") fail("Read aloud off: the kept player is released");
    const n1 = env.log.contexts.length;
    env.dispatch("pointerdown"); await sleep(5);
    if (env.log.contexts.length !== n1) fail("Read aloud off: a click opens no player");
    if (live().length !== 0) fail(`no player left running (${live().length})`);
    // ... and the Read aloud ownership is free again for the next hook that asks.
    const next = mount((props) => useGatewayVoice(props), { tts, unlock_on_gesture: true });
    await next.settle();
    const n2 = env.log.contexts.length;
    env.dispatch("pointerdown");
    if (env.log.contexts.length !== n2 + 1) fail("after Read aloud was turned off elsewhere, the next Read aloud hook keeps the player");
    // R11 (review 2026-11-08): on a touch screen the activation is the tap's end. A touch
    // pointerdown opens nothing; touchend does; the click of the same tap keeps that new player.
    const touchPlayer = env.log.contexts.at(-1);
    touchPlayer.state = "suspended";
    await sleep(1050); // older than the one-second grace of a player still starting
    const n3 = env.log.contexts.length;
    env.dispatch("pointerdown", { pointerType: "touch" });
    if (env.log.contexts.length !== n3) fail("a touch pointerdown (no user activation on iOS) opens no player");
    env.dispatch("touchend");
    if (env.log.contexts.length !== n3 + 1) fail("touchend (the tap's activation) opens the player");
    env.log.contexts.at(-1).state = "suspended"; // still starting
    env.dispatch("click");
    if (env.log.contexts.length !== n3 + 1) fail("the click of the same tap keeps the player that is still starting");
    // R2 (review 2026-11-08): Read aloud off while a reply's speech is still loading: that reply is
    // not spoken any more and no player is left running.
    let release;
    const slow = mount((props) => useGatewayVoice(props), { tts: () => new Promise((r) => { release = r; }), unlock_on_gesture: true });
    await slow.settle();
    next.unmount(); // frees the ownership for `slow`
    slow.rerender({ unlock_on_gesture: false }); await slow.settle();
    slow.rerender({ unlock_on_gesture: true }); await slow.settle();
    env.dispatch("keydown");
    void slow.tree.toggle_tts("s1", "Still loading"); await slow.settle();
    if ((slow.render(), slow.tree.tts_playback.status) !== "loading") fail(`the slow reply is loading (got ${slow.tree.tts_playback.status})`);
    slow.rerender({ unlock_on_gesture: false }); await slow.settle(); await sleep(1);
    const sourcesBefore = env.log.sources.length;
    release(new ArrayBuffer(8)); await sleep(5); await slow.settle();
    if (env.log.sources.length !== sourcesBefore || slow.tree.tts_playback.status !== "idle") fail(`Read aloud off while loading: the reply is not spoken (sources ${env.log.sources.length - sourcesBefore}, ${slow.tree.tts_playback.status})`);
    if (live().length !== 0) fail(`Read aloud off while loading: no player left running (${live().map((c) => c.sampleRate).join(",")})`);
    slow.unmount();
    // Review 2026-11-08 (d), R15: Read aloud off while the person has a reply PAUSED: the paused
    // audio is dropped (the message is idle again, its Play speaks it anew) and its player closes.
    let syntheses = 0;
    const pausedHook = mount((props) => useGatewayVoice(props), { tts: async () => (syntheses += 1, new ArrayBuffer(8)), unlock_on_gesture: true, tts_voice: { voice: "v" } });
    await pausedHook.settle();
    env.playMs = 5000;
    await pausedHook.tree.toggle_tts("h1", "Pause me"); await pausedHook.settle();
    await pausedHook.tree.toggle_tts("h1", "Pause me"); await pausedHook.settle();
    env.playMs = 5;
    if ((pausedHook.render(), pausedHook.tree.tts_playback.status) !== "paused") fail(`the reply is paused (got ${pausedHook.tree.tts_playback.status})`);
    pausedHook.rerender({ unlock_on_gesture: false }); await pausedHook.settle(); await sleep(1);
    if (live().length !== 0) fail(`Read aloud off with a paused reply: its player is closed (${live().length} running)`);
    if ((pausedHook.render(), pausedHook.tree.tts_playback.status) !== "idle") fail(`Read aloud off with a paused reply: the paused audio is dropped, the message idle (got ${pausedHook.tree.tts_playback.status})`);
    const spoken = syntheses;
    await pausedHook.tree.toggle_tts("h1", "Pause me"); await pausedHook.settle();
    if (syntheses !== spoken + 1) fail(`after Read aloud off, Play on the paused message speaks it anew (syntheses ${spoken} → ${syntheses})`);
    pausedHook.tree.stop_tts();
    pausedHook.unmount();
    v.unmount();
  } finally {
    env.restore();
  }
  ok("output changes: devicechange (idle now, busy once idle), synchronous new player in the click on another rate, Re-open audio, refused resume said, one kept player per page only with Read aloud (executed)");
}

console.log("check_voice_hook: 6 pins green");
await import("./check_voice_stream.mjs");
