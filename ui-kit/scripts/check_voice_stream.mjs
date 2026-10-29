// Execute the real hook and transport with a stalled fetch body and fake Web Audio.
// The small React dispatcher matches the other kit interaction checks; no DOM dependency.
import assert from "node:assert/strict";
import React from "react";
import { streamTtsJsonl, ttsErrorDetail, useGatewayVoice } from "../dist/use_gateway_voice.js";

const originalFetch = globalThis.fetch;
const originalWindow = globalThis.window;
const originalAudioContext = globalThis.AudioContext;
const requests = [];
const sources = [];
class AudioContext {
  state = "running";
  get currentTime() { return AudioContext.clock || 0; }
  destination = {};
  createGain() { return { gain: {}, connect() {}, disconnect() {} }; }
  decodeAudioData() { return Promise.resolve({ duration: AudioContext.nextDuration || 1 }); }
  createBufferSource() {
    const source = { connect() {}, disconnect() {}, start(when, offset) { source.started = true; source.when = when; source.offset = offset; }, stop() { source.stopped = true; }, onended: null };
    sources.push(source);
    return source;
  }
  close() { return Promise.resolve(); }
}
globalThis.window = { AudioContext, navigator: {} };
globalThis.AudioContext = AudioContext;
globalThis.fetch = async (_url, options) => {
  let body;
  const response = new Response(new ReadableStream({ start(controller) { body = controller; } }));
  const request = { signal: options.signal, body, headers: options.headers };
  requests.push(request);
  options.signal.addEventListener("abort", () => {
    try { body.error(new DOMException("Stopped", "AbortError")); } catch { /* already terminal */ }
  }, { once: true });
  if (options.signal.aborted) body.error(new DOMException("Stopped", "AbortError"));
  return response;
};
const tick = () => new Promise((resolve) => setImmediate(resolve));
const send = (request, value) => request.body.enqueue(new TextEncoder().encode(value));
const audio = '{"type":"audio","audio_b64":"AQID"}\n';
const bounded = async (promise) => {
  let timer;
  try { return await Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error("Stalled cancellation")), 1000); })]); }
  finally { clearTimeout(timer); }
};
function mount() {
  const cleanups = [];
  const errors = [];
  const statuses = [];
  const internals = React.__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED;
  const previous = internals.ReactCurrentDispatcher.current;
  internals.ReactCurrentDispatcher.current = {
    useRef: (value) => ({ current: value }),
    useMemo: (fn) => fn(),
    useCallback: (fn) => fn,
    useState: (value) => [value, (next) => {
      value = typeof next === "function" ? next(value) : next;
      // The read-aloud state a host renders (`tts_playback`): recorded as it changes.
      if (value && typeof value === "object" && "status" in value && "key" in value) statuses.push(value.status);
    }],
    useEffect: (fn) => { const cleanup = fn(); if (cleanup) cleanups.push(cleanup); },
  };
  let voice;
  try {
    voice = useGatewayVoice({
      tts_stream: (text, signal) => streamTtsJsonl({ path: "/tts", body: { text }, signal, headers: { "x-abstract-csrf": "token" } }),
      // The voice the stream speaks with: a paused reply resumes only in the same voice.
      tts_voice: { voice: "sisko" },
      on_error: (error) => { if (error) errors.push(error); },
    });
  } finally { internals.ReactCurrentDispatcher.current = previous; }
  // The last status set (React drops an equal update; the record keeps every write).
  return { voice, errors, statuses, status: () => statuses.at(-1) || "idle", unmount: () => cleanups.forEach((fn) => fn()) };
}

try {
  for (const action of ["stop", "supersede", "unmount"]) {
    const h = mount();
    const pending = h.voice.toggle_tts("first", "Read me");
    await tick();
    const request = requests.at(-1);
    assert.equal(request.headers["x-abstract-csrf"], "token");
    let replacement;
    if (action === "stop") h.voice.stop_tts();
    if (action === "unmount") h.unmount();
    if (action === "supersede") replacement = h.voice.toggle_tts("second", "New text");
    assert.equal(request.signal.aborted, true, `${action} aborts while no audio has arrived`);
    await bounded(pending);
    if (replacement) { h.voice.stop_tts(); await bounded(replacement); }
    assert.deepEqual(h.errors, []);
  }

  const h = mount();
  const pending = h.voice.toggle_tts("play", "Read now");
  await tick();
  const request = requests.at(-1);
  // QA (h) 2026-10-28: the button spins ONLY while the first audio is generated.
  assert.equal(h.status(), "loading", "no audio yet: loading (the spinner)");
  send(request, audio);
  await tick();
  assert.ok(sources.at(-1).started, "playback starts before the stream finishes");
  assert.equal(h.status(), "playing", "audio started: playing (Pause), never a spinner while speaking");
  const count = sources.length;
  await h.voice.toggle_tts("play", "Read now"); // pause
  assert.equal(h.status(), "paused", "paused (Play)");
  assert.equal(request.signal.aborted, false, "pause keeps synthesis buffering");
  send(request, audio);
  await tick();
  assert.equal(sources.length, count, "new chunks cannot auto-play while paused");
  await h.voice.toggle_tts("play", "Read now"); // resume
  // Gapless: resume schedules every buffered segment back to back (the one paused + the one that
  // arrived while paused), not only the next one.
  assert.equal(sources.length, count + 2);
  assert.equal(h.status(), "playing", "resumed: playing (Pause)");
  send(request, '{"type":"done"}'); // final JSONL line need not end in newline
  request.body.close();
  await bounded(pending);
  assert.deepEqual(h.errors, []);
  h.unmount();

  // GAPLESS (operator 2026-10-29, "short cuts every 2-4 s"): segments that arrive in a burst are
  // scheduled back to back on the audio clock, never chained from `onended` (a chained start waits
  // for the main thread). A segment arriving after playback ran dry starts at once (a real gap).
  {
    const g = mount();
    const p = g.voice.toggle_tts("gapless", "A long reply");
    await tick();
    const req = requests.at(-1);
    const before = sources.length;
    AudioContext.nextDuration = 2.5;
    send(req, audio + audio + audio);  // a burst of three 2.5 s segments
    await tick(); await tick();
    const mine = sources.slice(before);
    assert.equal(mine.length, 3, "a burst of three segments is scheduled at once (not one per onended)");
    for (let i = 1; i < mine.length; i++) {
      assert.ok(Math.abs(mine[i].when - (mine[i - 1].when + 2.5)) < 1e-9, `segment ${i} starts exactly where segment ${i - 1} ends (${mine[i - 1].when} + 2.5 vs ${mine[i].when})`);
    }
    // Pause half a second into the second segment: resume continues from that exact offset, and
    // the rest is scheduled back to back again.
    AudioContext.clock = mine[1].when + 0.5;
    await g.voice.toggle_tts("gapless", "A long reply"); // pause
    assert.ok(mine.every((s) => s.stopped), "pause stops every scheduled segment");
    const mark = sources.length;
    await g.voice.toggle_tts("gapless", "A long reply"); // resume
    const resumed = sources.slice(mark);
    assert.equal(resumed.length, 2, "resume schedules the paused segment and the one after it");
    assert.ok(Math.abs(resumed[0].offset - 0.5) < 1e-9, `resume starts 0.5 s into the paused segment (offset ${resumed[0].offset})`);
    assert.ok(Math.abs(resumed[1].when - (resumed[0].when + 2.0)) < 1e-9, "the next segment starts exactly where the resumed one ends");
    // Playback ran dry (the clock is past everything scheduled): a late segment starts at once.
    for (const s of resumed) if (typeof s.onended === "function") s.onended();
    AudioContext.clock = resumed[1].when + 10;
    const late = sources.length;
    send(req, audio);
    await tick(); await tick();
    assert.equal(sources.length, late + 1);
    const lead = sources.at(-1).when - AudioContext.clock;
    assert.ok(lead >= 0 && lead <= 0.03, `a segment after a real gap starts now (lead ${lead}), never in the past`);
    g.voice.stop_tts();
    await bounded(p);
    AudioContext.nextDuration = 1;
    AudioContext.clock = 0;
  }
  for (const [body, expected] of [[audio, /before synthesis completed/], ['{"type":"error","error":"engine failed"}', /engine failed/], ["garbled\n", /invalid JSON/]]) {
    const stream = streamTtsJsonl({ path: "/tts", body: {} });
    const consume = (async () => { for await (const _chunk of stream) { /* drain */ } })();
    await tick();
    const request = requests.at(-1);
    send(request, body);
    request.body.close();
    await assert.rejects(consume, expected);
    assert.equal(request.signal.aborted, true);
  }
  // A failed answer: a typed `detail` object gives its message, a string `detail` is unchanged,
  // never "[object Object]" (the thin clients showed it for the gateway's typed 409).
  assert.equal(ttsErrorDetail({ detail: { reason_code: "voice_unavailable", message: "The voice sisko is not available." } }, 409), "The voice sisko is not available.");
  assert.equal(ttsErrorDetail({ detail: "engine busy" }, 503), "engine busy");
  assert.equal(ttsErrorDetail({ detail: { reason_code: "x" } }, 409), "HTTP 409");
  assert.equal(ttsErrorDetail(null, 500), "HTTP 500");
  for (const [payload, expected] of [[{ detail: { reason_code: "voice_unavailable", message: "The voice sisko is not available." } }, /^The voice sisko is not available\.$/], [{ detail: "engine busy" }, /^engine busy$/]]) {
    const saved = globalThis.fetch;
    globalThis.fetch = async () => ({ ok: false, status: 409, json: async () => payload });
    try {
      await assert.rejects((async () => { for await (const _c of streamTtsJsonl({ path: "/tts", body: {} })) { /* drain */ } })(), (e) => expected.test(e.message) && !/object Object/.test(e.message));
    } finally { globalThis.fetch = saved; }
  }
  console.log("check_voice_stream: cancellation, first audio, pause/resume, EOF and error checks green");
} finally {
  globalThis.fetch = originalFetch;
  globalThis.window = originalWindow;
  globalThis.AudioContext = originalAudioContext;
}
