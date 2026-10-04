// DocsAssistantDrawer — the ONE docs assistant of the console and every app
// (round 8, R8.3: "the shared chat component, pointed at the current app's
// docs").
//
// - Grounding: the CURRENT app's llms.txt, read from the gateway
//   (`GET docs/corpus?app=<id>`; the gateway relays each app's own build copy,
//   the console's is the gateway's own). The text goes to the gateway's
//   shipped `docs-qa` workflow as its `docs` input; the workflow answers only
//   from it. No corpus = an honest error, never an ungrounded answer.
// - One gateway session per conversation (`use_session_history`): the gateway
//   replays earlier turns through the runtime's history window (ADR-0026) and
//   records the receipt; "New conversation" starts another session.
// - Attachments: uploaded to the conversation's session
//   (`POST attachments/upload`) and sent as `context.attachments`, which the
//   docs-qa model step receives as media.
// - Streaming: the run's live `llm.delta` frames (`runs/{id}/ledger/stream`)
//   grow the reply while the run is polled; the completed run's
//   `output.response` replaces the live text. Whether a reply streams is the
//   gateway's `agents.streaming_default` (the client never forces it).
// - Rendering: panel-chat's thread (user right, assistant left; markdown,
//   code, JSON, links; images per the kit's image policy) with copy.
//
// Transport is the host's `GatewayFetch` (bearer token or session cookie);
// the component never builds credentials.
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { AfDrawer, Icon, formatRelativeTime, gatewayApiPath, randomId, useAfTooltips } from "@abstractframework/ui-kit";

import { ChatComposer } from "./chat_composer.js";
import { ChatThread } from "./chat_thread.js";
import type { ChatAttachment, ChatMedia, ChatMessage } from "./chat_message_card.js";
import { droppedFiles, dragCarriesFiles, folderRefusal, pastedFiles } from "./file_drop.js";
import { llmDeltaFromSse, isLlmDeltaEnd } from "./llm_delta.js";
import { gatewayResponseError, type GatewayFetch } from "./workspace_browser.js";

/** Which documentation the assistant answers from. */
export type DocsAssistantSource = {
  /** The corpus id the gateway serves at `docs/corpus?app=<id>`: "gateway"
   * (the console) or an app id ("code", "flow", "observer", "continuum",
   * "entity"). */
  app: string;
  /** Display name, e.g. "AbstractCode". */
  name: string;
};

/** The shipped docs-qa workflow (abstractgateway flows/bundles/docs-qa@0.1.1.flow,
 * the version the gateway's terminal console pins too). Inputs: prompt, docs, app. */
export const DOCS_QA_WORKFLOW = { registry_scope: "tenant_catalog", bundle_id: "docs-qa", bundle_version: "0.1.1", flow_id: "docsqa001" } as const;

/** The session purpose the gateway records for a Docs assistant chat
 * (`POST runs/start` `kind`): conversation lists leave it out; the drawer's
 * history lists it (`GET runs?root_only=true&kind=docs`). */
export const DOCS_SESSION_KIND = "docs" as const;

export function docsCorpusPath(app: string): string {
  return gatewayApiPath(`docs/corpus?${new URLSearchParams({ app: String(app || "") })}`);
}

export function newDocsSessionId(app: string): string {
  return `${String(app || "app")}-docs-assistant:${randomId()}`;
}

/** An attachment as the gateway returns it from `POST attachments/upload`. */
export type DocsAttachmentRef = { $artifact: string; [key: string]: unknown };

/** The `POST runs/start` body for one question. */
export function docsQaStartBody(args: {
  question: string;
  docs: string;
  appName: string;
  sessionId: string;
  attachments?: DocsAttachmentRef[];
}): Record<string, unknown> {
  const input: Record<string, unknown> = {
    prompt: args.question,
    docs: args.docs,
    app: args.appName,
    use_session_history: true,
  };
  if (args.attachments && args.attachments.length) input.context = { attachments: args.attachments };
  return { ...DOCS_QA_WORKFLOW, session_id: args.sessionId, kind: DOCS_SESSION_KIND, input_data: input };
}

/** The answer of a COMPLETED docs-qa run (`output.response`), or "". */
export function docsAnswerFromRun(run: unknown): string {
  const out = (run as { output?: unknown } | null)?.output;
  if (typeof out === "string") return out.trim();
  const response = (out as { response?: unknown } | null)?.response;
  return typeof response === "string" ? response.trim() : "";
}

/** The run's history receipt as one sentence when earlier messages were not replayed. */
export function docsReplayNote(history: unknown): string {
  const h = (history && typeof history === "object" ? history : {}) as Record<string, unknown>;
  const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v > 0 ? Math.trunc(v) : 0);
  const dropped = n(h.dropped_messages);
  if (!dropped) return "";
  const replayed = n(h.replayed_messages);
  const tokens = n(h.dropped_tokens);
  const budget = n(h.max_tokens);
  return (
    `Earlier messages not replayed: ${dropped.toLocaleString("en-US")}${tokens ? ` (~${tokens.toLocaleString("en-US")} tokens)` : ""}. ` +
    `The model read the newest ${replayed.toLocaleString("en-US")} message${replayed === 1 ? "" : "s"}` +
    (budget ? ` (history window: the most recent ${budget.toLocaleString("en-US")} tokens of whole messages).` : ".")
  );
}

/** Parse an SSE body into frames. Ends when the body ends or `signal` aborts. */
export async function* sseFrames(body: ReadableStream<Uint8Array>, signal?: AbortSignal): AsyncGenerator<{ event: string; data: string }> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  const onAbort = () => {
    reader.cancel().catch(() => undefined);
  };
  signal?.addEventListener("abort", onAbort, { once: true });
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, "\n");
      let cut = buffer.indexOf("\n\n");
      while (cut >= 0) {
        const raw = buffer.slice(0, cut);
        buffer = buffer.slice(cut + 2);
        let event = "message";
        const data: string[] = [];
        for (const line of raw.split("\n")) {
          if (line.startsWith("event:")) event = line.slice(6).trim();
          else if (line.startsWith("data:")) data.push(line.slice(5).replace(/^ /, ""));
        }
        if (data.length) yield { event, data: data.join("\n") };
        cut = buffer.indexOf("\n\n");
      }
    }
  } finally {
    signal?.removeEventListener("abort", onAbort);
  }
}

export type DocsAskContext = {
  signal: AbortSignal;
  sessionId: string;
  files?: File[];
  /** The live reply text so far (streamed runs). */
  onText?: (text: string) => void;
  /** The completed run's history receipt (`session_history`). */
  onHistory?: (history: unknown) => void;
};

export type DocsAsk = (question: string, ctx: DocsAskContext) => Promise<string>;

function wait(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(new DOMException("Aborted", "AbortError"));
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", stop);
      resolve();
    }, ms);
    const stop = () => {
      clearTimeout(timer);
      reject(new DOMException("Aborted", "AbortError"));
    };
    signal.addEventListener("abort", stop, { once: true });
  });
}

async function jsonOf(response: Response, what: string): Promise<any> {
  if (!response.ok) throw await gatewayResponseError(response, what);
  return response.json();
}

/**
 * The docs-qa transport: corpus (cached per source on success) → uploads →
 * run start → live deltas + polling → the completed run's answer.
 */
export function makeDocsQaAsk(opts: {
  fetchGateway: GatewayFetch;
  source: DocsAssistantSource;
  pollMs?: number;
  timeoutMs?: number;
}): DocsAsk {
  const pollMs = opts.pollMs ?? 1000;
  const timeoutMs = opts.timeoutMs ?? 180_000;
  let corpus: string | null = null;
  return async (question, ctx) => {
    const { fetchGateway, source } = opts;
    if (corpus === null) {
      const r = await fetchGateway(docsCorpusPath(source.app), { signal: ctx.signal, headers: { Accept: "application/json" } });
      const body = await jsonOf(r, `The ${source.name} documentation could not be read, so nothing was asked`);
      const text = typeof body?.text === "string" ? body.text : "";
      if (!text.trim()) throw new Error(`The gateway returned an empty ${source.name} documentation corpus, so nothing was asked.`);
      corpus = text;
    }
    const docs = String(corpus);
    const attachments: DocsAttachmentRef[] = [];
    for (const file of ctx.files || []) {
      const form = new FormData();
      form.append("session_id", ctx.sessionId);
      form.append("file", file, file.name || "upload.bin");
      form.append("filename", file.name || "upload.bin");
      if (file.type) form.append("content_type", file.type);
      const up = await jsonOf(await fetchGateway(gatewayApiPath("attachments/upload"), { method: "POST", body: form, signal: ctx.signal }), `"${file.name}" could not be attached`);
      const ref = up?.attachment;
      if (!ref || typeof ref.$artifact !== "string" || !ref.$artifact) throw new Error(`"${file.name}" could not be attached: the gateway returned no attachment reference.`);
      attachments.push(ref as DocsAttachmentRef);
    }
    const started = await jsonOf(
      await fetchGateway(gatewayApiPath("runs/start"), {
        method: "POST",
        signal: ctx.signal,
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(docsQaStartBody({ question, docs, appName: source.name, sessionId: ctx.sessionId, attachments })),
      }),
      "The docs-qa workflow could not start",
    );
    const runId = String(started?.run_id || "");
    if (!runId) throw new Error("The gateway did not return a run id for the docs-qa workflow.");

    // Live text: best effort beside the poll (the poll is the authority).
    const live = new AbortController();
    const stopLive = () => live.abort();
    ctx.signal.addEventListener("abort", stopLive, { once: true });
    if (ctx.onText) {
      void (async () => {
        try {
          const r = await fetchGateway(gatewayApiPath(`runs/${encodeURIComponent(runId)}/ledger/stream?after=0`), { signal: live.signal, headers: { Accept: "text/event-stream" } });
          if (!r.ok || !r.body) return;
          let call = "";
          let text = "";
          for await (const frame of sseFrames(r.body, live.signal)) {
            const delta = llmDeltaFromSse(frame.event, frame.data);
            if (!delta || isLlmDeltaEnd(delta) || delta.channel !== "content" || delta.run_id !== runId) continue;
            if (delta.call_id !== call) {
              call = delta.call_id;
              text = "";
            }
            text = delta.snapshot ? delta.text : text + delta.text;
            ctx.onText?.(text);
          }
        } catch {
          /* the poll below still delivers the answer */
        }
      })();
    }
    try {
      const deadline = Date.now() + timeoutMs;
      for (;;) {
        await wait(pollMs, ctx.signal);
        const run = await jsonOf(await fetchGateway(gatewayApiPath(`runs/${encodeURIComponent(runId)}`), { signal: ctx.signal }), "The docs-qa run could not be read");
        const status = String(run?.status || "").toLowerCase();
        if (status === "completed") {
          ctx.onHistory?.(run?.session_history ?? null);
          const answer = docsAnswerFromRun(run);
          if (!answer) throw new Error(`The docs-qa run ${runId} completed without an answer.`);
          return answer;
        }
        if (status === "failed" || status === "cancelled") {
          const err = run?.error;
          const reason = typeof err === "string" ? err : typeof err?.message === "string" ? err.message : "";
          throw new Error(`The docs-qa run ${status}${reason ? `: ${reason}` : ""}.`);
        }
        if (status === "waiting") throw new Error(`The docs-qa run ${runId} is waiting for input it should never need. Inspect it in Observer.`);
        if (Date.now() >= deadline) throw new Error(`The docs-qa run ${runId} is still running after ${Math.round(timeoutMs / 1000)} s. It stays in the gateway's history.`);
      }
    } finally {
      ctx.signal.removeEventListener("abort", stopLive);
      live.abort();
    }
  };
}

/** One past Docs assistant conversation of this app (the drawer's history). */
export type DocsHistoryItem = { sessionId: string; title: string; updatedAt: string; runIds: string[] };

/** `GET runs?root_only=true&kind=docs` for this source's sessions, newest first, titled by their first question. */
export async function loadDocsHistory(fetchGateway: GatewayFetch, app: string, opts: { signal?: AbortSignal; max?: number } = {}): Promise<DocsHistoryItem[]> {
  const qs = new URLSearchParams({ root_only: "true", kind: DOCS_SESSION_KIND, limit: "500", include_ledger_len: "false" });
  const page = await jsonOf(await fetchGateway(gatewayApiPath(`runs?${qs}`), { signal: opts.signal }), "The docs assistant history could not be read");
  const prefix = `${String(app || "app")}-docs-assistant:`;
  const bySession = new Map<string, { runs: { id: string; created: string }[]; updatedAt: string }>();
  for (const row of Array.isArray(page?.items) ? page.items : []) {
    const sid = String(row?.session_id || "");
    if (!sid.startsWith(prefix) || !row?.run_id) continue;
    const entry = bySession.get(sid) || { runs: [], updatedAt: "" };
    entry.runs.push({ id: String(row.run_id), created: String(row.created_at || "") });
    const updated = String(row.updated_at || row.created_at || "");
    if (updated > entry.updatedAt) entry.updatedAt = updated;
    bySession.set(sid, entry);
  }
  const sessions = [...bySession.entries()].sort((a, b) => (a[1].updatedAt < b[1].updatedAt ? 1 : -1)).slice(0, opts.max ?? 20);
  return Promise.all(
    sessions.map(async ([sessionId, entry]) => {
      const runIds = entry.runs.sort((a, b) => (a.created < b.created ? -1 : 1)).map((r) => r.id);
      let title = "";
      try {
        const first = await jsonOf(await fetchGateway(gatewayApiPath(`runs/${encodeURIComponent(runIds[0])}/input_data`), { signal: opts.signal }), "");
        title = String(first?.input_data?.prompt || "").trim();
      } catch {
        title = "";
      }
      return { sessionId, title: title || "Untitled question", updatedAt: entry.updatedAt, runIds };
    }),
  );
}

/** A past conversation as messages: each turn's question (its input) and answer (the completed run's response). */
export async function loadDocsConversation(fetchGateway: GatewayFetch, item: DocsHistoryItem, appName: string, signal?: AbortSignal): Promise<ChatMessage[]> {
  const out: ChatMessage[] = [];
  for (const runId of item.runIds) {
    const [input, run] = await Promise.all([
      jsonOf(await fetchGateway(gatewayApiPath(`runs/${encodeURIComponent(runId)}/input_data`), { signal }), "A past question could not be read"),
      jsonOf(await fetchGateway(gatewayApiPath(`runs/${encodeURIComponent(runId)}`), { signal }), "A past answer could not be read"),
    ]);
    const question = String(input?.input_data?.prompt || "").trim();
    if (question) out.push({ id: `u-${runId}`, role: "user", content: question, ts: String(run?.created_at || "") || undefined });
    const answer = docsAnswerFromRun(run);
    const status = String(run?.status || "").toLowerCase();
    out.push(
      answer
        ? { id: `a-${runId}`, role: "assistant", title: appName, content: answer, ts: String(run?.updated_at || "") || undefined }
        : { id: `a-${runId}`, role: "assistant", title: appName, level: "warn", content: status === "completed" ? "This answer was empty." : `No answer: the run is ${status || "unknown"}.` },
    );
  }
  return out;
}

export type DocsHistoryListProps = {
  items: DocsHistoryItem[];
  state: "loading" | "ready" | "error";
  error?: string;
  nowMs: number;
  activeSessionId?: string;
  onOpen: (item: DocsHistoryItem) => void;
  onArchive: (item: DocsHistoryItem) => void;
};

/** The drawer's history: past conversations (newest first), open or archive (inline confirm). */
export function DocsHistoryList(props: DocsHistoryListProps): React.ReactElement {
  const [confirming, setConfirming] = useState<string | null>(null);
  if (props.state === "loading") return <div className="pc-docs-history__note" role="status">Loading past conversations…</div>;
  if (props.state === "error") return <div className="pc-docs-history__note pc-docs-history__note--error" role="alert">{props.error || "The history could not be read."}</div>;
  if (!props.items.length) return <div className="pc-docs-history__note">No past conversations yet.</div>;
  return (
    <ul className="pc-docs-history" aria-label="Past conversations">
      {props.items.map((item) => (
        <li key={item.sessionId} className={`pc-docs-history__row${item.sessionId === props.activeSessionId ? " is-active" : ""}`}>
          {confirming === item.sessionId ? (
            <div className="pc-docs-history__confirm">
              <span>Archive this conversation? It stays in the gateway; it leaves this list.</span>
              <button type="button" className="pc-docs-history__btn pc-docs-history__btn--danger" onClick={() => { setConfirming(null); props.onArchive(item); }}>Archive</button>
              <button type="button" className="pc-docs-history__btn" onClick={() => setConfirming(null)}>Cancel</button>
            </div>
          ) : (
            <>
              <button type="button" className="pc-docs-history__open" onClick={() => props.onOpen(item)} title={item.title}>
                <span className="pc-docs-history__title">{item.title}</span>
                <span className="pc-docs-history__meta">{formatRelativeTime(item.updatedAt, props.nowMs)}{item.runIds.length > 1 ? ` · ${item.runIds.length} questions` : ""}</span>
              </button>
              <button type="button" className="pc-docs-assistant__icon-btn" aria-label={`Archive "${item.title}"`} data-af-tip={`Archive "${item.title}" (kept, hidden)`} onClick={() => setConfirming(item.sessionId)}>
                <Icon name="archive" size={16} />
              </button>
            </>
          )}
        </li>
      ))}
    </ul>
  );
}

type PendingFile = { id: string; file: File; preview?: string };

const IMAGE_TYPES = /^image\/(png|jpe?g|gif|webp|avif|bmp|svg\+xml)$/i;

export type DocsAssistantPanelProps = {
  source: DocsAssistantSource;
  messages: ChatMessage[];
  draft: string;
  onDraftChange: (value: string) => void;
  onSend: () => void;
  onStop?: () => void;
  busy?: boolean;
  /** Composer disabled with this sentence in the thread (e.g. not connected). */
  blockedNotice?: string;
  files?: { id: string; name: string }[];
  onAddFiles?: (files: File[]) => void;
  onRemoveFile?: (id: string) => void;
  /** Receives a refusal sentence (e.g. a dropped folder). */
  onNotice?: (text: string) => void;
  /** A one-line notice above the composer (drop refusals, replay receipt). */
  notice?: string;
  suggestions?: string[];
  onSuggestion?: (text: string) => void;
  placeholder?: string;
};

/** The stateless view (thread, composer, footer); the drawer owns the state. */
export function DocsAssistantPanel(props: DocsAssistantPanelProps): React.ReactElement {
  const fileInput = useRef<HTMLInputElement | null>(null);
  const [dragging, setDragging] = useState(false);
  const blocked = Boolean(props.blockedNotice);
  const busy = Boolean(props.busy);
  const files = props.files || [];
  const canAttach = typeof props.onAddFiles === "function" && !blocked;
  const empty = (
    <div className="pc-docs-assistant__empty">
      <p className="pc-docs-assistant__empty-text">Ask anything about {props.source.name}.</p>
      {props.suggestions && props.suggestions.length ? (
        <div className="pc-docs-assistant__suggestions">
          {props.suggestions.map((s) => (
            <button key={s} type="button" className="pc-docs-assistant__suggestion" disabled={busy || blocked} onClick={() => props.onSuggestion?.(s)}>
              {s}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
  return (
    <div
      className={`pc-docs-assistant${dragging ? " is-dragging" : ""}`}
      onDragOver={(e) => {
        if (!canAttach || !dragCarriesFiles(e.dataTransfer?.types)) return;
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        if (!canAttach) return;
        e.preventDefault();
        setDragging(false);
        const dropped = droppedFiles(e.dataTransfer);
        if (dropped.files.length) props.onAddFiles?.(dropped.files);
        if (dropped.folders.length) props.onNotice?.(folderRefusal(dropped.folders));
      }}
    >
      <ChatThread className="pc-docs-assistant__thread" messages={props.messages} autoScroll empty={empty} messageProps={{ showCopy: true }} />
      {blocked ? <div className="pc-docs-assistant__blocked" role="status">{props.blockedNotice}</div> : null}
      {props.notice ? <div className="pc-docs-assistant__notice" role="status">{props.notice}</div> : null}
      <div className="pc-docs-assistant__composer">
        <ChatComposer
          value={props.draft}
          onChange={props.onDraftChange}
          onSubmit={props.onSend}
          placeholder={props.placeholder || `Ask about ${props.source.name}…`}
          ariaLabel={`Question about ${props.source.name}`}
          disabled={blocked}
          busy={busy}
          rows={1}
          sendLabel="Send"
          busyLabel="Answering…"
          onPaste={(e) => {
            if (!canAttach) return;
            const pasted = pastedFiles(e.clipboardData);
            if (pasted.length) {
              e.preventDefault();
              props.onAddFiles?.(pasted);
            }
          }}
          leading={
            files.length ? (
              <div className="pc-chat-attachments pc-docs-assistant__files" role="list" aria-label="Attached files">
                {files.map((f) => (
                  <span key={f.id} role="listitem" className="pc-chat-attachment-chip">
                    <Icon name="paperclip" size={14} />
                    <span className="pc-chat-attachment-name">{f.name}</span>
                    {props.onRemoveFile && !busy ? (
                      <button type="button" className="pc-docs-assistant__file-remove" aria-label={`Remove ${f.name}`} data-af-tip={`Remove ${f.name}`} onClick={() => props.onRemoveFile?.(f.id)}>
                        <Icon name="x" size={12} />
                      </button>
                    ) : null}
                  </span>
                ))}
              </div>
            ) : null
          }
          actions={
            <>
              {canAttach ? (
                <>
                  <button type="button" className="pc-docs-assistant__icon-btn" aria-label="Attach files" data-af-tip="Attach files to your question" disabled={busy} onClick={() => fileInput.current?.click()}>
                    <Icon name="paperclip" size={16} />
                  </button>
                  <input
                    ref={fileInput}
                    type="file"
                    multiple
                    hidden
                    aria-hidden="true"
                    tabIndex={-1}
                    onChange={(e) => {
                      const list = Array.from(e.currentTarget.files || []);
                      e.currentTarget.value = "";
                      if (list.length) props.onAddFiles?.(list);
                    }}
                  />
                </>
              ) : null}
              {busy && props.onStop ? (
                <button type="button" className="pc-docs-assistant__icon-btn" aria-label="Stop" data-af-tip="Stop the answer" onClick={props.onStop}>
                  <Icon name="stop" size={14} />
                </button>
              ) : null}
            </>
          }
        />
      </div>
      <div className="pc-docs-assistant__footer" title={`Answers come from ${props.source.name}'s documentation (llms.txt) through the gateway's docs-qa workflow.`}>
        Grounded on {props.source.name}&rsquo;s documentation (llms.txt) · docs-qa
      </div>
    </div>
  );
}

export type DocsAssistantDrawerProps = {
  open: boolean;
  onClose: () => void;
  source: DocsAssistantSource;
  /** The host's gateway fetch (relative `api/gateway/...` paths). */
  fetchGateway: GatewayFetch;
  /** False = the composer is disabled with "Connect to the gateway…". */
  connected: boolean;
  suggestions?: string[];
  placeholder?: string;
  width?: number;
  topOffset?: number;
  className?: string;
  /** Test seam: replaces the docs-qa transport. */
  ask?: DocsAsk;
};

function now(): string {
  return new Date().toISOString();
}

/**
 * The drawer every surface mounts (keep it mounted while closed: the kit's
 * keep-alive contract keeps the conversation and an in-flight answer).
 */
export function DocsAssistantDrawer(props: DocsAssistantDrawerProps): React.ReactElement {
  useAfTooltips();
  const { source } = props;
  const fetchRef = useRef(props.fetchGateway);
  fetchRef.current = props.fetchGateway;
  const ask = useMemo<DocsAsk>(
    () => props.ask || makeDocsQaAsk({ fetchGateway: (path, init) => fetchRef.current(path, init), source }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [props.ask, source.app, source.name],
  );
  const session = useRef(newDocsSessionId(source.app));
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const messagesRef = useRef(messages);
  messagesRef.current = messages;
  const [draft, setDraft] = useState("");
  const [files, setFiles] = useState<PendingFile[]>([]);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const active = useRef<AbortController | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [history, setHistory] = useState<{ state: "loading" | "ready" | "error"; items: DocsHistoryItem[]; error?: string }>({ state: "loading", items: [] });

  useEffect(() => () => active.current?.abort(), []);
  const refreshHistory = useCallback(async () => {
    setHistory((h) => ({ ...h, state: "loading" }));
    try {
      const items = await loadDocsHistory((path, init) => fetchRef.current(path, init), source.app);
      setHistory({ state: "ready", items });
    } catch (e: any) {
      setHistory({ state: "error", items: [], error: String(e?.message || e) });
    }
  }, [source.app]);
  const openPast = useCallback(
    async (item: DocsHistoryItem) => {
      active.current?.abort();
      setHistory((h) => ({ ...h, state: "loading" }));
      try {
        const past = await loadDocsConversation((path, init) => fetchRef.current(path, init), item, source.name);
        session.current = item.sessionId;
        setMessages(past);
        setNotice("");
        setHistoryOpen(false);
        setHistory((h) => ({ ...h, state: "ready" }));
      } catch (e: any) {
        setHistory((h) => ({ ...h, state: "error", error: String(e?.message || e) }));
      }
    },
    [source.name],
  );
  const archivePast = useCallback(
    async (item: DocsHistoryItem) => {
      try {
        const r = await fetchRef.current(gatewayApiPath(`sessions/${encodeURIComponent(item.sessionId)}/archive`), { method: "POST" });
        if (!r.ok) throw await gatewayResponseError(r, "The conversation could not be archived");
        if (session.current === item.sessionId) {
          session.current = newDocsSessionId(source.app);
          setMessages([]);
        }
        setHistory((h) => ({ ...h, items: h.items.filter((x) => x.sessionId !== item.sessionId) }));
      } catch (e: any) {
        setHistory((h) => ({ ...h, state: "error", error: String(e?.message || e) }));
      }
    },
    [source.app],
  );
  useEffect(() => {
    if (!props.connected) active.current?.abort();
  }, [props.connected]);
  useEffect(
    () => () => {
      for (const f of files) if (f.preview) URL.revokeObjectURL(f.preview);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const addFiles = useCallback((list: File[]) => {
    setNotice("");
    setFiles((prev) => [
      ...prev,
      ...list.map((file) => ({
        id: randomId(),
        file,
        preview: IMAGE_TYPES.test(file.type) && typeof URL !== "undefined" && typeof URL.createObjectURL === "function" ? URL.createObjectURL(file) : undefined,
      })),
    ]);
  }, []);

  const send = useCallback(
    async (text: string) => {
      const question = String(text || "").trim();
      if (!question || busy || !props.connected) return;
      const sending = files;
      setDraft("");
      setFiles([]);
      setNotice("");
      const media: ChatMedia[] = sending.filter((f) => f.preview).map((f) => ({ kind: "image", src: f.preview!, label: f.file.name }));
      const chips: ChatAttachment[] = sending.map((f) => ({ id: f.id, label: f.file.name, title: f.file.name, disabled: true }));
      const user: ChatMessage = { id: `u-${randomId()}`, role: "user", content: question, ts: now(), ...(media.length ? { media } : {}), ...(chips.length ? { attachments: chips } : {}) };
      const replyId = `a-${randomId()}`;
      const base = [...messagesRef.current, user];
      const pending: ChatMessage = { id: replyId, role: "assistant", title: source.name, content: "", ts: now(), live: { callId: replyId, reasoning: "", label: "answering" } };
      setMessages([...base, pending]);
      setBusy(true);
      const controller = new AbortController();
      active.current = controller;
      const put = (m: ChatMessage) => setMessages([...base, m]);
      try {
        const answer = await ask(question, {
          signal: controller.signal,
          sessionId: session.current,
          files: sending.map((f) => f.file),
          onText: (live) => {
            if (!controller.signal.aborted) put({ ...pending, content: live, live: { callId: replyId, reasoning: "", label: "streaming" } });
          },
          onHistory: (h) => setNotice(docsReplayNote(h)),
        });
        if (!controller.signal.aborted) put({ id: replyId, role: "assistant", title: source.name, content: answer, ts: now() });
      } catch (e: any) {
        const stopped = controller.signal.aborted;
        put({
          id: replyId,
          role: "assistant",
          title: source.name,
          level: stopped ? "warn" : "error",
          content: stopped ? "Stopped. Nothing more will be shown for this question." : String(e?.message || e || "The docs assistant failed."),
          ts: now(),
        });
      } finally {
        if (active.current === controller) active.current = null;
        setBusy(false);
      }
    },
    [ask, busy, files, props.connected, source.name],
  );

  const newConversation = () => {
    active.current?.abort();
    session.current = newDocsSessionId(source.app);
    setMessages([]);
    setFiles([]);
    setDraft("");
    setNotice("");
  };

  return (
    <AfDrawer
      open={props.open}
      onClose={props.onClose}
      label="Docs assistant"
      title={
        <span className="pc-docs-assistant__title">
          <Icon name="book" size={16} />
          Docs assistant
        </span>
      }
      width={props.width || 420}
      topOffset={props.topOffset}
      className={`pc-docs-assistant-drawer${props.className ? ` ${props.className}` : ""}`}
      headerActions={
        <>
          <button
            type="button"
            className={`pc-docs-assistant__icon-btn${historyOpen ? " is-active" : ""}`}
            aria-label="Past conversations"
            data-af-tip="Past conversations"
            aria-pressed={historyOpen}
            disabled={!props.connected || busy}
            onClick={() => {
              const next = !historyOpen;
              setHistoryOpen(next);
              if (next) void refreshHistory();
            }}
          >
            <Icon name="history" size={16} />
          </button>
          <button type="button" className="pc-docs-assistant__icon-btn" aria-label="New conversation" data-af-tip="Start a new conversation" disabled={!messages.length && !draft && !files.length && !historyOpen} onClick={() => { newConversation(); setHistoryOpen(false); }}>
            <Icon name="compose" size={16} />
          </button>
        </>
      }
    >
      {historyOpen ? (
        <div className="pc-docs-assistant pc-docs-assistant--history">
          <DocsHistoryList items={history.items} state={history.state} error={history.error} nowMs={Date.now()} activeSessionId={session.current} onOpen={(i) => void openPast(i)} onArchive={(i) => void archivePast(i)} />
        </div>
      ) : null}
      <div hidden={historyOpen} style={{ display: historyOpen ? "none" : "contents" }}>
      <DocsAssistantPanel
        source={source}
        messages={messages}
        draft={draft}
        onDraftChange={setDraft}
        onSend={() => void send(draft)}
        onStop={() => active.current?.abort()}
        busy={busy}
        blockedNotice={props.connected ? undefined : "Connect to the gateway to use the docs assistant."}
        files={files.map((f) => ({ id: f.id, name: f.file.name }))}
        onAddFiles={addFiles}
        onNotice={setNotice}
        onRemoveFile={(id) =>
          setFiles((prev) => {
            const gone = prev.find((f) => f.id === id);
            if (gone?.preview) URL.revokeObjectURL(gone.preview);
            return prev.filter((f) => f.id !== id);
          })
        }
        notice={notice}
        suggestions={props.suggestions}
        onSuggestion={(s) => void send(s)}
        placeholder={props.placeholder}
      />
      </div>
    </AfDrawer>
  );
}

export default DocsAssistantDrawer;
