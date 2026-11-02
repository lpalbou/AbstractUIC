import type { SessionReceipt } from "./session_activity.js";

export type SessionReadEvent = { sequence: number; session_id: string; run_id: string; status: string; at: string; event_id: string };
export interface SessionReadClient {
  load(receipts: readonly SessionReceipt[], signal: AbortSignal): Promise<SessionReadEvent[]>;
  mark(receipts: readonly SessionReceipt[], signal: AbortSignal): Promise<SessionReadEvent[]>;
}
export function sessionReadIdentity(p: SessionReceipt): { session_id: string; run_id: string; status: string } {
  const value = JSON.parse(p.revision);
  if (!Array.isArray(value) || value.length !== 2 || !p.sessionId) throw Error("Invalid session read revision");
  const [run, status] = value;
  if (typeof run !== "string" || !run || !["request", "completed", "failed", "cancelled"].includes(status)) throw Error("Invalid session read revision");
  return { session_id: p.sessionId, run_id: run, status };
}
export function sessionReadEventReceipt(e: SessionReadEvent): SessionReceipt {
  if (!e || !Number.isSafeInteger(e.sequence) || e.sequence < 1 || typeof e.event_id !== "string" || !e.event_id || typeof e.session_id !== "string" || !e.session_id || typeof e.run_id !== "string" || !e.run_id || typeof e.at !== "string" || !Number.isFinite(Date.parse(e.at)) || !["request", "completed", "failed", "cancelled"].includes(e.status)) throw Error("Invalid shared read receipt");
  return { sessionId: e.session_id, revision: JSON.stringify([e.run_id, e.status]), updatedAt: e.at };
}
export const sessionReceiptKey = (p: SessionReceipt) => JSON.stringify([p.sessionId, p.revision]);

/** Caller injects its authenticated, CSRF-aware same-origin transport. */
export function createSessionReadClient(fetchGateway: (path: string, init?: RequestInit) => Promise<Response>): SessionReadClient {
  async function request(query: string, init: RequestInit): Promise<SessionReadEvent[]> {
    const r = await fetchGateway(`api/gateway/me/session-reads${query}`, init);
    if (!r.ok) {
      const error = Object.assign(new Error(`Shared read state unavailable (HTTP ${r.status}).`), { status: r.status });
      await r.body?.cancel(); throw error;
    }
    const value = await r.json();
    if (!value || !Array.isArray(value.items) || value.more) throw Error("Shared read state returned an incomplete page.");
    for (const e of value.items) sessionReadEventReceipt(e);
    return value.items;
  }
  return {
    async load(receipts, signal) {
      const ids = [...new Set(receipts.map(p => sessionReadIdentity(p).run_id))].sort(), result: SessionReadEvent[] = [];
      for (let i = 0; i < ids.length; i += 100) {
        const params = new URLSearchParams({ limit: "1000" });
        for (const id of ids.slice(i, i + 100)) params.append("run_id", id);
        result.push(...await request(`?${params}`, { signal }));
      }
      return result;
    },
    async mark(receipts, signal) {
      const result: SessionReadEvent[] = [];
      for (let i = 0; i < receipts.length; i += 100) result.push(...await request("", { method: "POST", signal,
        headers: { "Content-Type": "application/json" }, body: JSON.stringify({ receipts: receipts.slice(i, i+100).map(sessionReadIdentity) }) }));
      return result;
    },
  };
}
