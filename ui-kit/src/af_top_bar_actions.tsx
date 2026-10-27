// AfTopBarActions — the unified upper-right corner cluster
// (plans/unified-top-bar.md, operator directive 2026-07-13 20:02; ADR 0001,
// backlog 0036 "app shell").
//
// Enforced order (pinned by scripts/check_app_shell.mjs):
//   [app extras] · docs · assistant · appearance · about · identity · pill
// The connection pill is always rightmost and the identity sits immediately
// left of it, so "who" and "which gateway" read together. The connection half
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
  /** True while signOut is in flight (renders "Signing out…"). */
  signingOut?: boolean;
  /** Opens the connect modal (disconnected/loading states). */
  onConnect: () => void;
  /** Signs out (connected state). Apps MAY interpose a confirm first. */
  onDisconnect: () => void;
  /** The connection status (the identity's source; `useGatewayConnection().status`). */
  status?: GatewayConnectionState | null;
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
   * Who is signed in, immediately left of the pill (from the connection's
   * status: `status.gateway.principal`). "badge" = icon + label;
   * "menu" = the same, opening a menu (who, which gateway, Copy user id,
   * Sign out). Omit/false = hidden. Nothing renders while signed out.
   */
  identity?: "badge" | "menu" | false;
  /** Runs AFTER the cluster's sign-out (`connection.signOut()`): the app's own state wipe. */
  onSignOut?: () => void;
  /** App-specific actions, rendered FIRST (left of docs). */
  extraActions?: React.ReactNode;
  /** `useGatewayConnection()`'s return value (preferred), or the legacy phase + callbacks. */
  connection: AfTopBarConnection | GatewayConnection;
  /** Publish `--af-topbar-h` (default true). */
  publishHeight?: boolean;
  className?: string;
};

/** The pill's words, decided once (ADR 0001 §5). */
export function topBarPillText(phase: GatewayConnectionPhase, signingOut: boolean): { label: string; title: string } {
  const label = signingOut ? "Signing out…" : phase === "connected" ? "Disconnect" : phase === "loading" ? "Connecting…" : "Connect";
  const title = phase === "connected" ? "Disconnect from gateway" : phase === "loading" ? "Checking gateway session…" : "Connect to gateway";
  return { label, title };
}

function isHookConnection(c: AfTopBarConnection | GatewayConnection): c is GatewayConnection {
  return typeof (c as GatewayConnection).openModal === "function" && typeof (c as GatewayConnection).signOut === "function";
}

/**
 * The cluster's view of either connection shape: phase, connect, the ONE
 * disconnect (the pill and the identity menu's Sign out call the same
 * function: the hook's `signOut()` then the host's `onSignOut`), and the
 * status the identity reads.
 */
export function topBarConnection(
  c: AfTopBarConnection | GatewayConnection,
  onSignOut?: () => void,
): { phase: GatewayConnectionPhase; signingOut: boolean; connect: () => void; disconnect: () => Promise<void>; status: GatewayConnectionState | null } {
  if (isHookConnection(c)) {
    return {
      phase: c.phase,
      signingOut: c.signingOut === true,
      connect: c.openModal,
      disconnect: async () => {
        await c.signOut();
        onSignOut?.();
      },
      status: c.status,
    };
  }
  return {
    phase: c.phase,
    signingOut: c.signingOut === true,
    connect: c.onConnect,
    disconnect: async () => {
      c.onDisconnect();
      onSignOut?.();
    },
    status: c.status ?? null,
  };
}

/** The identity's tooltip / accessible description. */
export function identityTitle(p: AfPrincipal, gatewayUrl: string | null | undefined): string {
  const host = gatewayHostLabel(gatewayUrl);
  return `Signed in as ${principalLabel(p)}${host ? ` · gateway ${host}` : ""}`;
}

/** The CSS variable the cluster publishes and `topOffset: "auto"` reads. */
export const AF_TOPBAR_HEIGHT_VAR = "--af-topbar-h";

/** Publish the bottom edge of `el`'s header as `--af-topbar-h` while mounted. */
export function useAfTopBarHeight(ref: React.RefObject<HTMLElement | null>, enabled = true): void {
  useEffect(() => {
    if (!enabled || typeof window === "undefined" || typeof document === "undefined") return;
    const el = ref.current;
    if (!el) return;
    const header = (el.closest("[data-af-topbar], header") as HTMLElement | null) || el.parentElement || el;
    const root = document.documentElement;
    const sync = () => {
      const bottom = Math.max(0, Math.round(header.getBoundingClientRect().bottom));
      root.style.setProperty(AF_TOPBAR_HEIGHT_VAR, `${bottom}px`);
    };
    sync();
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(sync) : null;
    ro?.observe(header);
    window.addEventListener("resize", sync);
    return () => {
      ro?.disconnect();
      window.removeEventListener("resize", sync);
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
  const principal = props.identity ? principalFromConnection(conn.status) : null;
  const signOut = () => void conn.disconnect();

  let identity: React.ReactNode = null;
  if (principal && props.identity) {
    const label = principalLabel(principal);
    const title = identityTitle(principal, conn.status?.gateway_url);
    const face = (
      <>
        <Icon name="user" size={14} />
        <span className="af-topbar__identity-label">{label}</span>
      </>
    );
    if (props.identity === "badge") {
      identity = (
        <span className="af-topbar__identity af-topbar__identity--badge" data-af-identity="badge" title={title} aria-label={title}>
          {face}
        </span>
      );
    } else {
      const copy = copyText(principal.userId);
      const host = gatewayHostLabel(conn.status?.gateway_url);
      identity = (
        <AfMenu
          label={`Account: ${title}`}
          title={title}
          className="af-topbar__account"
          buttonClassName="af-topbar__identity af-topbar__identity--menu"
          buttonContent={face}
          header={
            <span className="af-topbar__account-head" data-af-identity="menu">
              <span className="af-topbar__account-who">Signed in as {label}</span>
              {host ? <span className="af-topbar__account-host">Gateway {host}</span> : null}
            </span>
          }
          items={[
            { id: "copy-user-id", label: "Copy user id", onSelect: copy || (() => undefined), hidden: !copy },
            { id: "sign-out", label: signingOut ? "Signing out…" : "Sign out", onSelect: signOut, danger: true, hidden: signingOut },
          ]}
        />
      );
    }
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
          <Icon name="info" size={16} />
        </button>
      ) : null}

      {identity}

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
