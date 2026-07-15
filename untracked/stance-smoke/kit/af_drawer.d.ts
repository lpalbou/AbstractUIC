import React from "react";
export type AfDrawerProps = {
    open: boolean;
    onClose: () => void;
    /** Accessible name for the drawer region. */
    label: string;
    /** Panel width (px). Default 420. Below 680px viewport the drawer is full-width via CSS. */
    width?: number;
    /** Distance from the viewport top (px) — set to your header height so the
     * drawer opens BELOW the app header instead of covering the top-bar
     * cluster (flow's layout). Default 0 (full height). */
    topOffset?: number;
    /** Close on ESC (default true). The handler honors the consumed-event convention. */
    closeOnEscape?: boolean;
    className?: string;
    children: React.ReactNode;
    /** Optional header row; when absent, provide your own inside children. */
    title?: React.ReactNode;
    /** Extra header actions rendered before the close button. */
    headerActions?: React.ReactNode;
};
export declare function AfDrawer(props: AfDrawerProps): React.ReactElement;
export default AfDrawer;
//# sourceMappingURL=af_drawer.d.ts.map