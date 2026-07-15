import { type GatewayConnectionState } from "./gateway_connect_modal.js";
export type GatewayConnectionPhase = "loading" | "connected" | "disconnected";
export type UseGatewayConnectionOptions = {
    connectionPath?: string;
    /**
     * blocking: no dismiss affordance while signed out (apps with no offline
     * surface, e.g. flow). dismissable: auto-open once per signed-out episode;
     * the app keeps a badge/banner as re-entry (e.g. continuum).
     */
    variant?: "blocking" | "dismissable";
    /**
     * Mid-session auto-open policy (dismissable only; continuum's reload
     * adversary, 2026-07-16). When a LIVE session resolves away mid-use
     * (expiry, gateway restart, transient blip), a screen-covering modal over
     * whatever the operator is typing is a thin trigger — the app's
     * badge/banner is the re-entry instead. Default false: only boot-resolved
     * disconnects and post-signOut episodes auto-open. Pass true to restore
     * the old always-auto-open behavior. Blocking apps always auto-open (they
     * have no offline surface to fall back to).
     */
    autoOpenMidSession?: boolean;
    appName?: string;
    defaultGatewayUrl?: string;
    onStatusChange?: (status: GatewayConnectionState | null) => void;
};
export type GatewayConnection = {
    status: GatewayConnectionState | null;
    phase: GatewayConnectionPhase;
    connected: boolean;
    modalOpen: boolean;
    /** True while a signOut() is in flight (unified-top-bar behavior contract
     * statement 5: the Disconnect pill needs an in-flight state). */
    signingOut: boolean;
    /** Set when the last signOut()'s server call FAILED (the session may still
     * be live); cleared on the next signOut/refresh that succeeds. Never
     * silent — contract statement 5. */
    signOutError: string | null;
    /** Explicit user entry (settings button, badge click) — always allowed. */
    openModal: () => void;
    /** Re-probe on demand (e.g. after an app-level 401). */
    refresh: () => Promise<void>;
    /**
     * Sign out through the machine (settings pages that bypass the modal —
     * observer's adoption datum c1323): server-side sign-out, then a fresh
     * probe so phase/auto-open react to the REAL resulting state.
     */
    signOut: () => Promise<void>;
    /** Spread into <GatewayConnectModal {...modalProps} />. */
    modalProps: {
        isOpen: boolean;
        onClose: () => void;
        blocking: boolean;
        appName?: string;
        connectionPath?: string;
        defaultGatewayUrl?: string;
        initialStatus?: GatewayConnectionState | null;
        onStatusChange: (status: GatewayConnectionState | null) => void;
    };
};
export declare function isGatewayConnected(status: GatewayConnectionState | null): boolean;
export declare function useGatewayConnection(options?: UseGatewayConnectionOptions): GatewayConnection;
export default useGatewayConnection;
//# sourceMappingURL=use_gateway_connection.d.ts.map