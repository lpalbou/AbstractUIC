// Execute the real hook and transport with a stalled fetch body and fake Web Audio.
// The small React dispatcher matches the other kit interaction checks; no DOM dependency.
import assert from "node:assert/strict";
import React from "react";
import { streamTtsJsonl, useGatewayVoice } from "../dist/use_gateway_voice.js";

const originalFetch = globalThis.fetch;
const originalWindow = globalThis.window;
const originalAudioContext = globalThis.AudioContext;
const requests = [];
const sources = [];
class AudioContext {
  state = "running";
  currentTime = 0;
  destination = {};
  createGain() { return { gain: {}, connect() {}, disconnect() {} }; }
  decodeAudioData() { return Promise.resolve({ duration: 1 }); }
  createBufferSource() {
    const source = { connect() {}, disconnect() {}, start() { source.started = true; }, stop() {}, onended: null };
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
  const internals = React.__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED;
  const previous = internals.ReactCurrentDispatcher.current;
  internals.ReactCurrentDispatcher.current = {
    useRef: (value) => ({ current: value }),
    useMemo: (fn) => fn(),
    useCallback: (fn) => fn,
    useState: (value) => [value, (next) => { value = typeof next === "function" ? next(value) : next; }],
    useEffect: (fn) => { const cleanup = fn(); if (cleanup) cleanups.push(cleanup); },
  };
  let voice;
  try {
    voice = useGatewayVoice({
      tts_stream: (text, signal) => streamTtsJsonl({ path: "/tts", body: { text }, signal, headers: { "x-abstract-csrf": "token" } }),
      on_error: (error) => { if (error) errors.push(error); },
    });
  } finally { internals.ReactCurrentDispatcher.current = previous; }
  return { voice, errors, unmount: () => cleanups.forEach((fn) => fn()) };
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
  send(request, audio);
  await tick();
  assert.ok(sources.at(-1).started, "playback starts before the stream finishes");
  const count = sources.length;
  await h.voice.toggle_tts("play", "Read now"); // pause
  assert.equal(request.signal.aborted, false, "pause keeps synthesis buffering");
  send(request, audio);
  await tick();
  assert.equal(sources.length, count, "new chunks cannot auto-play while paused");
  await h.voice.toggle_tts("play", "Read now"); // resume
  assert.equal(sources.length, count + 1);
  send(request, '{"type":"done"}'); // final JSONL line need not end in newline
  request.body.close();
  await bounded(pending);
  assert.deepEqual(h.errors, []);
  h.unmount();

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
  console.log("check_voice_stream: cancellation, first audio, pause/resume, EOF and error checks green");
} finally {
  globalThis.fetch = originalFetch;
  globalThis.window = originalWindow;
  globalThis.AudioContext = originalAudioContext;
}
