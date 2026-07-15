/*
 * useGatewayConnection — the ONE connection state machine (B5 fix,
 * operator ruling 2026-07-13: "the logic must be revised, improved and
 * shared across apps. login/auth should be consistent across apps.").
 *
 * Before this hook every consumer hand-rolled the same machine (boot probe →
 * connected flag → auto-open decision → close-on-status) and they drifted —
 * the README contract lived in prose. This hook IS the contract:
 *
 *  - Probe ONCE at boot (`/api/connection/gateway`); phase is "loading"
 *    until the probe RESOLVES. connected = ok && has_session (server truth).
 *  - Auto-open the modal only on a RESOLVED disconnect — never over the
 *    loading state, never over a live session. A thrown probe (app-origin
 *    server unreachable) is UNKNOWN, not resolved: no auto-open (the proxy
 *    answers 200 with ok:false when the GATEWAY is down, which IS resolved).
 *  - Sign-in success closes the modal (the modal also self-closes; both
 *    paths converge here through onStatusChange).
 *  - Sign-out / session loss re-arms the auto-open: each new signed-out
 *    episode may auto-open once (dismissable) or hold the modal up
 *    (blocking).
 *  - `initialStatus` threading dedupes the modal's open-time probe.
 *
 * Consumers spread `modalProps` into <GatewayConnectModal/> and read
 * `connected`/`status`; app-local connection machines get deleted.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fetchGatewayConnection, signOutGateway } from "./gateway_connect_modal.js";
export function isGatewayConnected(status) {
    return Boolean(status && status.ok === true && status.has_session === true);
}
export function useGatewayConnection(options) {
    const opts = options || {};
    const connectionPath = opts.connectionPath || "/api/connection/gateway";
    const variant = opts.variant || "dismissable";
    // Callbacks fire from async work started renders ago (an in-flight
    // refresh) — read the latest through a ref so delivery is never one render
    // behind (the voice hook's opts_ref lesson; adversary find 2026-07-13).
    const onStatusChangeRef = useRef(opts.onStatusChange);
    onStatusChangeRef.current = opts.onStatusChange;
    const [status, setStatus] = useState(null);
    const [phase, setPhase] = useState("loading");
    const [modalOpen, setModalOpen] = useState(false);
    // One auto-open per signed-out episode (dismissable); reset when a session
    // comes back so the NEXT disconnect re-arms.
    const dismissedThisEpisode = useRef(false);
    // Close-on-connect must fire only on the TRANSITION to connected (sign-in
    // success). A connected→connected delivery (the modal's initialStatus seed
    // echo when the user explicitly opens it to sign out) must NOT close —
    // that instant-close was caught live by the B5 chrome verification.
    const wasConnected = useRef(false);
    // The CURRENT phase, readable synchronously. onClose must consult this,
    // never its render closure: the modal's sign-in sequence runs
    // applyStatus(connected) then onClose() in one batch, so a closure-bound
    // phase still reads "disconnected" and would mark the episode dismissed —
    // silently killing the NEXT expiry's auto-open (adversary F1).
    const phaseRef = useRef("loading");
    // Status generation: every applied status invalidates in-flight probes so
    // a slow probe started BEFORE a sign-in cannot land after it and overwrite
    // the connected status with a stale signed-out answer (adversary F2).
    const statusGen = useRef(0);
    const applyStatus = useCallback((s) => {
        statusGen.current += 1;
        setStatus(s);
        onStatusChangeRef.current?.(s);
        const nowConnected = isGatewayConnected(s);
        if (nowConnected) {
            setPhase("connected");
            phaseRef.current = "connected";
            dismissedThisEpisode.current = false;
            if (!wasConnected.current)
                setModalOpen(false); // sign-in success: the app is the confirmation
        }
        else if (s !== null) {
            setPhase("disconnected");
            phaseRef.current = "disconnected";
            if (!dismissedThisEpisode.current)
                setModalOpen(true); // resolved disconnect
        }
        if (s !== null)
            wasConnected.current = nowConnected;
        // s === null: unknown (probe threw) — never auto-open over unknown.
    }, []);
    // Delivery-timing pin (observer c1323): applyStatus runs SYNCHRONOUSLY
    // inside refresh()'s await chain — consumers read their own refs right
    // after `await refresh()` and rely on the status having been delivered.
    // Do not defer/batch delivery without a room round.
    const refresh = useCallback(async () => {
        const gen = statusGen.current;
        try {
            const s = await fetchGatewayConnection(connectionPath);
            // A status applied while this probe was in flight (sign-in result,
            // another refresh) supersedes it — drop the stale answer.
            if (statusGen.current !== gen)
                return;
            applyStatus(s);
        }
        catch {
            if (statusGen.current !== gen)
                return;
            // App-origin server unreachable: UNKNOWN, not a resolved disconnect.
            applyStatus(null);
        }
    }, [connectionPath, applyStatus]);
    const [signingOut, setSigningOut] = useState(false);
    const [signOutError, setSignOutError] = useState(null);
    const signOut = useCallback(async () => {
        setSigningOut(true);
        setSignOutError(null);
        // Invalidate the pre-signout world FIRST: a probe started before this
        // sign-out may carry a stale "connected" answer; if it landed after the
        // DELETE it would apply (bumping the gen) and the follow-up probe's
        // TRUE signed-out answer would be the one dropped — a phantom
        // connected state over cleared cookies (production audit P1,
        // 2026-07-14).
        statusGen.current += 1;
        let failed = null;
        try {
            await signOutGateway(connectionPath);
        }
        catch (e) {
            // A dead app-server means the session may STILL BE LIVE server-side —
            // swallowing this silently left the user believing they signed out
            // (design adversary C, 2026-07-13). The follow-up probe reports the
            // real state; the error channel reports the failed ACT.
            failed = String(e?.message || e || "Sign-out request failed");
        }
        await refresh();
        setSignOutError(failed);
        setSigningOut(false);
    }, [connectionPath, refresh]);
    const booted = useRef(false);
    useEffect(() => {
        if (booted.current)
            return;
        booted.current = true;
        void refresh();
    }, [refresh]);
    const openModal = useCallback(() => {
        setModalOpen(true);
    }, []);
    const onClose = useCallback(() => {
        // Read the phase through the ref (adversary F1): during the modal's
        // sign-in sequence applyStatus(connected) and onClose() run in the same
        // batch — the render-closure phase is stale ("disconnected") and would
        // (a) refuse the close under blocking, (b) mark the episode dismissed
        // and kill the NEXT expiry's auto-open under dismissable.
        const p = phaseRef.current;
        if (variant === "blocking" && p === "disconnected") {
            // Blocking apps have no offline surface — the modal stays until a
            // session exists. (The modal itself hides its close affordances when
            // blocking; this guards programmatic paths.)
            return;
        }
        if (p === "disconnected")
            dismissedThisEpisode.current = true;
        setModalOpen(false);
    }, [variant]);
    const modalProps = useMemo(() => ({
        isOpen: modalOpen,
        onClose,
        blocking: variant === "blocking" && phase !== "connected",
        appName: opts.appName,
        connectionPath,
        defaultGatewayUrl: opts.defaultGatewayUrl,
        initialStatus: status,
        onStatusChange: applyStatus,
    }), [modalOpen, onClose, variant, phase, opts.appName, connectionPath, opts.defaultGatewayUrl, status, applyStatus]);
    return {
        status,
        phase,
        connected: phase === "connected",
        modalOpen,
        signingOut,
        signOutError,
        openModal,
        refresh,
        signOut,
        modalProps,
    };
}
export default useGatewayConnection;
