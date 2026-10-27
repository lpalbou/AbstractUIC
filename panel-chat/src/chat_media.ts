/**
 * Generated media and run artifacts → `ChatMessage.media` (backlog 0031).
 * Pure helpers over a host-resolved artifact: the chat never fetches.
 */
import { fileViewerKind } from "@abstractframework/ui-kit";

import type { ChatMedia } from "./chat_message_card.js";
import type { ResolvedArtifact } from "./workflow_runtime.js";

/**
 * How a resolved artifact shows in a message: image / audio / video inline,
 * everything else as a `"file"` in the shared viewer. The kind comes from the
 * gateway's `content_type` (and the name), never from model text. SVG and
 * HTML are files (shown as source), never rendered.
 */
export function chatMediaFromArtifact(
  artifact: ResolvedArtifact,
  extra: { id?: string; label?: string; href?: string; transcript?: string; text?: string } = {},
): ChatMedia {
  const name = String(artifact.name || "").trim();
  const viewer = fileViewerKind(name, artifact.contentType);
  const kind: ChatMedia["kind"] = viewer === "image" || viewer === "audio" || viewer === "video" ? viewer : "file";
  return {
    kind,
    src: artifact.src,
    contentType: artifact.contentType,
    ...(name ? { name } : {}),
    ...(typeof artifact.size === "number" ? { size: artifact.size } : {}),
    ...(extra.id ? { id: extra.id } : {}),
    ...(extra.label ? { label: extra.label } : {}),
    ...(extra.href && kind !== "file" ? { href: extra.href } : {}),
    ...(extra.transcript && kind === "audio" ? { transcript: extra.transcript } : {}),
    // A document always has a way out: its raw link (default: the host's object URL).
    ...(kind === "file" ? { href: extra.href || artifact.src } : {}),
    ...(kind === "file" && (extra.text ?? artifact.text) !== undefined ? { text: extra.text ?? artifact.text } : {}),
  };
}

/**
 * Resolve a message's `artifactIds` (e.g. `replay_view_v1.messages[].artifact_ids`)
 * through the transport's `resolveArtifact`. Rejects when any artifact cannot
 * be resolved: a missing artifact is an error to show, not a silent gap.
 */
export async function chatMediaForArtifacts(
  runId: string,
  artifactIds: readonly string[],
  resolve: (runId: string, artifactId: string, signal?: AbortSignal) => Promise<ResolvedArtifact>,
  signal?: AbortSignal,
): Promise<ChatMedia[]> {
  return Promise.all(artifactIds.map(async (id) => chatMediaFromArtifact(await resolve(runId, id, signal), { id })));
}
