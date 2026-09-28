// WorkspaceBrowser: a run's folder on the gateway host, browsed through the
// host's credentialed fetch (CONTRACTS §W routes). Pure helpers, the fetch
// wrappers over a fake gateway, the tab-open safety rule, and the hook-free
// view with its handlers invoked.
// Run after `npm run build`: node scripts/check_workspace_browser.mjs
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import * as pc from "../dist/index.js";

const {
  WorkspaceBrowser,
  WorkspaceBrowserView,
  formatBytes,
  listWorkspaceFolder,
  loadRunWorkspace,
  loadWorkspaceView,
  parseWorkspaceListing,
  readWorkspaceFile,
  sortWorkspaceEntries,
  tabOpenPlan,
  workspaceContentUrl,
  workspaceCrumbs,
  workspaceFilesUrl,
  workspaceHiddenNote,
  workspaceInfoUrl,
  workspaceParent,
} = pc;

// --- routes -----------------------------------------------------------------------------
assert.equal(workspaceInfoUrl("a/b c"), "/api/gateway/runs/a%2Fb%20c/workspace");
assert.equal(workspaceFilesUrl("r1", "notes/2026 09"), "/api/gateway/runs/r1/workspace/files?path=notes%2F2026+09&recursive=false");
assert.equal(workspaceContentUrl("r1", "a&b.md"), "/api/gateway/runs/r1/workspace/content?path=a%26b.md");

// --- listing parser: malformed is an error, never an empty folder -------------------------
const good = { path: "notes", entries: [{ name: "b.md", path: "notes/b.md", type: "file", size_bytes: 2048 }, { name: "a", path: "notes/a", type: "dir" }], truncated: false, hidden: { blocked: 2, outside_links: 1 } };
assert.deepEqual(parseWorkspaceListing(good, "notes"), good);
assert.deepEqual(parseWorkspaceListing({ entries: [], truncated: true }, "x"), { path: "x", entries: [], truncated: true }, "path falls back to the requested folder");
assert.throws(() => parseWorkspaceListing(null, ""), /not an object/);
assert.throws(() => parseWorkspaceListing({ truncated: false }, ""), /no `entries` list/);
assert.throws(() => parseWorkspaceListing({ entries: [] }, ""), /no `truncated` flag/);
assert.throws(() => parseWorkspaceListing({ entries: [{ name: "x", path: "x", type: "link" }], truncated: false }, ""), /entry 1 lacks/);

// --- fetch wrappers over a fake gateway --------------------------------------------------
const seen = [];
const gateway = (routes) => async (path, init) => {
  seen.push(path);
  const r = routes[path];
  if (!r) return new Response(JSON.stringify({ detail: `no route ${path}` }), { status: 404, statusText: "Not Found" });
  return typeof r === "function" ? r(init) : r();
};
const json = (body, status = 200) => () => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const where = { run_id: "r1", workspace_root: "/srv/ws/r1", exists: true, host: { hostname: "box", caller_is_this_machine: false } };
const gw = gateway({
  [workspaceInfoUrl("r1")]: json(where),
  [workspaceFilesUrl("r1", "")]: json(good),
  [workspaceFilesUrl("r1", "bad")]: json({ entries: "nope", truncated: false }),
  [workspaceContentUrl("r1", "b.md")]: () => new Response("# hi", { headers: { "content-type": "text/markdown" } }),
  [workspaceInfoUrl("denied")]: json({ detail: { message: "Workspace access denied by policy" } }, 403),
  [workspaceInfoUrl("text")]: () => new Response("gateway exploded", { status: 500, statusText: "Internal Server Error" }),
  [workspaceInfoUrl("old")]: json({ root: "/x" }),
});
assert.deepEqual(await loadRunWorkspace(gw, "r1"), where);
assert.deepEqual(await listWorkspaceFolder(gw, "r1", ""), good);
const blob = await readWorkspaceFile(gw, "r1", "b.md");
assert.equal(await blob.text(), "# hi");
assert.equal(blob.type, "text/markdown");
assert.deepEqual(await loadWorkspaceView(gw, "r1", ""), { where, listing: good }, "the browser's load: where + the folder");
seen.length = 0;
const fresh = gateway({ [workspaceInfoUrl("new")]: json({ ...where, run_id: "new", exists: false }) });
assert.deepEqual(await loadWorkspaceView(fresh, "new", ""), { where: { ...where, run_id: "new", exists: false }, listing: null }, "a folder not created yet is not listed");
assert.deepEqual(seen, [workspaceInfoUrl("new")], "…and no listing request is made for it");
await assert.rejects(() => listWorkspaceFolder(gw, "r1", "bad"), /no `entries` list/, "a malformed listing fails loudly");
await assert.rejects(() => loadRunWorkspace(gw, "denied"), { message: "The workspace is not available (HTTP 403): Workspace access denied by policy" }, "the gateway's reason (detail.message)");
await assert.rejects(() => loadRunWorkspace(gw, "text"), { message: "The workspace is not available (HTTP 500): gateway exploded" }, "plain-text reason");
await assert.rejects(() => readWorkspaceFile(gw, "r1", "missing.md"), { message: `The file could not be read (HTTP 404): no route ${workspaceContentUrl("r1", "missing.md")}` }, "detail string");
await assert.rejects(() => loadRunWorkspace(gw, "old"), /no `workspace_root`/, "an older /workspace answer fails loudly");
const aborted = new AbortController();
let gotSignal = null;
await listWorkspaceFolder(async (_p, init) => ((gotSignal = init?.signal), json(good)()), "r1", "", aborted.signal);
assert.equal(gotSignal, aborted.signal, "the caller's abort signal reaches the host fetch");

// --- pure helpers ------------------------------------------------------------------------
assert.deepEqual(workspaceCrumbs("a/b"), [{ label: "Workspace", path: "" }, { label: "a", path: "a" }, { label: "b", path: "a/b" }]);
assert.deepEqual(workspaceCrumbs(""), [{ label: "Workspace", path: "" }]);
assert.equal(workspaceParent("a/b/c"), "a/b");
assert.equal(workspaceParent("a"), "");
assert.equal(formatBytes(512), "512 B");
assert.equal(formatBytes(2048), "2.0 KiB");
assert.equal(formatBytes(50 * 1024 * 1024), "50 MiB");
assert.equal(formatBytes(undefined), "");
assert.deepEqual(sortWorkspaceEntries(good.entries).map((e) => e.name), ["a", "b.md"], "folders first");
assert.equal(workspaceHiddenNote(good), "3 entries hidden by the gateway's workspace rules");
assert.equal(workspaceHiddenNote({ hidden: { other: 1 }, truncated: true }), "1 entry hidden by the gateway's workspace rules; the list is truncated");
assert.equal(workspaceHiddenNote({ truncated: false }), "");

// --- tab-open safety: a blob URL runs with the APP's origin -------------------------------
for (const t of ["text/html", "text/html; charset=utf-8", "image/svg+xml", "application/xhtml+xml", "text/xml", "application/xml", "application/javascript", "text/javascript", "text/markdown", "text/csv"])
  assert.deepEqual(tabOpenPlan(t), { mode: "open", type: "text/plain;charset=utf-8" }, `${t} opens as its source text`);
for (const t of ["image/png", "image/jpeg", "application/pdf", "text/plain", "application/json"]) assert.deepEqual(tabOpenPlan(t), { mode: "open", type: t }, `${t} opens as is`);
for (const t of ["application/octet-stream", "", "application/zip", "video/mp4"]) assert.deepEqual(tabOpenPlan(t), { mode: "download" }, `${t || "(none)"} is downloaded`);

// --- the view ------------------------------------------------------------------------------
function walk(node, visit) {
  if (node === null || node === undefined || typeof node === "boolean") return;
  if (Array.isArray(node)) return node.forEach((n) => walk(n, visit));
  if (typeof node !== "object") return;
  if (typeof node.type === "function") return walk(node.type(node.props), visit);
  visit(node);
  walk(node.props && node.props.children, visit);
}
const byAction = (tree, action) => {
  const out = [];
  walk(tree, (n) => n.props && n.props["data-action"] === action && out.push(n));
  return out;
};
const got = [];
const viewProps = {
  title: "Automation files",
  note: "Mounted read-only for the discussion.",
  where,
  path: "notes",
  listing: good,
  error: "",
  loading: false,
  fileBusy: "",
  onNavigate: (p) => got.push(["nav", p]),
  onRefresh: () => got.push(["refresh"]),
  onFile: (e, mode) => got.push(["file", e.path, mode]),
  onClose: () => got.push(["close"]),
};
const tree = WorkspaceBrowserView(viewProps);
const html = renderToStaticMarkup(tree);
assert.ok(html.startsWith('<section class="pc-ws" aria-label="Automation files" data-workspace-root="/srv/ws/r1">'), "labelled section with the root");
assert.ok(html.includes("<code>/srv/ws/r1</code><span class=\"pc-ws__muted\"> on the gateway host box</span>"), "remote host named");
assert.ok(html.includes("Mounted read-only for the discussion."), "host note");
assert.ok(html.indexOf('data-path="notes/a"') < html.indexOf('data-path="notes/b.md"'), "folders listed first");
assert.ok(html.includes('<span class="pc-ws__size">2.0 KiB</span>'), "file size");
assert.ok(html.includes('data-hidden-note="true">3 entries hidden by the gateway&#x27;s workspace rules</div>'), "hidden entries counted, never silently dropped");
assert.ok(html.includes('<span aria-current="page">notes</span>'), "current folder crumb");
byAction(tree, "open-dir")[0].props.onClick();
assert.deepEqual(got.at(-1), ["nav", "notes/a"]);
byAction(tree, "open-file")[0].props.onClick();
assert.deepEqual(got.at(-1), ["file", "notes/b.md", "open"]);
byAction(tree, "download-file")[0].props.onClick();
assert.deepEqual(got.at(-1), ["file", "notes/b.md", "download"]);
byAction(tree, "refresh-folder")[0].props.onClick();
assert.deepEqual(got.at(-1), ["refresh"]);
byAction(tree, "close-folder")[0].props.onClick();
assert.deepEqual(got.at(-1), ["close"]);
assert.equal(byAction(tree, "select-file").length, 0, "no selection without onSelectFile");

// A host preview (AbstractCode): the name selects; no Open/Download.
const sel = WorkspaceBrowserView({ ...viewProps, onFile: undefined, onSelectFile: (e) => got.push(["select", e.path]), selectedPath: "notes/b.md" });
const selHtml = renderToStaticMarkup(sel);
assert.equal(byAction(sel, "open-file").length + byAction(sel, "download-file").length, 0);
byAction(sel, "select-file")[0].props.onClick();
assert.deepEqual(got.at(-1), ["select", "notes/b.md"]);
assert.ok(selHtml.includes('class="pc-ws__entry is-selected" data-type="file" data-path="notes/b.md"') && selHtml.includes('aria-pressed="true"'), "selection marked");

// States: error, not created yet, empty, busy file, local host.
const err = renderToStaticMarkup(WorkspaceBrowserView({ ...viewProps, error: "The folder could not be listed (HTTP 403): denied" }));
assert.ok(err.includes('<div class="pc-ws__error" role="alert">The folder could not be listed (HTTP 403): denied</div>'));
const none = renderToStaticMarkup(WorkspaceBrowserView({ ...viewProps, where: { ...where, exists: false, host: { hostname: "box", caller_is_this_machine: true } }, listing: null }));
assert.ok(none.includes("The folder does not exist yet: nothing has been written.") && !none.includes("on the gateway host"), "not created yet; local host not announced");
const empty = renderToStaticMarkup(WorkspaceBrowserView({ ...viewProps, listing: { path: "", entries: [], truncated: false } }));
assert.ok(empty.includes("This folder is empty."));
const busy = renderToStaticMarkup(WorkspaceBrowserView({ ...viewProps, fileBusy: "notes/b.md" }));
assert.ok(/data-action="open-file" disabled=""/.test(busy) && /data-action="download-file" disabled=""/.test(busy), "file buttons disabled while that file is fetched");
assert.ok(!html.includes("close-folder") || byAction(WorkspaceBrowserView({ ...viewProps, onClose: undefined }), "close-folder").length === 0, "no close button without onClose");

// The stateful browser's first paint (effects run in a browser): loading, top folder.
const first = renderToStaticMarkup(React.createElement(WorkspaceBrowser, { fetchGateway: gw, runId: "r1", title: "Automation files" }));
assert.ok(first.includes('<div class="pc-ws__muted" role="status">Loading…</div>') && first.includes('<span aria-current="page">Workspace</span>'));

console.log("check_workspace_browser: OK");
