/*
 * AfTooltip — the kit's themed tooltip for React apps. Behaviour lives in
 * af_tooltip_core (shared with plain-HTML hosts through
 * `AfConsoleIslands.bindTooltips`): 150 ms delay on hover, shown on keyboard
 * focus, hoverable, Escape / press / scroll hide it, placed above the anchor
 * (flipped below) and kept inside the viewport.
 *
 *   <AfTooltip content="Archive alice (kept, hidden)">
 *     <button type="button" aria-label="Archive alice">…</button>
 *   </AfTooltip>
 *
 * The child must be ONE element that accepts a `data-af-tip` attribute; it
 * keeps its own aria-label and must NOT carry a `title` (a native tooltip
 * would show twice). Plain markup may set `data-af-tip` directly and call
 * useAfTooltips() once in the tree.
 */
import React, { useEffect } from "react";
import { acquireAfTooltips, AF_TOOLTIP_ATTR } from "./af_tooltip_core.js";

/** Bind the document-wide tooltip while the calling component is mounted. */
export function useAfTooltips(): void {
  useEffect(() => {
    if (typeof document === "undefined") return;
    return acquireAfTooltips(document);
  }, []);
}

export type AfTooltipProps = {
  /** The sentence shown (plain text). Empty = no tooltip. */
  content: string;
  children: React.ReactElement;
};

export function AfTooltip(props: AfTooltipProps): React.ReactElement {
  useAfTooltips();
  const child = React.Children.only(props.children);
  const text = String(props.content || "").trim();
  if (!text) return child;
  return React.cloneElement(child, { [AF_TOOLTIP_ATTR]: text } as Record<string, unknown>);
}

export default AfTooltip;
