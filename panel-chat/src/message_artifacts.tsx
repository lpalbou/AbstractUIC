import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  gatewayApiPath,
  Icon,
  type AfGatewayFetch,
} from "@abstractframework/ui-kit";
import type { ChatMessage } from "./chat_message_card.js";
import { runBounded } from "./attachment_uploads.js";
import { deliverBlob, gatewayResponseError } from "./workspace_browser.js";

export type MessageArtifact = { id: string; runId: string; name?: string };
const obj = (v: unknown): Record<string, unknown> =>
  v && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : {};
/** Walk only attachment/output fields selected by the caller, never internal run bookkeeping. */
export function messageArtifactRefs(
  value: unknown,
  runId: string,
): MessageArtifact[] {
  const refs: MessageArtifact[] = [],
    seen = new Set<string>();
  const walk = (v: unknown, depth = 0) => {
    if (depth > 8) return;
    if (Array.isArray(v)) {
      v.forEach((x) => walk(x, depth + 1));
      return;
    }
    const r = obj(v),
      id = r.$artifact || r.artifact_id;
    if (typeof id === "string" && id) {
      const owner =
          typeof r.run_id === "string"
            ? r.run_id
            : typeof r.artifact_run_id === "string"
              ? r.artifact_run_id
              : runId,
        key = JSON.stringify([owner, id]);
      if (!seen.has(key)) {
        seen.add(key);
        refs.push({
          id,
          runId: owner,
          ...(typeof (r.filename || r.name) === "string"
            ? { name: String(r.filename || r.name) }
            : {}),
        });
      }
      return;
    }
    Object.values(r).forEach((x) => {
      if (x && typeof x === "object") walk(x, depth + 1);
    });
  };
  walk(value);
  return refs;
}
export function submittedArtifacts(
  body: unknown,
  runId: string,
): MessageArtifact[] {
  const root = obj(body),
    input = obj(root.input_data || body),
    context = obj(input.context);
  return messageArtifactRefs(
    [
      input.attachments,
      context.attachments,
      input.image_artifact,
      context.image_artifact,
    ],
    runId,
  );
}
export function outputArtifacts(
  output: unknown,
  runId: string,
): MessageArtifact[] {
  const r = obj(output);
  return messageArtifactRefs(
    [
      r.attachments,
      r.artifacts,
      r.files,
      r.image_artifact,
      r.audio_artifact,
      r.video_artifact,
      r.music_artifact,
      obj(r.meta).attachments,
      obj(r.meta).files,
      obj(r.meta).artifacts,
      obj(r.meta).image_artifact,
      obj(r.meta).video_artifact,
      obj(r.meta).audio_artifact,
      obj(r.meta).music_artifact,
      ...(r.result
        ? [
            obj(r.result).attachments,
            obj(r.result).artifacts,
            obj(r.result).files,
          ]
        : []),
    ],
    runId,
  );
}
export function useMessageArtifacts(
  messages: ChatMessage[],
  fetchGateway: AfGatewayFetch | undefined,
  scope: string,
  run?: { runId: string; output: unknown },
) {
  const [attempt, setAttempt] = useState(0);
  const cache = useRef<{
    owner: string;
    refs: Map<string, MessageArtifact[]>;
    outputs: Map<string, MessageArtifact[]>;
  }>({ owner: scope, refs: new Map(), outputs: new Map() });
  if (cache.current.owner !== scope)
    cache.current = { owner: scope, refs: new Map(), outputs: new Map() };
  const signature = JSON.stringify([
    ...new Set(
      messages.filter((m) => m.role === "user" && m.runId).map((m) => m.runId),
    ),
  ]);
  const [inputs, setInputs] = useState<{
    owner: string;
    refs: Record<string, MessageArtifact[]>;
    error: string;
  }>({ owner: scope, refs: {}, error: "" });
  useEffect(() => {
    const abort = new AbortController(),
      ids = (JSON.parse(signature) as string[]).filter(
        (id) => !cache.current.refs.has(id),
      );
    const currentIds = new Set(JSON.parse(signature) as string[]);
    for (const key of cache.current.refs.keys())
      if (!currentIds.has(key)) cache.current.refs.delete(key);
    for (const key of cache.current.outputs.keys())
      if (!currentIds.has(key)) cache.current.outputs.delete(key);
    setInputs({
      owner: scope,
      refs: Object.fromEntries(cache.current.refs),
      error: "",
    });
    if (!fetchGateway) return () => abort.abort();
    void runBounded(ids, 4, async (id) => {
      try {
        const response = await fetchGateway(
          gatewayApiPath(`runs/${encodeURIComponent(id)}/input_data`),
          { signal: abort.signal },
        );
        if (!response.ok)
          throw await gatewayResponseError(
            response,
            "Message attachments could not be checked",
          );
        const refs = submittedArtifacts(await response.json(), id);
        if (!abort.signal.aborted && cache.current.owner === scope) {
          cache.current.refs.set(id, refs);
          setInputs((old) => ({ ...old, refs: { ...old.refs, [id]: refs } }));
        }
      } catch (e) {
        if (!abort.signal.aborted && cache.current.owner === scope)
          setInputs((old) => ({
            ...old,
            error: e instanceof Error ? e.message : String(e),
          }));
      }
    });
    return () => abort.abort();
  }, [fetchGateway, scope, signature, attempt]);
  // Older replay views omit file-only assistant messages. Restore only those missing
  // outcomes from authorized run snapshots; never infer attachments from tool bookkeeping.
  const missing = JSON.stringify(
    (JSON.parse(signature) as string[]).filter(
      (id) => !messages.some((m) => m.runId === id && m.role === "assistant"),
    ),
  );
  const [restored, setRestored] = useState<{
    owner: string;
    files: Record<string, MessageArtifact[]>;
    error: string;
  }>({ owner: scope, files: {}, error: "" });
  useEffect(() => {
    const abort = new AbortController();
    setRestored((old) =>
      old.owner === scope
        ? { ...old, error: "" }
        : { owner: scope, files: {}, error: "" },
    );
    if (fetchGateway)
      void runBounded(
        (JSON.parse(missing) as string[]).filter(
          (id) => !cache.current.outputs.has(id),
        ),
        4,
        async (id) => {
          if (id === run?.runId && outputArtifacts(run.output, id).length)
            return;
          try {
            const response = await fetchGateway(
              gatewayApiPath(`runs/${encodeURIComponent(id)}`),
              { signal: abort.signal },
            );
            if (!response.ok)
              throw await gatewayResponseError(
                response,
                "Attached reply could not be checked",
              );
            const body = obj(await response.json());
            const files =
              body.status === "completed"
                ? outputArtifacts(body.output, id)
                : [];
            if (!abort.signal.aborted && cache.current.owner === scope) {
              if (
                ["completed", "failed", "cancelled"].includes(
                  String(body.status),
                )
              )
                cache.current.outputs.set(id, files);
              setRestored((old) =>
                old.owner === scope
                  ? { ...old, files: { ...old.files, [id]: files } }
                  : old,
              );
            }
          } catch (e) {
            if (!abort.signal.aborted)
              setRestored((old) =>
                old.owner === scope
                  ? {
                      ...old,
                      error: e instanceof Error ? e.message : String(e),
                    }
                  : old,
              );
          }
        },
      );
    return () => abort.abort();
  }, [fetchGateway, scope, missing, run?.runId, run?.output, attempt]);
  const shown = useMemo(() => {
    const inputShown = new Set<string>();
    const list = messages.map((m) => {
      const originalPrompt =
        m.role === "user" && Boolean(m.runId) && !inputShown.has(m.runId!);
      if (originalPrompt) inputShown.add(m.runId!);
      const submitted =
        originalPrompt && inputs.owner === scope
          ? inputs.refs[m.runId || ""] || []
          : [];
      const refs = [
        ...(m.artifactRefs || []),
        ...(m.artifactIds || [])
          .filter(
            (id) =>
              ![...(m.artifactRefs || []), ...submitted].some(
                (r) => r.id === id,
              ),
          )
          .map((id) => ({ id, runId: m.runId || "" })),
        ...submitted,
      ];
      const unique = [
        ...new Map(
          refs
            .filter((r) => r.id && r.runId)
            .map((r) => [JSON.stringify([r.runId, r.id]), r]),
        ).values(),
      ];
      return unique.length ? { ...m, artifactRefs: unique } : m;
    });
    const visibleRuns = new Set(messages.map((message) => message.runId));
    const outcomes: Array<[string, MessageArtifact[]]> = [
      ...(restored.owner === scope
        ? Object.entries(restored.files).filter(([id]) => visibleRuns.has(id))
        : []),
      ...(run
        ? [
            [run.runId, outputArtifacts(run.output, run.runId)] as [
              string,
              MessageArtifact[],
            ],
          ]
        : []),
    ];
    for (const [outputRunId, refs] of outcomes) {
      if (refs.length) {
        let i = -1;
        for (let j = list.length - 1; j >= 0; j--)
          if (
            list[j].role === "assistant" &&
            list[j].runId === outputRunId &&
            !list[j].live
          ) {
            i = j;
            break;
          }
        if (i < 0) {
          const after = list.reduce(
            (last, message, index) =>
              message.runId === outputRunId ? index : last,
            -1,
          );
          list.splice(after + 1, 0, {
            id: `attachments:${outputRunId}`,
            kind: "attachments",
            role: "assistant",
            runId: outputRunId,
            content: "",
            artifactRefs: refs,
          });
        } else
          list[i] = {
            ...list[i],
            artifactRefs: [
              ...new Map(
                [...(list[i].artifactRefs || []), ...refs].map((r) => [
                  JSON.stringify([r.runId, r.id]),
                  r,
                ]),
              ).values(),
            ],
          };
      }
    }
    return list;
  }, [messages, inputs, restored, scope, run?.runId, run?.output]);
  return {
    messages: shown,
    error: [
      inputs.owner === scope ? inputs.error : "",
      restored.owner === scope ? restored.error : "",
    ]
      .filter(Boolean)
      .join(" "),
    retry: () => setAttempt((n) => n + 1),
  };
}
// Host-authenticated fetch is scoped by the provider's key. Content loads only on activation.
export const ArtifactFetchContext = createContext<AfGatewayFetch | undefined>(
  undefined,
);
export function MessageArtifactChip({
  artifact,
}: {
  artifact: MessageArtifact;
}): React.ReactElement {
  const fetchGateway = useContext(ArtifactFetchContext),
    [name, setName] = useState(artifact.name || `Attachment ${artifact.id}`),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    action = useRef<AbortController | null>(null);
  const path = gatewayApiPath(
    `runs/${encodeURIComponent(artifact.runId)}/artifacts/${encodeURIComponent(artifact.id)}`,
  );
  useEffect(() => {
    const abort = new AbortController();
    setName(artifact.name || `Attachment ${artifact.id}`);
    setError("");
    setBusy(false);
    if (fetchGateway)
      void fetchGateway(path, { signal: abort.signal })
        .then(async (r) => {
          if (!r.ok)
            throw await gatewayResponseError(r, "Attachment unavailable");
          const meta = await r.json(),
            tags = obj(meta.tags),
            descriptor = obj(meta.descriptor),
            envelope = obj(meta.artifact_envelope_v1);
          const value =
            meta.filename ||
            meta.name ||
            tags.filename ||
            descriptor.name ||
            envelope.name;
          if (!abort.signal.aborted && typeof value === "string")
            setName(value);
        })
        .catch((e) => {
          if (!abort.signal.aborted)
            setError(e instanceof Error ? e.message : String(e));
        });
    return () => {
      abort.abort();
      action.current?.abort();
    };
  }, [fetchGateway, path, artifact.name]);
  return (
    <span className="pc-message-artifact">
      <button
        type="button"
        className="pc-chat-attachment-chip"
        disabled={!fetchGateway || busy}
        onClick={async () => {
          if (!fetchGateway) return;
          const abort = new AbortController();
          action.current = abort;
          setBusy(true);
          setError("");
          try {
            const r = await fetchGateway(`${path}/content`, {
              signal: abort.signal,
            });
            if (!r.ok)
              throw await gatewayResponseError(
                r,
                "Attachment could not be opened",
              );
            const blob = await r.blob();
            if (!abort.signal.aborted) deliverBlob(blob, name, "open");
          } catch (e) {
            if (!abort.signal.aborted)
              setError(e instanceof Error ? e.message : String(e));
          } finally {
            if (!abort.signal.aborted) setBusy(false);
          }
        }}
      >
        <Icon name="paperclip" size={14} />
        <span className="pc-chat-attachment-name">{name}</span>
        {busy && " · Opening…"}
      </button>
      {error && (
        <span role="status" className="pc-message-artifact__error">
          {error} <span>Click the attachment to retry.</span>
        </span>
      )}
    </span>
  );
}

/** Bound all metadata/input/content reads for one mounted conversation. Aborted queued jobs never fetch. */
export function boundedArtifactFetch(
  fetchGateway: AfGatewayFetch,
): AfGatewayFetch {
  let active = 0;
  const queue: Array<() => void> = [];
  const next = () => {
    while (active < 4 && queue.length) queue.shift()!();
  };
  return (path, init = {}) =>
    new Promise<Response>((resolve, reject) => {
      const signal = init.signal;
      let queued = true;
      const abort = () => {
        if (queued) {
          queued = false;
          reject(new DOMException("Aborted", "AbortError"));
        }
      };
      signal?.addEventListener("abort", abort, { once: true });
      if (signal?.aborted) abort();
      queue.push(() => {
        signal?.removeEventListener("abort", abort);
        if (!queued) return;
        queued = false;
        active++;
        Promise.resolve()
          .then(() => fetchGateway(path, init))
          .then(resolve, reject)
          .finally(() => {
            active--;
            next();
          });
      });
      next();
    });
}
