/*
 * useGatewayVoice — shared voice hook (TTS playback + push-to-talk capture).
 *
 * Absorbed 2026-07-13 from the observer/continuum byte-similar copies
 * (continuum's absorb ask, commons c1073/c1126) BEFORE their first divergent
 * fix. The one deliberate contract change from those copies: the two gateway
 * calls arrive as INJECTED async functions —
 *
 *   tts:        (text) => Promise<ArrayBuffer>   // synthesized audio bytes
 *   transcribe: (blob, mime) => Promise<string>  // recognized text
 *
 * — which kills the app-local GatewayClient type import and keeps the kit
 * transport-free (apps own upload/artifact plumbing; observer/continuum wrap
 * their clients in two small closures). Return shape is kept verbatim from
 * the shipped copies so adoption is an import swap.
 *
 * Feature-detection semantics (not #FALLBACK): tts_supported /
 * voice_ptt_supported are false when the browser lacks WebAudio/MediaRecorder
 * OR when the consumer did not inject the corresponding function — absence of
 * capability, consumers hide the buttons.
 *
 * Internals preserved from the shipped copies: WebAudio pause/resume via
 * offset bookkeeping, callback-style decodeAudioData fallback (Safari), PTT
 * mime negotiation (webm/opus → mp4 → ogg), stale-response guards keyed on
 * the loading key, global pointerup stop while recording, idempotent stop,
 * full unmount cleanup.
 *
 * STABILITY CONTRACT (entity c2584 P0, 2026-07-16): every returned function
 * has a STABLE identity (useCallback([]), state read through ref twins) and
 * every state write goes through a shallow-equal guard — an idle stop_tts()
 * is a true no-op. Before this, fresh-per-render identities plus an
 * unconditional idle setState turned the textbook consumer shape
 * `useEffect(() => { if (!x) stop_tts(); }, [x, stop_tts])` into a
 * synchronous commit loop (measured: 105,449 commits/10s — the operator's
 * page-wide "blinking"). Dep-array consumers must stay safe by construction.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { insecureContextReason } from "./random_id.js";
import { clampVolume, inputGainSupported, microphoneErrorSentence, openMicrophone, watchLevel } from "./voice_devices.js";

export type TtsPlaybackStatus = "idle" | "loading" | "playing" | "paused";

export type GatewayVoiceOptions = {
  /**
   * Speaker to play on (a `MediaDeviceInfo.deviceId` of kind "audiooutput";
   * "" = the system default). Applied with `AudioContext.setSinkId` where the
   * browser supports it (`audioOutputSelectable()`); ignored elsewhere.
   */
  output_device_id?: string;
  /** Reply volume 0..1 (absent = 1), applied to every spoken reply. */
  volume?: number;
  /**
   * Replies muted (the `reply_muted` preference): playback gain 0, the volume kept for when the
   * mute is lifted. Applied at once, also to a reply that is playing.
   */
  muted?: boolean;
  /**
   * Microphone to record from (a `MediaDeviceInfo.deviceId` of kind
   * "audioinput"; "" = the system default). A saved device that is gone fails
   * with a sentence — the hook never records from another microphone silently.
   */
  input_device_id?: string;
  /** Input gain applied to recordings (1 = unchanged; needs Web Audio). */
  input_gain?: number;
  /**
   * Stop recording on any pointer release in the window (default true: the
   * hold-to-talk shape). A host with tap-to-start/tap-to-stop sets false and
   * stops recording itself.
   */
  stop_on_pointerup?: boolean;
  /**
   * How the microphone button records (the `capture_mode` preference): "hold" (default) = hold to
   * talk, a release anywhere stops; "toggle" = tap to start, tap again to stop (no pointerup
   * stop). An explicit `stop_on_pointerup` wins. `AfVoiceMicButton` refuses a different mode.
   */
  capture_mode?: VoiceCaptureMode;
  /** Synthesize text to audio bytes (absent = TTS unsupported). */
  tts?: (text: string) => Promise<ArrayBuffer>;
  /**
   * Streaming synthesis (operator item 3, 2026-07-13): yields decodable audio
   * segments (each a complete WAV — the gateway's tts/stream JSONL events
   * carry standalone wav-segments) as synthesis progresses. When present it
   * is PREFERRED over `tts`: long messages start speaking on the first
   * segment instead of waiting for full synthesis. `streamTtsJsonl` is the
   * ready-made transport for the gateway endpoint.
   */
  tts_stream?: (text: string, signal?: AbortSignal) => AsyncIterable<ArrayBuffer>;
  /**
   * The voice `tts` / `tts_stream` speak with: the request's speech fields (`voiceTtsRequest(prefs)`:
   * provider, model, voice, profile, speed, ...; `gatewayVoiceOptions(prefs)` passes it). The audio
   * the hook keeps for a message (to resume a paused one) is tied to (message, text, this voice):
   * after a voice change the message is spoken again in the new voice, never resumed in the old one
   * (operator, 2026-10-29). Absent: kept audio is never reused (a paused message starts over).
   */
  tts_voice?: Record<string, unknown> | string | null;
  /**
   * Transcribe a recorded blob (absent = PTT unsupported). Returns the text,
   * or the text with the route that ran (shown beside the transcript).
   */
  transcribe?: (blob: Blob, mime: string) => Promise<string | VoiceTranscription>;
  on_error?: (message: string) => void;
  on_transcript?: (text: string, info?: VoiceTranscription) => void;
};

/** The microphone button's way of recording: hold to talk, or tap to talk (tap again to stop). */
export type VoiceCaptureMode = "hold" | "toggle";

/**
 * The ONE reading of a capture mode (a stored preference, a prop, the preferences object):
 * "toggle" only when it is exactly "toggle", "hold" for anything else (absent, stale, foreign,
 * corrupt). The hook, `gatewayVoiceOptions` and `AfVoiceMicButton` all read it this way, so a
 * stored value can never make them disagree.
 */
export function voiceCaptureMode(value: unknown): VoiceCaptureMode {
  const v = value && typeof value === "object" ? (value as { capture_mode?: unknown }).capture_mode : value;
  return v === "toggle" ? "toggle" : "hold";
}

/**
 * A stable key for a TTS voice (`GatewayVoiceOptions.tts_voice`): the same fields in any order give
 * the same key; absent gives "" (no voice known).
 */
export function ttsVoiceKey(voice: GatewayVoiceOptions["tts_voice"]): string {
  if (voice === undefined || voice === null) return "";
  if (typeof voice === "string") return `s:${voice}`;
  const keys = Object.keys(voice).filter((k) => voice[k] !== undefined && voice[k] !== null && voice[k] !== "").sort();
  return `o:${JSON.stringify(keys.map((k) => [k, voice[k]]))}`;
}

/** A transcription result with the route that ran (`provider`/`model` from the gateway response). */
export type VoiceTranscription = { text: string; provider?: string | null; model?: string | null };

/**
 * Transport helper for the gateway streaming TTS endpoint
 * (`POST /api/gateway/runs/{run_id}/voice/tts/stream`, JSON-Lines): parses
 * events, decodes `audio_b64` wav-segments, ends on the terminal
 * done/cancelled event, throws on error events. Aborts the HTTP request when
 * the consumer stops iterating (pause keeps the stream; stop kills it).
 */
export async function* streamTtsJsonl(opts: {
  path: string;
  body: Record<string, unknown>;
  /** CSRF twin for the app-origin proxy (mutating POST). */
  csrfToken?: string;
  /** Extra headers — the direct-bearer posture passes Authorization here (entity c1242). */
  headers?: Record<string, string>;
  /** Abort immediately on stop or owner changes, even before the first segment. */
  signal?: AbortSignal;
}): AsyncGenerator<ArrayBuffer> {
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (opts.signal?.aborted) abort();
  else opts.signal?.addEventListener("abort", abort, { once: true });
  try {
    const res = await fetch(opts.path, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(opts.csrfToken ? { "x-abstract-csrf": opts.csrfToken } : {}),
        ...(opts.headers || {}),
      },
      body: JSON.stringify(opts.body),
      signal: controller.signal,
    });
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      throw new Error(ttsErrorDetail(data, res.status));
    }
    if (!res.body) throw new Error("TTS stream has no body");
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = "";
    for (;;) {
      const { done, value } = await reader.read();
      buf += done ? decoder.decode() : decoder.decode(value, { stream: true });
      if (done && buf.trim()) buf += "\n";
      let nl: number;
      while ((nl = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (!line) continue;
        let evt: any = null;
        try {
          evt = JSON.parse(line);
        } catch {
          throw new Error("TTS stream returned invalid JSON.");
        }
        if (evt && evt.type === "error") throw new Error(String(evt.error || "TTS stream error"));
        const b64 = evt && typeof evt.audio_b64 === "string" ? evt.audio_b64 : "";
        if (b64) {
          const bin = atob(b64);
          const bytes = new Uint8Array(bin.length);
          for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
          yield bytes.buffer;
        }
        if (evt && (evt.type === "done" || evt.type === "cancelled")) return;
      }
      if (done) throw new Error("TTS stream ended before synthesis completed.");
    }
  } finally {
    opts.signal?.removeEventListener("abort", abort);
    controller.abort();
  }
}

export type GatewayVoice = {
  tts_supported: boolean;
  tts_playback: { key: string; status: TtsPlaybackStatus };
  toggle_tts: (msg_key: string, text: string) => Promise<void>;
  stop_tts: () => void;
  voice_ptt_supported: boolean;
  voice_ptt_recording: boolean;
  voice_ptt_busy: boolean;
  start_voice_ptt_recording: () => Promise<void>;
  stop_voice_ptt_recording: () => void;
  /** Discard recording / pending permission / transcription on owner changes. */
  cancel_voice_ptt_recording?: () => void;
  /** When the current recording or transcription began (ms epoch; 0 = idle) — for "Transcribing… 12 s". */
  voice_ptt_since: number;
  /**
   * Hear the live microphone level 0..1 while recording (0 otherwise; called at once with the
   * current level, then on each 5 % step). A subscription, not state: only the meter that
   * subscribes re-renders (`useVoiceLevel`, `AfVoiceLevelMeter`), never the hook's owner.
   * Returns the unsubscribe function. Stable identity.
   */
  subscribe_level?: (fn: (level: number) => void) => () => void;
  /** The capture mode this hook was created with ("hold" unless `capture_mode: "toggle"`). */
  voice_capture_mode?: VoiceCaptureMode;
  /**
   * Hear every transcript this hook delivers (besides `on_transcript`); returns the unsubscribe
   * function. Stable identity. `AfVoiceMicButton`'s `onTranscript` uses it.
   */
  add_transcript_listener?: (fn: (text: string, info?: VoiceTranscription) => void) => () => void;
};

/**
 * The words of a failed TTS answer: `detail` as a string, or a typed answer's `detail.message`
 * (`{reason_code, message, ...}`), never "[object Object]"; `HTTP <status>` when there is neither.
 */
export function ttsErrorDetail(data: unknown, status: number): string {
  const detail = data && typeof data === "object" ? (data as { detail?: unknown }).detail : undefined;
  if (detail && typeof detail === "object") {
    const message = (detail as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) return message.trim();
    return `HTTP ${status}`;
  }
  if (detail !== undefined && detail !== null && String(detail).trim()) return String(detail);
  return `HTTP ${status}`;
}

/** "Prefix: detail." — every voice failure reaches the user as one sentence. */
export function voiceErrorSentence(prefix: string, e: unknown): string {
  const detail = String((e as any)?.message || e || "").trim().replace(/\.$/, "");
  return detail ? `${prefix}: ${detail}.` : `${prefix}.`;
}

/** A recording shorter than this carries no speech: say so instead of sending it. */
export const MIN_RECORDING_MS = 350;

function supportsMediaRecorder(): boolean {
  if (typeof window === "undefined") return false;
  const nav: any = navigator as any;
  return Boolean(nav?.mediaDevices?.getUserMedia) && typeof (window as any).MediaRecorder === "function";
}

function supportsTtsWebAudio(): boolean {
  if (typeof window === "undefined") return false;
  const w: any = window as any;
  return Boolean(w?.AudioContext || w?.webkitAudioContext);
}

function chooseVoiceMime(): string {
  const MR: any = (window as any).MediaRecorder;
  const isSupported = (t: string) => {
    try {
      return Boolean(MR?.isTypeSupported?.(t));
    } catch {
      return false;
    }
  };
  const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus", "audio/ogg"];
  for (const c of candidates) if (isSupported(c)) return c;
  return "";
}

async function decodeAudio(ctx: AudioContext, buf: ArrayBuffer): Promise<AudioBuffer> {
  const copy = buf.slice(0);
  const fn: any = (ctx as any).decodeAudioData?.bind(ctx);
  if (typeof fn !== "function") throw new Error("decodeAudioData not available");
  try {
    const maybe = fn(copy);
    if (maybe && typeof maybe.then === "function") return await maybe;
  } catch {
    // fall back to callback-style below (Safari)
  }
  return await new Promise<AudioBuffer>((resolve, reject) => {
    try {
      fn(copy, resolve, reject);
    } catch (e) {
      reject(e);
    }
  });
}

/**
 * Extract the WAV prelude (everything up to and including the `data` chunk
 * header) from a complete WAV buffer. Returns null when the buffer is not a
 * parseable RIFF/WAVE. Used by the streaming decoder: some TTS backends emit
 * a RIFF header only on the FIRST segment and raw sample continuation bytes
 * after (gateway c1224 caveat), which decodeAudioData refuses — re-wrapping
 * raw segments in the first segment's prelude (with patched sizes) makes
 * them decodable.
 */
function wavPrelude(buf: ArrayBuffer): Uint8Array | null {
  const bytes = new Uint8Array(buf);
  if (bytes.length < 44) return null;
  const tag = (off: number) => String.fromCharCode(bytes[off], bytes[off + 1], bytes[off + 2], bytes[off + 3]);
  if (tag(0) !== "RIFF" || tag(8) !== "WAVE") return null;
  const view = new DataView(buf);
  let off = 12;
  while (off + 8 <= bytes.length) {
    const id = tag(off);
    const size = view.getUint32(off + 4, true);
    if (id === "data") return bytes.slice(0, off + 8);
    off += 8 + size + (size % 2);
  }
  return null;
}

/** Wrap raw sample bytes in a WAV prelude, patching the RIFF + data sizes. */
function wrapWavSegment(prelude: Uint8Array, raw: ArrayBuffer): ArrayBuffer {
  const rawBytes = new Uint8Array(raw);
  const out = new Uint8Array(prelude.length + rawBytes.length);
  out.set(prelude, 0);
  out.set(rawBytes, prelude.length);
  const view = new DataView(out.buffer);
  view.setUint32(4, out.length - 8, true); // RIFF chunk size
  view.setUint32(prelude.length - 4, rawBytes.length, true); // data chunk size
  return out.buffer;
}

/** The browser can route Web Audio to a chosen speaker (`AudioContext.setSinkId`). */
export function audioOutputSelectable(): boolean {
  const w: any = globalThis as any;
  const Ctx = w?.AudioContext;
  return Boolean(Ctx && Ctx.prototype && typeof Ctx.prototype.setSinkId === "function");
}

const applied_sinks = new WeakMap<object, string>();
function apply_sink(ctx: AudioContext, device: string): void {
  const anyCtx = ctx as any;
  if (typeof anyCtx.setSinkId !== "function" || applied_sinks.get(ctx) === device) return;
  applied_sinks.set(ctx, device);
  try {
    void Promise.resolve(anyCtx.setSinkId(device)).catch(() => applied_sinks.delete(ctx));
  } catch {
    applied_sinks.delete(ctx);
  }
}

export function useGatewayVoice(opts: GatewayVoiceOptions): GatewayVoice {
  // Callbacks fire from async work started renders ago (recorder onstop,
  // stream loops) — read them through a ref so they are never stale
  // (adversary find 2026-07-13: on_transcript captured at recorder-start).
  const opts_ref = useRef(opts);
  opts_ref.current = opts;
  const set_error = (msg: string) => opts_ref.current.on_error?.(msg);

  const tts_supported = useMemo(
    () => supportsTtsWebAudio() && (typeof opts.tts === "function" || typeof opts.tts_stream === "function"),
    [opts.tts, opts.tts_stream]
  );
  const voice_ptt_supported = useMemo(
    () => supportsMediaRecorder() && typeof opts.transcribe === "function",
    [opts.transcribe]
  );

  const [tts_playback, set_tts_playback] = useState<{ key: string; status: TtsPlaybackStatus }>({ key: "", status: "idle" });
  // Ref twin (read from the stable callbacks) + shallow-equal write guard:
  // idle→idle (any unchanged pair) must NOT schedule a render — the
  // unconditional `{key:"",status:"idle"}` write was half of the c2584
  // commit loop (a new object every call defeats React's Object.is bail).
  const tts_playback_ref = useRef(tts_playback);
  const apply_tts_playback = useCallback((next: { key: string; status: TtsPlaybackStatus }) => {
    tts_playback_ref.current = next;
    set_tts_playback((prev) => (prev.key === next.key && prev.status === next.status ? prev : next));
  }, []);
  const tts_key_ref = useRef<string>("");
  const tts_loading_key_ref = useRef<string>("");
  const tts_ctx_ref = useRef<AudioContext | null>(null);
  const tts_gain_ref = useRef<GainNode | null>(null);
  const tts_source_ref = useRef<AudioBufferSourceNode | null>(null);
  const tts_buffer_ref = useRef<AudioBuffer | null>(null);
  const tts_offset_ref = useRef<number>(0);
  const tts_started_at_ref = useRef<number>(0);
  // Streaming state: decoded segments play in sequence; the fetch loop keeps
  // buffering ahead regardless of pause. `gen` invalidates a superseded or
  // stopped stream (the async iteration checks it after every await).
  const tts_stream_gen_ref = useRef(0);
  const tts_stream_abort_ref = useRef<AbortController | null>(null);
  const tts_segments_ref = useRef<AudioBuffer[]>([]);
  const tts_seg_idx_ref = useRef(0);
  // GAPLESS STREAMING (operator 2026-10-29: "short cuts every 2-4 s"): every buffered segment is
  // scheduled AHEAD on the audio clock (`source.start(when)`, each starting exactly where the
  // previous one ends), never chained from the previous `onended`. A chained start waits for the
  // main thread (JSON, base64, decodeAudioData of a burst of segments) and is heard as a cut.
  // `idx`: the segment; `at`: its start on the audio clock; `off`: the offset it starts from;
  // `dur`: the seconds it plays. Playing = this list is not empty.
  const tts_sched_ref = useRef<Array<{ src: AudioBufferSourceNode; idx: number; at: number; off: number; dur: number }>>([]);
  const tts_stream_done_ref = useRef(true);
  const tts_paused_ref = useRef(false);
  // WHAT the kept audio (paused buffer or stream segments) says and in which voice: message key,
  // text and the voice key at synthesis time. A paused message resumes only when all three still
  // match; "" = nothing reusable (no voice known, or nothing kept).
  const tts_audio_id_ref = useRef<string>("");
  const tts_audio_id = (key: string, text: string): string => {
    const voice = ttsVoiceKey(opts_ref.current.tts_voice);
    return voice ? `${key}\u0001${text}\u0001${voice}` : "";
  };

  const ensure_tts_webaudio = (): { ctx: AudioContext; gain: GainNode } | null => {
    try {
      const w: any = globalThis as any;
      const Ctx = w?.AudioContext || w?.webkitAudioContext;
      if (!Ctx) return null;
      if (!tts_ctx_ref.current) {
        const ctx: AudioContext = new Ctx();
        const gain = ctx.createGain();
        gain.gain.value = 1;
        gain.connect(ctx.destination);
        tts_ctx_ref.current = ctx;
        tts_gain_ref.current = gain;
      }
      const ctx = tts_ctx_ref.current;
      const gain = tts_gain_ref.current;
      if (!ctx || !gain) return null;
      apply_sink(ctx, opts_ref.current.output_device_id || "");
      gain.gain.value = clampVolume(opts_ref.current.volume) * (opts_ref.current.muted ? 0 : 1);
      try {
        if (ctx.state === "suspended") void ctx.resume();
      } catch {
        // ignore
      }
      return { ctx, gain };
    } catch {
      return null;
    }
  };

  // Volume and mute apply at once, also to a reply that is playing (a muted reply goes silent now).
  useEffect(() => {
    const gain = tts_gain_ref.current;
    if (gain) gain.gain.value = clampVolume(opts.volume) * (opts.muted ? 0 : 1);
  }, [opts.volume, opts.muted]);

  const stop_tts_source = useCallback((): void => {
    const scheduled = tts_sched_ref.current;
    tts_sched_ref.current = [];
    for (const s of scheduled) {
      try { s.src.onended = null; } catch { /* ignore */ }
      try { s.src.stop(); } catch { /* ignore */ }
      try { s.src.disconnect(); } catch { /* ignore */ }
    }
    const src = tts_source_ref.current;
    tts_source_ref.current = null;
    if (!src) return;
    try {
      src.onended = null;
    } catch {
      // ignore
    }
    try {
      src.stop();
    } catch {
      // ignore
    }
    try {
      src.disconnect();
    } catch {
      // ignore
    }
  }, []);

  // Stable identity (c2584 ask 1): touches only refs + the guarded setter, so
  // an idle stop is a full no-op — safe in any consumer dep array.
  const stop_tts = useCallback((): void => {
    stop_tts_source();
    tts_stream_gen_ref.current += 1; // invalidates any in-flight stream loop
    tts_stream_abort_ref.current?.abort();
    tts_stream_abort_ref.current = null;
    tts_segments_ref.current = [];
    tts_seg_idx_ref.current = 0;
    tts_stream_done_ref.current = true;
    tts_paused_ref.current = false;
    tts_loading_key_ref.current = "";
    tts_key_ref.current = "";
    tts_buffer_ref.current = null;
    tts_audio_id_ref.current = "";
    tts_offset_ref.current = 0;
    tts_started_at_ref.current = 0;
    apply_tts_playback({ key: "", status: "idle" });
  }, [stop_tts_source, apply_tts_playback]);

  // A voice change drops the audio kept for a paused message: its speaker button goes back to
  // idle, and the next press speaks it in the new voice.
  const voice_key = ttsVoiceKey(opts.tts_voice);
  const voice_key_ref = useRef(voice_key);
  useEffect(() => {
    if (voice_key_ref.current === voice_key) return;
    voice_key_ref.current = voice_key;
    if (tts_playback_ref.current.status === "paused") stop_tts();
  }, [voice_key, stop_tts]);

  useEffect(() => {
    return () => {
      stop_tts();
      try {
        tts_gain_ref.current?.disconnect();
      } catch {
        // ignore
      }
      try {
        void tts_ctx_ref.current?.close();
      } catch {
        // ignore
      }
      tts_ctx_ref.current = null;
      tts_gain_ref.current = null;
      tts_buffer_ref.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const start_tts_playback = async (key: string, buffer: AudioBuffer, offset: number): Promise<void> => {
    const generation = tts_stream_gen_ref.current;
    const engine = ensure_tts_webaudio();
    if (!engine) throw new Error("TTS playback is not supported in this browser");
    const { ctx, gain } = engine;
    try {
      if (ctx.state === "suspended") await ctx.resume();
    } catch {
      // ignore
    }

    if (generation !== tts_stream_gen_ref.current) return;
    stop_tts_source();
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(gain);

    const dur = Number.isFinite(Number(buffer.duration)) ? Number(buffer.duration) : 0;
    const off = Math.max(0, Math.min(Number(offset || 0), dur > 0 ? Math.max(0, dur - 0.01) : 0));
    tts_started_at_ref.current = ctx.currentTime - off;
    tts_offset_ref.current = off;
    tts_source_ref.current = source;
    tts_key_ref.current = key;

    source.onended = () => {
      if (tts_source_ref.current !== source) return;
      tts_source_ref.current = null;
      tts_offset_ref.current = 0;
      tts_started_at_ref.current = 0;
      tts_key_ref.current = "";
      apply_tts_playback({ key: "", status: "idle" });
    };

    source.start(0, off);
    apply_tts_playback({ key, status: "playing" });
  };

  /**
   * Streaming playback: play the segment at tts_seg_idx from tts_offset,
   * chaining to the next on end. Starvation (index past the buffered tail
   * while the stream is still fetching) leaves status "playing" with no
   * source — the fetch loop restarts playback as the next segment lands.
   */
  const start_stream_segment = (key: string, gen: number): void => {
    if (gen !== tts_stream_gen_ref.current || tts_paused_ref.current) return;
    const engine = ensure_tts_webaudio();
    if (!engine) return;
    const segs = tts_segments_ref.current;
    const sched = tts_sched_ref.current;
    const last = sched.length ? sched[sched.length - 1] : null;
    let idx = last ? last.idx + 1 : tts_seg_idx_ref.current;
    if (!last && idx >= segs.length) {
      if (tts_stream_done_ref.current) {
        // Played everything and the stream is finished.
        tts_key_ref.current = "";
        tts_offset_ref.current = 0;
        tts_started_at_ref.current = 0;
        apply_tts_playback({ key: "", status: "idle" });
      }
      return;
    }
    const { ctx, gain } = engine;
    try {
      if (ctx.state === "suspended") void ctx.resume();
    } catch {
      // ignore
    }
    // Back to back on the audio clock. A start in the past (the stream fell behind playback) is a
    // real gap the network made; it starts now. A small lead lets the first start be exact.
    const now = Number(ctx.currentTime || 0);
    let when = last ? Math.max(last.at + last.dur, now) : now + 0.02;
    for (; idx < segs.length; idx++) {
      const buffer = segs[idx];
      const dur = Number.isFinite(Number(buffer.duration)) ? Number(buffer.duration) : 0;
      const off = !last && idx === tts_seg_idx_ref.current
        ? Math.max(0, Math.min(Number(tts_offset_ref.current || 0), dur > 0 ? Math.max(0, dur - 0.01) : 0))
        : 0;
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(gain);
      const entry = { src: source, idx, at: when, off, dur: Math.max(0, dur - off) };
      source.onended = () => {
        if (gen !== tts_stream_gen_ref.current) return;
        const list = tts_sched_ref.current;
        const at = list.indexOf(entry);
        if (at < 0) return;
        list.splice(at, 1);
        tts_seg_idx_ref.current = entry.idx + 1;
        tts_offset_ref.current = 0;
        // All scheduled audio played: the end of the reply, or starved until the next segment.
        if (!list.length) start_stream_segment(key, gen);
      };
      source.start(when, off);
      tts_sched_ref.current.push(entry);
      when += entry.dur;
    }
    tts_started_at_ref.current = tts_sched_ref.current.length ? tts_sched_ref.current[0].at - tts_sched_ref.current[0].off : 0;
    tts_key_ref.current = key;
    apply_tts_playback({ key, status: "playing" });
  };
  /** Where streamed playback is: the segment playing now and the offset into it (for pause). */
  const stream_position = (now: number): { idx: number; off: number } => {
    const sched = tts_sched_ref.current;
    if (!sched.length) return { idx: tts_seg_idx_ref.current, off: 0 };
    for (const s of sched) {
      if (now < s.at) return { idx: s.idx, off: s.off };  // not started yet: from where it would
      if (now < s.at + s.dur) return { idx: s.idx, off: s.off + (now - s.at) };
    }
    const tail = sched[sched.length - 1];
    return { idx: tail.idx + 1, off: 0 };
  };

  const start_tts_stream = async (key: string, text: string, streamFn: NonNullable<GatewayVoiceOptions["tts_stream"]>): Promise<void> => {
    const engine = ensure_tts_webaudio();
    if (!engine) {
      set_error?.("This browser cannot play spoken replies.");
      return;
    }
    stop_tts_source();
    const gen = ++tts_stream_gen_ref.current;
    tts_stream_abort_ref.current?.abort();
    const streamAbort = new AbortController();
    tts_stream_abort_ref.current = streamAbort;
    tts_segments_ref.current = [];
    tts_seg_idx_ref.current = 0;
    tts_stream_done_ref.current = false;
    tts_paused_ref.current = false;
    tts_buffer_ref.current = null;
    tts_offset_ref.current = 0;
    tts_started_at_ref.current = 0;
    tts_key_ref.current = key;
    tts_loading_key_ref.current = key;
    tts_audio_id_ref.current = tts_audio_id(key, text);
    apply_tts_playback({ key, status: "loading" });
    set_error?.("");

    let prelude: Uint8Array | null = null;
    try {
      for await (const bytes of streamFn(text, streamAbort.signal)) {
        if (gen !== tts_stream_gen_ref.current) return; // superseded/stopped
        let buffer: AudioBuffer;
        try {
          buffer = await decodeAudio(engine.ctx, bytes);
          if (!prelude) prelude = wavPrelude(bytes);
        } catch {
          // Backend emitted raw continuation bytes without a RIFF header
          // (gateway c1224): re-wrap in the first segment's prelude.
          if (!prelude) continue;
          try {
            buffer = await decodeAudio(engine.ctx, wrapWavSegment(prelude, bytes));
          } catch {
            continue; // one undecodable segment must not kill the stream
          }
        }
        if (gen !== tts_stream_gen_ref.current) return;
        tts_segments_ref.current.push(buffer);
        // First segment (or starved mid-stream): start speaking now — the
        // whole point of streaming. Never auto-start while user-paused.
        // Scheduled at once, back to back after what is already queued (gapless).
        if (!tts_paused_ref.current) {
          tts_loading_key_ref.current = "";
          start_stream_segment(key, gen);
        }
      }
      if (gen !== tts_stream_gen_ref.current) return;
      tts_stream_done_ref.current = true;
      if (tts_segments_ref.current.length === 0) {
        set_error?.("Reading aloud failed: the voice engine returned no audio.");
        stop_tts();
        return;
      }
      // Starved-at-tail: nothing playing, not paused, and index already past
      // the end — close out to idle via the same path onended uses.
      if (!tts_sched_ref.current.length && !tts_paused_ref.current) start_stream_segment(key, gen);
    } catch (e: any) {
      if (gen !== tts_stream_gen_ref.current) return;
      set_error?.(voiceErrorSentence("Reading aloud failed", e));
      stop_tts();
    } finally {
      if (tts_stream_abort_ref.current === streamAbort) tts_stream_abort_ref.current = null;
    }
  };

  // Stable identity (c2584 ask 1): options through opts_ref (call-time
  // fresh), playback state through its ref twin — never the render closure.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const toggle_tts = useCallback(async (msg_key: string, text: string): Promise<void> => {
    const key = String(msg_key || "").trim();
    const t = String(text || "").trim();
    if (!key || !t) return;

    const tts = opts_ref.current.tts;
    const tts_stream = opts_ref.current.tts_stream;
    if (typeof tts !== "function" && typeof tts_stream !== "function") {
      set_error?.("Reading aloud is not available on this gateway.");
      return;
    }

    const engine = ensure_tts_webaudio();
    if (!engine) {
      set_error?.("This browser cannot play spoken replies.");
      return;
    }

    const playback = tts_playback_ref.current;
    const is_same = playback.key === key;
    if (is_same && playback.status === "playing") {
      // Compute the offset ONLY while a source is actually playing. During
      // stream starvation (index past the buffered tail, no source) the
      // started_at timestamp is stale from the finished segment — computing
      // an offset from it grows unbounded and, applied to the NEXT segment
      // on resume, skips nearly all of it (adversary P1, 2026-07-13).
      if (tts_sched_ref.current.length) {
        // Streamed: the segment playing now and the offset into it, from the audio clock.
        const pos = stream_position(Number(engine.ctx.currentTime || 0));
        tts_seg_idx_ref.current = pos.idx;
        tts_offset_ref.current = pos.off;
      } else if (tts_source_ref.current) {
        const off = Math.max(0, engine.ctx.currentTime - Number(tts_started_at_ref.current || 0));
        tts_offset_ref.current = off;
      } else {
        tts_offset_ref.current = 0; // starved: next segment plays from its start
      }
      tts_paused_ref.current = true;
      stop_tts_source();
      apply_tts_playback({ key, status: "paused" });
      return;
    }
    // Kept audio is reused only for the same message, text AND voice (a voice change means new audio).
    const reusable = is_same && playback.status === "paused" && tts_audio_id_ref.current !== "" && tts_audio_id_ref.current === tts_audio_id(key, t);
    if (is_same && playback.status === "paused" && !reusable) stop_tts();
    if (reusable) {
      // Streaming resume: continue from the paused position in the segment
      // queue (buffering may have advanced while paused).
      if (tts_segments_ref.current.length > 0) {
        set_error?.("");
        tts_paused_ref.current = false;
        // Render "playing" even when resume lands in a starved window (index
        // past the buffered tail): playback auto-continues the moment the
        // next segment arrives, and a stuck "paused" label over auto-playing
        // audio is the dishonest render (adversary find).
        apply_tts_playback({ key, status: "playing" });
        start_stream_segment(key, tts_stream_gen_ref.current);
        return;
      }
      const buffer = tts_buffer_ref.current;
      if (buffer) {
        set_error?.("");
        tts_paused_ref.current = false;
        try {
          await start_tts_playback(key, buffer, tts_offset_ref.current);
        } catch (e: any) {
          set_error?.(voiceErrorSentence("Reading aloud failed", e));
          apply_tts_playback({ key: "", status: "idle" });
        }
        return;
      }
      // fall through to regenerate if buffer missing
    }
    if (is_same && playback.status === "loading") return;

    // Streaming preferred: speak on the first synthesized segment.
    if (typeof tts_stream === "function") {
      await start_tts_stream(key, t, tts_stream);
      return;
    }

    stop_tts_source();
    tts_stream_gen_ref.current += 1;
    tts_stream_abort_ref.current?.abort();
    tts_stream_abort_ref.current = null;
    // Non-stream requests ride the same generation guard: a stop_tts (or a
    // newer toggle) mid-decode bumps the generation and this request's
    // results — including its error — are dropped instead of resurrecting
    // state or surfacing a stale failure (adversary find 2026-07-13).
    const gen = tts_stream_gen_ref.current;
    tts_segments_ref.current = [];
    tts_seg_idx_ref.current = 0;
    tts_stream_done_ref.current = true;
    tts_paused_ref.current = false;
    tts_buffer_ref.current = null;
    tts_offset_ref.current = 0;
    tts_started_at_ref.current = 0;

    tts_key_ref.current = key;
    tts_loading_key_ref.current = key;
    tts_audio_id_ref.current = tts_audio_id(key, t);
    apply_tts_playback({ key, status: "loading" });
    set_error?.("");

    try {
      const bytes = await tts!(t);
      if (tts_loading_key_ref.current !== key || tts_stream_gen_ref.current !== gen) return; // stale response

      const buffer = await decodeAudio(engine.ctx, bytes);
      if (tts_loading_key_ref.current !== key || tts_stream_gen_ref.current !== gen) return; // stale response
      tts_buffer_ref.current = buffer;
      tts_offset_ref.current = 0;

      await start_tts_playback(key, buffer, 0);
    } catch (e: any) {
      if (tts_stream_gen_ref.current !== gen) return; // superseded/stopped: swallow the stale failure
      if (tts_loading_key_ref.current === key) {
        tts_loading_key_ref.current = "";
        tts_key_ref.current = "";
        apply_tts_playback({ key: "", status: "idle" });
      }
      set_error?.(voiceErrorSentence("Reading aloud failed", e));
    }
  }, []);

  const [voice_ptt_recording, set_voice_ptt_recording] = useState<boolean>(false);
  const [voice_ptt_busy, set_voice_ptt_busy] = useState<boolean>(false);
  // Recording ref twin + supported ref twin: the stable PTT callbacks read
  // current values at call time instead of freezing first-render closures.
  const voice_ptt_recording_ref = useRef(false);
  const voice_ptt_supported_ref = useRef(voice_ptt_supported);
  voice_ptt_supported_ref.current = voice_ptt_supported;
  // One write path keeps the ref twin and the state in lockstep (boolean
  // setState already bails on equal values; the ref is for stable callbacks).
  const apply_recording = useCallback((v: boolean) => {
    voice_ptt_recording_ref.current = v;
    set_voice_ptt_recording((prev) => (prev === v ? prev : v));
  }, []);
  // Busy twin readable from callbacks bound renders ago (the recorder's
  // onstop) — the state value in those closures is stale (adversary find).
  const voice_ptt_busy_ref = useRef(false);
  const voice_ptt_stream_ref = useRef<MediaStream | null>(null);
  const voice_ptt_recorder_ref = useRef<MediaRecorder | null>(null);
  const voice_ptt_chunks_ref = useRef<BlobPart[]>([]);
  const voice_ptt_mime_ref = useRef<string>("");
  const voice_ptt_generation = useRef(0);
  const voice_ptt_start_pending = useRef(false);
  // A stop asked while the microphone is still opening (a permission prompt): honoured when the
  // stream arrives (its tracks stopped, nothing recorded), never a recording that starts after it.
  const voice_ptt_stop_pending = useRef(false);
  const [voice_ptt_since, set_voice_ptt_since] = useState(0);
  const voice_ptt_started_ms = useRef(0);
  const voice_ptt_gain_ctx = useRef<AudioContext | null>(null);
  // Live level while recording (watchLevel on the recording stream, ~20 reads/s), quantised to 5 %
  // steps and sent to subscribers only: the hook's owner (often the app's top level) never
  // re-renders for it (review 2026-10-27 M1).
  const voice_ptt_level_ref = useRef(0);
  const level_listeners = useRef(new Set<(level: number) => void>());
  const voice_ptt_level_stop = useRef<(() => void) | null>(null);
  const apply_level = useCallback((v: number) => {
    const q = Math.round(Math.min(1, Math.max(0, Number(v) || 0)) * 20) / 20;
    if (q === voice_ptt_level_ref.current) return;
    voice_ptt_level_ref.current = q;
    for (const listener of Array.from(level_listeners.current)) listener(q);
  }, []);
  const subscribe_level = useCallback((fn: (level: number) => void) => {
    level_listeners.current.add(fn);
    fn(voice_ptt_level_ref.current);
    return () => {
      level_listeners.current.delete(fn);
    };
  }, []);
  const transcript_listeners = useRef(new Set<(text: string, info?: VoiceTranscription) => void>());
  const add_transcript_listener = useCallback((fn: (text: string, info?: VoiceTranscription) => void) => {
    transcript_listeners.current.add(fn);
    return () => {
      transcript_listeners.current.delete(fn);
    };
  }, []);

  function stop_voice_ptt_tracks(): void {
    const stop_level = voice_ptt_level_stop.current;
    voice_ptt_level_stop.current = null;
    try {
      stop_level?.();
    } catch {
      // ignore
    }
    apply_level(0);
    try {
      voice_ptt_stream_ref.current?.getTracks?.().forEach((t) => {
        try {
          t.stop();
        } catch {
          // ignore
        }
      });
    } catch {
      // ignore
    }
    voice_ptt_stream_ref.current = null;
    const gainCtx = voice_ptt_gain_ctx.current;
    voice_ptt_gain_ctx.current = null;
    try {
      void gainCtx?.close();
    } catch {
      // ignore
    }
  }

  const cancel_voice_ptt_recording = useCallback(() => {
    voice_ptt_generation.current += 1;
    voice_ptt_start_pending.current = false;
    const recorder = voice_ptt_recorder_ref.current;
    if (recorder) { recorder.onstop = null; recorder.ondataavailable = null; recorder.onerror = null; try { recorder.stop(); } catch { /* Already stopped. */ } }
    voice_ptt_recorder_ref.current = null;
    stop_voice_ptt_tracks(); apply_recording(false);
    voice_ptt_busy_ref.current = false; set_voice_ptt_busy(false);
    set_voice_ptt_since(0);
    voice_ptt_chunks_ref.current = [];
  }, [apply_recording]);
  useEffect(() => () => cancel_voice_ptt_recording(), [cancel_voice_ptt_recording]);

  async function transcribe_voice_blob(blob: Blob, mime: string): Promise<void> {
    set_error?.("");
    if (voice_ptt_busy_ref.current) return;
    const held_ms = voice_ptt_started_ms.current ? Date.now() - voice_ptt_started_ms.current : Infinity;
    if (!blob || !blob.size || held_ms < MIN_RECORDING_MS) {
      set_voice_ptt_since(0);
      set_error?.("The recording was too short. Hold the microphone button while you speak, or tap it once to start and again to stop.");
      return;
    }

    const transcribe = opts_ref.current.transcribe;
    if (typeof transcribe !== "function") {
      set_error?.("Speech to text is not available on this gateway.");
      return;
    }

    voice_ptt_busy_ref.current = true;
    const generation = voice_ptt_generation.current;
    set_voice_ptt_busy(true);
    set_voice_ptt_since(Date.now());
    try {
      const result = await transcribe(blob, mime);
      const info: VoiceTranscription = typeof result === "string" || !result ? { text: String(result || "") } : result;
      const text = String(info.text || "").trim();
      if (generation !== voice_ptt_generation.current) return;
      if (text) {
        opts_ref.current.on_transcript?.(text, { ...info, text });
        for (const listener of Array.from(transcript_listeners.current)) listener(text, { ...info, text });
      }
      else set_error?.("Nothing was heard. Check the microphone in Settings → Voice (Test), then try again.");
    } catch (e: any) {
      if (generation === voice_ptt_generation.current) {
        const detail = String(e?.message || e || "").trim().replace(/\.$/, "");
        set_error?.(detail ? `Transcription failed: ${detail}.` : "Transcription failed.");
      }
    } finally {
      if (generation === voice_ptt_generation.current) { voice_ptt_busy_ref.current = false; set_voice_ptt_busy(false); set_voice_ptt_since(0); }
    }
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const start_voice_ptt_recording = useCallback(async (): Promise<void> => {
    set_error?.("");
    if (!voice_ptt_supported_ref.current) {
      set_error?.(insecureContextReason("the microphone") ?? "Voice recording is not supported in this browser (MediaRecorder/getUserMedia unavailable).");
      return;
    }
    if (voice_ptt_busy_ref.current) return;
    if (voice_ptt_start_pending.current) return;
    if (voice_ptt_recording_ref.current || voice_ptt_recorder_ref.current) return;

    voice_ptt_chunks_ref.current = [];
    const generation = voice_ptt_generation.current;
    voice_ptt_start_pending.current = true;
    voice_ptt_stop_pending.current = false;

    try {
      const stream = await openMicrophone(opts_ref.current.input_device_id || "");
      if (generation !== voice_ptt_generation.current) { stream.getTracks().forEach((track) => track.stop()); return; }
      if (voice_ptt_stop_pending.current) {
        voice_ptt_stop_pending.current = false;
        stream.getTracks().forEach((track) => track.stop());
        set_voice_ptt_since(0);
        return;
      }
      voice_ptt_stream_ref.current = stream;
      // The live level (the meter moves while the user speaks, not only during Test).
      const level_gain = Number(opts_ref.current.input_gain ?? 1);
      try {
        voice_ptt_level_stop.current = watchLevel(stream, apply_level, Number.isFinite(level_gain) && level_gain > 0 ? level_gain : 1);
      } catch {
        // No meter where Web Audio cannot read the stream; the recording itself goes on.
      }
      const mime = chooseVoiceMime();
      voice_ptt_mime_ref.current = mime;
      // Input gain: record the stream through a Web Audio gain node.
      let recorded: MediaStream = stream;
      const input_gain = Number(opts_ref.current.input_gain ?? 1);
      if (Number.isFinite(input_gain) && input_gain > 0 && input_gain !== 1 && inputGainSupported()) {
        const C: any = (globalThis as any).AudioContext || (globalThis as any).webkitAudioContext;
        const ctx: AudioContext = new C();
        const g = ctx.createGain();
        g.gain.value = input_gain;
        const dest = ctx.createMediaStreamDestination();
        ctx.createMediaStreamSource(stream).connect(g);
        g.connect(dest);
        voice_ptt_gain_ctx.current = ctx;
        recorded = dest.stream;
      }

      const rec: MediaRecorder = mime ? new MediaRecorder(recorded, { mimeType: mime }) : new MediaRecorder(recorded);
      voice_ptt_recorder_ref.current = rec;
      rec.ondataavailable = (ev: any) => {
        if (generation !== voice_ptt_generation.current) return;
        try {
          if (ev?.data) voice_ptt_chunks_ref.current.push(ev.data as BlobPart);
        } catch {
          // ignore
        }
      };
      rec.onerror = () => {
        if (generation !== voice_ptt_generation.current) return;
        set_error?.("Recording failed. Try again, or pick another microphone in Settings → Voice.");
      };
      rec.onstop = () => {
        if (generation !== voice_ptt_generation.current) return;
        apply_recording(false);
        stop_voice_ptt_tracks();
        voice_ptt_recorder_ref.current = null;
        try {
          const b = new Blob(voice_ptt_chunks_ref.current, { type: voice_ptt_mime_ref.current || "" });
          void transcribe_voice_blob(b, voice_ptt_mime_ref.current);
        } catch (e: any) {
          set_error?.(voiceErrorSentence("The recording could not be prepared", e));
        }
      };

      rec.start();
      voice_ptt_started_ms.current = Date.now();
      set_voice_ptt_since(voice_ptt_started_ms.current);
      apply_recording(true);
    } catch (e: any) {
      if (generation !== voice_ptt_generation.current) return;
      stop_voice_ptt_tracks();
      voice_ptt_recorder_ref.current = null;
      apply_recording(false);
      set_voice_ptt_since(0);
      set_error?.(microphoneErrorSentence(e));
    } finally {
      if (generation === voice_ptt_generation.current) voice_ptt_start_pending.current = false;
    }
  }, []);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const stop_voice_ptt_recording = useCallback((): void => {
    const rec = voice_ptt_recorder_ref.current;
    if (voice_ptt_start_pending.current && !rec) {
      voice_ptt_stop_pending.current = true;
      return;
    }
    if (!voice_ptt_recording_ref.current || !rec) return;
    // Keep ownership until onstop, so cancellation can detach queued events
    // and a new start cannot replace a recorder that is still draining.
    apply_recording(false);
    try {
      rec.stop();
    } catch (e: any) {
      set_error?.(voiceErrorSentence("The recording could not stop", e));
    }
  }, []);

  useEffect(() => {
    if (!voice_ptt_recording || opts_ref.current.stop_on_pointerup === false) return;
    if (opts_ref.current.stop_on_pointerup === undefined && voiceCaptureMode(opts_ref.current.capture_mode) === "toggle") return;
    const on_up = () => stop_voice_ptt_recording();
    window.addEventListener("pointerup", on_up);
    window.addEventListener("pointercancel", on_up);
    return () => {
      window.removeEventListener("pointerup", on_up);
      window.removeEventListener("pointercancel", on_up);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [voice_ptt_recording]);

  return {
    tts_supported,
    tts_playback,
    toggle_tts,
    stop_tts,
    voice_ptt_supported,
    voice_ptt_recording,
    voice_ptt_busy,
    start_voice_ptt_recording,
    stop_voice_ptt_recording,
    cancel_voice_ptt_recording,
    voice_ptt_since,
    subscribe_level,
    voice_capture_mode: voiceCaptureMode(opts.capture_mode),
    add_transcript_listener,
  };
}

export default useGatewayVoice;
