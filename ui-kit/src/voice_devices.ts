// Voice devices and the gateway's voice routes (ui-kit 0.7.1, round 6 R6.1).
//
// Pure helpers + browser plumbing shared by AfVoiceSection (Settings → Voice)
// and every composer microphone:
//
// - `voiceDefaultSummary` renders "supertonic / supertonic-3" from the ONE
//   gateway answer (`GET /api/gateway/voice/defaults`), never from a voice
//   catalog's engine-side fields (that is how "Gateway default · openai"
//   appeared on a gateway routed to supertonic and faster-whisper).
// - devices: `listVoiceDevices`, `unlockDeviceLabels` (labels need the
//   microphone permission once), `openMicrophone` (the chosen input, no
//   silent fallback), `watchLevel` (live meter), `recordSample` (the 3 s mic
//   Test), `playOnDevice` / `playTestTone` (speaker Test on the chosen output).
// - `microphoneErrorSentence` turns DOMException names into one sentence the
//   user can act on.
import { insecureContextReason } from "./random_id.js";

/** One route of `GET /api/gateway/voice/defaults`. */
export type VoiceRouteDefault = {
  route?: string;
  configured: boolean;
  provider?: string | null;
  model?: string | null;
  voice?: string | null;
  note?: string;
};

/** The body of `GET /api/gateway/voice/defaults`. */
export type VoiceDefaults = {
  tts?: VoiceRouteDefault;
  stt?: VoiceRouteDefault;
  source?: string;
};

export type VoiceDevice = { id: string; label: string };

/** "provider / model" of a route ("" when nothing is known). */
export function voiceRouteText(entry?: { provider?: string | null; model?: string | null } | null): string {
  if (!entry) return "";
  return [entry.provider, entry.model].map((v) => String(v || "").trim()).filter(Boolean).join(" / ");
}

/**
 * What "Gateway default · …" names for `kind`:
 * the configured route, "not set" when the administrator set none,
 * "unknown" when the gateway could not be asked, "" while loading.
 */
export function voiceDefaultSummary(defaults: VoiceDefaults | null | undefined, kind: "tts" | "stt", failed = false): string {
  if (failed) return "unknown";
  if (!defaults) return "";
  const entry = defaults[kind];
  if (!entry || !entry.configured) return "not set";
  return voiceRouteText(entry) || "not set";
}

/** The route a transcription will use: the override, else the gateway default. */
export function sttRouteText(prefs: { stt_provider?: string; stt_model?: string }, defaults?: VoiceDefaults | null): string {
  if (prefs.stt_provider) return voiceRouteText({ provider: prefs.stt_provider, model: prefs.stt_model });
  return defaults?.stt?.configured ? voiceRouteText(defaults.stt) : "";
}

/** Whole seconds since `sinceMs` ("12 s"). */
export function elapsedSeconds(sinceMs: number, nowMs: number): string {
  return `${Math.max(0, Math.floor((nowMs - sinceMs) / 1000))} s`;
}

/** "Transcribing… 12 s · faster-whisper / large-v3" */
export function transcribingLine(sinceMs: number, nowMs: number, route: string): string {
  return `Transcribing… ${elapsedSeconds(sinceMs, nowMs)}${route ? ` · ${route}` : ""}`;
}

const md = (): any => (globalThis as any).navigator?.mediaDevices;

/** A sentence for a getUserMedia / playback failure. */
export function microphoneErrorSentence(error: unknown): string {
  const insecure = insecureContextReason("the microphone");
  if (insecure) return insecure;
  const name = String((error as any)?.name || "");
  if (name === "NotAllowedError" || name === "SecurityError" || name === "PermissionDeniedError")
    return "The browser blocked the microphone. Allow it for this site (the icon left of the address), then try again.";
  if (name === "NotFoundError" || name === "DevicesNotFoundError")
    return "No microphone was found. Connect one, then try again.";
  if (name === "OverconstrainedError")
    return "The chosen microphone is not connected. Pick another one in Settings → Voice.";
  if (name === "NotReadableError" || name === "TrackStartError")
    return "Another app is using the microphone. Close it, then try again.";
  if (!md()?.getUserMedia) return "This browser cannot record audio.";
  const detail = String((error as any)?.message || error || "").trim();
  return detail ? `The microphone did not start: ${detail.replace(/\.$/, "")}.` : "The microphone did not start.";
}

/** Devices of one kind; `labelled` is false until the microphone permission was granted once. */
export async function listVoiceDevices(kind: "audioinput" | "audiooutput"): Promise<{ devices: VoiceDevice[]; labelled: boolean }> {
  const m = md();
  if (!m || typeof m.enumerateDevices !== "function") return { devices: [], labelled: false };
  const list: any[] = await m.enumerateDevices();
  const ofKind = list.filter((d) => d.kind === kind);
  const labelled = ofKind.some((d) => Boolean(d.label));
  const devices = ofKind
    .filter((d) => d.deviceId && d.deviceId !== "default" && d.deviceId !== "communications")
    .map((d, i) => ({
      id: String(d.deviceId),
      label: String(d.label || `${kind === "audioinput" ? "Microphone" : "Speaker"} ${i + 1}`),
    }));
  return { devices, labelled };
}

/** Ask for the microphone once so the browser reveals device names; the stream is closed at once. */
export async function unlockDeviceLabels(): Promise<void> {
  const m = md();
  if (!m?.getUserMedia) throw new Error(insecureContextReason("the microphone") || "This browser cannot record audio.");
  const stream: MediaStream = await m.getUserMedia({ audio: true });
  stream.getTracks().forEach((t) => t.stop());
}

/** The chosen microphone ("" = system default). A missing device fails loudly (OverconstrainedError), never silently switches. */
export async function openMicrophone(deviceId?: string): Promise<MediaStream> {
  const m = md();
  if (!m?.getUserMedia) throw Object.assign(new Error("This browser cannot record audio."), { name: "NotSupportedError" });
  return m.getUserMedia({ audio: deviceId ? { deviceId: { exact: deviceId } } : true });
}

function audioContextCtor(): any {
  const w: any = globalThis as any;
  return w.AudioContext || w.webkitAudioContext || null;
}

/** The browser can apply an input gain to recordings (Web Audio + MediaStreamDestination). */
export function inputGainSupported(): boolean {
  const C = audioContextCtor();
  return Boolean(C && C.prototype && typeof C.prototype.createMediaStreamDestination === "function");
}

/**
 * Live level of a stream, 0..1 (RMS, ~20 updates/s) until the returned stop
 * function is called. `gain` scales the level like the recording.
 */
export function watchLevel(stream: MediaStream, onLevel: (level: number) => void, gain = 1): () => void {
  const C = audioContextCtor();
  if (!C) return () => undefined;
  const ctx = new C();
  const source = ctx.createMediaStreamSource(stream);
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 1024;
  source.connect(analyser);
  const data = new Float32Array(analyser.fftSize);
  let alive = true;
  const tick = () => {
    if (!alive) return;
    analyser.getFloatTimeDomainData(data);
    let sum = 0;
    for (let i = 0; i < data.length; i += 1) sum += data[i] * data[i];
    onLevel(Math.min(1, Math.sqrt(sum / data.length) * 4 * gain));
  };
  const timer = setInterval(tick, 50);
  return () => {
    alive = false;
    clearInterval(timer);
    try {
      source.disconnect();
    } catch {
      /* already disconnected */
    }
    void ctx.close?.();
  };
}

/** Level below which a whole recording counts as silence. */
export const SILENT_LEVEL = 0.02;

/**
 * The microphone Test: record `ms` from the chosen input (live level through
 * `onLevel`), return the recording and its peak level. Throws the browser's
 * error (turn it into a sentence with `microphoneErrorSentence`).
 */
export async function recordSample(opts: {
  deviceId?: string;
  ms?: number;
  gain?: number;
  onLevel?: (level: number) => void;
  signal?: AbortSignal;
}): Promise<{ blob: Blob; peak: number; mime: string }> {
  const MR: any = (globalThis as any).MediaRecorder;
  if (typeof MR !== "function") throw Object.assign(new Error("This browser cannot record audio."), { name: "NotSupportedError" });
  const stream = await openMicrophone(opts.deviceId);
  let peak = 0;
  const stopMeter = watchLevel(
    stream,
    (level) => {
      peak = Math.max(peak, level);
      opts.onLevel?.(level);
    },
    opts.gain ?? 1,
  );
  try {
    const recorder = new MR(stream);
    const chunks: BlobPart[] = [];
    const done = new Promise<void>((resolve, reject) => {
      recorder.ondataavailable = (e: any) => e?.data && chunks.push(e.data);
      recorder.onstop = () => resolve();
      recorder.onerror = (e: any) => reject(e?.error || new Error("Recording failed."));
    });
    recorder.start();
    await new Promise<void>((resolve) => {
      const t = setTimeout(resolve, opts.ms ?? 3000);
      opts.signal?.addEventListener("abort", () => {
        clearTimeout(t);
        resolve();
      }, { once: true });
    });
    recorder.stop();
    await done;
    const mime = String(recorder.mimeType || "audio/webm");
    return { blob: new Blob(chunks, { type: mime }), peak, mime };
  } finally {
    stopMeter();
    stream.getTracks().forEach((t) => t.stop());
    opts.onLevel?.(0);
  }
}

/** Play encoded audio on a chosen output ("" = system default) at `volume` 0..1; resolves when it ends. */
export async function playOnDevice(data: Blob | ArrayBuffer, opts: { deviceId?: string; volume?: number } = {}): Promise<void> {
  const C = audioContextCtor();
  if (!C) throw new Error("This browser cannot play audio.");
  const ctx = new C();
  try {
    if (opts.deviceId && typeof ctx.setSinkId === "function") await ctx.setSinkId(opts.deviceId);
    const bytes = data instanceof Blob ? await data.arrayBuffer() : data;
    const buffer: AudioBuffer = await ctx.decodeAudioData(bytes.slice(0));
    const gain = ctx.createGain();
    gain.gain.value = clampVolume(opts.volume);
    gain.connect(ctx.destination);
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.connect(gain);
    await new Promise<void>((resolve) => {
      src.onended = () => resolve();
      src.start();
    });
  } finally {
    void ctx.close?.();
  }
}

/** The speaker Test: a short two-note chime on the chosen output at `volume`. */
export async function playTestTone(opts: { deviceId?: string; volume?: number } = {}): Promise<void> {
  const C = audioContextCtor();
  if (!C) throw new Error("This browser cannot play audio.");
  const ctx = new C();
  try {
    if (opts.deviceId && typeof ctx.setSinkId === "function") await ctx.setSinkId(opts.deviceId);
    if (ctx.state === "suspended") await ctx.resume?.();
    const gain = ctx.createGain();
    gain.connect(ctx.destination);
    const peak = 0.3 * clampVolume(opts.volume);
    const t0 = ctx.currentTime + 0.02;
    [660, 880].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const env = ctx.createGain();
      osc.frequency.value = freq;
      osc.connect(env);
      env.connect(gain);
      const start = t0 + i * 0.22;
      env.gain.setValueAtTime(0, start);
      env.gain.linearRampToValueAtTime(peak, start + 0.02);
      env.gain.exponentialRampToValueAtTime(0.0001, start + 0.2);
      osc.start(start);
      osc.stop(start + 0.21);
    });
    await new Promise((resolve) => setTimeout(resolve, 520));
  } finally {
    void ctx.close?.();
  }
}

/** Volume preference (0..1; absent = 1). */
export function clampVolume(v: unknown): number {
  const n = Number(v);
  if (v === undefined || v === null || v === "" || !Number.isFinite(n)) return 1;
  return Math.min(1, Math.max(0, n));
}
