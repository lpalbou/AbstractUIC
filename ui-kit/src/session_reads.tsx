import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { SessionReadStore, type SessionReceipt } from "./session_activity.js";

/** Browser-local, account-scoped receipts shared by clients on this origin. No Gateway writes. */
export function useSessionReads(scope: string, observed: readonly SessionReceipt[] = []) {
  const [, refresh] = useState(0);
  const store = useMemo(() => {
    let storage: Storage | null = null;
    try { storage = window.localStorage; } catch { /* memory-only receipts */ }
    return new SessionReadStore(scope, scope ? storage : null);
  }, [scope]);
  useEffect(() => { if (scope) for (const p of observed) store.observe(p); }, [scope, store, observed]);
  useEffect(() => {
    const changed = (e: StorageEvent) => { if (!e.key || e.key.startsWith(store.prefix)) refresh((n) => n+1); };
    window.addEventListener("storage", changed);
    return () => window.removeEventListener("storage", changed);
  }, [store]);
  const markRead = useCallback((p: SessionReceipt) => {
    if (!scope) return;
    store.markRead(p); refresh((n) => n+1);
    // Same-document consumers do not receive the browser's storage event.
    window.dispatchEvent(new StorageEvent("storage", { key: store.prefix }));
  }, [scope, store]);
  return { isUnread: (p: SessionReceipt) => Boolean(scope) && store.isUnread(p), markRead, error: store.error };
}

/** Mount after loaded content, normally in ChatMessageCard.renderFooter.
 * A selected row or background subscription cannot acknowledge content. */
export function SessionReadMarker(p: { receipt: SessionReceipt; enabled: boolean; ownerKey?: string; onRead: (p: SessionReceipt) => void }): React.ReactElement {
  const ref = useRef<HTMLSpanElement>(null), callback = useRef(p.onRead); callback.current = p.onRead;
  const { sessionId, revision, updatedAt } = p.receipt;
  useEffect(() => {
    const el = ref.current;
    if (!el || !p.enabled) return;
    const notify = callback.current; // Capture this owner; a late timer cannot call a new account's callback.
    let timer: ReturnType<typeof setTimeout> | undefined, done = false;
    const visible = () => {
      if (document.hidden || !document.hasFocus() || !el.isConnected) return false;
      const b = el.getBoundingClientRect();
      if (b.width <= 0 || b.height <= 0 || b.top < 0 || b.bottom > window.innerHeight) return false;
      const hit = document.elementFromPoint(b.left + b.width/2, b.top + b.height/2);
      return hit === el || Boolean(hit && el.contains(hit));
    };
    const check = () => {
      if (done) return;
      clearTimeout(timer);
      if (visible()) timer = setTimeout(() => { if (visible()) { done = true; notify({ sessionId, revision, updatedAt }); } }, 250);
    };
    const observer = new IntersectionObserver(check, { threshold: 1 }); observer.observe(el);
    for (const event of ["focus", "blur", "resize", "pointerup", "keyup", "scroll"]) window.addEventListener(event, check, true);
    document.addEventListener("visibilitychange", check);
    check();
    return () => {
      clearTimeout(timer); observer.disconnect();
      for (const event of ["focus", "blur", "resize", "pointerup", "keyup", "scroll"]) window.removeEventListener(event, check, true);
      document.removeEventListener("visibilitychange", check);
    };
  }, [p.enabled, p.ownerKey, sessionId, revision, updatedAt]);
  return <span ref={ref} aria-hidden="true" className="af-session-read-marker" style={{ display: "block", width: "100%", height: 1 }} />;
}
