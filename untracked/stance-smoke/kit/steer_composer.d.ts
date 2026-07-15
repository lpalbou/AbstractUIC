import React from "react";
export type SteerSubmitResult = {
    accepted: boolean;
    duplicate: boolean;
    seq: number;
};
/**
 * Read every app-server CSRF twin cookie (`<appId>_gateway_csrf`) on this
 * origin. Usually one — but localhost apps on different PORTS share a cookie
 * jar (cookies are port-agnostic), so an operator running observer + entity
 * side by side carries several twins and the sender cannot know which pairs
 * with THIS app's HttpOnly session cookie (adversary find 2026-07-13).
 * `submitSteer` tries candidates in order and retries on the proxy's
 * `csrf_required` refusal.
 */
export declare function readGatewayCsrfTokens(): string[];
/** First CSRF twin on the origin (single-app case). */
export declare function readGatewayCsrfToken(): string;
/**
 * Default transport: the app-origin session proxy (mutating call, so the
 * canonical `x-abstract-csrf` header carries the proxy's CSRF twin). Apps on
 * a direct bearer connection inject their own `submit` instead.
 */
export declare function submitSteer(opts: {
    runId: string;
    guidance: string;
    commandsPath?: string;
    csrfToken?: string;
}): Promise<SteerSubmitResult>;
export type SteerComposerProps = {
    runId: string;
    /** Transport override (direct bearer apps). Default posts via the app-origin proxy. */
    submit?: (runId: string, guidance: string) => Promise<SteerSubmitResult>;
    commandsPath?: string;
    disabled?: boolean;
    /** Consumer-known wait state: parked runs deliver only at next wake (steers do not wake runs). */
    parked?: boolean;
    placeholder?: string;
    ariaLabel?: string;
    onSent?: (result: SteerSubmitResult & {
        guidance: string;
    }) => void;
    className?: string;
};
export declare function SteerComposer(props: SteerComposerProps): React.ReactElement;
export default SteerComposer;
//# sourceMappingURL=steer_composer.d.ts.map