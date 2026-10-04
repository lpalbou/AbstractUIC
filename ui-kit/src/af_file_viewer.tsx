// AfFileViewer — one preview for every file a client shows (ui-kit 0.6.0).
//
// Presentational and transport-free: the host fetches the bytes (with its own
// credentials) and passes text for text kinds, or an object URL for image and
// PDF. Markdown is rendered by the host's renderer (`renderMarkdown`, e.g.
// panel-chat `Markdown`; panel-chat `FileViewer` wires it); without one the
// source shows highlighted. Code is highlighted by `AfCodeBlock`, JSON is
// pretty-printed. Audio plays in the shared waveform player (AfAudioPlayer,
// 0.7.0). Header: name, size, generated date (relative, exact on hover),
// download and close icons.
import React from "react";
import { Icon } from "./icon.js";
import { AfAudioPlayer } from "./af_audio_player.js";
import { AfCodeBlock, codeLanguage } from "./code_highlight.js";
import { formatExactTime, formatRelativeTime, timeValueMs } from "./relative_time.js";

export type AfFileViewerKind = "markdown" | "code" | "json" | "image" | "audio" | "pdf" | "text" | "binary";

const IMAGE_EXT = new Set("png jpg jpeg gif webp bmp ico avif".split(" "));
const AUDIO_EXT = new Set("mp3 wav ogg oga opus m4a aac flac weba".split(" "));
const TEXT_EXT = new Set("txt log csv tsv rst adoc org tex diff patch lock".split(" "));

function extensionOf(name: string): string {
  const base = String(name || "").split("/").pop() || "";
  const dot = base.lastIndexOf(".");
  return dot > 0 ? base.slice(dot + 1).toLowerCase() : base.toLowerCase();
}

/**
 * How a file is shown, from its name and (when known) the Content-Type the
 * server reported. SVG and HTML are shown as SOURCE (code), never rendered:
 * a model-written file must not run in the app's origin.
 */
export function fileViewerKind(name: string, contentType = ""): AfFileViewerKind {
  const ext = extensionOf(name);
  const type = String(contentType || "").split(";", 1)[0].trim().toLowerCase();
  if (ext === "md" || ext === "markdown" || type === "text/markdown") return "markdown";
  if (ext === "json" || type === "application/json" || type.endsWith("+json")) return "json";
  if (ext === "pdf" || type === "application/pdf") return "pdf";
  if (IMAGE_EXT.has(ext) || (type.startsWith("image/") && type !== "image/svg+xml")) return "image";
  if (AUDIO_EXT.has(ext) || type.startsWith("audio/")) return "audio";
  if (codeLanguage(name)) return "code";
  if (TEXT_EXT.has(ext) || type.startsWith("text/")) return "text";
  if (["application/javascript", "application/xml", "application/x-yaml", "application/toml"].includes(type)) return "code";
  return "binary";
}

/** Kinds whose preview needs the file's text (the others use an object URL or nothing). */
export function fileViewerNeedsText(kind: AfFileViewerKind): boolean {
  return kind === "markdown" || kind === "code" || kind === "json" || kind === "text";
}

/** "512 B", "12 KiB", "3.4 MiB" ("" when unknown). */
export function formatFileSize(n: number | undefined | null): string {
  if (typeof n !== "number" || !Number.isFinite(n) || n < 0) return "";
  if (n < 1024) return `${n} B`;
  const units = ["KiB", "MiB", "GiB", "TiB"];
  let v = n / 1024;
  let u = 0;
  while (v >= 1024 && u < units.length - 1) {
    v /= 1024;
    u += 1;
  }
  return `${v < 10 ? v.toFixed(1) : Math.round(v)} ${units[u]}`;
}

export type AfFileViewerProps = {
  name: string;
  /** Full workspace path (the name's tooltip). */
  path?: string;
  sizeBytes?: number;
  /** When the file was generated / last written (ISO text or epoch). */
  modified?: string | number;
  /** "Now" for the relative date (deterministic; the host passes Date.now()). */
  nowMs: number;
  /** Default: `fileViewerKind(name, contentType)`. */
  kind?: AfFileViewerKind;
  contentType?: string;
  status: "loading" | "error" | "ready";
  error?: string;
  /** Text kinds: the (possibly partial) text. */
  text?: string;
  /** Shown above a partial preview ("Showing the first 1 MiB of 3 MiB…"). */
  partialNote?: string;
  /** Image / audio / PDF: an object URL of the bytes. */
  url?: string;
  renderMarkdown?: (text: string) => React.ReactNode;
  onDownload?: () => void;
  onClose?: () => void;
  /** Extra header actions (e.g. "Attach"), placed before Download. */
  actions?: React.ReactNode;
  className?: string;
};

export function AfFileViewer(p: AfFileViewerProps): React.ReactElement {
  const kind = p.kind ?? fileViewerKind(p.name, p.contentType);
  const size = formatFileSize(p.sizeBytes);
  const relative = p.modified !== undefined ? formatRelativeTime(p.modified, p.nowMs) : "";
  return (
    <section className={`af-file-viewer${p.className ? ` ${p.className}` : ""}`} aria-label={`Preview of ${p.name}`} data-kind={kind}>
      <header className="af-file-viewer__head">
        <Icon name="file" size={15} />
        <span className="af-file-viewer__title">
          <strong className="af-file-viewer__name" title={p.path || p.name}>
            {p.name}
          </strong>
          {size || relative ? (
            <span className="af-file-viewer__meta">
              {size ? <span data-meta="size">{size}</span> : null}
              {size && relative ? <span aria-hidden="true"> · </span> : null}
              {relative ? (
                <time data-meta="modified" title={formatExactTime(p.modified)} dateTime={new Date(timeValueMs(p.modified)).toISOString()}>
                  {relative}
                </time>
              ) : null}
            </span>
          ) : null}
        </span>
        {p.actions}
        {p.onDownload ? (
          <button type="button" className="af-file-viewer__icon-btn" data-action="download-file" onClick={p.onDownload} title="Download" aria-label={`Download ${p.name}`}>
            <Icon name="download" size={15} />
          </button>
        ) : null}
        {p.onClose ? (
          <button type="button" className="af-file-viewer__icon-btn" data-action="close-preview" onClick={p.onClose} title="Close" aria-label="Close the preview">
            <Icon name="x" size={15} />
          </button>
        ) : null}
      </header>
      <div className="af-file-viewer__body">
        {p.status === "loading" ? (
          <p className="af-file-viewer__muted" role="status">
            Loading preview…
          </p>
        ) : p.status === "error" ? (
          <p className="af-file-viewer__error" role="alert">
            {p.error || "The preview could not be loaded."}
          </p>
        ) : (
          <>
            {p.partialNote ? (
              <p className="af-file-viewer__muted" role="status">
                {p.partialNote}
              </p>
            ) : null}
            <FileBody kind={kind} p={p} />
          </>
        )}
      </div>
    </section>
  );
}

function FileBody({ kind, p }: { kind: AfFileViewerKind; p: AfFileViewerProps }): React.ReactElement {
  const text = p.text ?? "";
  switch (kind) {
    case "image":
      return p.url ? <img className="af-file-viewer__image" src={p.url} alt={p.name} /> : <NoPreview />;
    case "audio":
      return p.url ? <AfAudioPlayer src={p.url} name={p.name} /> : <NoPreview />;
    case "pdf":
      return p.url ? (
        <object className="af-file-viewer__pdf" data={p.url} type="application/pdf" aria-label={p.name}>
          <p className="af-file-viewer__muted">This browser cannot show PDFs inline. Use Download to open it.</p>
        </object>
      ) : (
        <NoPreview />
      );
    case "markdown":
      return p.renderMarkdown ? <div className="af-file-viewer__markdown">{p.renderMarkdown(text)}</div> : <AfCodeBlock text={text} language="" />;
    case "json": {
      let pretty = text;
      let note = "";
      try {
        pretty = JSON.stringify(JSON.parse(text), null, 2);
      } catch {
        note = p.partialNote ? "" : "Not valid JSON; shown as text.";
      }
      return (
        <>
          {note ? <p className="af-file-viewer__muted">{note}</p> : null}
          <AfCodeBlock text={pretty} language="json" />
        </>
      );
    }
    case "code":
      return <AfCodeBlock text={text} language={p.name} />;
    case "text":
      return <AfCodeBlock text={text} language="" lineNumbers={false} />;
    default:
      return <NoPreview />;
  }
}

function NoPreview(): React.ReactElement {
  return <p className="af-file-viewer__muted">No preview for this file type. Use Download to open it.</p>;
}
