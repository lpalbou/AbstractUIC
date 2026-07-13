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
 */
import { useEffect, useMemo, useRef, useState } from "react";

export type TtsPlaybackStatus = "idle" | "loading" | "playing" | "paused";

export type GatewayVoiceOptions = {
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
  tts_stream?: (text: string) => AsyncIterable<ArrayBuffer>;
  /** Transcribe a recorded blob to text (absent = PTT unsupported). */
  transcribe?: (blob: Blob, mime: string) => Promise<string>;
  on_error?: (message: string) => void;
  on_transcript?: (text: string) => void;
};

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
}): AsyncGenerator<ArrayBuffer> {
  const controller = new AbortController();
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
      const detail = data && typeof data === "object" && (data as any).detail ? String((data as any).detail) : `HTTP ${res.status}`;
      throw new Error(detail);
    }
    if (!res.body) throw new Error("TTS stream has no body");
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = "";
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      let nl: number;
      while ((nl = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (!line) continue;
        let evt: any = null;
        try {
          evt = JSON.parse(line);
        } catch {
          continue; // tolerate partial/garbled lines rather than killing playback
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
    }
  } finally {
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
};

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
  const tts_segments_ref = useRef<AudioBuffer[]>([]);
  const tts_seg_idx_ref = useRef(0);
  const tts_stream_done_ref = useRef(true);
  const tts_paused_ref = useRef(false);

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

  const stop_tts_source = (): void => {
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
  };

  const stop_tts = (): void => {
    stop_tts_source();
    tts_stream_gen_ref.current += 1; // invalidates any in-flight stream loop
    tts_segments_ref.current = [];
    tts_seg_idx_ref.current = 0;
    tts_stream_done_ref.current = true;
    tts_paused_ref.current = false;
    tts_loading_key_ref.current = "";
    tts_key_ref.current = "";
    tts_buffer_ref.current = null;
    tts_offset_ref.current = 0;
    tts_started_at_ref.current = 0;
    set_tts_playback({ key: "", status: "idle" });
  };

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
    const engine = ensure_tts_webaudio();
    if (!engine) throw new Error("TTS playback is not supported in this browser");
    const { ctx, gain } = engine;
    try {
      if (ctx.state === "suspended") await ctx.resume();
    } catch {
      // ignore
    }

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
      set_tts_playback({ key: "", status: "idle" });
    };

    source.start(0, off);
    set_tts_playback({ key, status: "playing" });
  };

  /**
   * Streaming playback: play the segment at tts_seg_idx from tts_offset,
   * chaining to the next on end. Starvation (index past the buffered tail
   * while the stream is still fetching) leaves status "playing" with no
   * source — the fetch loop restarts playback as the next segment lands.
   */
  const start_stream_segment = (key: string, gen: number): void => {
    if (gen !== tts_stream_gen_ref.current) return;
    const engine = ensure_tts_webaudio();
    if (!engine) return;
    const segs = tts_segments_ref.current;
    const idx = tts_seg_idx_ref.current;
    if (idx >= segs.length) {
      if (tts_stream_done_ref.current) {
        // Played everything and the stream is finished.
        tts_key_ref.current = "";
        tts_offset_ref.current = 0;
        tts_started_at_ref.current = 0;
        set_tts_playback({ key: "", status: "idle" });
      }
      return;
    }
    const buffer = segs[idx];
    const { ctx, gain } = engine;
    stop_tts_source();
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(gain);
    const dur = Number.isFinite(Number(buffer.duration)) ? Number(buffer.duration) : 0;
    const off = Math.max(0, Math.min(Number(tts_offset_ref.current || 0), dur > 0 ? Math.max(0, dur - 0.01) : 0));
    tts_started_at_ref.current = ctx.currentTime - off;
    tts_source_ref.current = source;
    tts_key_ref.current = key;
    source.onended = () => {
      if (gen !== tts_stream_gen_ref.current) return;
      if (tts_source_ref.current !== source) return;
      tts_source_ref.current = null;
      tts_seg_idx_ref.current = idx + 1;
      tts_offset_ref.current = 0;
      start_stream_segment(key, gen);
    };
    try {
      if (ctx.state === "suspended") void ctx.resume();
    } catch {
      // ignore
    }
    source.start(0, off);
    set_tts_playback({ key, status: "playing" });
  };

  const start_tts_stream = async (key: string, text: string, streamFn: (t: string) => AsyncIterable<ArrayBuffer>): Promise<void> => {
    const engine = ensure_tts_webaudio();
    if (!engine) {
      set_error?.("TTS playback is not supported in this browser.");
      return;
    }
    stop_tts_source();
    const gen = ++tts_stream_gen_ref.current;
    tts_segments_ref.current = [];
    tts_seg_idx_ref.current = 0;
    tts_stream_done_ref.current = false;
    tts_paused_ref.current = false;
    tts_buffer_ref.current = null;
    tts_offset_ref.current = 0;
    tts_started_at_ref.current = 0;
    tts_key_ref.current = key;
    tts_loading_key_ref.current = key;
    set_tts_playback({ key, status: "loading" });
    set_error?.("");

    let prelude: Uint8Array | null = null;
    try {
      for await (const bytes of streamFn(text)) {
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
        if (!tts_source_ref.current && !tts_paused_ref.current) {
          tts_loading_key_ref.current = "";
          start_stream_segment(key, gen);
        }
      }
      if (gen !== tts_stream_gen_ref.current) return;
      tts_stream_done_ref.current = true;
      if (tts_segments_ref.current.length === 0) {
        set_error?.("TTS stream produced no audio.");
        stop_tts();
        return;
      }
      // Starved-at-tail: nothing playing, not paused, and index already past
      // the end — close out to idle via the same path onended uses.
      if (!tts_source_ref.current && !tts_paused_ref.current) start_stream_segment(key, gen);
    } catch (e: any) {
      if (gen !== tts_stream_gen_ref.current) return;
      set_error?.(String(e?.message || e || "TTS stream failed"));
      stop_tts();
    }
  };

  const toggle_tts = async (msg_key: string, text: string): Promise<void> => {
    const key = String(msg_key || "").trim();
    const t = String(text || "").trim();
    if (!key || !t) return;

    const tts = opts.tts;
    const tts_stream = opts.tts_stream;
    if (typeof tts !== "function" && typeof tts_stream !== "function") {
      set_error?.("TTS is not available.");
      return;
    }

    const engine = ensure_tts_webaudio();
    if (!engine) {
      set_error?.("TTS playback is not supported in this browser.");
      return;
    }

    const is_same = tts_playback.key === key;
    if (is_same && tts_playback.status === "playing") {
      // Compute the offset ONLY while a source is actually playing. During
      // stream starvation (index past the buffered tail, no source) the
      // started_at timestamp is stale from the finished segment — computing
      // an offset from it grows unbounded and, applied to the NEXT segment
      // on resume, skips nearly all of it (adversary P1, 2026-07-13).
      if (tts_source_ref.current) {
        const off = Math.max(0, engine.ctx.currentTime - Number(tts_started_at_ref.current || 0));
        tts_offset_ref.current = off;
      } else {
        tts_offset_ref.current = 0; // starved: next segment plays from its start
      }
      tts_paused_ref.current = true;
      stop_tts_source();
      set_tts_playback({ key, status: "paused" });
      return;
    }
    if (is_same && tts_playback.status === "paused") {
      // Streaming resume: continue from the paused position in the segment
      // queue (buffering may have advanced while paused).
      if (tts_segments_ref.current.length > 0) {
        set_error?.("");
        tts_paused_ref.current = false;
        // Render "playing" even when resume lands in a starved window (index
        // past the buffered tail): playback auto-continues the moment the
        // next segment arrives, and a stuck "paused" label over auto-playing
        // audio is the dishonest render (adversary find).
        set_tts_playback({ key, status: "playing" });
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
          set_error?.(String(e?.message || e || "TTS play failed"));
          set_tts_playback({ key: "", status: "idle" });
        }
        return;
      }
      // fall through to regenerate if buffer missing
    }
    if (is_same && tts_playback.status === "loading") return;

    // Streaming preferred: speak on the first synthesized segment.
    if (typeof tts_stream === "function") {
      await start_tts_stream(key, t, tts_stream);
      return;
    }

    stop_tts_source();
    tts_stream_gen_ref.current += 1;
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
    set_tts_playback({ key, status: "loading" });
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
        set_tts_playback({ key: "", status: "idle" });
      }
      set_error?.(String(e?.message || e || "TTS failed"));
    }
  };

  const [voice_ptt_recording, set_voice_ptt_recording] = useState<boolean>(false);
  const [voice_ptt_busy, set_voice_ptt_busy] = useState<boolean>(false);
  // Busy twin readable from callbacks bound renders ago (the recorder's
  // onstop) — the state value in those closures is stale (adversary find).
  const voice_ptt_busy_ref = useRef(false);
  const voice_ptt_stream_ref = useRef<MediaStream | null>(null);
  const voice_ptt_recorder_ref = useRef<MediaRecorder | null>(null);
  const voice_ptt_chunks_ref = useRef<BlobPart[]>([]);
  const voice_ptt_mime_ref = useRef<string>("");

  function stop_voice_ptt_tracks(): void {
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
  }

  useEffect(() => {
    return () => {
      try {
        voice_ptt_recorder_ref.current?.stop?.();
      } catch {
        // ignore
      }
      voice_ptt_recorder_ref.current = null;
      stop_voice_ptt_tracks();
    };
  }, []);

  async function transcribe_voice_blob(blob: Blob, mime: string): Promise<void> {
    set_error?.("");
    if (!blob || !blob.size) return;
    if (voice_ptt_busy_ref.current) return;

    const transcribe = opts_ref.current.transcribe;
    if (typeof transcribe !== "function") {
      set_error?.("Transcription is not available.");
      return;
    }

    voice_ptt_busy_ref.current = true;
    set_voice_ptt_busy(true);
    try {
      const text = String((await transcribe(blob, mime)) || "").trim();
      if (text) opts_ref.current.on_transcript?.(text);
    } catch (e: any) {
      set_error?.(String(e?.message || e || "Transcription failed"));
    } finally {
      voice_ptt_busy_ref.current = false;
      set_voice_ptt_busy(false);
    }
  }

  async function start_voice_ptt_recording(): Promise<void> {
    set_error?.("");
    if (!voice_ptt_supported) {
      set_error?.("Voice recording is not supported in this browser (MediaRecorder/getUserMedia unavailable).");
      return;
    }
    if (voice_ptt_busy_ref.current) return;
    if (voice_ptt_recording || voice_ptt_recorder_ref.current) return;

    voice_ptt_chunks_ref.current = [];

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      voice_ptt_stream_ref.current = stream;
      const mime = chooseVoiceMime();
      voice_ptt_mime_ref.current = mime;

      const rec: MediaRecorder = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
      voice_ptt_recorder_ref.current = rec;
      rec.ondataavailable = (ev: any) => {
        try {
          if (ev?.data) voice_ptt_chunks_ref.current.push(ev.data as BlobPart);
        } catch {
          // ignore
        }
      };
      rec.onerror = () => {
        set_error?.("Recording failed.");
      };
      rec.onstop = () => {
        set_voice_ptt_recording(false);
        stop_voice_ptt_tracks();
        voice_ptt_recorder_ref.current = null;
        try {
          const b = new Blob(voice_ptt_chunks_ref.current, { type: voice_ptt_mime_ref.current || "" });
          void transcribe_voice_blob(b, voice_ptt_mime_ref.current);
        } catch (e: any) {
          set_error?.(String(e?.message || e || "Failed to build recording"));
        }
      };

      rec.start();
      set_voice_ptt_recording(true);
    } catch (e: any) {
      stop_voice_ptt_tracks();
      voice_ptt_recorder_ref.current = null;
      set_voice_ptt_recording(false);
      const msg = String(e?.message || e || "Failed to access microphone");
      set_error?.(msg.toLowerCase().includes("permission") ? `Microphone permission denied: ${msg}` : msg);
    }
  }

  function stop_voice_ptt_recording(): void {
    const rec = voice_ptt_recorder_ref.current;
    if (!voice_ptt_recording || !rec) return;
    voice_ptt_recorder_ref.current = null; // idempotency: prevent double-stop on global handlers
    set_voice_ptt_recording(false);
    try {
      rec.stop();
    } catch (e: any) {
      set_error?.(String(e?.message || e || "Failed to stop recording"));
    }
  }

  useEffect(() => {
    if (!voice_ptt_recording) return;
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
  };
}

export default useGatewayVoice;
