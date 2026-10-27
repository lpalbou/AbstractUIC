// AfVoiceMicButton — the composer microphone (ui-primitives 0035, ADR 0001 §5):
// ONE button and ONE wording for every app (absorbs the Code, Observer and
// Entity copies, audit voice.md §E2).
//
//   hold    "Hold to talk"  →  "Recording — release to send"   (a tap is too short: a hint, nothing sent)
//   toggle  "Tap to talk"   →  "Recording — tap to stop"
//
// beside it a live level meter while recording (`voice.voice_ptt_level`) and
// the status line "Recording… 3 s" / "Transcribing… 4 s · faster-whisper /
// large-v3". The recording is `useGatewayVoice`'s: create the hook with the
// same `capture_mode` (`gatewayVoiceOptions(prefs)` does; pass
// `mode={voiceCaptureMode(prefs)}`). `mode` is read with `voiceCaptureMode`
// (anything but "toggle" is hold), so a stored value can never crash a page. A
// hook in the other mode (a hold-mode hook stops a tap-to-talk recording on the
// first pointer release) is refused VISIBLY: the button is disabled with the
// reason, and the developer gets a console error; it never throws at render.
// What happens to the transcript (send it, put it in the draft) is the host's:
// `onTranscript`, or the hook's own `on_transcript`.
import React, { useEffect, useRef, useState } from "react";
import { Icon } from "./icon.js";
import { MIN_RECORDING_MS, voiceCaptureMode, type GatewayVoice, type VoiceCaptureMode, type VoiceTranscription } from "./use_gateway_voice.js";
import { elapsedSeconds, transcribingLine } from "./voice_devices.js";

/** The one wording set of the microphone button (ADR 0001 §5). */
export const VOICE_MIC_TEXT = {
  hold: "Hold to talk",
  toggle: "Tap to talk",
  recordingHold: "Recording — release to send",
  recordingToggle: "Recording — tap to stop",
  holdHint: "Hold the button while you speak — release to send.",
  unavailable: "Speech to text is not available here.",
  modeMismatch: "The microphone is set up for the other way of talking. Reload the page.",
  transcriptMismatch: "The microphone cannot deliver what you say here. Reload the page.",
} as const;

export type AfVoiceMicButtonProps = {
  /** The hook's return value (`useGatewayVoice`). */
  voice: GatewayVoice;
  /** Hold to talk, or tap to talk: the same `capture_mode` the hook was created with (read with `voiceCaptureMode`: anything but "toggle" is hold). */
  mode: VoiceCaptureMode | (string & {}) | null | undefined;
  /** The transcription route ("faster-whisper / large-v3": `sttRouteText(prefs, defaults)`), named while transcribing. */
  routeText?: string;
  /** Each transcript (subscribed through `voice.add_transcript_listener`). */
  onTranscript?: (text: string, info?: VoiceTranscription) => void;
  /** The idle label, only where the job differs ("Dictate a note"); default "Hold to talk" / "Tap to talk". */
  label?: string;
  /** Why the microphone cannot be used now (plain http, disconnected); disables the button and says why. */
  unavailableReason?: string | null;
  /** The status line beside the button (default true). */
  showStatus?: boolean;
  className?: string;
};

/** Ticks once a second while `active` (the elapsed seconds of "Recording…" / "Transcribing…"). */
function useNow(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [active]);
  return now;
}

export function AfVoiceMicButton(p: AfVoiceMicButtonProps): React.ReactElement {
  const { voice } = p;
  const mode = voiceCaptureMode(p.mode);
  // Wiring faults are shown, never thrown: a render error would take the host page down with it.
  const fault: "" | "mode" | "transcript" =
    voice.voice_capture_mode && voice.voice_capture_mode !== mode
      ? "mode"
      : p.onTranscript && typeof voice.add_transcript_listener !== "function"
        ? "transcript"
        : "";
  useEffect(() => {
    if (fault === "mode")
      console.error(
        `AfVoiceMicButton mode "${mode}" needs useGatewayVoice({ capture_mode: "${mode}" }) (the hook records in "${voice.voice_capture_mode}" mode): pass the same voiceCaptureMode(prefs) to both.`,
      );
    else if (fault === "transcript")
      console.error("AfVoiceMicButton onTranscript needs the voice returned by useGatewayVoice (add_transcript_listener).");
  }, [fault, mode, voice.voice_capture_mode]);
  const held = useRef(false);
  const pressedAt = useRef(0);
  const mounted = useRef(true);
  const recordingRef = useRef(voice.voice_ptt_recording);
  recordingRef.current = voice.voice_ptt_recording;
  const voiceRef = useRef(voice);
  voiceRef.current = voice;
  const transcriptRef = useRef(p.onTranscript);
  transcriptRef.current = p.onTranscript;
  const [hint, setHint] = useState(false);
  const hasTranscript = Boolean(p.onTranscript);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      // The button is gone: nothing keeps recording behind it.
      if (held.current || recordingRef.current) voiceRef.current.cancel_voice_ptt_recording?.();
      held.current = false;
    };
  }, []);
  useEffect(() => {
    if (!hasTranscript || !voice.add_transcript_listener) return;
    return voice.add_transcript_listener((text, info) => transcriptRef.current?.(text, info));
  }, [voice.add_transcript_listener, hasTranscript]);
  useEffect(() => {
    if (!hint) return;
    const timer = setTimeout(() => setHint(false), 4000);
    return () => clearTimeout(timer);
  }, [hint]);

  const reason =
    fault === "mode"
      ? VOICE_MIC_TEXT.modeMismatch
      : fault === "transcript"
        ? VOICE_MIC_TEXT.transcriptMismatch
        : p.unavailableReason || (!voice.voice_ptt_supported ? VOICE_MIC_TEXT.unavailable : null);
  const busy = voice.voice_ptt_busy;
  const recording = voice.voice_ptt_recording;

  // Hold: press records at once; a release sends; a tap (shorter than a word) is discarded.
  const begin = () => {
    const v = voiceRef.current;
    if (reason || v.voice_ptt_busy || held.current) return;
    held.current = true;
    pressedAt.current = Date.now();
    setHint(false);
    void v.start_voice_ptt_recording().then(() => {
      // A permission prompt may outlive the press; never leave the microphone open.
      if (!held.current || !mounted.current) voiceRef.current.cancel_voice_ptt_recording?.();
    });
  };
  const release = () => {
    if (!held.current) return;
    held.current = false;
    if (Date.now() - pressedAt.current < MIN_RECORDING_MS) {
      voiceRef.current.cancel_voice_ptt_recording?.();
      if (mounted.current) setHint(true);
      return;
    }
    voiceRef.current.stop_voice_ptt_recording();
  };
  // Focus left the page mid-hold: nothing is sent.
  const abandon = () => {
    if (!held.current) return;
    held.current = false;
    voiceRef.current.cancel_voice_ptt_recording?.();
  };
  useEffect(() => {
    if (mode !== "hold") return;
    window.addEventListener("pointerup", release);
    window.addEventListener("pointercancel", release);
    window.addEventListener("blur", abandon);
    return () => {
      window.removeEventListener("pointerup", release);
      window.removeEventListener("pointercancel", release);
      window.removeEventListener("blur", abandon);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);
  // Tap: one press starts, the next stops (Space / Enter click the button too).
  const toggle = () => {
    const v = voiceRef.current;
    if (v.voice_ptt_recording) {
      v.stop_voice_ptt_recording();
      return;
    }
    if (reason || v.voice_ptt_busy) return;
    setHint(false);
    void v.start_voice_ptt_recording();
  };

  const since = voice.voice_ptt_since || 0;
  const now = useNow(Boolean(since));
  const idleLabel = p.label || (mode === "hold" ? VOICE_MIC_TEXT.hold : VOICE_MIC_TEXT.toggle);
  const label = recording ? (mode === "hold" ? VOICE_MIC_TEXT.recordingHold : VOICE_MIC_TEXT.recordingToggle) : idleLabel;
  const status = recording
    ? `Recording… ${since ? elapsedSeconds(since, now) : ""}`.trim()
    : busy
      ? transcribingLine(since || now, now, p.routeText || "")
      : hint
        ? VOICE_MIC_TEXT.holdHint
        : "";
  const level = Math.min(1, Math.max(0, Number(voice.voice_ptt_level) || 0));
  const handlers =
    mode === "hold"
      ? {
          onPointerDown: (e: React.PointerEvent) => {
            if (e.button === 0) begin();
          },
          onPointerUp: release,
          onPointerCancel: release,
          onKeyDown: (e: React.KeyboardEvent) => {
            if ([" ", "Enter"].includes(e.key) && !e.repeat) {
              e.preventDefault();
              begin();
            }
          },
          onKeyUp: (e: React.KeyboardEvent) => {
            if ([" ", "Enter"].includes(e.key)) {
              e.preventDefault();
              release();
            }
          },
        }
      : { onClick: toggle };
  return (
    <span className={`af-voice-mic${recording ? " af-voice-mic--recording" : ""}${p.className ? ` ${p.className}` : ""}`} data-voice-mic data-mode={mode} data-voice-mic-error={fault || undefined}>
      <button
        type="button"
        className="af-voice-mic__button"
        data-action="voice-mic"
        aria-label={label}
        aria-pressed={recording}
        title={reason || label}
        disabled={Boolean(reason) || busy}
        {...handlers}
      >
        <Icon name={busy ? "loader" : "mic"} size={15} />
      </button>
      {recording ? (
        <span
          className="af-voice-meter af-voice-mic__meter"
          data-voice-meter
          role="meter"
          aria-label="Microphone level"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(level * 100)}
        >
          <span className="af-voice-meter__fill" style={{ width: `${Math.round(level * 100)}%` }} />
        </span>
      ) : null}
      {p.showStatus !== false && (status || reason) ? (
        <span role="status" className="af-voice-mic__status" data-voice-status>
          {status || reason}
        </span>
      ) : null}
    </span>
  );
}
