#!/usr/bin/env node
/**
 * The shared top-bar set (operator ruling 2026-10-29: "change the widget once, it changes
 * everywhere"): every app and the console render the SAME four kit pieces through
 * AfTopBarActions — the docs drawer button, the theme picker (Appearance), the About dialog and the
 * account widget. check_app_shell.mjs pins their order and the account's behaviour; this check
 * pins what the 2026-10-29 ruling added:
 *
 * - The About button draws the kit's `about` glyph (the ruling: "its icon is bad"), never `info`.
 *   `about` must stay legible at 16 px: its dot is WIDER than the stroke (the `info` dot, r 0.75,
 *   is narrower than its own 2-unit stem and vanishes at 16 px), and its ring is `contrast`'s ring
 *   (the neighbouring round button), so the two read as one size.
 * - Each piece's glyph, pinned: docs = book, appearance = contrast, about = about, account = user.
 * - The console's About is the kit's: the islands carry a page-owned `extra` element into the kit
 *   AfAboutDialog (the console's update controls), on `mountTopBar`'s `about` and on `mountAbout`.
 *   It is moved in while the dialog is open and put back where it was when it closes
 *   (`hostElementInto`), so the page still finds it by id while the dialog is closed.
 * Mutation-checked (see the PR): each block goes red when its behaviour is removed.
 */
import { build } from "esbuild";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

const kitDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const kit = await import(join(kitDir, "dist", "index.js"));
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
const inner = (name) => renderToStaticMarkup(h(kit.Icon, { name, size: 16 })).replace(/^<svg[^>]*>/, "").replace(/<\/svg>$/, "");

// ------------------------------------------------------------ the about glyph
{
  check("about is a kit icon", kit.ICON_NAMES.includes("about"), String(kit.ICON_NAMES));
  const about = inner("about");
  const dot = about.match(/<circle cx="12" cy="([\d.]+)" r="([\d.]+)" fill="currentColor" stroke="none"/);
  const ring = about.match(/<circle cx="12" cy="12" r="([\d.]+)"(?! fill)/);
  const contrastRing = inner("contrast").match(/<circle cx="12" cy="12" r="([\d.]+)"/);
  check("about: a filled dot", Boolean(dot), about);
  check("about: the dot is wider than the 2-unit stroke (legible at 16 px)", dot && 2 * Number(dot[2]) > 2, dot && dot[2]);
  check("about: a stem under the dot, longer than info's 4 units", /<path d="M12 (\d+(?:\.\d+)?)v(\d+(?:\.\d+)?)"/.test(about) && Number(about.match(/<path d="M12 [\d.]+v([\d.]+)"/)[1]) > 4, about);
  check("about: the stem starts below the dot", dot && Number(about.match(/<path d="M12 ([\d.]+)v/)?.[1]) - 1 > Number(dot[1]) + Number(dot[2]), about);
  check("about: the same ring as contrast (one size in the cluster)", ring && contrastRing && ring[1] === contrastRing[1], `${ring && ring[1]} vs ${contrastRing && contrastRing[1]}`);
  check("about differs from info", about !== inner("info"));
}

// ------------------------------------------------------------ the set's four glyphs, in one render
const status = { ok: true, has_session: true, gateway_url: "http://gw.local:8080", gateway: { ok: true, principal: { user_id: "alice", tenant_id: "default" } } };
const ident = kit.appIdentity("abstractflow", "1.0.0");
Object.defineProperty(globalThis, "navigator", { value: { clipboard: { writeText: async () => undefined } }, configurable: true, writable: true });
const bar = renderToStaticMarkup(
  h(kit.AfTopBarActions, {
    docs: { open: false, onToggle: noop },
    appearance: { onOpen: noop },
    about: { identity: ident },
    identity: "menu",
    connection: { phase: "connected", onConnect: noop, onDisconnect: noop, status },
  }),
);
const buttonOf = (cls) => (bar.match(new RegExp(`<button[^>]*${cls}[^>]*>([\\s\\S]*?)</button>`)) || [, ""])[1];
const glyphIn = (html) => html.replace(/^[\s\S]*?<svg[^>]*>/, "").replace(/<\/svg>[\s\S]*$/, "");
check("docs button draws book", glyphIn(buttonOf("af-topbar__btn--docs")) === inner("book"), buttonOf("af-topbar__btn--docs"));
check("appearance button draws contrast", glyphIn(buttonOf("af-topbar__btn--appearance")) === inner("contrast"), buttonOf("af-topbar__btn--appearance"));
check("About button draws the about glyph", glyphIn(buttonOf("af-topbar__btn--about")) === inner("about"), buttonOf("af-topbar__btn--about"));
check("About button never draws info", glyphIn(buttonOf("af-topbar__btn--about")) !== inner("info"));
check("account button draws user (person, name, light)", glyphIn(buttonOf("af-topbar__identity--menu")) === inner("user") && buttonOf("af-topbar__identity--menu").includes(">alice<"), buttonOf("af-topbar__identity--menu"));

// ------------------------------------------------------------ islands: a page-owned About extra
const out = await build({
  entryPoints: [join(kitDir, "islands", "console_islands.tsx")],
  bundle: true, format: "esm", platform: "node", write: false, jsx: "automatic",
  external: ["react", "react-dom", "react/jsx-runtime", "react-dom/client"],
  define: { "process.env.NODE_ENV": '"production"', __KIT_VERSION__: '"check"' },
  alias: { "@abstractframework/ui-kit": join(kitDir, "src", "index.ts") },
});
const file = join(kitDir, "islands", "dist", "check-top-bar-set.mjs");
mkdirSync(dirname(file), { recursive: true });
writeFileSync(file, out.outputFiles[0].text);
const isl = await import(pathToFileURL(file).href);

// A minimal node tree (parentNode, nextSibling, appendChild, insertBefore) for hostElementInto.
class N {
  constructor(name) { this.name = name; this.parentNode = null; this.children = []; }
  get nextSibling() { const p = this.parentNode; if (!p) return null; return p.children[p.children.indexOf(this) + 1] || null; }
  detach(n) { if (n.parentNode) { const c = n.parentNode.children; c.splice(c.indexOf(n), 1); n.parentNode = null; } }
  appendChild(n) { this.detach(n); this.children.push(n); n.parentNode = this; return n; }
  insertBefore(n, ref) { if (!ref) return this.appendChild(n); this.detach(n); this.children.splice(this.children.indexOf(ref), 0, n); n.parentNode = this; return n; }
}
const names = (p) => p.children.map((c) => c.name).join(",");
{
  check("islands export hostElementInto, hostElementEffect, islandAbout, AboutIsland, TopBarIsland", ["hostElementInto", "hostElementEffect", "islandAbout", "AboutIsland", "TopBarIsland"].every((k) => typeof isl[k] === "function"), Object.keys(isl).join(","));
  const home = new N("home"), a = new N("a"), el = new N("el"), b = new N("b"), box = new N("box");
  home.appendChild(a); home.appendChild(el); home.appendChild(b);
  const putBack = isl.hostElementInto(box, el);
  check("hosted: moved into the box (not cloned)", el.parentNode === box && names(box) === "el" && names(home) === "a,b", names(home));
  check("hosted: a put-back for an element that had a home", typeof putBack === "function");
  putBack();
  check("closed: put back in place (before its old next sibling)", el.parentNode === home && names(home) === "a,el,b", names(home));
  const again = isl.hostElementInto(box, el);
  home.children.splice(home.children.indexOf(b), 1); b.parentNode = null; // the old sibling left meanwhile
  again();
  check("closed: appended home when the old sibling is gone", el.parentNode === home && names(home) === "a,el", names(home));
  const third = isl.hostElementInto(box, el);
  const elsewhere = new N("elsewhere");
  elsewhere.appendChild(el);
  third();
  check("closed: never pulled back from where the page moved it meanwhile", el.parentNode === elsewhere);
  const orphan = new N("orphan");
  check("an element without a parent: hosted, nothing to put back", isl.hostElementInto(box, orphan) === null && orphan.parentNode === box);
  check("already in the box: no move, nothing to put back", isl.hostElementInto(box, orphan) === null && orphan.parentNode === box);
  // The effect HostElement runs: a dialog's content (restore) is put back on unmount; a keep-alive panel's is not.
  const room = new N("room"), d = new N("dialog-content"), p = new N("panel-content"), dlg = new N("dialog-box"), pan = new N("panel-box");
  room.appendChild(d); room.appendChild(p);
  const cleanup = isl.hostElementEffect(dlg, d, true);
  check("effect (restore): hosted while open", d.parentNode === dlg && typeof cleanup === "function");
  cleanup && cleanup();
  check("effect (restore): back home on unmount (the page finds it by id while closed)", d.parentNode === room);
  check("effect (keep-alive): no cleanup, stays hosted", isl.hostElementEffect(pan, p, false) === undefined && p.parentNode === pan);
  check("effect: no box yet, nothing moved", isl.hostElementEffect(null, d, true) === undefined && d.parentNode === room);
}
{
  const fakeEl = { nodeType: 1, parentNode: null, nextSibling: null };
  const mapped = isl.islandAbout({ identity: ident, versions: { framework: "1", gateway: "2" }, extra: fakeEl });
  check("islandAbout: the page element becomes the kit About's extra (a hosted element, not the raw node)", mapped && React.isValidElement(mapped.extra) && mapped.extra.props.element === fakeEl && mapped.extra.props.restore === true, mapped && String(mapped.extra));
  check("islandAbout: identity and versions pass through", mapped && mapped.identity === ident && mapped.versions.gateway === "2");
  const plain = isl.islandAbout({ identity: ident });
  check("islandAbout: no extra, no extra key", plain && !("extra" in plain));
  check("islandAbout: null hides About", isl.islandAbout(null) === undefined && isl.islandAbout(undefined) === undefined);
  const open = renderToStaticMarkup(h(isl.AboutIsland, { open: true, onClose: noop, identity: ident, extra: fakeEl }));
  check("mountAbout: the kit AfAboutDialog with the page's extra hosted in it", open.includes('role="dialog"') && open.includes("af-about") && /af-about[\s\S]*class="af-island-host af-about-host"/.test(open), open.slice(0, 400));
  const none = renderToStaticMarkup(h(isl.AboutIsland, { open: true, onClose: noop, identity: ident }));
  check("mountAbout: no extra, no host box", none.includes('role="dialog"') && !none.includes("af-about-host"));
  // TopBarIsland is hook-free: calling it returns the AfTopBarActions element it renders (the dialog
  // only renders on click, so the prop is what proves the page element reaches the kit About hosted).
  const tree = isl.TopBarIsland({ about: { identity: ident, extra: fakeEl }, connection: { phase: "connected", onConnect: noop, onDisconnect: noop } });
  const passed = tree && tree.props && tree.props.about;
  check("mountTopBar: the cluster's About gets the page element hosted (never the raw node)", tree.type && tree.type.name === "AfTopBarActions" && passed && React.isValidElement(passed.extra) && passed.extra.props.element === fakeEl && passed.extra.props.restore === true, passed && String(passed.extra));
  const topbar = renderToStaticMarkup(h(isl.TopBarIsland, { about: { identity: ident, extra: fakeEl }, identity: "menu", connection: { phase: "connected", onConnect: noop, onDisconnect: noop, me: status.gateway } }));
  check("mountTopBar: About with a page extra renders the kit About button (about glyph) and the account", glyphIn((topbar.match(/<button[^>]*af-topbar__btn--about[^>]*>([\s\S]*?)<\/button>/) || [, ""])[1]) === inner("about") && topbar.includes('data-af-identity="menu"'), topbar.slice(0, 400));
}

if (failures) {
  console.error(`check_top_bar_set: ${failures}/${checks} FAILED`);
  process.exit(1);
}
console.log(`check_top_bar_set: OK (${checks} checks: the about glyph, the set's four glyphs, the islands' page-owned About extra)`);
