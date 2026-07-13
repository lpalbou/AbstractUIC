// AfTopBarActions — the unified upper-right corner cluster
// (plans/unified-top-bar.md, operator directive 2026-07-13 20:02).
//
// Enforced order (behavior contract statement 1): assistant → appearance →
// [app extras] → Disconnect pill, always rightmost. The connection half
// consumes useGatewayConnection's PHASE — three states, never a boolean
// (a boolean flashes "Connect" over a live session during the boot probe;
// code/web's hosted token exchange made this load-bearing, c1645).
import React from "react";
import { Icon } from "./icon.js";
import type { GatewayConnectionPhase } from "./use_gateway_connection.js";

export type AfTopBarActionsProps = {
  /** Omit to hide the assistant button (apps without an assistant yet). */
  assistant?: {
    open: boolean;
    onToggle: () => void;
    label?: string;
  };
  /** Omit to hide the appearance button. */
  appearance?: {
    onOpen: () => void;
    label?: string;
  };
  /** App-specific actions rendered between appearance and the connection pill. */
  extraActions?: React.ReactNode;
  connection: {
    phase: GatewayConnectionPhase;
    /** True while signOut is in flight (renders "Signing out…"). */
    signingOut?: boolean;
    /** Opens the connect modal (disconnected/loading states). */
    onConnect: () => void;
    /** Signs out (connected state). Apps MAY interpose a confirm first. */
    onDisconnect: () => void;
  };
  className?: string;
};

export function AfTopBarActions(props: AfTopBarActionsProps): React.ReactElement {
  const { connection } = props;
  const phase = connection.phase;
  const signingOut = connection.signingOut === true;

  const pillLabel = signingOut
    ? "Signing out…"
    : phase === "connected"
      ? "Disconnect"
      : phase === "loading"
        ? "Connecting…"
        : "Connect";
  const pillTitle =
    phase === "connected" ? "Disconnect from gateway" : phase === "loading" ? "Checking gateway session…" : "Connect to gateway";

  return (
    <div className={`af-topbar${props.className ? ` ${props.className}` : ""}`} role="group" aria-label="App actions">
      {props.assistant ? (
        <button
          type="button"
          className={`af-topbar__btn${props.assistant.open ? " is-active" : ""}`}
          aria-pressed={props.assistant.open}
          aria-label={props.assistant.label || "Open assistant"}
          title={props.assistant.label || "Assistant"}
          onClick={props.assistant.onToggle}
        >
          <Icon name="sparkle" size={16} />
        </button>
      ) : null}

      {props.appearance ? (
        <button
          type="button"
          className="af-topbar__btn"
          aria-label={props.appearance.label || "Appearance (theme and typography)"}
          title={props.appearance.label || "Appearance"}
          onClick={props.appearance.onOpen}
        >
          <Icon name="contrast" size={16} />
        </button>
      ) : null}

      {props.extraActions}

      <button
        type="button"
        className={`af-topbar__pill af-topbar__pill--${phase}`}
        onClick={phase === "connected" ? connection.onDisconnect : connection.onConnect}
        disabled={signingOut}
        title={pillTitle}
        aria-label={pillTitle}
      >
        <span className={`af-topbar__dot af-topbar__dot--${phase}`} aria-hidden="true" />
        <span className="af-topbar__pill-label">{pillLabel}</span>
      </button>
    </div>
  );
}

export default AfTopBarActions;
