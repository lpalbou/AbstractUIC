import React from "react";
export type GatewayConnectionState = {
    ok: boolean;
    gateway_url: string;
    has_session: boolean;
    gateway?: {
        ok?: boolean;
        error?: string;
        detail?: string;
        principal?: {
            user_id?: string;
            runtime_id?: string;
            admin?: boolean;
        };
    };
};
export declare function fetchGatewayConnection(connectionPath?: string): Promise<GatewayConnectionState>;
export declare function signInGateway(payload: {
    gateway_url?: string;
    gateway_user_id: string;
    gateway_token: string;
    persist?: boolean;
}, connectionPath?: string): Promise<GatewayConnectionState>;
export declare function signOutGateway(connectionPath?: string): Promise<void>;
/** Strip wrapping quotes/JSON-encoding pasted around a URL, drop trailing slashes. Client twin of app-server's helper (vector-tested there); the SERVER re-normalizes authoritatively — this copy only improves what the user sees. */
export declare function normalizeGatewayUrl(value: string): string;
export declare function gatewayStatusBadge(status: GatewayConnectionState | null): {
    label: string;
    tone: "ok" | "warn" | "err";
};
export type GatewayConnectModalProps = {
    isOpen: boolean;
    onClose: () => void;
    /** Blocking mode: no close/sign-out affordances (first-run sign-in). */
    blocking?: boolean;
    appName?: string;
    connectionPath?: string;
    defaultGatewayUrl?: string;
    /**
     * Probe dedupe (10-15s connect incident fold, 2026-07-13): apps that
     * already probed /api/connection/gateway at boot pass the result here so
     * opening the modal does not re-probe. The modal still refreshes after
     * sign-in/out (those change the answer); omit the prop to keep the
     * open-time probe.
     */
    initialStatus?: GatewayConnectionState | null;
    onStatusChange?: (status: GatewayConnectionState | null) => void;
};
export declare function GatewayConnectModal(props: GatewayConnectModalProps): React.ReactElement | null;
export default GatewayConnectModal;
//# sourceMappingURL=gateway_connect_modal.d.ts.map