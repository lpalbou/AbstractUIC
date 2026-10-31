import React, { useEffect, useRef, useState } from "react";
import {
  AfModal,
  fileViewerKind,
  fileViewerNeedsText,
  type AfFileViewerKind,
  type AfGatewayFetch,
} from "@abstractframework/ui-kit";
import {
  FileViewer,
  readBoundedText,
  partialPreviewNote,
  responseTotal,
  PREVIEW_TEXT_LIMIT,
  PREVIEW_BLOB_LIMIT,
} from "./file_viewer.js";
import { deliverBlob, gatewayResponseError } from "./workspace_browser.js";

/** Enforce the cap even when a response has no Content-Length. */
export async function boundedPreviewBlob(
  response: Response,
  limit = PREVIEW_BLOB_LIMIT,
): Promise<Blob> {
  const total = responseTotal(response);
  if (total !== undefined && total > limit) {
    await response.body?.cancel();
    throw Error("This file is too large to preview. Use Download.");
  }
  const reader = response.body?.getReader();
  if (!reader)
    return new Blob([], { type: response.headers.get("content-type") || "" });
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    for (;;) {
      const part = await reader.read();
      if (part.done) break;
      bytes += part.value.byteLength;
      if (bytes > limit)
        throw Error("This file is too large to preview. Use Download.");
      chunks.push(part.value);
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
  return new Blob(chunks as BlobPart[], {
    type: response.headers.get("content-type") || "",
  });
}
export function artifactPreviewKind(
  name: string,
  type: string,
): AfFileViewerKind {
  const mime = type.split(";", 1)[0].trim().toLowerCase();
  if (mime.includes("html") || mime.includes("xml") || mime === "image/svg+xml")
    return "text";
  const byMime = fileViewerKind("", mime),
    byName = fileViewerKind(name, "");
  if (byMime === "text")
    return ["code", "json", "markdown"].includes(byName) ? byName : "text";
  return byMime !== "binary" ? byMime : byName;
}
type Preview = {
  status: "loading" | "ready" | "error";
  kind: AfFileViewerKind;
  contentType?: string;
  text?: string;
  url?: string;
  partialNote?: string;
  error?: string;
};
export function ArtifactPreviewModal(p: {
  name: string;
  path: string;
  fetchGateway: AfGatewayFetch;
  onClose: () => void;
}): React.ReactElement {
  const [state, setState] = useState<Preview>({
      status: "loading",
      kind: "binary",
    }),
    [attempt, retry] = useState(0),
    [downloading, setDownloading] = useState(false),
    [downloadError, setDownloadError] = useState("");
  const previewAbort = useRef<AbortController | null>(null),
    download = useRef<AbortController | null>(null),
    alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      download.current?.abort();
    };
  }, []);
  useEffect(() => {
    const abort = new AbortController();
    previewAbort.current = abort;
    let objectUrl = "";
    setState({ status: "loading", kind: "binary" });
    void (async () => {
      try {
        const r = await p.fetchGateway(`${p.path}/content`, {
          signal: abort.signal,
          headers: { Range: `bytes=0-${PREVIEW_TEXT_LIMIT - 1}` },
        });
        if (!r.ok)
          throw await gatewayResponseError(r, "Attachment preview failed");
        const contentType = r.headers.get("content-type") || "",
          kind = artifactPreviewKind(p.name, contentType);
        if (fileViewerNeedsText(kind)) {
          const read = await readBoundedText(r, PREVIEW_TEXT_LIMIT);
          if (abort.signal.aborted) return;
          setState({
            status: "ready",
            kind,
            contentType,
            text: read.text,
            ...(read.partial
              ? { partialNote: partialPreviewNote(read.total) }
              : {}),
          });
        } else if (["image", "audio", "video", "pdf"].includes(kind)) {
          // Range is a text optimization only. A partial media body cannot be decoded.
          let media = r;
          const range = /^bytes 0-(\d+)\/(\d+)$/.exec(
            r.headers.get("content-range") || "",
          );
          if (
            r.status === 206 &&
            (!range || Number(range[1]) + 1 < Number(range[2]))
          ) {
            await r.body?.cancel();
            media = await p.fetchGateway(`${p.path}/content`, {
              signal: abort.signal,
            });
            if (!media.ok)
              throw await gatewayResponseError(
                media,
                "Attachment preview failed",
              );
          }
          const actualType = media.headers.get("content-type") || contentType,
            actualKind = artifactPreviewKind(p.name, actualType);
          if (fileViewerNeedsText(actualKind)) {
            const read = await readBoundedText(media, PREVIEW_TEXT_LIMIT);
            if (!abort.signal.aborted)
              setState({
                status: "ready",
                kind: actualKind,
                contentType: actualType,
                text: read.text,
                ...(read.partial
                  ? { partialNote: partialPreviewNote(read.total) }
                  : {}),
              });
            return;
          }
          const blob = await boundedPreviewBlob(media);
          if (abort.signal.aborted) return;
          objectUrl = URL.createObjectURL(
            actualKind === "pdf"
              ? new Blob([blob], { type: "application/pdf" })
              : blob,
          );
          setState({
            status: "ready",
            kind: actualKind,
            contentType: actualType,
            url: objectUrl,
          });
        } else {
          await r.body?.cancel();
          if (!abort.signal.aborted)
            setState({ status: "ready", kind: "binary", contentType });
        }
      } catch (e) {
        if (!abort.signal.aborted)
          setState({
            status: "error",
            kind: "binary",
            error: e instanceof Error ? e.message : String(e),
          });
      }
    })();
    return () => {
      abort.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [p.fetchGateway, p.path, p.name, attempt]);
  const save = async () => {
    if (downloading) return;
    const abort = new AbortController();
    download.current = abort;
    setDownloading(true);
    setDownloadError("");
    try {
      const r = await p.fetchGateway(`${p.path}/content`, {
        signal: abort.signal,
      });
      if (!r.ok)
        throw await gatewayResponseError(r, "Attachment download failed");
      const blob = await r.blob();
      if (!abort.signal.aborted && alive.current)
        deliverBlob(blob, p.name, "download");
    } catch (e) {
      if (!abort.signal.aborted && alive.current)
        setDownloadError(e instanceof Error ? e.message : String(e));
    } finally {
      if (!abort.signal.aborted && alive.current) setDownloading(false);
    }
  };
  return (
    <AfModal
      open
      title={p.name}
      onClose={() => {
        alive.current = false;
        previewAbort.current?.abort();
        download.current?.abort();
        p.onClose();
      }}
      size="wide"
      className="pc-artifact-preview"
      footerNote={downloading ? "Downloading…" : downloadError || undefined}
      footer={state.status === "error" ? <button type="button" className="pc-artifact-preview__retry" onClick={()=>retry(n=>n+1)}>Retry preview</button> : undefined}
    >
      <FileViewer
        name={p.name}
        onDownload={()=>void save()}
        status={state.status}
        kind={state.kind}
        contentType={state.contentType}
        text={state.text}
        url={state.url}
        error={state.error}
        partialNote={state.partialNote}
        markdownImages="link"
        inlineImage={() => false}
      />
    </AfModal>
  );
}
