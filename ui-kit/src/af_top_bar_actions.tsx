// AfTopBarActions — the unified upper-right corner cluster
// (plans/unified-top-bar.md, operator directive 2026-07-13 20:02; ADR 0001,
// backlog 0036 "app shell").
//
// Enforced order (pinned by scripts/check_app_shell.mjs):
//   [app extras] · docs · assistant · appearance · about · account
// ONE ACCOUNT WIDGET, rightmost (operator, 2026-10-29: "(person) admin (status light)", Disconnect
// inside its menu). Signed in with `identity` on, it is the person, their name and the connection
// light in one button; the menu says who and which gateway, Copy user id, Disconnect. Otherwise
// (connecting, signed out, or `identity` off) the same place holds the connection pill. The connection half
// consumes useGatewayConnection's PHASE — three states, never a boolean (a
// boolean flashes "Connect" over a live session during the boot probe;
// code/web's hosted token exchange made this load-bearing, c1645). Pass the
// hook's return value as `connection`: the identity and the sign-out read it
// directly (no re-derived phase).
//
// The cluster also publishes `--af-topbar-h` on <html> (the bottom edge, in
// px, of the header that contains it, kept current by a ResizeObserver) so
// drawers opened with `topOffset: "auto"` sit under the header.
import React, { useEffect, useRef, useState } from "react";
import { AfAboutDialog, ABOUT_VERSIONS_CHECKING, fetchAboutVersions, type AfAboutVersions, type AfGatewayFetch } from "./about.js";
import { AfAppearanceDialog, type AppearanceSettings } from "./appearance.js";
import { AfMenu } from "./af_menu.js";
import { Icon } from "./icon.js";
import { useAfTooltips } from "./af_tooltip.js";
import type { AppIdentity } from "./identity.js";
import type { GatewayConnectionState } from "./gateway_connect_modal.js";
import type { GatewayConnection, GatewayConnectionPhase } from "./use_gateway_connection.js";
import { gatewayHostLabel, principalFromConnection, principalLabel, type AfPrincipal } from "./principal.js";

/** The connection the cluster renders, when the host does not pass the hook's return value. */
export type AfTopBarConnection = {
  phase: GatewayConnectionPhase;
  /** True while signOut is in flight (renders "Disconnecting…"). */
  signingOut?: boolean;
  /** Opens the connect modal (disconnected/loading states). */
  onConnect: () => void;
  /**
   * Disconnects (connected state). Apps MAY interpose a confirm first. With
   * this shape the cluster never calls `onSignOut`: the host's own
   * `onDisconnect` owns its state wipe (it alone knows whether it happened).
   */
  onDisconnect: () => void;
  /** The connection status (the identity's source; `useGatewayConnection().status`). */
  status?: GatewayConnectionState | null;
  /** The last disconnect's failure, rendered beside the pill (`useGatewayConnection().signOutError`). */
  signOutError?: string | null;
};

export type AfTopBarActionsProps = {
  /**
   * The Docs assistant (round 8): the app's documentation chat (panel-chat
   * `DocsAssistantDrawer` / `docsAssistantPanel`). Same book icon in every
   * app and the console. Omit to hide it.
   */
  docs?: {
    open: boolean;
    onToggle: () => void;
    label?: string;
  };
  /** An app-specific assistant (e.g. Flow's authoring assistant, Continuum's
   * advisor). Omit to hide the assistant button. */
  assistant?: {
    open: boolean;
    onToggle: () => void;
    label?: string;
  };
  /**
   * Omit to hide the appearance button. `{onOpen}` = the host owns its
   * dialog; `{value, onChange}` (e.g. from `useAppearanceSettings`) = the
   * cluster owns the open state and renders `AfAppearanceDialog`, like About.
   */
  appearance?:
    | { onOpen: () => void; label?: string }
    | { value: AppearanceSettings; onChange: (next: AppearanceSettings) => void; label?: string; title?: string; note?: string };
  /**
   * Omit to hide the About button. With it, the cluster renders an "About"
   * button that opens the shared AfAboutDialog (the cluster owns the open
   * state). `versions` = the framework and gateway versions; or pass `fetch`
   * (the host's gateway fetch) and the cluster GETs `api/gateway/about` each
   * time the dialog opens (used only when `versions` is omitted). `onOpen`
   * fires each time the dialog opens. `extra` = host content in the dialog
   * (under the links).
   */
  about?: {
    identity: AppIdentity;
    versions?: AfAboutVersions;
    fetch?: AfGatewayFetch;
    extra?: React.ReactNode;
    onOpen?: () => void;
    label?: string;
  };
  /**
   * Who is signed in (from the connection's status: `status.gateway.principal`). On, and
   * connected: ONE account button takes the pill's place: person icon, name, connection light;
   * it opens the menu (who, which gateway, Copy user id, Disconnect). "badge" is the former
   * read-only badge and now renders the same account button (one widget in every app).
   * Omit/false = no identity: the connection pill alone.
   */
  identity?: "badge" | "menu" | false;
  /**
   * The app's own state wipe, run only after a disconnect that HAPPENED
   * (`connection.signOut()` resolved true). Hook-shaped `connection` only;
   * ignored with the legacy shape (its `onDisconnect` owns the wipe).
   */
  onSignOut?: () => void;
  /** App-specific actions, rendered FIRST (left of docs). */
  extraActions?: React.ReactNode;
  /** `useGatewayConnection()`'s return value (preferred), or the legacy phase + callbacks. */
  connection: AfTopBarConnection | GatewayConnection;
  /** Publish `--af-topbar-h` (default true). */
  publishHeight?: boolean;
  className?: string;
};

/**
 * The pill's words, decided once (ADR 0001 §5). ONE verb for ending the
 * session, in the pill and in the identity menu: "Disconnect" (in flight
 * "Disconnecting…"); "Disconnect from gateway" is the accessible name apps'
 * end-to-end tests already address.
 */
export function topBarPillText(phase: GatewayConnectionPhase, signingOut: boolean): { label: string; title: string } {
  const label = signingOut ? "Disconnecting…" : phase === "connected" ? "Disconnect" : phase === "loading" ? "Connecting…" : "Connect";
  const title = phase === "connected" ? "Disconnect from gateway" : phase === "loading" ? "Checking gateway session…" : "Connect to gateway";
  return { label, title };
}

function isHookConnection(c: AfTopBarConnection | GatewayConnection): c is GatewayConnection {
  return typeof (c as GatewayConnection).openModal === "function" && typeof (c as GatewayConnection).signOut === "function";
}

/**
 * The cluster's view of either connection shape: phase, connect, the ONE
 * disconnect (the pill and the identity menu's Disconnect call the same
 * function), the status the identity reads and the last disconnect failure.
 * Hook shape: `signOut()`, then `onSignOut` only when it resolved true (the
 * session is gone). Legacy shape: `onDisconnect()` only.
 */
export function topBarConnection(
  c: AfTopBarConnection | GatewayConnection,
  onSignOut?: () => void,
): { phase: GatewayConnectionPhase; signingOut: boolean; connect: () => void; disconnect: () => Promise<void>; status: GatewayConnectionState | null; signOutError: string | null } {
  if (isHookConnection(c)) {
    return {
      phase: c.phase,
      signingOut: c.signingOut === true,
      connect: c.openModal,
      disconnect: async () => {
        const done = await c.signOut();
        if (done === true) onSignOut?.();
      },
      status: c.status,
      signOutError: c.signOutError || null,
    };
  }
  return {
    phase: c.phase,
    signingOut: c.signingOut === true,
    connect: c.onConnect,
    disconnect: async () => {
      c.onDisconnect();
    },
    status: c.status ?? null,
    signOutError: c.signOutError || null,
  };
}

/** The identity's tooltip / accessible description. */
export function identityTitle(p: AfPrincipal, gatewayUrl: string | null | undefined): string {
  const host = gatewayHostLabel(gatewayUrl);
  return `Signed in as ${principalLabel(p)}${host ? ` · gateway ${host}` : ""}`;
}

/** The account button's tooltip: who, which gateway, the light's meaning, and where Disconnect is. */
export function accountTitle(p: AfPrincipal, gatewayUrl: string | null | undefined, signingOut: boolean): string {
  return `${identityTitle(p, gatewayUrl)} · ${signingOut ? "disconnecting…" : "connected (Disconnect is in this menu)"}`;
}

/** The CSS variable the cluster publishes and `topOffset: "auto"` reads. */
export const AF_TOPBAR_HEIGHT_VAR = "--af-topbar-h";

/**
 * Publish the bottom edge of `el`'s header (`[data-af-topbar]`, else the
 * nearest `<header>`, else the parent) as `--af-topbar-h` on <html> while
 * mounted. The value is viewport-relative (`getBoundingClientRect().bottom`):
 * right for a fixed or sticky header; for a header that scrolls away it is
 * re-measured on scroll. It updates on the header's resize (ResizeObserver),
 * window resize and scroll; where ResizeObserver is missing, a header that
 * grows without a resize or a scroll is seen at the next one. On unmount the
 * variable is removed, unless another publisher wrote it since.
 */
export function useAfTopBarHeight(ref: React.RefObject<HTMLElement | null>, enabled = true): void {
  useEffect(() => {
    if (!enabled || typeof window === "undefined" || typeof document === "undefined") return;
    const el = ref.current;
    if (!el) return;
    const header = (el.closest("[data-af-topbar], header") as HTMLElement | null) || el.parentElement || el;
    const root = document.documentElement;
    let written = "";
    const sync = () => {
      const bottom = Math.max(0, Math.round(header.getBoundingClientRect().bottom));
      written = `${bottom}px`;
      root.style.setProperty(AF_TOPBAR_HEIGHT_VAR, written);
    };
    sync();
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(sync) : null;
    ro?.observe(header);
    const passive = { passive: true, capture: true } as AddEventListenerOptions;
    window.addEventListener("resize", sync);
    window.addEventListener("scroll", sync, passive);
    return () => {
      ro?.disconnect();
      window.removeEventListener("resize", sync);
      window.removeEventListener("scroll", sync, passive);
      if (written && root.style.getPropertyValue(AF_TOPBAR_HEIGHT_VAR) === written) root.style.removeProperty(AF_TOPBAR_HEIGHT_VAR);
    };
  }, [ref, enabled]);
}

function copyText(value: string): (() => void) | null {
  const clip = typeof navigator !== "undefined" ? (navigator as Navigator).clipboard : undefined;
  if (!clip || typeof clip.writeText !== "function") return null;
  return () => {
    void clip.writeText(value).catch(() => undefined);
  };
}

export function AfTopBarActions(props: AfTopBarActionsProps): React.ReactElement {
  const conn = topBarConnection(props.connection, props.onSignOut);
  const { phase, signingOut } = conn;
  const [aboutOpen, setAboutOpen] = useState(false);
  const [appearanceOpen, setAppearanceOpen] = useState(false);
  const [fetchedVersions, setFetchedVersions] = useState<AfAboutVersions | undefined>(undefined);
  const rootRef = useRef<HTMLDivElement | null>(null);
  // Icon buttons explain themselves with the kit tooltip (data-af-tip; no native title).
  useAfTooltips();
  useAfTopBarHeight(rootRef, props.publishHeight !== false);
  const about = props.about;
  const appearance = props.appearance;
  const ownsAppearance = Boolean(appearance && "value" in appearance);

  // About versions fetched by the cluster on open (only when the host passes `fetch`
  // and no `versions`); a late answer after close/unmount is dropped.
  const aboutFetch = about && !about.versions ? about.fetch : undefined;
  const fetchRef = useRef(aboutFetch);
  fetchRef.current = aboutFetch;
  useEffect(() => {
    const f = fetchRef.current;
    if (!aboutOpen || !f) return;
    const ctl = typeof AbortController !== "undefined" ? new AbortController() : null;
    let live = true;
    setFetchedVersions(ABOUT_VERSIONS_CHECKING);
    void fetchAboutVersions(f, ctl?.signal).then((v) => {
      if (live) setFetchedVersions(v);
    });
    return () => {
      live = false;
      ctl?.abort();
    };
  }, [aboutOpen]);

  const pill = topBarPillText(phase, signingOut);
  // The identity follows the pill: nothing unless the phase is connected (one source).
  const principal = props.identity && phase === "connected" ? principalFromConnection(conn.status) : null;
  const signOut = () => void conn.disconnect();

  // The account button (signed in, `identity` on) REPLACES the pill: one widget, never two.
  let account: React.ReactNode = null;
  if (principal && props.identity) {
    const label = principalLabel(principal);
    const title = accountTitle(principal, conn.status?.gateway_url, signingOut);
    const copy = copyText(principal.userId);
    const host = gatewayHostLabel(conn.status?.gateway_url);
    account = (
      <AfMenu
        label={`Account: ${title}`}
        tip={title}
        className="af-topbar__account"
        buttonClassName="af-topbar__identity af-topbar__identity--menu"
        buttonContent={
          <>
            <Icon name="user" size={14} />
            <span className="af-topbar__identity-label">{label}</span>
            <span className={`af-topbar__dot af-topbar__dot--${signingOut ? "loading" : "connected"}`} data-af-identity="menu" aria-hidden="true" />
          </>
        }
        header={
          <span className="af-topbar__account-head">
            <span className="af-topbar__account-who">Signed in as {label}</span>
            {host ? <span className="af-topbar__account-host">Gateway {host}</span> : null}
          </span>
        }
        items={[
          { id: "copy-user-id", label: "Copy user id", onSelect: copy || (() => undefined), hidden: !copy },
          { id: "disconnect", label: signingOut ? "Disconnecting…" : "Disconnect", onSelect: signingOut ? () => undefined : signOut, danger: true },
        ]}
      />
    );
  }

  return (
    <div ref={rootRef} className={`af-topbar${props.className ? ` ${props.className}` : ""}`} role="group" aria-label="App actions">
      {props.extraActions}

      {props.docs ? (
        <button
          type="button"
          className={`af-topbar__btn af-topbar__btn--docs${props.docs.open ? " is-active" : ""}`}
          aria-pressed={props.docs.open}
          aria-label={props.docs.label || "Docs assistant"}
          data-af-tip={props.docs.label || "Docs assistant"}
          onClick={props.docs.onToggle}
        >
          <Icon name="book" size={16} />
        </button>
      ) : null}

      {props.assistant ? (
        <button
          type="button"
          className={`af-topbar__btn af-topbar__btn--assistant${props.assistant.open ? " is-active" : ""}`}
          aria-pressed={props.assistant.open}
          aria-label={props.assistant.label || "Open assistant"}
          data-af-tip={props.assistant.label || "Assistant"}
          onClick={props.assistant.onToggle}
        >
          <Icon name="sparkle" size={16} />
        </button>
      ) : null}

      {appearance ? (
        <button
          type="button"
          className="af-topbar__btn af-topbar__btn--appearance"
          aria-label={appearance.label || "Appearance (theme and typography)"}
          data-af-tip={appearance.label || "Appearance (theme and text size)"}
          aria-haspopup={ownsAppearance ? "dialog" : undefined}
          onClick={() => {
            if ("value" in appearance) setAppearanceOpen(true);
            else appearance.onOpen();
          }}
        >
          <Icon name="contrast" size={16} />
        </button>
      ) : null}

      {about ? (
        <button
          type="button"
          className="af-topbar__btn af-topbar__btn--about"
          aria-label={about.label || `About ${about.identity.name}`}
          data-af-tip={about.label || `About ${about.identity.name}`}
          aria-haspopup="dialog"
          onClick={() => {
            setAboutOpen(true);
            about.onOpen?.();
          }}
        >
          <Icon name="about" size={16} />
        </button>
      ) : null}

      {conn.signOutError ? (
        <span className="af-topbar__signout-error" role="alert" data-af-tip={`Disconnect failed: ${conn.signOutError}`} aria-label={`Disconnect failed: ${conn.signOutError}`}>
          <Icon name="warning" size={14} />
          <span className="af-topbar__signout-error-label">Disconnect failed</span>
        </span>
      ) : null}

      {account || (
        <button
          type="button"
          className={`af-topbar__pill af-topbar__pill--${phase}`}
          onClick={phase === "connected" ? signOut : conn.connect}
          disabled={signingOut}
          title={pill.title}
          aria-label={pill.title}
        >
          <span className={`af-topbar__dot af-topbar__dot--${phase}`} aria-hidden="true" />
          <span className="af-topbar__pill-label">{pill.label}</span>
        </button>
      )}

      {about ? (
        <AfAboutDialog
          open={aboutOpen}
          onClose={() => setAboutOpen(false)}
          identity={about.identity}
          versions={about.versions || (about.fetch ? fetchedVersions : undefined)}
          extra={about.extra}
        />
      ) : null}
      {appearance && "value" in appearance ? (
        <AfAppearanceDialog
          open={appearanceOpen}
          onClose={() => setAppearanceOpen(false)}
          value={appearance.value}
          onChange={appearance.onChange}
          title={appearance.title}
          note={appearance.note}
        />
      ) : null}
    </div>
  );
}

export default AfTopBarActions;
