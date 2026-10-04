// AfAbout / AfAboutDialog — the one About every AbstractFramework web app and
// console shows (compact card, ui-kit 0.7.0).
//
// Content rule (operator, round 5): the app's name and version, the
// framework version, the gateway version, the links (website, source, docs,
// issues, feedback, contact) and ONE author/licence line. Never a package
// list: per-package versions belong to the gateway's own diagnostics, not to
// About. Same dialog shell as AfAppearanceDialog (overlay, Escape closes,
// click outside closes); a true modal (Tab / Shift+Tab cycle inside).
import React, { useEffect, useId, useRef } from "react";
import { frameworkIdentity, type AppIdentity, type GatewayAboutPayload } from "./identity.js";
import { Icon } from "./icon.js";

/**
 * The two versions About states besides the app's own. `null`/missing = not
 * known; `gatewayNote` says why the gateway version is missing (e.g.
 * "unavailable (HTTP 503)"). The kit never fetches: the app passes what it
 * knows, typically from `aboutVersionsFromGateway(GET /api/gateway/about)`.
 */
export type AfAboutVersions = {
  /** The AbstractFramework version (installed on the gateway host for web apps). */
  framework?: string | null;
  /** Why `framework` is missing (e.g. "not installed on the gateway host"); shown instead of "not reported". */
  frameworkNote?: string;
  /** The AbstractGateway version the app talks to (or serves). */
  gateway?: string | null;
  /** Why `gateway` is missing; shown instead of "not connected". */
  gatewayNote?: string;
};

export type AfAboutProps = {
  /** From `appIdentity(id, version)`. */
  identity: AppIdentity;
  versions?: AfAboutVersions;
  /** id of the heading (the dialog's aria-labelledby). */
  titleId?: string;
  /** Rendered in the heading row, at the end (the dialog's Close button). */
  action?: React.ReactNode;
  className?: string;
};

export type AfAboutDialogProps = Omit<AfAboutProps, "titleId" | "action" | "className"> & {
  open: boolean;
  onClose: () => void;
};

function versionOf(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/**
 * About versions from the body of `GET /api/gateway/about` (or, when the
 * request failed, `null` + the reason). Only the framework and gateway
 * versions are taken: the payload's per-package list is deliberately unused.
 */
export function aboutVersionsFromGateway(payload: GatewayAboutPayload | null, error?: string): AfAboutVersions {
  if (error !== undefined && error !== null) {
    return { framework: null, gateway: null, gatewayNote: `unavailable (${String(error).trim() || "unknown error"})` };
  }
  const raw = (payload && typeof payload === "object" && !Array.isArray(payload) ? payload : {}) as Record<string, unknown>;
  const gateway = versionOf(raw.abstractgateway);
  const framework = versionOf(raw.abstractframework);
  return {
    framework: framework || null,
    gateway: gateway || null,
    ...(gateway && !framework ? { frameworkNote: "not installed on the gateway host" } : {}),
    ...(gateway ? {} : { gatewayNote: "unavailable (the gateway did not report its version)" }),
  };
}

/** The ordered links of an About card (exported for the kit checks). */
export function aboutLinks(identity: AppIdentity): Array<{ id: string; label: string; href: string; title: string }> {
  const fw = frameworkIdentity();
  return [
    { id: "website", label: "Website", href: identity.website, title: identity.website },
    { id: "source", label: "Source", href: identity.repo, title: identity.repo },
    { id: "docs", label: "Docs", href: identity.docs, title: identity.docs },
    { id: "issues", label: "Issues", href: identity.issues, title: identity.issues },
    { id: "feedback", label: "Feedback", href: identity.feedback, title: identity.feedback },
    { id: "contact", label: "Contact", href: `mailto:${fw.contact_email}`, title: fw.contact_email },
  ];
}

/** The two version facts as `[label, text]` (exported for the kit checks). */
export function aboutVersionFacts(versions: AfAboutVersions | undefined): Array<[string, string]> {
  const v = versions || {};
  const framework = versionOf(v.framework);
  const gateway = versionOf(v.gateway);
  return [
    ["AbstractFramework", framework || (versionOf(v.frameworkNote) || "not reported")],
    ["AbstractGateway", gateway || (versionOf(v.gatewayNote) || "not connected")],
  ];
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

// Same rule as the Python `about_html` (`_URL_RE`): every http(s) URL inside a
// value is a link, the rest stays text; ONLY the "Contact" row is a mailto
// (a value such as `basic-agent@0.1.0:main` is plain text).
const URL_RE = /https?:\/\/[^\s<>"]+/g;

/** Split a row value into text and link parts (exported for the kit checks). */
export function aboutValueParts(label: string, value: string): Array<{ text: string; href?: string }> {
  if (label === "Contact") return [{ text: value, href: `mailto:${value}` }];
  const parts: Array<{ text: string; href?: string }> = [];
  let last = 0;
  for (const m of value.matchAll(URL_RE)) {
    const at = m.index ?? 0;
    if (at > last) parts.push({ text: value.slice(last, at) });
    parts.push({ text: m[0], href: m[0] });
    last = at + m[0].length;
  }
  if (last < value.length || parts.length === 0) parts.push({ text: value.slice(last) });
  return parts;
}

/** The About card (inline; AfAboutDialog wraps it in a modal). */
export function AfAbout(p: AfAboutProps): React.ReactElement {
  const fw = frameworkIdentity();
  return (
    <div className={`af-about-card${p.className ? ` ${p.className}` : ""}`} data-app={p.identity.id}>
      <div className="af-about-card__head">
        <h2 className="af-about-card__name" id={p.titleId}>
          {p.identity.name} <span className="af-about-card__version">{p.identity.version}</span>
        </h2>
        {p.action}
      </div>
      <dl className="af-about-card__versions">
        {aboutVersionFacts(p.versions).map(([label, text]) => (
          <div className="af-about-card__fact" key={label}>
            <dt>{label}</dt>
            <dd>{text}</dd>
          </div>
        ))}
      </dl>
      <nav className="af-about-card__links" aria-label={`${p.identity.name} links`}>
        {aboutLinks(p.identity).map((link) =>
          link.href.startsWith("mailto:") ? (
            <a key={link.id} className="af-about-card__link" data-link={link.id} href={link.href} title={link.title}>
              {link.label}
            </a>
          ) : (
            <a key={link.id} className="af-about-card__link" data-link={link.id} href={link.href} title={link.title} target="_blank" rel="noopener noreferrer">
              {link.label}
            </a>
          ),
        )}
      </nav>
      <p className="af-about-card__legal">{fw.copyright}</p>
    </div>
  );
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
        <AfAbout
          identity={props.identity}
          versions={props.versions}
          titleId={titleId}
          action={
            <button ref={closeRef} type="button" className="af-about-card__close" data-action="close-about" onClick={props.onClose} aria-label="Close" title="Close">
              <Icon name="x" size={16} />
            </button>
          }
        />
      </div>
    </div>
  );
}

export default AfAboutDialog;
