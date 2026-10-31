import React, { useCallback, useEffect, useMemo, useState } from "react";
import { VisibleContentMarker } from "./visible_content.js";
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

/** Mount after loaded content; selection and background loads cannot acknowledge it. */
export function SessionReadMarker(p: { receipt: SessionReceipt; enabled: boolean; ownerKey?: string; relatedReceipts?: readonly SessionReceipt[]; onRead: (p: SessionReceipt) => void }): React.ReactElement {
  return <VisibleContentMarker ownerKey={p.ownerKey} contentKey={`${p.receipt.sessionId}:${p.receipt.revision}:${p.receipt.updatedAt || ""}`}
    enabled={p.enabled} onConsume={() => {
      // VisibleContentMarker captures this callback when its dwell begins.
      // A later arrival cannot broaden this opening's snapshot retroactively.
      const seen = new Set<string>();
      for (const receipt of [...(p.relatedReceipts || []), p.receipt]) {
        if (receipt.sessionId !== p.receipt.sessionId || seen.has(receipt.revision)) continue;
        seen.add(receipt.revision);
        p.onRead(receipt);
      }
    }} />;
}
