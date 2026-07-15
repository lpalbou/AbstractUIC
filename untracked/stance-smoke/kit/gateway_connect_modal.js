import { jsx as _jsx } from "react/jsx-runtime";
/*
 * GatewayConnectModal: the shared connect/disconnect surface for apps sitting
 * behind the @abstractframework/app-server session proxy.
 *
 * Extracted 2026-07-12 from AbstractFlow's GatewayConnectionModal (the design
 * the maintainer endorsed) onto the standardized /api/connection/gateway
 * contract, so every app gets the same modal instead of a per-app wrapper.
 * Sign-out (flow's, improved): stays in the modal with a clear signed-out
 * status instead of closing, so the user SEES the disconnect took effect and
 * can immediately sign back in.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { GatewaySessionSignInCard } from "./gateway_session_signin.js";
export async function fetchGatewayConnection(connectionPath = "/api/connection/gateway") {
    const res = await fetch(connectionPath);
    const data = await res.json().catch(() => null);
    if (!res.ok) {
        const msg = data && typeof data === "object" && data.detail ? String(data.detail) : `HTTP ${res.status}`;
        throw new Error(msg);
    }
    return data;
}
export async function signInGateway(payload, connectionPath = "/api/connection/gateway") {
    const res = await fetch(connectionPath, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
        const msg = data && typeof data === "object" && data.detail ? String(data.detail) : `HTTP ${res.status}`;
        throw new Error(msg);
    }
    return data;
}
export async function signOutGateway(connectionPath = "/api/connection/gateway") {
    const res = await fetch(connectionPath, { method: "DELETE" });
    if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        const msg = data && typeof data === "object" && data.detail ? String(data.detail) : `HTTP ${res.status}`;
        throw new Error(msg);
    }
}
/** Strip wrapping quotes/JSON-encoding pasted around a URL, drop trailing slashes. Client twin of app-server's helper (vector-tested there); the SERVER re-normalizes authoritatively — this copy only improves what the user sees. */
export function normalizeGatewayUrl(value) {
    let raw = String(value || "").trim();
    for (let i = 0; i < 2 && raw; i += 1) {
        try {
            const parsed = JSON.parse(raw);
            if (typeof parsed === "string" && parsed !== raw) {
                raw = parsed.trim();
                continue;
            }
        }
        catch {
            // Not JSON — try quote-pair cleanup below.
        }
        const first = raw[0];
        const last = raw[raw.length - 1];
        if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
            raw = raw.slice(1, -1).trim();
            continue;
        }
        break;
    }
    return raw.replace(/\/+$/, "");
}
export function gatewayStatusBadge(status) {
    if (!status)
        return { label: "Signed out", tone: "warn" };
    if (!status.has_session)
        return { label: "Signed out", tone: "warn" };
    const gw = status.gateway || {};
    const user = gw.principal?.user_id;
    const runtime = gw.principal?.runtime_id;
    if (gw.ok && user)
        return { label: `Signed in as ${user}${runtime ? ` · runtime ${runtime}` : ""}`, tone: "ok" };
    if (gw.ok)
        return { label: "Signed in", tone: "ok" };
    const err = gw.error || gw.detail;
    if (typeof err === "string" && err.trim())
        return { label: "Session rejected — sign in again", tone: "err" };
    return { label: "Sign in required", tone: "err" };
}
export function GatewayConnectModal(props) {
    const connectionPath = props.connectionPath || "/api/connection/gateway";
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [status, setStatus] = useState(null);
    // Self-close belt (B5): if a consumer's onClose is a no-op (blocking apps
    // often pass one), the modal still leaves the screen after a successful
    // sign-in. Reset when the consumer cycles isOpen.
    const [selfClosed, setSelfClosed] = useState(false);
    useEffect(() => {
        if (!props.isOpen)
            setSelfClosed(false);
    }, [props.isOpen]);
    const [gatewayUrl, setGatewayUrl] = useState(props.defaultGatewayUrl || "http://127.0.0.1:8080");
    const [userId, setUserId] = useState("admin");
    const [token, setToken] = useState("");
    const [showToken, setShowToken] = useState(false);
    const [persist, setPersist] = useState(true);
    const [error, setError] = useState("");
    const [notice, setNotice] = useState("");
    const badge = useMemo(() => gatewayStatusBadge(status), [status]);
    const applyStatus = (s) => {
        setStatus(s);
        props.onStatusChange?.(s);
    };
    // The seed is honored ONCE: on the first open it is seconds old (the boot
    // probe); on a REOPEN it may predate a sign-out made elsewhere, so later
    // opens always probe fresh (adversary find 2026-07-13).
    const initialStatusConsumed = useRef(false);
    useEffect(() => {
        if (!props.isOpen)
            return;
        const isFirstOpen = !initialStatusConsumed.current;
        // Mark consumption on the FIRST open unconditionally: an open during
        // the loading phase (seed still null) must not shift seed consumption
        // to the SECOND open — later opens always probe fresh (B5 reviewer F5,
        // 2026-07-14).
        initialStatusConsumed.current = true;
        if (isFirstOpen && props.initialStatus !== undefined && props.initialStatus !== null) {
            const s = props.initialStatus;
            applyStatus(s);
            if (typeof s.gateway_url === "string" && s.gateway_url.trim())
                setGatewayUrl(normalizeGatewayUrl(s.gateway_url));
            const principal = s.gateway?.principal;
            if (principal?.user_id)
                setUserId(principal.user_id);
            return;
        }
        setLoading(true);
        setError("");
        fetchGatewayConnection(connectionPath)
            .then((s) => {
            applyStatus(s);
            if (typeof s.gateway_url === "string" && s.gateway_url.trim())
                setGatewayUrl(normalizeGatewayUrl(s.gateway_url));
            const principal = s.gateway?.principal;
            if (principal?.user_id)
                setUserId(principal.user_id);
        })
            .catch((e) => setError(`Failed to load connection status: ${String(e?.message || e)}`))
            .finally(() => setLoading(false));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [props.isOpen]);
    useEffect(() => {
        if (!props.isOpen)
            return;
        const onKey = (e) => {
            // Consumed-event convention (unified-top-bar contract statement 11):
            // ESC closes the TOPMOST layer only. The modal is the top layer, so it
            // consumes the event; already-consumed events belong to a layer above.
            if (e.key === "Escape" && !e.defaultPrevented && !props.blocking) {
                e.preventDefault();
                props.onClose();
            }
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [props.isOpen, props.blocking, props.onClose]);
    if (!props.isOpen || selfClosed)
        return null;
    const handleSignIn = async () => {
        setSaving(true);
        setError("");
        setNotice("");
        try {
            const normalized = normalizeGatewayUrl(gatewayUrl);
            setGatewayUrl(normalized);
            const s = await signInGateway({ gateway_url: normalized, gateway_user_id: userId, gateway_token: token, persist }, connectionPath);
            applyStatus(s);
            setToken("");
            // B5 (operator incident 2026-07-13): after a SUCCESSFUL sign-in the APP
            // is the confirmation — the modal closes itself (both variants; blocking
            // gates dismissal while signed out, never after success). The stay-open
            // behavior is sign-OUT's design, and applying it here parked a "Signed
            // in." modal over every app whose consumer didn't wire the close.
            setSelfClosed(true);
            props.onClose();
        }
        catch (e) {
            setError(String(e?.message || e));
        }
        finally {
            setSaving(false);
        }
    };
    const handleSignOut = async () => {
        setSaving(true);
        setError("");
        setNotice("");
        try {
            await signOutGateway(connectionPath);
            setToken("");
            // Stay open with a visible signed-out state (the improved disconnect):
            // the user SEES the sign-out took effect and can sign back in at once.
            const s = await fetchGatewayConnection(connectionPath).catch(() => null);
            applyStatus(s);
            setNotice("Signed out. This browser no longer holds a gateway session.");
        }
        catch (e) {
            setError(String(e?.message || e));
        }
        finally {
            setSaving(false);
        }
    };
    return (_jsx("div", { className: "af-connect-overlay", role: "presentation", onMouseDown: (e) => {
            if (!props.blocking && e.target === e.currentTarget)
                props.onClose();
        }, children: _jsx("div", { className: "af-connect-modal", role: "dialog", "aria-modal": "true", "aria-label": "Gateway connection", children: _jsx(GatewaySessionSignInCard, { kicker: `${props.appName || "AbstractFramework"} connection`, title: "Connect this browser to AbstractGateway", description: "Sign in with a Gateway user token. The app exchanges it for an HTTP-only browser session and never stores the raw token.", statusLabel: badge.label, statusTone: badge.tone, tokenSourceLabel: status?.has_session ? "token: browser session" : "token: missing", showGatewayUrl: true, gatewayUrl: gatewayUrl, onGatewayUrlChange: (value) => setGatewayUrl(value), userId: userId, onUserIdChange: setUserId, token: token, tokenPlaceholder: status?.has_session ? "(browser session already signed in)" : "Paste Gateway user token", showToken: showToken, onTokenChange: setToken, onShowTokenChange: setShowToken, remember: persist, rememberLabel: "Keep this browser signed in", onRememberChange: setPersist, loading: loading, submitting: saving, submittingLabel: "Signing in...", showClose: !props.blocking, onClose: props.onClose, showSignOut: !props.blocking && Boolean(status?.has_session), onSignOut: handleSignOut, error: error, message: notice, onSubmit: handleSignIn }) }) }));
}
export default GatewayConnectModal;
