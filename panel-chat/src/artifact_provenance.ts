/** Artifact storage references are not automatically user attachments. */
export const INTERNAL_ARTIFACT_PARTS = new Set([
  "scratchpad",
  "node_traces",
  "node_trace",
  "trace",
  "traces",
  "bookkeeping",
]);
export function internalArtifactPart(part: string): boolean {
  return part.startsWith("_") || INTERNAL_ARTIFACT_PARTS.has(part);
}
export function displayArtifactPath(path: string): boolean {
  const parts = String(path || "")
    .split(/[.\[\]]/)
    .filter(Boolean);
  if (parts.some(internalArtifactPart)) return false;
  const slot = parts.findIndex((p) =>
    [
      "attachments",
      "files",
      "artifacts",
      "media",
      "artifact",
      "artifact_ref",
      "image_artifact",
      "audio_artifact",
      "video_artifact",
      "music_artifact",
    ].includes(p),
  );
  if (slot < 0) return false;
  return !parts
    .slice(0, slot)
    .some((p) =>
      [
        "session",
        "sessions",
        "history",
        "conversation",
        "transcript",
        "messages",
        "context",
      ].includes(p),
    );
}
export type MessageArtifact = { id: string; runId: string; name?: string };
export function replayMessageArtifacts(
  message: { artifact_ids?: string[]; run_id: string },
  entries: ReadonlyMap<string, Record<string, unknown>>,
): { refs: MessageArtifact[]; unresolved: boolean } {
  const byId = entries;
  let unresolved = false;
  const refs: MessageArtifact[] = [];
  for (const id of message.artifact_ids || []) {
    const entry = byId.get(id);
    if (!entry) {
      unresolved = true;
      continue;
    }
    if (!displayArtifactPath(String(entry.path || ""))) continue;
    refs.push({
      id,
      runId:
        typeof entry.run_id === "string" && entry.run_id
          ? entry.run_id
          : message.run_id,
    });
  }
  return { refs, unresolved };
}

export function internalArtifactMetadata(
  meta: Record<string, unknown>,
): boolean {
  const tags =
    meta.tags && typeof meta.tags === "object"
      ? (meta.tags as Record<string, unknown>)
      : {};
  const envelope =
    meta.artifact_envelope_v1 && typeof meta.artifact_envelope_v1 === "object"
      ? (meta.artifact_envelope_v1 as Record<string, unknown>)
      : {};
  return (
    [
      "node_trace_offload",
      "run_output_offload",
      "run_input_offload",
      "conversation_offload",
      "session_offload",
      "state_offload",
    ].includes(String(tags.source || meta.source || "")) ||
    ["internal", "bookkeeping"].includes(
      String(tags.role || envelope.role || meta.role || ""),
    )
  );
}
