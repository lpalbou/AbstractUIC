// The web equivalent of "open the folder": browse a run's workspace on the
// gateway host and open or download its files through the gateway's workspace
// routes (CONTRACTS §W): `GET /runs/{id}/workspace` (where),
// `/workspace/files?path=` (one folder) and `/workspace/content?path=` (one
// file). The gateway applies the caller's workspace policy and deny lists to
// every entry and read; this view shows what it serves and says how many
// entries it kept out.
//
// Works on any machine with the host's own credentials: files are FETCHED
// through the host's `GatewayFetch` (bearer token or session cookie), never
// linked (a bare link carries no bearer token). An automation's id is its
// controller run id, so `runId = automation_id` browses the automation's
// folder.
//
// Moved here from the Observer (`ui/workspace_browser.tsx`); the strict
// listing parser comes from AbstractCode web (`workspace/session_files.tsx`).
import React, { useCallback, useEffect, useState } from "react";

import { Icon, formatExactTime, formatRelativeTime, gatewayApiPath, gatewayResourcePath } from "@abstractframework/ui-kit";
import { FileViewer, filePreviewViewerProps, useWorkspaceFilePreview } from "./file_viewer.js";

/**
 * A gateway request with the host's credentials. `path` is RELATIVE,
 * "api/gateway/…" (ui-kit `gatewayApiPath`): a same-origin host passes it to
 * `fetch` as is (it resolves under the app's base path) with
 * `credentials: "same-origin"`; a direct-URL host joins it to its gateway
 * base URL (ui-kit `joinBaseUrl`) and adds its bearer header. Returns the raw
 * Response; non-2xx answers are turned into errors here.
 */
export type GatewayFetch = (path: string, init?: RequestInit) => Promise<Response>;

/** `GET /runs/{id}/workspace`. */
export type RunWorkspace = {
  run_id?: string;
  workspace_root: string;
  kind?: string;
  session_id?: string | null;
  exists: boolean;
  host?: { hostname?: string; caller_is_this_machine?: boolean };
  /** `POST /runs/{id}/workspace/open` works (admin, same machine, folder exists). */
  open_supported?: boolean;
};

export type WorkspaceEntry = { name: string; path: string; type: "file" | "dir"; size_bytes?: number; mtime?: string | number };

/** `GET /runs/{id}/workspace/files`. `hidden` counts what the deny rules kept out. */
export type WorkspaceListing = {
  path: string;
  entries: WorkspaceEntry[];
  truncated: boolean;
  hidden?: { outside_links?: number; blocked?: number; other?: number };
};

const runPath = (runId: string) => gatewayApiPath(`runs/${encodeURIComponent(runId)}/workspace`);

export function workspaceInfoUrl(runId: string): string {
  return runPath(runId);
}

export function workspaceFilesUrl(runId: string, path: string): string {
  return `${runPath(runId)}/files?${new URLSearchParams({ path, recursive: "false" })}`;
}

export function workspaceContentUrl(runId: string, path: string): string {
  return `${runPath(runId)}/content?${new URLSearchParams({ path })}`;
}

/** `What failed (HTTP 404): <the gateway's detail>` — the gateway's own reason, never a generic failure. */
export async function gatewayResponseError(response: Response, what: string): Promise<Error> {
  let reason = "";
  try {
    const text = await response.text();
    try {
      const body = JSON.parse(text);
      const detail = body?.detail ?? body?.error ?? body?.message;
      reason = typeof detail === "string" ? detail : detail && typeof detail.message === "string" ? detail.message : text;
    } catch {
      reason = text;
    }
  } catch {
    reason = "";
  }
  return new Error(`${what} (HTTP ${response.status}): ${reason.trim() || response.statusText || "no reason given"}`);
}

/**
 * Validate a `/workspace/files` answer. A malformed or older response is an
 * error, never an empty folder.
 */
export function parseWorkspaceListing(data: unknown, directory: string): WorkspaceListing {
  const body = data && typeof data === "object" && !Array.isArray(data) ? (data as Record<string, unknown>) : null;
  const fail = (why: string): never => {
    throw new Error(`Unexpected /workspace/files response from the gateway: ${why}.`);
  };
  if (!body) return fail("not an object");
  if (!Array.isArray(body.entries)) fail("no `entries` list");
  if (typeof body.truncated !== "boolean") fail("no `truncated` flag");
  const entries = (body.entries as unknown[]).map((raw, index) => {
    const row = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
    if (typeof row.name !== "string" || typeof row.path !== "string" || (row.type !== "file" && row.type !== "dir"))
      fail(`entry ${index + 1} lacks a name, path or file/dir type`);
    return row as unknown as WorkspaceEntry;
  });
  const hidden = body.hidden && typeof body.hidden === "object" && !Array.isArray(body.hidden) ? (body.hidden as WorkspaceListing["hidden"]) : undefined;
  return { path: typeof body.path === "string" ? body.path : directory, entries, truncated: body.truncated as boolean, ...(hidden ? { hidden } : {}) };
}

/** `GET /runs/{id}/workspace`. */
export async function loadRunWorkspace(fetchGateway: GatewayFetch, runId: string, signal?: AbortSignal): Promise<RunWorkspace> {
  const r = await fetchGateway(workspaceInfoUrl(runId), { signal });
  if (!r.ok) throw await gatewayResponseError(r, "The workspace is not available");
  const body = await r.json();
  if (!body || typeof body.workspace_root !== "string" || typeof body.exists !== "boolean")
    throw new Error("Unexpected /workspace response from the gateway: no `workspace_root` / `exists`.");
  return body as RunWorkspace;
}

/** `GET /runs/{id}/workspace/files?path=` (one folder, validated). */
export async function listWorkspaceFolder(fetchGateway: GatewayFetch, runId: string, path: string, signal?: AbortSignal): Promise<WorkspaceListing> {
  const r = await fetchGateway(workspaceFilesUrl(runId, path), { signal });
  if (!r.ok) throw await gatewayResponseError(r, "The folder could not be listed");
  return parseWorkspaceListing(await r.json(), path);
}

/** `GET /runs/{id}/workspace/content?path=`: one file's bytes, with the host's credentials. */
export async function readWorkspaceFile(fetchGateway: GatewayFetch, runId: string, path: string, signal?: AbortSignal): Promise<Blob> {
  const r = await fetchGateway(workspaceContentUrl(runId, path), { signal });
  if (!r.ok) throw await gatewayResponseError(r, "The file could not be read");
  return await r.blob();
}

/**
 * Where the run's folder is and, when it exists, one folder of it: what the
 * browser shows (the stateful `WorkspaceBrowser` loads exactly this).
 */
export async function loadWorkspaceView(
  fetchGateway: GatewayFetch,
  runId: string,
  path: string,
  signal?: AbortSignal,
): Promise<{ where: RunWorkspace; listing: WorkspaceListing | null }> {
  const where = await loadRunWorkspace(fetchGateway, runId, signal);
  return { where, listing: where.exists ? await listWorkspaceFolder(fetchGateway, runId, path, signal) : null };
}

/** Breadcrumb of a workspace-relative folder: [{label, path}], root first. */
export function workspaceCrumbs(path: string): Array<{ label: string; path: string }> {
  const parts = String(path || "").split("/").filter(Boolean);
  const out = [{ label: "Workspace", path: "" }];
  parts.forEach((part, i) => out.push({ label: part, path: parts.slice(0, i + 1).join("/") }));
  return out;
}

/** The parent of a workspace-relative folder ("" for the top folder). */
export function workspaceParent(path: string): string {
  return String(path || "").split("/").filter(Boolean).slice(0, -1).join("/");
}

export function formatBytes(n: number | undefined): string {
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

/** Folders first, then files, each by name. */
export function sortWorkspaceEntries(entries: WorkspaceEntry[]): WorkspaceEntry[] {
  return [...entries].sort((a, b) => (a.type === b.type ? a.name.localeCompare(b.name) : a.type === "dir" ? -1 : 1));
}

/** "2 entries hidden by the gateway's workspace rules; the list is truncated" — or "" when neither. */
export function workspaceHiddenNote(listing: Pick<WorkspaceListing, "hidden" | "truncated">): string {
  const h = listing.hidden || {};
  const n = Number(h.blocked || 0) + Number(h.outside_links || 0) + Number(h.other || 0);
  const parts: string[] = [];
  if (n > 0) parts.push(`${n} ${n === 1 ? "entry" : "entries"} hidden by the gateway's workspace rules`);
  if (listing.truncated) parts.push("the list is truncated");
  return parts.join("; ");
}

/** Types a browser tab may render as they are (no script can run in them). */
const TAB_SAFE_TYPES = new Set(["image/png", "image/jpeg", "image/gif", "image/webp", "image/avif", "image/bmp", "application/pdf", "text/plain", "application/json"]);

/**
 * How a fetched file opens in a new tab. A blob URL runs with THIS app's
 * origin, so a workspace file written by a model must never execute there:
 * an HTML, SVG, XML or script file (and any other text) opens as plain text
 * (its source); a type a tab cannot show safely is downloaded instead.
 */
export function tabOpenPlan(contentType: string): { mode: "open"; type: string } | { mode: "download" } {
  const type = String(contentType || "").split(";", 1)[0].trim().toLowerCase();
  if (TAB_SAFE_TYPES.has(type)) return { mode: "open", type };
  if (type.startsWith("text/") || type.endsWith("+xml") || type.endsWith("+json") || type.endsWith("/xml") || type.endsWith("/javascript") || type.endsWith("/x-yaml") || type.endsWith("/toml"))
    return { mode: "open", type: "text/plain;charset=utf-8" };
  return { mode: "download" };
}

/**
 * Hand fetched bytes to the user: "open" shows them in a new tab when
 * `tabOpenPlan` allows it (active content as its source text), otherwise, and
 * for "download", saves them under `name`.
 */
export function deliverBlob(blob: Blob, name: string, mode: "open" | "download"): void {
  const plan = mode === "open" ? tabOpenPlan(blob.type) : ({ mode: "download" } as const);
  const safe = plan.mode === "open" && plan.type !== blob.type ? new Blob([blob], { type: plan.type }) : blob;
  const url = URL.createObjectURL(safe);
  if (plan.mode === "open") {
    window.open(url, "_blank", "noopener");
  } else {
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }
  // The opened tab / download holds its own reference by then.
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/**
 * Open (or download) a file the gateway links in its data — a run's ledger
 * JSON, an artifact's content URL — through the host's credentials. The
 * server's gateway-rooted URL is mapped to the relative path the app's proxy
 * or base URL serves (ui-kit `gatewayResourcePath`; anything else throws),
 * fetched with `fetchGateway`, and shown with the same safe rule as workspace
 * files (`tabOpenPlan`).
 */
export async function openGatewayResource(
  fetchGateway: GatewayFetch,
  serverUrl: string,
  options: { name: string; mode?: "open" | "download"; signal?: AbortSignal },
): Promise<void> {
  const r = await fetchGateway(gatewayResourcePath(serverUrl), { signal: options.signal });
  if (!r.ok) throw await gatewayResponseError(r, `${options.name} could not be read`);
  deliverBlob(await r.blob(), options.name, options.mode ?? "open");
}

/** The last segment of a path ("/srv/ws/run-1" → "run-1"); the whole path when it has none. */
export function workspaceShortName(root: string): string {
  const parts = String(root || "").split(/[\\/]/).filter(Boolean);
  return parts.length ? parts[parts.length - 1] : String(root || "");
}

/** "Open folder" acts on the gateway machine: offered only to a browser on that machine, where the gateway can open folders. */
export function workspaceCanOpenFolder(where: RunWorkspace | null | undefined): boolean {
  return Boolean(where && where.open_supported === true && where.host?.caller_is_this_machine === true && where.exists);
}

export type WorkspaceBrowserProps = {
  /** The host's gateway request (credentials included). */
  fetchGateway: GatewayFetch;
  /** A run whose workspace is the folder to browse (an automation's id is its controller run). */
  runId: string;
  /** "Automation files", "Discussion files", … */
  title: string;
  /** One line under the title (e.g. "Mounted read-only for the discussion"). */
  note?: string;
  onClose?: () => void;
  /**
   * Select a file instead of previewing it here (a host with its own
   * preview). Without it, a click opens the shared `FileViewer` in place.
   */
  onSelectFile?: (entry: WorkspaceEntry) => void;
  selectedPath?: string;
  /** Changes whenever the host knows files changed (e.g. a run finished): the folder is re-listed. */
  refreshKey?: string | number;
  className?: string;
  /** Extra actions in the preview header for a file (e.g. AbstractCode's "Attach"). */
  fileActions?: (entry: WorkspaceEntry) => React.ReactNode;
  /**
   * Open the folder on the gateway machine (`POST /runs/{id}/workspace/open`
   * with the host's CSRF rules). Offered only when `workspaceCanOpenFolder`.
   */
  onOpenFolder?: () => Promise<void>;
  /** Copy text (default: `navigator.clipboard.writeText`). Returns success. */
  copyText?: (text: string) => Promise<boolean>;
  /** "Now" for relative dates (default Date.now() per render). */
  nowMs?: number;
};

async function clipboardCopy(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/** Stateful browser: loads where the folder is and one level at a time; previews a file in place. */
export function WorkspaceBrowser(props: WorkspaceBrowserProps): React.ReactElement {
  const { fetchGateway, runId } = props;
  // Location and loaded data are keyed by the run they belong to, so a new
  // run starts at its top folder and never shows the previous run's files.
  const [loc, setLoc] = useState({ runId, path: "" });
  const path = loc.runId === runId ? loc.path : "";
  const [data, setData] = useState<{ runId: string; where: RunWorkspace; listing: WorkspaceListing | null } | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(Boolean(runId));
  const [fileBusy, setFileBusy] = useState("");
  const [opening, setOpening] = useState(false);
  const [revision, setRevision] = useState(0);
  const [selected, setSelected] = useState<{ runId: string; entry: WorkspaceEntry } | null>(null);
  const preview = selected && selected.runId === runId && !props.onSelectFile ? selected.entry : null;
  const previewState = useWorkspaceFilePreview(fetchGateway, runId, preview, `${props.refreshKey ?? ""}:${revision}`);

  useEffect(() => {
    if (!runId) return;
    const abort = new AbortController();
    setLoading(true);
    setError("");
    void (async () => {
      try {
        const view = await loadWorkspaceView(fetchGateway, runId, path, abort.signal);
        if (!abort.signal.aborted) setData({ runId, ...view });
      } catch (e: any) {
        if (!abort.signal.aborted) setError(String(e?.message || e));
      } finally {
        if (!abort.signal.aborted) setLoading(false);
      }
    })();
    return () => abort.abort();
  }, [fetchGateway, runId, path, revision, props.refreshKey]);
  useEffect(() => setNotice(""), [runId]);
  const current = data && data.runId === runId ? data : null;

  const download = useCallback(
    async (entry: WorkspaceEntry) => {
      setFileBusy(entry.path);
      setError("");
      try {
        deliverBlob(await readWorkspaceFile(fetchGateway, runId, entry.path), entry.name, "download");
      } catch (e: any) {
        setError(String(e?.message || e));
      } finally {
        setFileBusy("");
      }
    },
    [fetchGateway, runId],
  );
  const root = current?.where.workspace_root || "";
  const nowMs = props.nowMs ?? Date.now();

  return (
    <WorkspaceBrowserView
      title={props.title}
      note={props.note}
      where={current?.where ?? null}
      path={path}
      listing={current?.listing ?? null}
      error={error}
      notice={notice}
      loading={loading}
      fileBusy={fileBusy}
      selectedPath={props.onSelectFile ? props.selectedPath : preview?.path}
      className={props.className}
      nowMs={nowMs}
      openingFolder={opening}
      onNavigate={(p) => {
        setSelected(null);
        setLoc({ runId, path: p });
      }}
      onRefresh={() => setRevision((n) => n + 1)}
      onFile={(entry) => void download(entry)}
      onSelectFile={props.onSelectFile ?? ((entry) => setSelected({ runId, entry }))}
      onClose={props.onClose}
      onCopyPath={
        root
          ? () => {
              void (props.copyText || clipboardCopy)(root).then((ok) => setNotice(ok ? "Path copied." : "Could not copy; select the path instead."));
            }
          : undefined
      }
      onOpenFolder={
        props.onOpenFolder && workspaceCanOpenFolder(current?.where)
          ? () => {
              setOpening(true);
              setNotice("");
              void props.onOpenFolder!()
                .then(() => setNotice("Folder opened on this machine."))
                .catch((e: any) => setNotice(`Open folder failed: ${String(e?.message || e)}`))
                .finally(() => setOpening(false));
            }
          : undefined
      }
      preview={
        preview ? (
          <FileViewer
            name={preview.name}
            path={preview.path}
            sizeBytes={preview.size_bytes}
            modified={preview.mtime}
            nowMs={nowMs}
            {...filePreviewViewerProps(previewState)}
            actions={props.fileActions?.(preview)}
            onDownload={() => void download(preview)}
            onClose={() => setSelected(null)}
          />
        ) : null
      }
    />
  );
}

export type WorkspaceBrowserViewProps = {
  title: string;
  note?: string;
  where: RunWorkspace | null;
  path: string;
  listing: WorkspaceListing | null;
  error: string;
  /** A one-line outcome ("Path copied."). */
  notice?: string;
  loading: boolean;
  fileBusy: string;
  selectedPath?: string;
  className?: string;
  /** "Now" for the rows' relative dates (deterministic in checks). */
  nowMs?: number;
  onNavigate(path: string): void;
  onRefresh(): void;
  /** The row's download icon. `mode` is always "download" (0.3.0: no "Open" button). */
  onFile?(entry: WorkspaceEntry, mode: "download"): void;
  /** A click on the file name (the preview). */
  onSelectFile?(entry: WorkspaceEntry): void;
  onClose?: () => void;
  onCopyPath?: () => void;
  onOpenFolder?: () => void;
  openingFolder?: boolean;
  /** Shown instead of the list (a file preview); its close returns to the list. */
  preview?: React.ReactNode;
};

/** The hook-free view (checks render it in any state). */
export function WorkspaceBrowserView(p: WorkspaceBrowserViewProps): React.ReactElement {
  const note = p.listing ? workspaceHiddenNote(p.listing) : "";
  const hostname = p.where?.host?.hostname;
  const root = p.where?.workspace_root || "";
  const nowMs = p.nowMs ?? Date.now();
  return (
    <section className={`pc-ws${p.className ? ` ${p.className}` : ""}`} aria-label={p.title} data-workspace-root={root || undefined}>
      <header className="pc-ws__head">
        <span className="pc-ws__title">
          <Icon name="folder" size={15} /> {p.title}
        </span>
        <span className="pc-ws__spacer" />
        <button type="button" className="pc-ws__icon-btn" data-action="refresh-folder" onClick={p.onRefresh} disabled={p.loading} title="Refresh" aria-label="Refresh the folder">
          <Icon name="refresh" size={14} />
        </button>
        {p.onClose ? (
          <button type="button" className="pc-ws__icon-btn" data-action="close-folder" onClick={p.onClose} title="Close" aria-label="Close the file browser">
            <Icon name="x" size={14} />
          </button>
        ) : null}
      </header>
      {p.where ? (
        <div className="pc-ws__root">
          <span className="pc-ws__root-name" title={root} data-root-name="true">
            {workspaceShortName(root)}
          </span>
          {p.onOpenFolder ? (
            <button type="button" className="pc-ws__icon-btn pc-ws__icon-btn--bare" data-action="open-folder" onClick={p.onOpenFolder} disabled={p.openingFolder} title="Open folder" aria-label="Open the folder on this machine">
              <Icon name="folder" size={14} />
            </button>
          ) : null}
          {p.onCopyPath ? (
            <button type="button" className="pc-ws__icon-btn pc-ws__icon-btn--bare" data-action="copy-path" onClick={p.onCopyPath} title="Copy path" aria-label="Copy the folder path">
              <Icon name="copy" size={14} />
            </button>
          ) : null}
          {hostname && p.where.host?.caller_is_this_machine !== true ? <span className="pc-ws__muted"> on {hostname}</span> : null}
        </div>
      ) : null}
      {p.note ? <div className="pc-ws__muted">{p.note}</div> : null}
      {p.notice ? (
        <div className="pc-ws__muted" role="status">
          {p.notice}
        </div>
      ) : null}
      {p.error ? (
        <div className="pc-ws__error" role="alert">
          {p.error}
        </div>
      ) : null}
      {p.preview ? (
        <div className="pc-ws__preview">{p.preview}</div>
      ) : (
        <>
          <nav className="pc-ws__crumbs" aria-label="Folder">
            {workspaceCrumbs(p.path).map((c, i, all) =>
              i === all.length - 1 ? (
                <span key={c.path} aria-current="page">
                  {c.label}
                </span>
              ) : (
                <React.Fragment key={c.path}>
                  <button type="button" className="pc-ws__crumb" onClick={() => p.onNavigate(c.path)}>
                    {c.label}
                  </button>
                  <span className="pc-ws__muted"> / </span>
                </React.Fragment>
              ),
            )}
          </nav>
          {p.loading && !p.listing ? <div className="pc-ws__muted" role="status">Loading…</div> : null}
          {p.where && !p.where.exists ? <div className="pc-ws__muted">The folder does not exist yet: nothing has been written.</div> : null}
          {p.listing ? (
            p.listing.entries.length ? (
              <ul className="pc-ws__entries">
                {sortWorkspaceEntries(p.listing.entries).map((e) => (
                  <li key={e.path} className={`pc-ws__entry${p.selectedPath === e.path ? " is-selected" : ""}`} data-type={e.type} data-path={e.path}>
                    {e.type === "dir" ? (
                      <button type="button" className="pc-ws__name" data-action="open-dir" onClick={() => p.onNavigate(e.path)}>
                        <Icon name="folder" size={14} /> <span className="pc-ws__label">{e.name}/</span>
                      </button>
                    ) : (
                      <>
                        {p.onSelectFile ? (
                          <button type="button" className="pc-ws__name" data-action="select-file" aria-pressed={p.selectedPath === e.path} title={`Preview ${e.name}`} onClick={() => p.onSelectFile?.(e)}>
                            <Icon name="file" size={14} /> <span className="pc-ws__label">{e.name}</span>
                          </button>
                        ) : (
                          <span className="pc-ws__name">
                            <Icon name="file" size={14} /> <span className="pc-ws__label">{e.name}</span>
                          </span>
                        )}
                        <span className="pc-ws__meta">
                          <span className="pc-ws__size">{formatBytes(e.size_bytes)}</span>
                          {e.mtime !== undefined && formatRelativeTime(e.mtime, nowMs) ? (
                            <time className="pc-ws__time" title={formatExactTime(e.mtime)} data-meta="modified">
                              {formatRelativeTime(e.mtime, nowMs)}
                            </time>
                          ) : null}
                        </span>
                        {p.onFile ? (
                          <button
                            type="button"
                            className="pc-ws__icon-btn pc-ws__icon-btn--bare"
                            data-action="download-file"
                            disabled={p.fileBusy === e.path}
                            onClick={() => p.onFile?.(e, "download")}
                            title="Download"
                            aria-label={`Download ${e.name}`}
                          >
                            <Icon name="download" size={14} />
                          </button>
                        ) : null}
                      </>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <div className="pc-ws__muted">This folder is empty.</div>
            )
          ) : null}
          {note ? (
            <div className="pc-ws__muted" data-hidden-note="true">
              {note}
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}
