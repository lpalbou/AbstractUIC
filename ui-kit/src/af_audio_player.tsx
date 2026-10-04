// AfAudioPlayer — the one audio viewer every client shows (ui-kit 0.7.0).
//
// Lifted from AbstractFlow's artifact audio preview (a bare `<audio controls>`)
// and made a shared waveform player: play/pause, a waveform you click or drag
// to seek (a keyboard slider: arrows ±5 s, Home/End), elapsed / total time.
// Transport-free like AfFileViewer: the host passes a URL it can play (an
// object URL of bytes it fetched with its own credentials, or a same-origin
// URL). The waveform is decoded from that URL with the Web Audio API; when
// decoding is unavailable or fails, the bars stay flat and the player still
// plays (the reason is in the `title` of the waveform, never hidden).
import React, { useCallback, useEffect, useRef, useState } from "react";
import { Icon } from "./icon.js";

/** Number of waveform bars (fixed: the SVG scales to its box). */
export const AUDIO_WAVEFORM_BARS = 72;

/**
 * Peak amplitude per bar, normalised to 0..1 (loudest bar = 1). Deterministic
 * and pure (exported for the kit checks). Silence gives all zeros; an empty
 * input gives `bars` zeros.
 */
export function audioPeaks(samples: ArrayLike<number>, bars = AUDIO_WAVEFORM_BARS): number[] {
  const n = Math.max(1, Math.floor(bars));
  const out = new Array<number>(n).fill(0);
  const len = samples.length;
  if (!len) return out;
  const step = len / n;
  let max = 0;
  for (let b = 0; b < n; b += 1) {
    const start = Math.floor(b * step);
    const end = Math.max(start + 1, Math.floor((b + 1) * step));
    let peak = 0;
    for (let i = start; i < end && i < len; i += 1) {
      const v = Math.abs(Number(samples[i]) || 0);
      if (v > peak) peak = v;
    }
    out[b] = peak;
    if (peak > max) max = peak;
  }
  if (max <= 0) return out;
  return out.map((v) => v / max);
}

/** "0:07", "1:03", "1:02:09"; "--:--" when unknown. */
export function formatAudioTime(seconds: number | null | undefined): string {
  if (typeof seconds !== "number" || !Number.isFinite(seconds) || seconds < 0) return "--:--";
  const s = Math.floor(seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${sec}` : `${m}:${sec}`;
}

/** Seek target (seconds) for a pointer at `x` within a bar of `width`. */
export function audioSeekTime(x: number, width: number, duration: number): number {
  if (!(width > 0) || !(duration > 0)) return 0;
  return Math.min(duration, Math.max(0, (x / width) * duration));
}

export type AfAudioPlayerProps = {
  /** A playable URL (object URL or same-origin). */
  src: string;
  /** File name, for the accessible labels. */
  name?: string;
  /** Precomputed peaks (0..1); skips decoding (tests, server-side peaks). */
  peaks?: number[];
  className?: string;
};

type DecodeState = { peaks: number[] | null; note: string };

function useWaveform(src: string, given?: number[]): DecodeState {
  const [state, setState] = useState<DecodeState>({ peaks: given ?? null, note: "" });
  useEffect(() => {
    if (given) {
      setState({ peaks: given, note: "" });
      return;
    }
    let active = true;
    setState({ peaks: null, note: "" });
    const Ctx: typeof AudioContext | undefined =
      typeof window !== "undefined" ? window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext : undefined;
    if (!src || !Ctx || typeof fetch !== "function") {
      setState({ peaks: null, note: "Waveform unavailable in this browser." });
      return;
    }
    (async () => {
      let ctx: AudioContext | null = null;
      try {
        const buf = await (await fetch(src)).arrayBuffer();
        ctx = new Ctx();
        const audio = await ctx.decodeAudioData(buf);
        if (active) setState({ peaks: audioPeaks(audio.getChannelData(0)), note: "" });
      } catch (err) {
        if (active) setState({ peaks: null, note: `Waveform unavailable: ${err instanceof Error ? err.message : String(err)}` });
      } finally {
        if (ctx) void ctx.close().catch(() => undefined);
      }
    })();
    return () => {
      active = false;
    };
  }, [src, given]);
  return state;
}

/** The shared waveform audio player. */
export function AfAudioPlayer(p: AfAudioPlayerProps): React.ReactElement {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const waveRef = useRef<HTMLDivElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState<number | null>(null);
  const [error, setError] = useState("");
  const { peaks, note } = useWaveform(p.src, p.peaks);
  const bars = peaks ?? new Array<number>(AUDIO_WAVEFORM_BARS).fill(0);
  const progress = duration && duration > 0 ? Math.min(1, time / duration) : 0;
  const label = p.name ? `Audio ${p.name}` : "Audio";

  const toggle = useCallback(() => {
    const el = audioRef.current;
    if (!el) return;
    if (el.paused) {
      void el.play().catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)));
    } else {
      el.pause();
    }
  }, []);

  const seek = useCallback((t: number) => {
    const el = audioRef.current;
    if (!el || !Number.isFinite(t)) return;
    el.currentTime = t;
    setTime(t);
  }, []);

  const seekFromPointer = (clientX: number) => {
    const box = waveRef.current?.getBoundingClientRect();
    if (!box || !duration) return;
    seek(audioSeekTime(clientX - box.left, box.width, duration));
  };

  const onKey = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (!duration) return;
    const step = e.key === "ArrowRight" || e.key === "ArrowUp" ? 5 : e.key === "ArrowLeft" || e.key === "ArrowDown" ? -5 : 0;
    if (step) {
      e.preventDefault();
      seek(Math.min(duration, Math.max(0, time + step)));
    } else if (e.key === "Home") {
      e.preventDefault();
      seek(0);
    } else if (e.key === "End") {
      e.preventDefault();
      seek(duration);
    } else if (e.key === " " || e.key === "Enter") {
      e.preventDefault();
      toggle();
    }
  };

  return (
    <div className={`af-audio${p.className ? ` ${p.className}` : ""}`} data-playing={playing ? "true" : "false"}>
      <audio
        ref={audioRef}
        src={p.src}
        preload="metadata"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
        onTimeUpdate={(e) => setTime(e.currentTarget.currentTime)}
        onLoadedMetadata={(e) => setDuration(Number.isFinite(e.currentTarget.duration) ? e.currentTarget.duration : null)}
        onDurationChange={(e) => setDuration(Number.isFinite(e.currentTarget.duration) ? e.currentTarget.duration : null)}
        onError={() => setError("This audio cannot be played in this browser. Use Download to open it.")}
      />
      <button
        type="button"
        className="af-audio__play"
        data-action={playing ? "pause-audio" : "play-audio"}
        aria-label={playing ? `Pause ${label}` : `Play ${label}`}
        title={playing ? "Pause" : "Play"}
        onClick={toggle}
      >
        <Icon name={playing ? "pause" : "play"} size={16} />
      </button>
      <div
        ref={waveRef}
        className="af-audio__wave"
        role="slider"
        tabIndex={0}
        aria-label={`Seek in ${label}`}
        aria-valuemin={0}
        aria-valuemax={Math.round(duration ?? 0)}
        aria-valuenow={Math.round(time)}
        aria-valuetext={`${formatAudioTime(time)} of ${formatAudioTime(duration)}`}
        title={note || undefined}
        data-waveform={peaks ? "decoded" : "flat"}
        onKeyDown={onKey}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture?.(e.pointerId);
          seekFromPointer(e.clientX);
        }}
        onPointerMove={(e) => {
          if (e.buttons & 1) seekFromPointer(e.clientX);
        }}
      >
        <svg viewBox={`0 0 ${bars.length * 2} 32`} preserveAspectRatio="none" aria-hidden="true" focusable="false">
          {bars.map((v, i) => {
            const h = Math.max(1.5, v * 30);
            const played = (i + 0.5) / bars.length <= progress;
            return <rect key={i} className={played ? "af-audio__bar af-audio__bar--played" : "af-audio__bar"} x={i * 2 + 0.3} y={16 - h / 2} width={1.4} height={h} rx={0.6} />;
          })}
        </svg>
      </div>
      <span className="af-audio__time" aria-hidden="true">
        {formatAudioTime(time)} / {formatAudioTime(duration)}
      </span>
      {error ? (
        <p className="af-audio__error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export default AfAudioPlayer;
