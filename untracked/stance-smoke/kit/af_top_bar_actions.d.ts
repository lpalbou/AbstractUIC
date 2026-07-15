import React from "react";
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
export declare function AfTopBarActions(props: AfTopBarActionsProps): React.ReactElement;
export default AfTopBarActions;
//# sourceMappingURL=af_top_bar_actions.d.ts.map