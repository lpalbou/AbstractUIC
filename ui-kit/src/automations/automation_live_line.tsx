// The live line of a run in progress, under its "Running" badge: `2:14 · Search the web for AI
// news` and `7 steps so far` (or `Waiting to retry (attempt 2)` between attempts). The elapsed time
// ticks every second on the client; the line's two rows are reserved (theme.css `.af-auto-live`)
// so nothing below moves when it changes. Not a live region: a clock that changes every second
// would be read out every second.
import React, { useEffect, useState } from "react";
import { automationLiveWords, liveElapsed } from "./automation_live.js";
import type { CurrentOccurrence } from "./types.js";

export type AutomationLiveLineProps = {
  /** The summary's `current_occurrence` (with its `live` from the detail route). */
  current: CurrentOccurrence | null | undefined;
  /** The first clock reading (ms since epoch; default `Date.now()`); it then ticks each second. */
  nowMs?: number;
  className?: string;
};

/** Null when `automationLiveWords(current)` has nothing to say (the row then reads as before). */
export function AutomationLiveLine(p: AutomationLiveLineProps): React.ReactElement | null {
  const words = automationLiveWords(p.current);
  const ticking = words !== null && words.elapsedFrom !== null;
  const [now, setNow] = useState(() => p.nowMs ?? Date.now());
  useEffect(() => {
    if (!ticking) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [ticking]);
  if (!words) return null;
  const state = p.current?.live && words.elapsedFrom !== null ? p.current.live.state : p.current?.status;
  return (
    <div className={`af-auto-live${p.className ? ` ${p.className}` : ""}`} data-live-state={state}>
      <span className="af-auto-live__now">
        {words.elapsedFrom !== null ? (
          <>
            <span className="af-auto-live__elapsed">{liveElapsed(words.elapsedFrom, now)}</span> ·{" "}
          </>
        ) : null}
        {words.text}
      </span>
      {words.steps ? <span className="af-auto-live__steps">{words.steps}</span> : null}
    </div>
  );
}
