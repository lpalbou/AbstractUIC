/** Presentation facts only. Receipt revisions distinguish a request from its later answer. */
export type SessionContent = SessionReceipt & { runId: string; status: string };
export type SessionActivity = { revision: string; updatedAt: string; content: SessionContent[]; needsAttention: boolean; working: boolean; toolCount?: number };
export function sessionContentRevision(runId: string, status: string): string {
  return JSON.stringify([runId, ["completed", "failed", "cancelled"].includes(status.toLowerCase()) ? status.toLowerCase() : "request"]);
}
export function sessionNeedsAttention(run: Record<string, unknown>): boolean {
  const wait = run.waiting && typeof run.waiting === "object" ? run.waiting as Record<string, unknown> : {};
  return run.status === "waiting" && (wait.reason === "user" || run.wait_reason === "user");
}
export function sessionActivityFromRuns(body: unknown): Record<string, SessionActivity> {
  const root = body && typeof body === "object" ? body as Record<string, unknown> : {};
  const rows = Array.isArray(body) ? body : Array.isArray(root.items) ? root.items : Array.isArray(root.runs) ? root.runs : [];
  const groups = new Map<string, Record<string, unknown>[]>();
  for (const row of rows) {
    if (!row || typeof row !== "object" || row.parent_run_id || typeof row.session_id !== "string" || typeof row.run_id !== "string") continue;
    const list = groups.get(row.session_id) ?? []; list.push(row); groups.set(row.session_id, list);
  }
  const out: Record<string, SessionActivity> = Object.create(null);
  const time = (r: Record<string, unknown>) => Date.parse(String(r.created_at || r.updated_at || "")) || 0;
  for (const [id, runs] of groups) {
    runs.sort((a,b) => time(b) - time(a)); // Stable page order breaks equal timestamp ties, as the session folds do.
    const latest = runs[0];
    const tools = runs.map((r) => r.tool_calls);
    out[id] = {
      revision: sessionContentRevision(String(latest.run_id), String(latest.status || "")),
      updatedAt: String(latest.updated_at || latest.created_at || ""),
      content: runs.map((r) => ({ sessionId: id, runId: String(r.run_id), status: String(r.status || ""), revision: sessionContentRevision(String(r.run_id), String(r.status || "")), updatedAt: String(r.updated_at || r.created_at || "") })),
      needsAttention: runs.some(sessionNeedsAttention),
      working: runs.some((r) => ["running", "queued", "pending"].includes(String(r.status))),
      ...(tools.every((n) => typeof n === "number" && Number.isSafeInteger(n) && n >= 0) ? { toolCount: (tools as number[]).reduce((a,b) => a+b, 0) } : {}),
    };
  }
  return out;
}

/** Non-secret account identity; never include a token or token fingerprint. */
export function sessionReadScope(connection: { gateway_url?: string; gateway?: { principal?: { user_id?: string; tenant_id?: string; runtime_id?: string } } } | null | undefined): string {
  const user = connection?.gateway?.principal?.user_id;
  if (!user || !connection?.gateway_url) return "";
  let gateway: string;
  try { const url = new URL(connection.gateway_url); url.username = ""; url.password = ""; url.search = ""; url.hash = ""; gateway = url.href.replace(/\/+$/, ""); }
  catch { return ""; }
  return JSON.stringify([gateway, connection.gateway?.principal?.tenant_id || "", user, connection.gateway?.principal?.runtime_id || ""]);
}

export type SessionReceipt = { sessionId: string; revision: string; updatedAt: string };
export type ReceiptStorage = Pick<Storage, "getItem" | "setItem" | "removeItem" | "key" | "length">;
export class SessionReadStore {
  readonly prefix: string;
  readonly since: number;
  error = "";
  private memory = new Set<string>();
  constructor(scope: string, private storage: ReceiptStorage | null, now = Date.now()) {
    this.prefix = `af.session-read.v1:${encodeURIComponent(scope)}:`;
    let since = now;
    if (scope && !storage) this.error = "Read markers could not be saved in this browser.";
    try {
      const raw = storage?.getItem(this.prefix + "since"), saved = Number(raw);
      if (raw && Number.isFinite(saved) && saved > 0 && saved <= now) since = saved;
      else storage?.setItem(this.prefix + "since", String(now));
    } catch { this.error = "Read markers could not be saved in this browser."; }
    this.since = since;
  }
  private key(p: SessionReceipt) { return this.prefix + encodeURIComponent(JSON.stringify(p.sessionId)) + ":" + encodeURIComponent(JSON.stringify(p.revision)); }
  observe(p: SessionReceipt): void {
    // Baseline old history once, so later metadata-only timestamps cannot make it new.
    if (Date.parse(p.updatedAt) < this.since) this.markRead(p);
  }
  isUnread(p: SessionReceipt): boolean {
    if (!p.sessionId || !p.revision || !Number.isFinite(Date.parse(p.updatedAt)) || Date.parse(p.updatedAt) < this.since) return false;
    const key = this.key(p);
    if (this.memory.has(key)) return false;
    try { return !this.storage?.getItem(key); } catch { return true; }
  }
  markRead(p: SessionReceipt): void {
    if (!p.sessionId || !p.revision) return;
    const key = this.key(p);
    if (this.memory.has(key)) return;
    this.memory.add(key);
    try {
      // Immutable keys per revision: an old tab's acknowledgement cannot overwrite a newer one.
      if (this.storage?.getItem(key)) return;
      this.storage?.setItem(key, String(Date.now()));
      const keys: Array<[string,number]> = [];
      for (let i=0; i<(this.storage?.length || 0); i++) {
        const k = this.storage!.key(i);
        if (k?.startsWith(this.prefix) && k !== this.prefix + "since") keys.push([k, Number(this.storage!.getItem(k)) || 0]);
      }
      keys.sort((a,b) => b[1]-a[1]);
      for (const [k] of keys.slice(4096)) if (k !== key) this.storage?.removeItem(k);
    } catch { this.error = "Read markers could not be saved in this browser."; }
    if (this.memory.size > 4096) this.memory.delete(this.memory.values().next().value!);
  }
}

/** The loaded message whose footer can acknowledge a run's displayed outcome.
 * Failures/cancellations must render `outcome` before the marker: a prompt alone is insufficient. */
export function sessionReadTarget<T extends { runId?: string; role: string; live?: unknown; toolActivity?: unknown }>(messages: readonly T[], runId: string, status: string): { message?: T; outcome?: string } {
  const outcome = status === "failed" ? "Request failed." : status === "cancelled" ? "Request cancelled." : undefined;
  const role = status === "completed" ? "assistant" : "user";
  const candidates = messages.filter(m => m.runId === runId && !m.live && !m.toolActivity && m.role === role);
  return { message: candidates[candidates.length-1], ...(outcome ? { outcome } : {}) };
}
