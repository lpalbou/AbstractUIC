// AfAboutDialog — the one About dialog every AbstractFramework web app shows.
//
// The rows come from `aboutRows` (identity.ts), which mirrors the Python
// `abstractcore.utils.identity.about_fields`, so the web apps, the desktop
// assistant and the terminal UIs all state the same facts in the same order.
// Same dialog shell as AfAppearanceDialog (overlay, Escape closes, click
// outside closes), themed through the kit tokens in theme.css. It is a true
// modal: Tab / Shift+Tab cycle inside the dialog (aria-modal contract).
import React, { useEffect, useId, useRef } from "react";
import { aboutRows, type AppIdentity } from "./identity.js";

export type AfAboutDialogProps = {
  open: boolean;
  onClose: () => void;
  /** From `appIdentity(id, version)`. */
  identity: AppIdentity;
  /**
   * App-specific rows appended after the standard ones, e.g. the versions the
   * connected gateway reports (`GET /api/gateway/about`). The kit never fetches
   * versions itself: the app passes what it knows.
   */
  extraRows?: ReadonlyArray<readonly [string, string]>;
  /** Defaults to "About <app name>". */
  title?: string;
};

function isUrl(value: string): boolean {
  return value.startsWith("http://") || value.startsWith("https://");
}

const FOCUSABLE = 'a[href], button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])';

/** Tab / Shift+Tab containment inside `card` (exported for the kit checks). */
export function trapTabKey(e: Pick<KeyboardEvent, "key" | "shiftKey" | "preventDefault">, card: HTMLElement | null, active: Element | null): void {
  if (e.key !== "Tab" || !card) return;
  const focusables = Array.from(card.querySelectorAll<HTMLElement>(FOCUSABLE));
  if (focusables.length === 0) {
    e.preventDefault();
    return;
  }
  const first = focusables[0];
  const last = focusables[focusables.length - 1];
  const inside = !!active && card.contains(active);
  if (e.shiftKey) {
    if (active === first || !inside) {
      e.preventDefault();
      last.focus();
    }
  } else if (active === last || !inside) {
    e.preventDefault();
    first.focus();
  }
}

function isEmail(value: string): boolean {
  return value.includes("@") && !value.includes(" ") && !isUrl(value);
}

function RowValue({ value }: { value: string }): React.ReactElement {
  if (isUrl(value)) {
    return (
      <a className="af-about__link" href={value} target="_blank" rel="noopener noreferrer">
        {value}
      </a>
    );
  }
  if (isEmail(value)) {
    return (
      <a className="af-about__link" href={`mailto:${value}`}>
        {value}
      </a>
    );
  }
  return <span>{value}</span>;
}

/** The shared About dialog (controlled: the app owns `open`). */
export function AfAboutDialog(props: AfAboutDialogProps): React.ReactElement | null {
  const closeRef = useRef<HTMLButtonElement | null>(null);
  const cardRef = useRef<HTMLDivElement | null>(null);
  const titleId = useId();
  // Latest onClose without re-running the open effect: an inline onClose
  // must not move focus back and forth on every parent re-render.
  const onCloseRef = useRef(props.onClose);
  onCloseRef.current = props.onClose;

  // Keyed on `open` only: focus the Close button on open, Escape closes, Tab
  // stays inside the dialog, focus returns to the opener on close.
  useEffect(() => {
    if (!props.open) return;
    const restore = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return;
      if (e.key === "Escape") {
        e.preventDefault();
        onCloseRef.current();
        return;
      }
      trapTabKey(e, cardRef.current, document.activeElement);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      if (restore && typeof restore.focus === "function") restore.focus();
    };
  }, [props.open]);

  if (!props.open) return null;

  const title = props.title || `About ${props.identity.name}`;
  const rows = aboutRows(props.identity, props.extraRows);

  return (
    <div className="af-appearance-overlay af-about-overlay" onClick={props.onClose} role="presentation">
      <div
        ref={cardRef}
        className="af-appearance af-about"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="af-appearance__title" id={titleId}>
          {title}
        </div>
        <dl className="af-about__rows">
          {rows.map(([label, value], i) => (
            <div className="af-about__row" key={`${i}:${label}`}>
              <dt className="af-about__label">{label}</dt>
              <dd className="af-about__value">
                <RowValue value={value} />
              </dd>
            </div>
          ))}
        </dl>
        <div className="af-appearance__actions">
          <button ref={closeRef} type="button" className="af-appearance__close" onClick={props.onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

export default AfAboutDialog;
