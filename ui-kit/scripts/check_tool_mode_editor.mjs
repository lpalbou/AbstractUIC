#!/usr/bin/env node
/**
 * ToolModeEditor + the tool layer store (ui-primitives tools-models, backlog 0033).
 *
 * Markup (renderToStaticMarkup over dist):
 * - three states per row (Off / Ask / Auto), the row's mode pressed;
 * - a toolset group control with a Mixed state, and the bulk-Auto cap EXPLAINED in words where a
 *   group holds tools group Auto does not reach;
 * - a "Default: X" chip on a row that overrides the layer below, and only there;
 * - the reset wording per layer: "Use the gateway's" (app) / "Use my defaults" (session);
 * - `allowListOnly`: Off / On only; a tool the gateway does not offer shows its reason, disabled;
 * - the AfOverrideRow frame names whose override it is ("this app" / "this conversation") and never
 *   says "Gateway default" over changed app defaults.
 * Behaviour (the kit's minimal hook harness, as check_voice_library.mjs): a row click writes a
 * SPARSE diff, a click back to the inherited mode deletes it, group Auto writes only the reachable
 * tools, allowListOnly On restores the inherited approval.
 * Store: kit-standard keys, sparse canonical values, newest 100 conversations, "Saved in this
 * browser" (never "saved for this Gateway account").
 */
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

const here = dirname(fileURLToPath(import.meta.url));
const kit = await import(join(here, "..", "dist", "index.js"));
let failures = 0;
let checks = 0;
function check(name, cond, detail) {
  checks += 1;
  if (cond) return;
  failures += 1;
  console.error(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`);
}
const j = (v) => JSON.stringify(v);
const h = React.createElement;
const { ToolModeEditor, normalizeToolCatalog, createToolLayerStore, toolIdentityKey, TOOL_LAYER_STORE_WHERE, TOOL_SESSION_LAYERS_MAX, BULK_AUTO_CAP_SENTENCE } = kit;

const catalog = normalizeToolCatalog({
  items: [
    { name: "read_file", toolset: "files", enabled: true, approval_default: "auto", risk_tier: "observe", risk_rank: 1 },
    { name: "write_file", toolset: "files", enabled: true, approval_default: "ask", risk_tier: "act", risk_rank: 2 },
    { name: "fetch_url", toolset: "web", enabled: true, approval_default: "auto", risk_tier: "act", risk_rank: 2, model_controlled_destination: true },
    { name: "web_search", toolset: "web", enabled: true, approval_default: "auto", risk_tier: "observe", risk_rank: 1 },
    { name: "execute_command", toolset: "shell", enabled: true, approval_default: "ask", risk_tier: "destroy", risk_rank: 4 },
    { name: "send_telegram_message", toolset: "comms.telegram", enabled: false, approval_default: "ask", why_disabled: "Set TELEGRAM_BOT_TOKEN." },
  ],
});
const render = (props) => renderToStaticMarkup(h(ToolModeEditor, { catalog, layer: "app", value: {}, onChange() {}, ...props }));
const rowOf = (html, name) => {
  const start = html.indexOf(`data-tool="${name}"`);
  if (start < 0) return "";
  const next = html.indexOf('data-tool="', start + 1);
  const sectionEnd = html.indexOf("</section>", start);
  const end = Math.min(next < 0 ? html.length : next, sectionEnd < 0 ? html.length : sectionEnd);
  return html.slice(start, end);
};
const groupHead = (html, toolset) => {
  const start = html.indexOf(`data-toolset="${toolset}"`);
  return start < 0 ? "" : html.slice(start, html.indexOf('data-tool="', start));
};
const pressed = (html, key) => new RegExp(`aria-pressed="true"[^>]*data-(?:tool|group)-mode="${key.replace(/[.:]/g, (c) => `\\${c}`)}"`).test(html);

// ---------------------------------------------------------------- three states per row
{
  const html = render({});
  const row = rowOf(html, "write_file");
  check("three states per row", ["off", "ask", "auto"].every((m) => row.includes(`data-tool-mode="write_file:${m}"`)), row.slice(0, 300));
  check("Off / Ask / Auto words", />Off</.test(row) && />Ask</.test(row) && />Auto</.test(row));
  check("the row's mode is pressed (gateway ask)", pressed(row, "write_file:ask") && !pressed(row, "write_file:auto"));
  check("gateway auto pressed for read_file", pressed(rowOf(html, "read_file"), "read_file:auto"));
  check("no Default chip without an override", !html.includes("data-default-chip"));
  check("counts in words", html.includes("5 of 5 tools on · 3 run without asking · 2 ask first"), html.match(/data-tool-count[^<]*<?[^<]*/)?.[0]);
  const tg = rowOf(html, "send_telegram_message");
  check("not offered: the gateway's reason", tg.includes("Not offered by the gateway: Set TELEGRAM_BOT_TOKEN."), tg);
  check("not offered: its controls disabled", (tg.match(/disabled=""/g) || []).length === 3, tg);
  check("risk badge", rowOf(html, "execute_command").includes(">destroy<"));
  check("served defaults carry no 'did not say' label", !html.includes("data-default-unserved"));
  const unserved = renderToStaticMarkup(h(ToolModeEditor, { catalog: normalizeToolCatalog({ items: [{ name: "mystery", toolset: "x", enabled: true }] }), layer: "app", value: {}, onChange() {} }));
  check("an unserved default is labeled, Ask assumed", unserved.includes('data-default-unserved="mystery"') && unserved.includes("Ask is assumed") && pressed(rowOf(unserved, "mystery"), "mystery:ask"), unserved.slice(0, 400));
}

// ---------------------------------------------------------------- group control: Mixed + cap explained
{
  const html = render({});
  const web = groupHead(html, "web");
  check("uniform group shows its mode", web.includes('data-group-state="auto"') && pressed(web, "web:auto"), web.slice(0, 400));
  const files = groupHead(html, "files");
  check("Mixed group state", files.includes('data-group-state="mixed"') && files.includes(">Mixed<") && !/aria-pressed="true"/.test(files), files.slice(0, 500));
  check("group control has the three modes", ["off", "ask", "auto"].every((m) => files.includes(`data-group-mode="files:${m}"`)));
  const cap = html.match(/data-bulk-cap="web">([^<]*)</)?.[1] || "";
  check("the rank cap is explained in words", cap.includes("risk 2 or lower") && cap.includes("destination the assistant does not choose") && cap.includes("fetch_url"), cap);
  check("cap sentence exported verbatim", cap.startsWith(BULK_AUTO_CAP_SENTENCE.replace(/'/g, "&#x27;")), cap);
  check("no cap note where every tool is reached", !html.includes('data-bulk-cap="files"'));
  check("a group of only unreachable tools cannot go Auto", /data-group-mode="shell:auto"[^>]*disabled=""|disabled=""[^>]*data-group-mode="shell:auto"/.test(html));
}

// ---------------------------------------------------------------- Default chip + reset wording
{
  const app = render({ value: { write_file: "auto" }, onReset() {} });
  const row = rowOf(app, "write_file");
  check("Default chip on an overriding row", /data-default-chip="write_file"[^>]*>Default: Ask</.test(row), row);
  check("chip says whose default (app layer: the gateway's)", row.includes('title="The gateway&#x27;s default"'));
  check("only the overriding row has a chip", (app.match(/data-default-chip=/g) || []).length === 1);
  check("the overriding row shows its own mode", pressed(row, "write_file:auto"));
  check("app reset: Use the gateway's", app.includes(">Use the gateway&#x27;s</button>"));
  const session = render({ layer: "session", value: { read_file: "off" }, inherited: { read_file: "ask" }, onReset() {} });
  check("session reset: Use my defaults", session.includes(">Use my defaults</button>") && !session.includes("Use the gateway"));
  const overGateway = render({ layer: "session", value: { write_file: "auto" }, inherited: { write_file: "ask" } });
  check("session chip over the gateway's default names the gateway (review F8)", /data-default-chip="write_file" title="The gateway&#x27;s default"/.test(overGateway), overGateway.match(/data-default-chip="write_file"[^>]*/)?.[0]);
  check("session chip shows the inherited (app) mode", /data-default-chip="read_file"[^>]*>Default: Ask</.test(session) && session.includes('title="Your default for this app"'));
  check("no reset without a diff", !render({ onReset() {} }).includes("data-action=\"reset-layer\""));
}

// ---------------------------------------------------------------- allowListOnly
{
  const html = render({ allowListOnly: true, value: { write_file: "off" } });
  const row = rowOf(html, "read_file");
  check("allowListOnly: Off / On only", row.includes('data-tool-mode="read_file:off"') && row.includes('data-tool-mode="read_file:on"') && !row.includes("read_file:ask") && !row.includes("read_file:auto"), row);
  check("allowListOnly: On pressed for an enabled tool", pressed(row, "read_file:on"));
  check("allowListOnly: Off pressed for an off tool", pressed(rowOf(html, "write_file"), "write_file:off"));
  check("allowListOnly: no cap note (approval untouched)", !html.includes("data-bulk-cap"));
  check("allowListOnly: count in on/off words", html.includes("4 of 5 tools on"));
}

// ---------------------------------------------------------------- frame (AfOverrideRow)
{
  const plain = render({ rowLabel: "Tools", open: true });
  check("frame: Gateway default named when nothing changed", plain.includes("Gateway default · 5 tools on, 3 without asking"), plain.slice(0, 600));
  const sess = render({ rowLabel: "Tools", layer: "session", value: { read_file: "off" }, open: true });
  check("frame: session override owned by this conversation", sess.includes("1 tool changed — this conversation"));
  const overApp = render({ rowLabel: "Tools", layer: "session", value: {}, inherited: { read_file: "ask" }, open: true });
  check("frame: never 'Gateway default' over changed app defaults", overApp.includes("Your defaults — this app") && !overApp.includes(">Gateway default"), overApp.slice(0, 600));
  // Review F1: the frame and the run agree — keys that change nothing are no change.
  const inert = render({ rowLabel: "Tools", value: { gone_tool: "auto", send_telegram_message: "auto", read_file: "auto", web_search: "approve" }, open: true });
  check("frame: stale / not-offered / redundant / non-canonical keys are no change", inert.includes("Gateway default · 5 tools on, 3 without asking") && !inert.includes("data-default-chip") && !inert.includes('data-overridden="true"'), inert.slice(0, 500));
  check("frame: no account promise", !/Gateway account/i.test(plain + sess + overApp));
}

// ---------------------------------------------------------------- served payload (review F2, F3)
{
  const { ToolModeEditorForPayload } = kit;
  const failed = renderToStaticMarkup(h(ToolModeEditorForPayload, { catalog: { items: [], error: "ImportError: abstractruntime" }, layer: "app", value: {}, onChange() {} }));
  check("the gateway's failure answer renders a labeled error, not 'no tools'", failed.includes('data-catalog-error=""') && failed.includes("Tools unavailable: The gateway could not list its tools: ImportError: abstractruntime") && !failed.includes("offers no tools"), failed);
  const broken = renderToStaticMarkup(h(ToolModeEditorForPayload, { catalog: { nope: 1 }, layer: "app", value: {}, onChange() {} }));
  check("a broken answer renders, never throws", broken.includes("Tools unavailable"));
  const warned = renderToStaticMarkup(h(ToolModeEditorForPayload, { catalog: { items: [{ name: "read_file", approval_default: "auto" }], catalog_warnings: ["MCP tools unavailable: RuntimeError: x"] }, layer: "app", value: {}, onChange() {} }));
  check("catalog_warnings shown in the gateway's words", warned.includes("data-catalog-warnings") && warned.includes("Gateway warning: MCP tools unavailable: RuntimeError: x") && warned.includes('data-tool="read_file"'));
  const { readFileSync } = await import("node:fs");
  const island = readFileSync(join(here, "..", "islands", "console_islands.tsx"), "utf8");
  check("the island mounts the payload editor (no throw after createRoot)", /mount\(el, \(p\) => <ToolModeEditorForPayload \{\.\.\.p\} \/>, props\)/.test(island));
  check("the voice picker's doc comment sits on mountVoiceSettings again", /\* transport injected \(fetchCatalog\)\. Additive member \(round 3\)\.\n \*\/\nexport function mountVoiceSettings/.test(island));
}

// ---------------------------------------------------------------- behaviour (hook harness)
const internals = React.__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED;
function mount(Component, initialProps) {
  const hooks = [];
  let index = 0;
  let props = initialProps;
  const changed = (prev, deps) => !prev || !deps || deps.length !== prev.deps.length || deps.some((d, k) => !Object.is(d, prev.deps[k]));
  const dispatcher = {
    useState(init) {
      const k = index++;
      if (!(k in hooks)) hooks[k] = { value: typeof init === "function" ? init() : init };
      const s = hooks[k];
      s.set ||= (next) => { s.value = typeof next === "function" ? next(s.value) : next; };
      return [s.value, s.set];
    },
    useRef(init) { const k = index++; if (!(k in hooks)) hooks[k] = { current: init }; return hooks[k]; },
    useEffect() { index++; },
    useMemo(fn, deps) { const k = index++; if (changed(hooks[k], deps)) hooks[k] = { deps: deps || [], value: fn() }; return hooks[k].value; },
    useCallback(fn, deps) { return dispatcher.useMemo(() => fn, deps); },
    useId() { index++; return ":r0:"; },
  };
  let tree = null;
  const render = () => {
    index = 0;
    const before = internals.ReactCurrentDispatcher.current;
    internals.ReactCurrentDispatcher.current = dispatcher;
    try { tree = Component(props); } finally { internals.ReactCurrentDispatcher.current = before; }
    return tree;
  };
  render();
  return { get tree() { return tree; }, render, rerender(next) { props = { ...props, ...next }; return render(); } };
}
function* walk(node) {
  if (node == null || typeof node !== "object") return;
  if (Array.isArray(node)) { for (const n of node) yield* walk(n); return; }
  if (node.props) { yield node; yield* walk(node.props.children); }
}
const btn = (tree, key) => [...walk(tree)].find((n) => n.props["data-tool-mode"] === key || n.props["data-group-mode"] === key);
{
  const seen = [];
  const m = mount(ToolModeEditor, { catalog, layer: "app", value: {}, onChange: (v) => seen.push(v) });
  btn(m.tree, "write_file:auto").props.onClick();
  check("row click writes a sparse diff", j(seen.at(-1)) === j({ write_file: "auto" }), j(seen.at(-1)));
  m.rerender({ value: { write_file: "auto", not_loaded_yet: "off" } });
  btn(m.tree, "write_file:ask").props.onClick();
  check("back to the inherited mode deletes the diff (others kept)", j(seen.at(-1)) === j({ not_loaded_yet: "off" }), j(seen.at(-1)));
  m.rerender({ value: {} });
  btn(m.tree, "web:off").props.onClick();
  check("group Off writes every offered tool of the group", j(seen.at(-1)) === j({ fetch_url: "off", web_search: "off" }), j(seen.at(-1)));
  m.rerender({ value: { fetch_url: "off", web_search: "off" } });
  btn(m.tree, "web:auto").props.onClick();
  check("group Auto writes only reachable tools (fetch_url stays)", j(seen.at(-1)) === j({ fetch_url: "off" }), j(seen.at(-1)));
  const n = seen.length;
  btn(m.tree, "send_telegram_message:auto").props.onClick();
  check("a not-offered tool is never written", seen.length === n + 1 && !("send_telegram_message" in seen.at(-1)), j(seen.at(-1)));
  m.rerender({ disabled: true });
  const before = seen.length;
  btn(m.tree, "read_file:off").props.onClick();
  check("disabled writes nothing", seen.length === before);
}
{
  const seen = [];
  const m = mount(ToolModeEditor, { catalog, layer: "session", value: { write_file: "off" }, inherited: { write_file: "auto", read_file: "auto" }, allowListOnly: true, onChange: (v) => seen.push(v) });
  btn(m.tree, "write_file:on").props.onClick();
  check("allowListOnly On restores the inherited approval (diff deleted)", j(seen.at(-1)) === "{}", j(seen.at(-1)));
  m.rerender({ value: {}, inherited: { write_file: "off", read_file: "auto" } });
  btn(m.tree, "write_file:on").props.onClick();
  check("allowListOnly On over an inherited Off uses the gateway's default", j(seen.at(-1)) === j({ write_file: "ask" }), j(seen.at(-1)));
}

// ---------------------------------------------------------------- the layer store
{
  const mem = new Map();
  const storage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };
  const id = toolIdentityKey({ gatewayUrl: "https://gw", tenantId: "t", runtimeId: "r", userId: "" });
  check("identity tuple is abstractcode's shape", id === j(["https://gw", "t", "r", "session"]), id);
  const store = createToolLayerStore(id, { storage });
  store.writeApp("abstractcode.agent.v1", { read_file: "off", bogus: "approve" });
  check("app key", mem.has(`af.tools.app.abstractcode.agent.v1.${id}`), j([...mem.keys()]));
  check("app value is a canonical sparse layer", mem.get(`af.tools.app.abstractcode.agent.v1.${id}`) === j({ modes: { read_file: "off" } }));
  check("app read back", j(store.readApp("abstractcode.agent.v1")) === j({ read_file: "off" }));
  store.writeApp("abstractcode.agent.v1", {});
  check("an empty layer removes the entry (Use the gateway's)", !mem.has(`af.tools.app.abstractcode.agent.v1.${id}`));
  store.writeSession("s1", { write_file: "auto" });
  check("session key", mem.has(`af.tools.session.${id}.s1`));
  check("the store keeps 100 conversations", TOOL_SESSION_LAYERS_MAX === 100, String(TOOL_SESSION_LAYERS_MAX));
  for (let i = 0; i < 105; i += 1) store.writeSession(`n${i}`, { read_file: "ask" });
  check("newest 100 conversations kept", store.sessions().length === 100 && store.sessions()[0] === "n104", String(store.sessions().length));
  check("evicted conversations are deleted", !mem.has(`af.tools.session.${id}.s1`) && !mem.has(`af.tools.session.${id}.n0`) && mem.has(`af.tools.session.${id}.n5`));
  store.writeSession("n104", null);
  check("an empty session layer is removed (Use my defaults)", !mem.has(`af.tools.session.${id}.n104`) && !store.sessions().includes("n104"));
  const other = createToolLayerStore(toolIdentityKey({ gatewayUrl: "https://gw", userId: "bob" }), { storage });
  check("another identity does not see it", j(other.readSession("n103")) === "{}" && j(store.readSession("n103")) === j({ read_file: "ask" }));
  storage.setItem(`af.tools.session.${id}.junk`, "{not json");
  check("corrupt storage reads as no layer", j(store.readSession("junk")) === "{}");
  // Review F6: a corrupt index is rebuilt from the stored keys, so the 100 cap still holds.
  const mem2 = new Map();
  const enumerable = { getItem: (k) => (mem2.has(k) ? mem2.get(k) : null), setItem: (k, v) => mem2.set(k, String(v)), removeItem: (k) => mem2.delete(k), key: (i) => [...mem2.keys()][i] ?? null, get length() { return mem2.size; } };
  const s2 = createToolLayerStore(id, { storage: enumerable });
  for (let i = 0; i < 101; i += 1) s2.writeSession(`c${i}`, { read_file: "ask" });
  enumerable.setItem(`af.tools.sessions.${id}`, "{corrupt");
  s2.writeSession("after", { read_file: "off" });
  const entries = [...mem2.keys()].filter((k) => k.startsWith(`af.tools.session.${id}.`)).length;
  check("a corrupt session index is rebuilt; the cap holds", entries === 100 && s2.sessions().length === 100 && s2.sessions()[0] === "after", `${entries} entries, index ${s2.sessions().length}`);
  // A stored "approve" (another writer's dialect) is read with the declared dialect, or reported.
  storage.setItem(`af.tools.app.x.${id}`, j({ modes: { a: "approve", b: "auto" } }));
  const drops = [];
  const plain = createToolLayerStore(id, { storage, onDropped: (key, names) => drops.push([key, names]) });
  check("an unreadable stored value is reported, not silently dropped", j(plain.readApp("x")) === j({ b: "auto" }) && j(drops) === j([[`af.tools.app.x.${id}`, ["a"]]]), j(drops));
  check("…or read with the stored dialect", j(createToolLayerStore(id, { storage, dialect: "entity" }).readApp("x")) === j({ a: "ask", b: "auto" }));
  check("no storage: reads empty, writes are dropped", (() => { const s = createToolLayerStore(id, { storage: null }); s.writeApp("x", { a: "off" }); return j(s.readApp("x")) === "{}"; })());
  check("needs an identity", (() => { try { createToolLayerStore(""); return false; } catch { return true; } })());
  check("says where it saves: this browser, never the account", TOOL_LAYER_STORE_WHERE === "Saved in this browser" && !/account/i.test(TOOL_LAYER_STORE_WHERE));
  check("the editor renders the host's savedWhere", render({ savedWhere: TOOL_LAYER_STORE_WHERE }).includes("Saved in this browser"));
}

if (failures) {
  console.error(`check_tool_mode_editor: ${failures}/${checks} FAILED`);
  process.exit(1);
}
console.log(`check_tool_mode_editor: OK (${checks} checks)`);
