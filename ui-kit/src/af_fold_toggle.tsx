/*
 * AfFoldToggle — the kit's ONE header of a fold: a real button (Enter and Space toggle it) with a
 * chevron (right = folded, down = open), an optional icon, the host's label, `aria-expanded` and
 * `aria-controls`. Controlled: the host holds `open` (and remembers it if it wants). The fold's body
 * is the host's. Wrapped by `AutomationGroupFold` ("Failed · 2") and by hosts' list disclosures
 * (AbstractObserver `ListDisclosure`), each keeping its own class for its look. Hook-free.
 */
import React from "react";
import { Icon } from "./icon.js";

export type AfFoldToggleProps = {
  open: boolean;
  /** Pressed: the host flips `open`. */
  onToggle(): void;
  /** id of the element the toggle shows and hides. */
  controls?: string;
  /** The host's class (its look); default `af-fold-toggle`. */
  className?: string;
  chevronClassName?: string;
  /** An icon after the chevron (e.g. the group's glyph). */
  icon?: React.ReactNode;
  /** `data-action` (clients and tests find it by this). */
  action?: string;
  title?: string;
  children?: React.ReactNode;
};

export function AfFoldToggle(p: AfFoldToggleProps): React.ReactElement {
  return (
    <button
      type="button"
      className={p.className ?? "af-fold-toggle"}
      {...(p.action ? { "data-action": p.action } : {})}
      aria-expanded={p.open}
      aria-controls={p.controls}
      title={p.title}
      onClick={() => p.onToggle()}
    >
      <Icon name={p.open ? "chevronDown" : "chevronRight"} size={14} className={p.chevronClassName} />
      {p.icon}
      {p.children}
    </button>
  );
}

export default AfFoldToggle;
