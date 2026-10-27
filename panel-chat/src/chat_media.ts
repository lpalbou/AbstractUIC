/**
 * Generated media and run artifacts → `ChatMessage.media` (backlog 0031).
 * Pure helpers over a host-resolved artifact: the chat never fetches.
 */
import { fileViewerKind } from "@abstractframework/ui-kit";

import type { ChatMedia } from "./chat_message_card.js";
import type { ResolvedArtifact } from "./workflow_runtime.js";

// Names that a browser renders as an active document (scripts run) when opened.
const ACTIVE_EXT = new Set("html htm xhtml xht shtml svg svgz xml xsl xslt mht mhtml".split(" "));
// Content types a browser shows inertly when opened (no script runs).
const INERT_TYPES = new Set(["application/pdf", "text/plain", "application/json", "text/markdown", "text/csv"]);

/** A browser-local URL (object or data URL): it carries the APP's origin and none of the gateway's headers. */
export function isLocalObjectUrl(url: string | undefined): boolean {
  return /^(blob|data):/i.test(String(url || "").trim());
}

/**
 * Whether a `blob:`/`data:` URL of this file may be opened as its "Raw file"
 * (review N1, security). An object URL carries the APP origin and none of the
 * gateway's `Content-Security-Policy: sandbox` / nosniff headers
 * (abstractgateway routes/gateway.py:11328-11340), so agent-written HTML, SVG
 * or XML opened from it would run on the app's origin. Only known-inert types
 * qualify: pdf, raster images, audio, video, JSON, Markdown, CSV, text/* other than HTML/XML,
 * and never a file whose NAME is an active document. No type = no.
 * Hosts pass the gateway's (sandboxed) content URL as `href` for the rest.
 */
export function objectUrlRawLinkSafe(contentType: string | undefined, name: string | undefined): boolean {
  const base = String(name || "").split("/").pop() || "";
  const dot = base.lastIndexOf(".");
  if (dot > 0 && ACTIVE_EXT.has(base.slice(dot + 1).toLowerCase())) return false;
  const type = String(contentType || "").split(";", 1)[0].trim().toLowerCase();
  if (!type || type === "text/html" || type.includes("xml")) return false;
  if (INERT_TYPES.has(type)) return true;
  // Other text/* (source code, CSS, ...) is shown as text; html/xml are refused above.
  return type.startsWith("text/") || type.startsWith("image/") || type.startsWith("audio/") || type.startsWith("video/");
}

/** The raw-file link a document may show: the host's `href`, else its `src`; a
 * browser-local URL only for an inert type (see `objectUrlRawLinkSafe`). */
export function fileRawLink(item: { href?: string; src?: string; contentType?: string; name?: string }): string | undefined {
  const allowed = (url: string | undefined) => Boolean(url) && (!isLocalObjectUrl(url) || objectUrlRawLinkSafe(item.contentType, item.name));
  if (allowed(item.href)) return item.href;
  if (allowed(item.src)) return item.src;
  return undefined;
}

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
    // A document keeps a way out: its raw link (the host's object URL only for an
    // inert type; agent-written HTML/SVG/XML needs the gateway's sandboxed URL as `href`).
    ...(kind === "file" && fileRawLink({ href: extra.href, src: artifact.src, contentType: artifact.contentType, name })
      ? { href: fileRawLink({ href: extra.href, src: artifact.src, contentType: artifact.contentType, name }) }
      : {}),
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
