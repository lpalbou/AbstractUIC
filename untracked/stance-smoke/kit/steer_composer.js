import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/*
 * SteerComposer — the shared "speak to a live run" input (hooks plan H4).
 *
 * Consumes the gateway steer door verbatim (commons c1023/c1025, live-verified
 * H4): POST /api/gateway/commands with type=inject_guidance and
 * payload.guidance. The gateway queues through the durable steer sidecar; the
 * run's OWN tick drains into `_runtime.inbox` at its next loop boundary and
 * acks with an `abstract.steer_seen` ledger record — so the composer's truth
 * is "queued (seq N)", never "delivered". Consumers already render the
 * steer_seen ack from their ledger streams (observer c1003); this component
 * deliberately does not fake a delivery signal it cannot see.
 *
 * Delivery honesty (Runtime.steer contract): a RUNNING run sees the steer at
 * its next loop boundary; a PARKED (waiting) run only at its next wake —
 * steers do not wake runs. The `parked` prop lets consumers surface that.
 *
 * Entity visit runs are refused at the door with a synchronous 403 naming the
 * H5 rite; the error detail renders verbatim (the contract says the refusal
 * text IS the operator guidance).
 */
import { useEffect, useMemo, useRef, useState } from "react";
/** Best-effort UUID for the command idempotency key. */
function newCommandId() {
    try {
        if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function")
            return crypto.randomUUID();
    }
    catch {
        // fall through
    }
    return `steer-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
/**
 * Read every app-server CSRF twin cookie (`<appId>_gateway_csrf`) on this
 * origin. Usually one — but localhost apps on different PORTS share a cookie
 * jar (cookies are port-agnostic), so an operator running observer + entity
 * side by side carries several twins and the sender cannot know which pairs
 * with THIS app's HttpOnly session cookie (adversary find 2026-07-13).
 * `submitSteer` tries candidates in order and retries on the proxy's
 * `csrf_required` refusal.
 */
export function readGatewayCsrfTokens() {
    const out = [];
    try {
        if (typeof document === "undefined")
            return out;
        for (const part of String(document.cookie || "").split(";")) {
            const idx = part.indexOf("=");
            if (idx < 0)
                continue;
            const key = part.slice(0, idx).trim();
            if (!key.endsWith("_gateway_csrf"))
                continue;
            const raw = part.slice(idx + 1).trim();
            let value = raw;
            try {
                value = decodeURIComponent(raw);
            }
            catch {
                // keep raw
            }
            if (value && !out.includes(value))
                out.push(value);
        }
    }
    catch {
        // no document / cookie access — direct-transport consumers inject submit()
    }
    return out;
}
/** First CSRF twin on the origin (single-app case). */
export function readGatewayCsrfToken() {
    return readGatewayCsrfTokens()[0] || "";
}
/**
 * Default transport: the app-origin session proxy (mutating call, so the
 * canonical `x-abstract-csrf` header carries the proxy's CSRF twin). Apps on
 * a direct bearer connection inject their own `submit` instead.
 */
export async function submitSteer(opts) {
    const path = opts.commandsPath || "/api/gateway/commands";
    // Same command_id across retries: the door's idempotency key means a
    // csrf-retry can never queue the steer twice.
    const commandId = newCommandId();
    const body = JSON.stringify({
        command_id: commandId,
        run_id: opts.runId,
        type: "inject_guidance",
        payload: { guidance: opts.guidance },
    });
    const candidates = opts.csrfToken !== undefined ? [opts.csrfToken] : readGatewayCsrfTokens();
    if (candidates.length === 0)
        candidates.push("");
    let lastError = null;
    for (const csrf of candidates) {
        const res = await fetch(path, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                ...(csrf ? { "x-abstract-csrf": csrf } : {}),
            },
            body,
        });
        const data = await res.json().catch(() => null);
        if (!res.ok) {
            const detail = data && typeof data === "object" && data.detail ? String(data.detail) : `HTTP ${res.status}`;
            lastError = new Error(detail);
            // Wrong twin on a multi-app origin: try the next candidate cookie.
            if (res.status === 403 && data && typeof data === "object" && data.reason_code === "csrf_required") {
                continue;
            }
            throw lastError;
        }
        return {
            accepted: Boolean(data?.accepted),
            duplicate: Boolean(data?.duplicate),
            seq: Number(data?.seq ?? 0),
        };
    }
    throw lastError || new Error("Steer submit failed");
}
export function SteerComposer(props) {
    const [text, setText] = useState("");
    const [status, setStatus] = useState({ kind: "idle" });
    const sendingRef = useRef(false);
    // A "Queued (seq N)" badge must never survive a run switch — it would
    // claim run B was steered when run A was (adversary find 2026-07-14).
    // The generation also guards in-flight sends: a result from run A's send
    // never stamps run B's UI.
    const runGen = useRef(0);
    useEffect(() => {
        runGen.current += 1;
        setStatus({ kind: "idle" });
    }, [props.runId]);
    const canSend = !props.disabled && text.trim().length > 0 && status.kind !== "sending";
    const deliveryNote = useMemo(() => {
        if (props.parked)
            return "Run is waiting — your guidance delivers at its next wake (steers do not wake runs).";
        return "Delivers at the run's next loop boundary.";
    }, [props.parked]);
    const doSend = async () => {
        const guidance = text.trim();
        if (!guidance || sendingRef.current || props.disabled)
            return;
        sendingRef.current = true;
        const gen = runGen.current;
        setStatus({ kind: "sending" });
        try {
            const result = props.submit
                ? await props.submit(props.runId, guidance)
                : await submitSteer({ runId: props.runId, guidance, commandsPath: props.commandsPath });
            if (runGen.current !== gen)
                return; // run switched mid-flight: never stamp the new run's UI
            // A 200 with accepted:false is a REFUSAL, not a queue — saying
            // "Queued" over it would lie (adversary find 2026-07-13).
            if (!result.accepted && !result.duplicate) {
                setStatus({ kind: "error", detail: "The gateway did not accept this steer (accepted=false)." });
                return;
            }
            setStatus({ kind: "queued", seq: result.seq, duplicate: result.duplicate });
            setText("");
            props.onSent?.({ ...result, guidance });
        }
        catch (e) {
            if (runGen.current === gen)
                setStatus({ kind: "error", detail: String(e?.message || e) });
        }
        finally {
            sendingRef.current = false;
        }
    };
    const onKeyDown = (e) => {
        // Guidance is prose: Enter inserts a newline; Cmd/Ctrl+Enter sends.
        if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            void doSend();
        }
    };
    return (_jsxs("div", { className: `af-steer${props.className ? ` ${props.className}` : ""}`, children: [_jsxs("div", { className: "af-steer__row", children: [_jsx("textarea", { className: "af-steer__input", value: text, rows: 2, placeholder: props.placeholder || "Steer this run…", "aria-label": props.ariaLabel || "Steer message", disabled: props.disabled || status.kind === "sending", onChange: (e) => {
                            setText(e.target.value);
                            if (status.kind === "error" || status.kind === "queued")
                                setStatus({ kind: "idle" });
                        }, onKeyDown: onKeyDown }), _jsx("button", { type: "button", className: "af-steer__send", disabled: !canSend, onClick: () => void doSend(), title: "Send guidance (Cmd/Ctrl+Enter)", children: status.kind === "sending" ? "Sending…" : "Steer" })] }), _jsx("div", { className: "af-steer__status", role: "status", "aria-live": "polite", children: status.kind === "queued" ? (_jsxs("span", { className: "af-steer__ok", children: [status.duplicate ? `Already queued (seq ${status.seq}).` : `Queued (seq ${status.seq}).`, " ", deliveryNote, " ", "Watch for the steer_seen ack in the run ledger."] })) : status.kind === "error" ? (_jsx("span", { className: "af-steer__err", children: status.detail })) : (_jsx("span", { className: "af-steer__hint", children: deliveryNote })) })] }));
}
export default SteerComposer;
