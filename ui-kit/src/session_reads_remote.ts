import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { sessionReadIdentity, sessionReadEventReceipt, sessionReceiptKey, type SessionReadClient, type SessionReadEvent } from "./session_read_client.js";
import type { SessionReceipt } from "./session_activity.js";

/** The Gateway is authoritative. A failed write never clears an unread revision. */
export function useRemoteSessionReads(scope: string, observed: readonly SessionReceipt[], client?: SessionReadClient) {
  const [, redraw] = useState(0), observedRef = useRef(observed);
  observedRef.current = observed;
  const state = useMemo(() => ({
    keys: new Map<string, string>(), pending: new Map<string, SessionReceipt>(),
    controllers: new Set<AbortController>(), active: false, generation: 0,
    loaded: false, writing: false, queued: false, readError: "", writeError: "",
  }), [scope, client]);
  const accept = useCallback((items: SessionReadEvent[]) => {
    // Bound memory to current sidebar turns. Use the live catalog, never a stale
    // request snapshot, so delayed GETs cannot prune newly accepted reads.
    const ids = new Set(observedRef.current.map(p => sessionReadIdentity(p).run_id));
    for (const [key, id] of state.keys) if (!ids.has(id) && !state.pending.has(key)) state.keys.delete(key);
    for (const e of items) if (ids.has(e.run_id)) state.keys.set(sessionReceiptKey(sessionReadEventReceipt(e)), e.run_id);
    redraw(n => n+1);
  }, [state]);
  const flush = useCallback(async () => {
    if (!client || !scope || !state.active || state.writing) return;
    state.writing = true;
    const generation = state.generation;
    try {
      // Drain arrivals queued during an outstanding write without waiting for polling.
      while (state.active && state.generation === generation && state.pending.size) {
        const controller = new AbortController(), batch = [...state.pending.values()].slice(0,100);
        state.controllers.add(controller);
        try {
          const events = await client.mark(batch, controller.signal);
          if (!state.active || state.generation !== generation) return;
          const acknowledged = new Set(events.map(e => sessionReceiptKey(sessionReadEventReceipt(e))));
          if (batch.some(p => !acknowledged.has(sessionReceiptKey(p)))) throw Error("The gateway did not confirm every read receipt. Please retry.");
          for (const p of batch) state.pending.delete(sessionReceiptKey(p));
          state.writeError = "";
          accept(events);
        } catch (e) {
          if (!controller.signal.aborted && state.active && state.generation === generation) {
            state.writeError = e instanceof Error ? e.message : String(e);
            const code = (e as { status?: number })?.status;
            if (code && code >= 400 && code < 500 && code !== 408 && code !== 429)
              for (const p of batch) state.pending.delete(sessionReceiptKey(p));
            redraw(n => n+1);
          }
          break; // Transient failures retry on focus, reconnect, or the next poll.
        } finally { state.controllers.delete(controller); }
      }
    } finally { if (state.generation === generation) state.writing = false; }
  }, [client, scope, state, accept]);
  const refresh = useCallback(async () => {
    if (!client || !scope || !state.active) return;
    const controller = new AbortController(), generation = state.generation;
    state.controllers.add(controller);
    try {
      const events = await client.load([...observedRef.current], controller.signal);
      if (!state.active || state.generation !== generation) return;
      // Receipts are monotone. An older concurrent response cannot revoke a read.
      state.loaded = true; state.readError = "";
      accept(events);
    } catch (e) {
      if (!controller.signal.aborted && state.active && state.generation === generation) {
        state.readError = e instanceof Error ? e.message : String(e); redraw(n => n+1);
      }
    } finally { state.controllers.delete(controller); }
    await flush();
  }, [client, scope, state, accept, flush]);
  const ids = [...new Set(observed.map(p => sessionReadIdentity(p).run_id))].sort().join("\0");
  useEffect(() => {
    if (!client || !scope) return;
    state.active = true; state.generation++; state.writing = false;
    const wake = () => { if (!document.hidden) void refresh(); };
    const timer = window.setInterval(wake, 10_000);
    window.addEventListener("focus", wake); window.addEventListener("online", wake); document.addEventListener("visibilitychange", wake);
    return () => {
      state.active = false; state.queued = false;
      for (const c of state.controllers) c.abort(); state.controllers.clear();
      window.clearInterval(timer); window.removeEventListener("focus",wake); window.removeEventListener("online",wake); document.removeEventListener("visibilitychange",wake);
    };
  }, [client, scope, state, refresh]);
  useEffect(() => { void refresh(); }, [ids, refresh]);
  const markRead = useCallback((p: SessionReceipt) => {
    if (!scope || !client || !state.active || state.keys.has(sessionReceiptKey(p))) return;
    sessionReadIdentity(p); state.pending.set(sessionReceiptKey(p), p);
    if (state.queued) return;
    state.queued = true;
    queueMicrotask(() => { state.queued = false; void flush(); });
  }, [client, scope, state, flush]);
  return { markRead, refresh, isUnread: (p: SessionReceipt) => Boolean(scope && state.loaded && !state.keys.has(sessionReceiptKey(p))), error: state.writeError || state.readError, loading: !state.loaded };
}
