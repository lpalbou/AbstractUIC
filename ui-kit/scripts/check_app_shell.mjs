#!/usr/bin/env node
/**
 * ui-primitives "shell" (backlog 0036, ADR 0001 §1 §5 §6): the top-right widget set and the
 * app shell around it.
 *
 * - ORDER (pinned): extras · docs · assistant · appearance · about · identity · pill.
 * - The pill's ONE wording: Connect / Connecting… / Disconnect / Signing out….
 * - Identity from the connection status (`status.gateway.principal`, the app-server relay of the
 *   gateway's /api/gateway/me): `principalFromConnection`, `principalLabel` (display name or user
 *   id; tenant only when not "default"), the gateway host; "badge" and "menu" (Copy user id,
 *   Sign out); nothing while signed out or without the prop (back-compat).
 * - The cluster owns the Appearance dialog when given {value, onChange}, and fetches About
 *   versions on open when given `fetch` (GET api/gateway/about), never when given `versions`.
 * - `--af-topbar-h`: the cluster publishes its header's bottom edge (ResizeObserver);
 *   `topOffset: "auto"` reads it (AfDrawer, AfDrawerSystem, AfAppShell).
 * - AfDrawer: focus moves to an autofocus / text field / first control on open.
 * - AfAppShell: header (data-af-topbar) · brand · leading · cluster; the drawer system wraps the
 *   content; the nav is docked on wide screens.
 * Mutation-checked (see the PR): each block goes red when its behaviour is removed.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { mountHook, find } from "./hook_harness.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const kit = await import(join(root, "dist", "index.js"));
const h = React.createElement;
let failures = 0;
let checks = 0;
function check(name, cond, detail) {
  checks += 1;
  if (cond) return;
  failures += 1;
  console.error(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`);
}
const noop = () => {};
const { AfTopBarActions, AfAppShell, AfDrawer, AfAppearanceDialog, AfAboutDialog, AfMenu, appIdentity, principalFromConnection, principalLabel, gatewayHostLabel, topBarPillText, identityTitle, useAfTopBarHeight, drawerTop, drawerFocusTarget, AF_TOPBAR_HEIGHT_VAR } = kit;
for (const [name, fn] of Object.entries({ AfTopBarActions, AfAppShell, principalFromConnection, principalLabel, gatewayHostLabel, topBarPillText, identityTitle, useAfTopBarHeight, drawerTop, drawerFocusTarget })) check(`export ${name}`, typeof fn === "function", typeof fn);

const status = (principal, extra = {}) => ({ ok: true, has_session: true, gateway_url: "http://gw.local:8080", gateway: { ok: true, principal, auth: { mode: "users", user_auth_enabled: true }, routing: { mode: "per-principal", one_user_one_runtime: true } }, ...extra });
const alice = { user_id: "alice", tenant_id: "default", roles: ["user"], scopes: ["*"], token_fingerprint: "fp", runtime_id: "alice", source: "session", admin: false };

// ------------------------------------------------------------ principal
{
  const p = principalFromConnection(status(alice));
  check("principal: mapped from status.gateway.principal", p && p.userId === "alice" && p.tenantId === "default" && p.runtimeId === "alice" && p.source === "session" && p.admin === false && p.roles.join() === "user", JSON.stringify(p));
  check("principal: no invented fields", p && !("displayName" in p) && !("email" in p) && !("avatarUrl" in p), JSON.stringify(p));
  check("principal: null without a session", principalFromConnection({ ok: false, has_session: false, gateway_url: "x", gateway: { ok: false, error: "Gateway sign-in required" } }) === null);
  check("principal: null for a rejected session (ok false)", principalFromConnection({ ...status(alice), ok: false }) === null);
  check("principal: null without a user id", principalFromConnection(status({ tenant_id: "acme" })) === null);
  check("principal: null before the probe", principalFromConnection(null) === null);
  check("label: user id, default tenant hidden", principalLabel(p) === "alice", principalLabel(p));
  check("label: tenant shown when not default", principalLabel({ userId: "bob", tenantId: "acme" }) === "acme/bob");
  check("label: display name wins over the user id", principalLabel({ userId: "u1", displayName: "Ada" }) === "Ada");
  check("host: from gateway_url", gatewayHostLabel("http://gw.local:8080/") === "gw.local:8080" && gatewayHostLabel("") === "" && gatewayHostLabel("not a url") === "not a url");
  check("identity title", identityTitle(p, "https://gw.example.com") === "Signed in as alice · gateway gw.example.com", identityTitle(p, "https://gw.example.com"));
}

// ------------------------------------------------------------ pill wording (ONE set)
{
  const w = (phase, so) => topBarPillText(phase, so).label;
  check("pill: Connect", w("disconnected", false) === "Connect");
  check("pill: Connecting…", w("loading", false) === "Connecting…");
  check("pill: Disconnect", w("connected", false) === "Disconnect");
  check("pill: Signing out…", w("connected", true) === "Signing out…");
  check("pill titles", topBarPillText("connected", false).title === "Disconnect from gateway" && topBarPillText("loading", false).title === "Checking gateway session…" && topBarPillText("disconnected", false).title === "Connect to gateway");
  for (const [phase, label] of [["disconnected", "Connect"], ["loading", "Connecting…"], ["connected", "Disconnect"]]) {
    const html = renderToStaticMarkup(h(AfTopBarActions, { connection: { phase, onConnect: noop, onDisconnect: noop } }));
    check(`pill renders ${label}`, html.includes(`<span class="af-topbar__pill-label">${label}</span>`) && html.includes(`af-topbar__dot--${phase}`), html);
  }
  const out = renderToStaticMarkup(h(AfTopBarActions, { connection: { phase: "connected", signingOut: true, onConnect: noop, onDisconnect: noop } }));
  check("pill renders Signing out… (disabled)", out.includes(">Signing out…</span>") && /af-topbar__pill[^>]*disabled/.test(out), out);
}

// ------------------------------------------------------------ order + identity
Object.defineProperty(globalThis, "navigator", { value: { clipboard: { writeText: async () => undefined } }, configurable: true, writable: true });
const ident = appIdentity("abstractflow", "1.0.0");
const full = (identity, conn) =>
  renderToStaticMarkup(
    h(AfTopBarActions, {
      extraActions: h("span", { id: "x-extra" }),
      docs: { open: false, onToggle: noop },
      assistant: { open: false, onToggle: noop },
      appearance: { onOpen: noop },
      about: { identity: ident },
      identity,
      connection: conn || { phase: "connected", onConnect: noop, onDisconnect: noop, status: status(alice) },
    }),
  );
{
  const html = full("badge");
  const marks = ['id="x-extra"', "af-topbar__btn--docs", "af-topbar__btn--assistant", "af-topbar__btn--appearance", "af-topbar__btn--about", 'data-af-identity="badge"', "af-topbar__pill"];
  const at = marks.map((m) => html.indexOf(m));
  check("ORDER extras · docs · assistant · appearance · about · identity · pill", at.every((v, i) => v >= 0 && (i === 0 || v > at[i - 1])), JSON.stringify(at));
  check("badge: label + title with the gateway host", html.includes(">alice</span>") && html.includes('title="Signed in as alice · gateway gw.local:8080"'), html);
  const menu = full("menu");
  const mat = ["af-topbar__btn--about", 'data-af-identity="menu"', "af-topbar__pill"].map((m) => menu.indexOf(m));
  check("ORDER (menu): about · identity · pill", mat.every((v, i) => v >= 0 && (i === 0 || v > mat[i - 1])), JSON.stringify(mat));
  check("menu: a menu button labelled with who and where", menu.includes('aria-haspopup="menu"') && menu.includes('aria-label="Account: Signed in as alice · gateway gw.local:8080"'), menu);
  check("menu: header says who and which gateway", menu.includes("Signed in as alice") && menu.includes("Gateway gw.local:8080") && menu.includes('class="af-menu__header"'), menu);
  check("menu: Copy user id + Sign out", menu.includes('data-menu-id="copy-user-id"') && menu.includes(">Copy user id<") && menu.includes('data-menu-id="sign-out"') && menu.includes(">Sign out<"), menu);
  check("menu: Sign out is the danger item", /af-menu__item--danger"[^>]*>Sign out</.test(menu) || /data-menu-id="sign-out"[^>]*class="af-menu__item af-menu__item--danger"/.test(menu), menu);
  check("identity: tenant shown when not default", full("badge", { phase: "connected", onConnect: noop, onDisconnect: noop, status: status({ ...alice, tenant_id: "acme" }) }).includes(">acme/alice</span>"));
  check("identity: nothing while signed out", !full("menu", { phase: "disconnected", onConnect: noop, onDisconnect: noop, status: { ok: false, has_session: false, gateway_url: "x" } }).includes("data-af-identity"));
  check("identity: nothing without the prop (back-compat)", !full(undefined).includes("data-af-identity") && !full(false).includes("data-af-identity"));
  Object.defineProperty(globalThis, "navigator", { value: {}, configurable: true, writable: true });
  check("menu: no Copy user id without a clipboard (no dead items)", !full("menu").includes("copy-user-id") && full("menu").includes(">Sign out<"));
  Object.defineProperty(globalThis, "navigator", { value: { clipboard: { writeText: async () => undefined } }, configurable: true, writable: true });
}

// The menu's Sign out and the pill are the SAME disconnect: hook signOut, then the host's onSignOut.
{
  const order = [];
  const hookConn = { status: status(alice), phase: "connected", connected: true, modalOpen: false, signingOut: false, signOutError: null, openModal: () => order.push("open"), refresh: async () => {}, signOut: async () => void order.push("signOut"), modalProps: {} };
  const t = mountHook(AfTopBarActions, { connection: hookConn, identity: "menu", onSignOut: () => order.push("onSignOut") });
  const menu = find(t.current, (n) => n.type === AfMenu);
  const signOutItem = menu?.props.items.find((i) => i.id === "sign-out");
  signOutItem?.onSelect();
  await new Promise((r) => setImmediate(r));
  check("menu Sign out: hook signOut then onSignOut", JSON.stringify(order) === JSON.stringify(["signOut", "onSignOut"]), JSON.stringify(order));
  order.length = 0;
  const pill = find(t.current, (n) => typeof n.props.className === "string" && n.props.className.startsWith("af-topbar__pill"));
  pill.props.onClick();
  await new Promise((r) => setImmediate(r));
  check("pill Disconnect: the same sign-out", JSON.stringify(order) === JSON.stringify(["signOut", "onSignOut"]), JSON.stringify(order));
  t.rerender({ connection: { ...hookConn, phase: "disconnected", connected: false, status: null } });
  order.length = 0;
  find(t.current, (n) => typeof n.props.className === "string" && n.props.className.startsWith("af-topbar__pill")).props.onClick();
  check("pill Connect: opens the hook's modal", JSON.stringify(order) === JSON.stringify(["open"]), JSON.stringify(order));
}

// ------------------------------------------------------------ appearance + about owned by the cluster
{
  let value = { theme: "dark", font_scale: "md", header_density: "standard" };
  const t = mountHook(AfTopBarActions, { connection: { phase: "connected", onConnect: noop, onDisconnect: noop }, appearance: { value, onChange: (v) => (value = v) } });
  const dlg = () => find(t.current, (n) => n.type === AfAppearanceDialog);
  check("appearance {value,onChange}: the cluster renders the dialog (closed)", dlg() && dlg().props.open === false);
  find(t.current, (n) => typeof n.props.className === "string" && n.props.className.includes("af-topbar__btn--appearance")).props.onClick();
  t.render();
  check("appearance: the button opens the owned dialog", dlg()?.props.open === true && dlg().props.value === value);
  dlg().props.onChange({ ...value, theme: "light" });
  check("appearance: changes go to the host", value.theme === "light");
  const legacy = mountHook(AfTopBarActions, { connection: { phase: "connected", onConnect: noop, onDisconnect: noop }, appearance: { onOpen: noop } });
  check("appearance {onOpen}: no owned dialog (host keeps its own)", !find(legacy.current, (n) => n.type === AfAppearanceDialog));
}
{
  const calls = [];
  const fetchGateway = async (path) => (calls.push(path), { ok: true, status: 200, json: async () => ({ abstractframework: "0.2.0", abstractgateway: "0.16.0" }) });
  const t = mountHook(AfTopBarActions, { connection: { phase: "connected", onConnect: noop, onDisconnect: noop }, about: { identity: ident, fetch: fetchGateway, extra: h("i", { id: "x-extra-about" }) } });
  const dlg = () => find(t.current, (n) => n.type === AfAboutDialog);
  check("about fetch: nothing fetched before open", calls.length === 0);
  check("about extra: passed to the dialog", dlg()?.props.extra?.props?.id === "x-extra-about");
  find(t.current, (n) => typeof n.props.className === "string" && n.props.className.includes("af-topbar__btn--about")).props.onClick();
  t.render();
  check("about fetch: checking… while in flight", dlg()?.props.open === true && dlg().props.versions?.gatewayNote === "checking…", JSON.stringify(dlg()?.props.versions));
  await t.settle();
  check("about fetch: GET api/gateway/about on open", calls.length === 1 && calls[0] === "api/gateway/about", JSON.stringify(calls));
  check("about fetch: versions shown", dlg()?.props.versions?.gateway === "0.16.0" && dlg().props.versions.framework === "0.2.0", JSON.stringify(dlg()?.props.versions));
  const calls2 = [];
  const t2 = mountHook(AfTopBarActions, { connection: { phase: "connected", onConnect: noop, onDisconnect: noop }, about: { identity: ident, versions: { gateway: "9.9.9" }, fetch: async (p) => (calls2.push(p), { ok: true, status: 200, json: async () => ({}) }) } });
  find(t2.current, (n) => typeof n.props.className === "string" && n.props.className.includes("af-topbar__btn--about")).props.onClick();
  await t2.settle();
  check("about: host versions win, no fetch", calls2.length === 0 && find(t2.current, (n) => n.type === AfAboutDialog)?.props.versions?.gateway === "9.9.9");
}

// ------------------------------------------------------------ --af-topbar-h + topOffset "auto"
{
  check("var name", AF_TOPBAR_HEIGHT_VAR === "--af-topbar-h");
  check("AfDrawer topOffset auto reads the var", drawerTop("auto") === "var(--af-topbar-h, 0px)" && drawerTop(48) === 48 && drawerTop(undefined) === 0);
  const auto = renderToStaticMarkup(h(AfDrawer, { open: true, onClose: noop, label: "Docs", topOffset: "auto" }, "x"));
  check("AfDrawer topOffset auto: top = var(--af-topbar-h)", auto.includes("top:var(--af-topbar-h, 0px)") && auto.includes("af-drawer--offset"), auto);
  check("drawer system topOffset auto", kit.railDrawerTopOffset("auto") === "var(--af-topbar-h, 0px)" && kit.railDrawerTopOffset(40) === "40px" && kit.railDrawerTopOffset(undefined) === undefined);
  const css = readFileSync(join(root, "src", "theme.css"), "utf8");
  check("css: anchored overlay uses the published offset", /\.af-rail--anchored \.af-rail__panel-wrap,\s*\.af-rail--anchored \.af-rail__backdrop\s*\{[^}]*position: fixed;[^}]*top: var\(--af-drawers-top, 0px\)/.test(css));
  // Publication: a fake DOM (the harness has none).
  const set = [];
  let roCb = null;
  let bottom = 52.4;
  const header = { getBoundingClientRect: () => ({ bottom }) };
  const el = { closest: (sel) => (sel.includes("[data-af-topbar]") ? header : null), parentElement: null };
  const listeners = [];
  globalThis.window = { addEventListener: (e, f) => listeners.push([e, f]), removeEventListener: (e, f) => listeners.splice(listeners.findIndex((l) => l[1] === f), 1) };
  globalThis.document = { documentElement: { style: { setProperty: (k, v) => set.push([k, v]) } } };
  globalThis.ResizeObserver = class {
    constructor(cb) {
      roCb = cb;
    }
    observe(target) {
      this.target = target;
    }
    disconnect() {
      roCb = null;
    }
  };
  const t = mountHook(() => useAfTopBarHeight({ current: el }, true));
  check("publish: the header's bottom edge, rounded", set.length === 1 && set[0][0] === "--af-topbar-h" && set[0][1] === "52px", JSON.stringify(set));
  bottom = 61;
  roCb?.();
  check("publish: a header resize republishes", set.length === 2 && set[1][1] === "61px", JSON.stringify(set));
  check("publish: listens to window resize", listeners.some(([e]) => e === "resize"));
  t.unmount();
  check("publish: unmount stops observing", roCb === null && listeners.length === 0);
  set.length = 0;
  mountHook(() => useAfTopBarHeight({ current: el }, false));
  check("publish: disabled = nothing published", set.length === 0);
  delete globalThis.window;
  delete globalThis.document;
  delete globalThis.ResizeObserver;
}

// ------------------------------------------------------------ AfDrawer focus target
{
  const mk = (map) => ({ querySelector: (sel) => map[sel] ?? null });
  const auto = { id: "auto" };
  const ta = { id: "textarea" };
  const btn = { id: "button" };
  const body = (m) => mk(m);
  const drawer = (m) => mk({ ".af-drawer__body": body(m) });
  check("focus: [data-autofocus] first", drawerFocusTarget(drawer({ "[data-autofocus]": auto, "textarea:not(:disabled)": ta }))?.id === "auto");
  check("focus: then a text field (the composer)", drawerFocusTarget(drawer({ "textarea:not(:disabled)": ta }))?.id === "textarea");
  const anyFocusable = (m) => ({ querySelector: (s) => (s === ".af-drawer__body" ? { querySelector: (q) => (q.startsWith("button") ? btn : m[q] ?? null) } : null) });
  check("focus: then the first control", drawerFocusTarget(anyFocusable({}))?.id === "button");
  const empty = drawer({});
  check("focus: else the drawer itself", drawerFocusTarget(empty) === empty);
  const src = readFileSync(join(root, "src", "af_drawer.tsx"), "utf8");
  check("focus: AfDrawer moves focus in and restores the opener", src.includes("drawerFocusTarget(el)?.focus(") && src.includes("back.focus?.("), "af_drawer.tsx");
}

// ------------------------------------------------------------ AfAppShell
{
  const panels = [{ id: "files", label: "Files", icon: "folder", content: h("p", null, "FILES") }];
  const html = renderToStaticMarkup(
    h(
      AfAppShell,
      {
        topBar: { brand: { name: "AbstractFlow", mark: h("b", { id: "x-mark" }) }, leading: h("span", { id: "x-lead" }), connection: { phase: "connected", onConnect: noop, onDisconnect: noop, status: status(alice) }, identity: "badge", docs: { open: false, onToggle: noop } },
        drawers: { panels, active: "files", onActiveChange: noop, ariaLabel: "Panels", overlay: false },
        nav: { label: "Navigation", content: h("ul", { id: "x-nav" }) },
      },
      h("div", { id: "x-main" }, "MAIN"),
    ),
  );
  const at = ['data-af-topbar=""', 'id="x-mark"', "AbstractFlow", 'id="x-lead"', "af-topbar__btn--docs", 'data-af-identity="badge"', "af-topbar__pill"].map((m) => html.indexOf(m));
  check("shell: header = brand · leading · cluster (in order)", at.every((v, i) => v >= 0 && (i === 0 || v > at[i - 1])), JSON.stringify(at));
  check("shell: docked nav on wide screens", /<nav class="af-shell__nav" aria-label="Navigation"[^>]*><ul id="x-nav">/.test(html), html);
  const main = html.indexOf('id="x-main"');
  check("shell: the drawer system wraps the content (main between the sides)", html.includes('class="af-drawers"') && html.indexOf("af-drawers__main") < main && main < html.indexOf('role="tablist"') && html.includes("FILES"), html);
  check("shell: nav content mounted once", (html.match(/id="x-nav"/g) || []).length === 1);
  const bare = renderToStaticMarkup(h(AfAppShell, { topBar: { connection: { phase: "loading", onConnect: noop, onDisconnect: noop } } }, "C"));
  check("shell: no drawers = plain main", bare.includes('<main class="af-shell__main">C</main>') && !bare.includes("af-drawers"), bare);
}

console.log(`check_app_shell: ${checks - failures}/${checks} checks passed`);
if (failures) process.exit(1);
