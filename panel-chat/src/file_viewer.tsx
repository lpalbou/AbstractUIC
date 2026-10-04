// The shared file preview (panel-chat 0.3.0): ui-kit `AfFileViewer` with this
// package's `Markdown` renderer, plus the loader that reads one workspace
// file through the host's credentialed `GatewayFetch` — bounded text for the
// text kinds (Range request + a reader that stops at the limit), an object
// URL for images, audio (the kit waveform player, 0.7.0) and PDFs. Lifted from AbstractCode web's
// `workspace/session_files.tsx` (previewKind, readBoundedText,
// safeMarkdownImages) so every client previews files the same way.
import React, { useEffect, useState } from "react";
import { AfFileViewer, fileViewerKind, fileViewerNeedsText, formatFileSize, gatewayApiPath, type AfFileViewerKind, type AfFileViewerProps } from "@abstractframework/ui-kit";
import { Markdown } from "./markdown.js";

/** A gateway request with the host's credentials (see `workspace_browser.tsx`). */
type GatewayFetch = (path: string, init?: RequestInit) => Promise<Response>;

/** Bytes read for a text preview; larger files show their first part. */
export const PREVIEW_TEXT_LIMIT = 1024 * 1024;
export const PREVIEW_LIMIT_LABEL = "1 MiB";
/** Images / audio / PDFs larger than this are offered as a download only. */
export const PREVIEW_BLOB_LIMIT = 25 * 1024 * 1024;

const contentUrl = (runId: string, path: string) =>
  `${gatewayApiPath(`runs/${encodeURIComponent(runId)}/workspace`)}/content?${new URLSearchParams({ path })}`;

export type BoundedText = { text: string; received: number; total?: number; partial: boolean };

/** The size a content response reports: the total of `Content-Range` (a 206), else `Content-Length` of a full 200. */
export function responseTotal(response: Response): number | undefined {
  const range = response.headers.get("content-range");
  const total = range ? Number(range.split("/")[1]) : NaN;
  if (Number.isFinite(total)) return total;
  const length = Number(response.headers.get("content-length"));
  return response.status === 200 && Number.isFinite(length) && response.headers.has("content-length") ? length : undefined;
}

/** Read at most `limit` bytes of a response body as text, then stop reading (never the whole of a large file). */
export async function readBoundedText(response: Response, limit: number, knownSize?: number): Promise<BoundedText> {
  const decoder = new TextDecoder();
  let text = "";
  let received = 0;
  const reader = response.body?.getReader();
  if (reader) {
    while (received < limit) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = value.subarray(0, limit - received);
      received += chunk.length;
      text += decoder.decode(chunk, { stream: true });
    }
    await reader.cancel().catch(() => {});
  } else {
    text = (await response.text()).slice(0, limit);
    received = text.length;
  }
  const total = responseTotal(response) ?? knownSize;
  const partial = total !== undefined ? total > received : received >= limit;
  return { text, received, total, partial };
}

export function partialPreviewNote(total: number | undefined): string {
  return `Showing the first ${PREVIEW_LIMIT_LABEL} of ${total !== undefined ? formatFileSize(total) : "a file of unknown size"}; download for the rest.`;
}

function decodeSafe(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/**
 * Markdown previews never load images from elsewhere: an image renders only
 * when its URL is this run's workspace content route (a relative path is
 * resolved against the Markdown file's folder); any other image becomes a
 * plain link. Fenced code is left untouched.
 */
export function safeMarkdownImages(text: string, runId: string, markdownPath: string): string {
  const contentPrefix = `${gatewayApiPath(`runs/${encodeURIComponent(runId)}/workspace`)}/content?`;
  const folder = markdownPath.split("/").slice(0, -1);
  const resolveRelative = (src: string): string | null => {
    if (/^[a-z][a-z0-9+.-]*:/i.test(src) || src.startsWith("/") || src.startsWith("#")) return null;
    const parts = [...folder];
    for (const part of src.split(/[?#]/, 1)[0].split("/")) {
      if (!part || part === ".") continue;
      if (part === "..") {
        if (!parts.length) return null;
        parts.pop();
      } else parts.push(decodeSafe(part));
    }
    return parts.length ? contentUrl(runId, parts.join("/")) : null;
  };
  const rewriteLine = (line: string): string => {
    let out = "";
    let i = 0;
    while (i < line.length) {
      if (line[i] === "!" && line[i + 1] === "[") {
        const labelEnd = line.indexOf("]", i + 2);
        if (labelEnd !== -1 && line[labelEnd + 1] === "(") {
          const hrefEnd = line.indexOf(")", labelEnd + 2);
          if (hrefEnd !== -1) {
            const alt = line.slice(i + 2, labelEnd);
            const src = line.slice(labelEnd + 2, hrefEnd).trim();
            const local = src.startsWith(contentPrefix) ? src : resolveRelative(src);
            out += local ? `![${alt}](${local})` : `[image: ${alt || src}](${src})`;
            i = hrefEnd + 1;
            continue;
          }
        }
      }
      out += line[i];
      i += 1;
    }
    return out;
  };
  let fenced = false;
  return text
    .split("\n")
    .map((line) => {
      if (/^\s*(```|~~~)/.test(line)) {
        fenced = !fenced;
        return line;
      }
      return fenced ? line : rewriteLine(line);
    })
    .join("\n");
}

export type FilePreviewEntry = { name: string; path: string; size_bytes?: number };
export type FilePreviewState =
  | { status: "idle" }
  | { status: "loading"; kind: AfFileViewerKind }
  | { status: "error"; kind: AfFileViewerKind; message: string }
  | { status: "ready"; kind: AfFileViewerKind; contentType: string; text?: string; url?: string; partial: boolean; total?: number };

/**
 * Load one workspace file for the viewer. Text kinds: a bounded Range read.
 * Image / audio / PDF: the bytes as an object URL (revoked when the entry changes).
 * Binary: nothing is read. `refreshKey` re-reads (the run wrote again).
 */
export function useWorkspaceFilePreview(fetchGateway: GatewayFetch, runId: string, entry: FilePreviewEntry | null, refreshKey?: string | number): FilePreviewState {
  const [state, setState] = useState<FilePreviewState>({ status: "idle" });
  useEffect(() => {
    if (!entry || !runId) {
      setState({ status: "idle" });
      return;
    }
    const abort = new AbortController();
    let objectUrl = "";
    const byName = fileViewerKind(entry.name);
    if (byName === "binary") {
      setState({ status: "ready", kind: "binary", contentType: "", partial: false });
      return;
    }
    if ((byName === "image" || byName === "audio" || byName === "pdf") && typeof entry.size_bytes === "number" && entry.size_bytes > PREVIEW_BLOB_LIMIT) {
      setState({ status: "error", kind: byName, message: `Too large to preview (${formatFileSize(entry.size_bytes)}); use Download.` });
      return;
    }
    setState({ status: "loading", kind: byName });
    const text = fileViewerNeedsText(byName);
    void (async () => {
      try {
        const r = await fetchGateway(contentUrl(runId, entry.path), {
          signal: abort.signal,
          ...(text ? { headers: { Range: `bytes=0-${PREVIEW_TEXT_LIMIT - 1}` } } : {}),
        });
        if (!r.ok) throw new Error(`Preview failed (HTTP ${r.status}): ${(await r.text().catch(() => "")) || r.statusText || "no reason given"}`);
        const contentType = r.headers.get("content-type") || "";
        const kind = fileViewerKind(entry.name, contentType);
        if (fileViewerNeedsText(kind)) {
          const read = await readBoundedText(r, PREVIEW_TEXT_LIMIT, entry.size_bytes);
          if (abort.signal.aborted) return;
          setState({
            status: "ready",
            kind,
            contentType,
            text: kind === "markdown" ? safeMarkdownImages(read.text, runId, entry.path) : read.text,
            partial: read.partial,
            total: read.total,
          });
          return;
        }
        if (kind === "image" || kind === "audio" || kind === "pdf") {
          const blob = await r.blob();
          if (abort.signal.aborted) return;
          objectUrl = URL.createObjectURL(blob.type ? blob : new Blob([blob], { type: kind === "pdf" ? "application/pdf" : contentType }));
          setState({ status: "ready", kind, contentType, url: objectUrl, partial: false });
          return;
        }
        await r.body?.cancel().catch(() => {});
        if (!abort.signal.aborted) setState({ status: "ready", kind: "binary", contentType, partial: false });
      } catch (e: any) {
        if (!abort.signal.aborted) setState({ status: "error", kind: byName, message: String(e?.message || e) });
      }
    })();
    return () => {
      abort.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [fetchGateway, runId, entry?.path, entry?.name, entry?.size_bytes, refreshKey]);
  return state;
}

export type FileViewerProps = Omit<AfFileViewerProps, "renderMarkdown" | "nowMs"> & { nowMs?: number };

/** `AfFileViewer` with panel-chat's Markdown renderer (the one every client uses). */
export function FileViewer(props: FileViewerProps): React.ReactElement {
  return <AfFileViewer {...props} nowMs={props.nowMs ?? Date.now()} renderMarkdown={(text) => <Markdown text={text} />} />;
}

/** Props of `FileViewer` for a loaded `FilePreviewState`. */
export function filePreviewViewerProps(state: FilePreviewState): Pick<AfFileViewerProps, "status" | "error" | "text" | "url" | "kind" | "contentType" | "partialNote"> {
  if (state.status === "idle" || state.status === "loading") return { status: "loading", ...(state.status === "loading" ? { kind: state.kind } : {}) };
  if (state.status === "error") return { status: "error", error: state.message, kind: state.kind };
  return {
    status: "ready",
    kind: state.kind,
    contentType: state.contentType,
    ...(state.text !== undefined ? { text: state.text } : {}),
    ...(state.url ? { url: state.url } : {}),
    ...(state.partial ? { partialNote: partialPreviewNote(state.total) } : {}),
  };
}
