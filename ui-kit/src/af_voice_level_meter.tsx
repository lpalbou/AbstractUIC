// AfVoiceLevelMeter + useVoiceLevel — the live microphone level (ui-primitives
// 0035, review 2026-10-27 M1). `useGatewayVoice` sends the level to
// subscribers (`subscribe_level`) instead of holding it in state, so the hook's
// owner (often the app's top level) never re-renders ~20 times a second while
// the user speaks: only this meter does.
import React, { useEffect, useState } from "react";

/** Anything that sends a live level 0..1: the value `useGatewayVoice` returns. */
export type VoiceLevelSource = { subscribe_level?: (fn: (level: number) => void) => () => void };

/** The live level of `source` (0 without one). Re-renders only the component that calls it. */
export function useVoiceLevel(source?: VoiceLevelSource | null): number {
  const [level, setLevel] = useState(0);
  const subscribe = source?.subscribe_level;
  useEffect(() => {
    if (!subscribe) {
      setLevel(0);
      return;
    }
    return subscribe((v) => setLevel(Math.min(1, Math.max(0, Number(v) || 0))));
  }, [subscribe]);
  return level;
}

export type AfVoiceLevelMeterProps = {
  /** The live level's source (`voice` from `useGatewayVoice`). */
  source?: VoiceLevelSource | null;
  /** A level the host already has (0..1); wins over `source`. */
  level?: number;
  /** Accessible name (default "Microphone level"). */
  label?: string;
  /** Where the level comes from, for styling and checks ("live", "test"). */
  origin?: string;
  /** A span inside a line of controls instead of a block. */
  inline?: boolean;
  className?: string;
};

export function AfVoiceLevelMeter(p: AfVoiceLevelMeterProps): React.ReactElement {
  const live = useVoiceLevel(p.level === undefined ? p.source : null);
  const value = Math.min(1, Math.max(0, p.level === undefined ? live : Number(p.level) || 0));
  const Tag = p.inline ? "span" : "div";
  return (
    <Tag
      className={`af-voice-meter${p.className ? ` ${p.className}` : ""}`}
      data-voice-meter
      data-voice-meter-source={p.origin || "live"}
      role="meter"
      aria-label={p.label || "Microphone level"}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(value * 100)}
    >
      <span className="af-voice-meter__fill" style={{ width: `${Math.round(value * 100)}%` }} />
    </Tag>
  );
}
