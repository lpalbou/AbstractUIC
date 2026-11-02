import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useRemoteSessionReads } from "./session_reads_remote.js";
import type { SessionReadClient } from "./session_read_client.js";
import { VisibleContentMarker } from "./visible_content.js";
import { SessionReadStore, type SessionReceipt } from "./session_activity.js";

/** With a client: Gateway-owned receipts. Without one: explicitly browser-local compatibility mode. */
export function useSessionReads(scope: string, observed: readonly SessionReceipt[] = [], client?: SessionReadClient) {
  const remote = useRemoteSessionReads(scope, client ? observed : [], client);
  const [, refresh] = useState(0);
  const store = useMemo(() => {
    if (client) return new SessionReadStore("", null);
    let storage: Storage | null = null;
    try { storage = window.localStorage; } catch { /* memory-only receipts */ }
    return new SessionReadStore(scope, scope ? storage : null);
  }, [scope, client]);
  useEffect(() => { if (scope && !client) for (const p of observed) store.observe(p); }, [scope, store, observed, client]);
  useEffect(() => {
    if (client) return;
    const changed = (e: StorageEvent) => { if (!e.key || e.key.startsWith(store.prefix)) refresh((n) => n+1); };
    window.addEventListener("storage", changed);
    return () => window.removeEventListener("storage", changed);
  }, [store, client]);
  const markRead = useCallback((p: SessionReceipt) => {
    if (!scope) return;
    store.markRead(p); refresh((n) => n+1);
    // Same-document consumers do not receive the browser's storage event.
    window.dispatchEvent(new StorageEvent("storage", { key: store.prefix }));
  }, [scope, store]);
  if (client) return remote;
  return { refresh: async () => {}, loading: false, isUnread: (p: SessionReceipt) => Boolean(scope) && store.isUnread(p), markRead, error: store.error };
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
