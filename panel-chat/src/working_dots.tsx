import React from "react";

/**
 * Three dots that rise in turn while the assistant works on a reply: the desktop Assistant's
 * thinking dots (abstractassistant `ThinkingDotsWidget`: 6 px dots 9 px apart, each lifting
 * 4.5 px in the accent colour, resting faint, one wave every ~0.75 s). Under reduced motion the
 * dots stand still. The host decides when the assistant is working (a run state, never text).
 */
export function WorkingDots({ label = "Working", className }: { label?: string; className?: string }): React.ReactElement {
  return (
    <span className={["pc-working-dots", className].filter(Boolean).join(" ")} role="img" aria-label={label}>
      <span className="pc-working-dots__dot" />
      <span className="pc-working-dots__dot" />
      <span className="pc-working-dots__dot" />
    </span>
  );
}
