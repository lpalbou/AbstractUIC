#!/usr/bin/env node
/**
 * AfMenu / bindAfMenu / af-modal--wide checks (ui-kit 0.4.0, round 3; docs/modal.md "Menu").
 *
 * 1. bindAfMenu over a minimal fake DOM (dependency-free, like check_modal):
 *    ARIA wiring, click / Enter / ArrowDown / ArrowUp open, arrow / Home / End
 *    movement with wrap, Escape closes and returns focus (and, taken at the
 *    window capture phase, leaves an enclosing bindAfModal open), Tab closes
 *    without stealing focus, an outside press closes, choosing an item closes
 *    and returns focus unless the item moved it, hidden/disabled items are
 *    skipped, release() unbinds.
 * 2. afMenuPlacement: below by default, flips upward / leftward at the edges,
 *    clamps inside the viewport.
 * 3. AfMenu SSR markup: labelled button, role=menu list hidden, role=menuitem
 *    items, danger class, hidden items left out, no disabled item, nothing
 *    rendered without items.
 * 4. CSS contract (theme.css): .af-menu__list fixed + --z-popover, 44 px touch
 *    targets, no disabled styling, .af-modal--wide width and phone sheet.
 * 5. The islands entry exports bindMenu (check_islands evaluates the bundle).
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const kit = await import(join(root, "dist", "index.js"));
const { AfMenu, bindAfMenu, afMenuPlacement, bindAfModal } = kit;

let failures = 0;
let checks = 0;
function check(name, cond, detail) {
  checks += 1;
  if (cond) return;
  failures += 1;
  console.error(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`);
}

// ------------------------------------------------------------ minimal fake DOM
class FakeEl {
  constructor(doc, tag, attrs = {}, children = []) {
    this.ownerDocument = doc;
    this.tag = tag;
    this.attrs = { ...attrs };
    this.children = [];
    this.parent = null;
    this.listeners = {};
    this.isConnected = true;
    this.style = {};
    this.rect = { top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0 };
    const cls = new Set(String(attrs.class || "").split(/\s+/).filter(Boolean));
    this.classList = { add: (c) => cls.add(c), remove: (c) => cls.delete(c), contains: (c) => cls.has(c) };
    for (const c of children) this.append(c);
  }
  get hidden() { return this.attrs.hidden !== undefined; }
  set hidden(v) { if (v) this.attrs.hidden = ""; else delete this.attrs.hidden; }
  append(c) { c.parent = this; this.children.push(c); return c; }
  getAttribute(n) { return this.attrs[n] ?? null; }
  setAttribute(n, v) { this.attrs[n] = String(v); }
  hasAttribute(n) { return this.attrs[n] !== undefined; }
  removeAttribute(n) { delete this.attrs[n]; }
  contains(n) { for (let x = n; x; x = x.parent) if (x === this) return true; return false; }
  matches(sel) {
    if (sel.startsWith(".")) return this.classList.contains(sel.slice(1));
    throw new Error(`fake DOM cannot match ${sel}`);
  }
  closest(sel) { for (let x = this; x && x instanceof FakeEl; x = x.parent) if (x.matches(sel)) return x; return null; }
  descendants() { return this.children.flatMap((c) => [c, ...c.descendants()]); }
  querySelectorAll(sel) { return this.descendants().filter((d) => d.matches(sel)); }
  querySelector(sel) { return this.querySelectorAll(sel)[0] || null; }
  getBoundingClientRect() { return this.rect; }
  focus() { this.ownerDocument.activeElement = this; }
  addEventListener(t, f, cap) { (this.listeners[t] ||= []).push({ f, cap: !!cap }); }
  removeEventListener(t, f, cap) { this.listeners[t] = (this.listeners[t] || []).filter((g) => !(g.f === f && g.cap === !!cap)); }
}
function mkEvent(type, target, props) {
  const e = { type, target, defaultPrevented: false, propagationStopped: false, preventDefault() { e.defaultPrevented = true; }, stopPropagation() { e.propagationStopped = true; }, ...props };
  return e;
}
function mkWorld(width = 1440, height = 900) {
  const win = { innerWidth: width, innerHeight: height, listeners: {} };
  const doc = { listeners: {}, activeElement: null, defaultView: win };
  const on = (o) => {
    o.addEventListener = (t, f, cap) => (o.listeners[t] ||= []).push({ f, cap: !!cap });
    o.removeEventListener = (t, f, cap) => (o.listeners[t] = (o.listeners[t] || []).filter((g) => !(g.f === f && g.cap === !!cap)));
  };
  on(win);
  on(doc);
  doc.documentElement = new FakeEl(doc, "html");
  doc.body = doc.documentElement.append(new FakeEl(doc, "body"));
  doc.activeElement = doc.body;
  // Dispatch: window capture, document capture, then bubble from the target up (target, ancestors, document).
  const dispatch = (type, target, props = {}) => {
    const e = mkEvent(type, target, props);
    const run = (o, phaseCap) => {
      for (const l of [...(o.listeners[type] || [])]) if (l.cap === phaseCap || (phaseCap === null)) l.f(e);
    };
    run(win, true);
    run(doc, true);
    const path = [];
    for (let x = target; x && x instanceof FakeEl; x = x.parent) path.push(x);
    for (const el of path) { if (e.propagationStopped) break; for (const l of [...(el.listeners[type] || [])]) l.f(e); }
    if (!e.propagationStopped) run(doc, false);
    return e;
  };
  return { win, doc, dispatch, key: (k, extra = {}) => dispatch("keydown", doc.activeElement, { key: k, ...extra }) };
}
const E = (doc, tag, attrs, ...children) => new FakeEl(doc, tag, attrs, children);
function mkMenu(w, { labels = ["Workspace", "Rotate token", "Archive"], extra = [] } = {}) {
  const { doc } = w;
  const button = E(doc, "button", { class: "af-menu__button", id: "more" });
  const items = labels.map((l, i) => E(doc, "button", { class: "af-menu__item", id: `item${i}` }));
  const list = E(doc, "div", { class: "af-menu__list" }, ...items, ...extra);
  const wrap = E(doc, "div", { class: "af-menu" }, button, list);
  doc.body.append(wrap);
  button.rect = { top: 100, bottom: 132, left: 1300, right: 1332, width: 32, height: 32 };
  list.rect = { top: 0, left: 0, right: 200, bottom: 120, width: 200, height: 120 };
  return { button, list, items };
}
const click = (w, el) => { w.dispatch("pointerdown", el); w.dispatch("mousedown", el); return w.dispatch("click", el); };

// 1a) ARIA + open/close by click + keys
{
  const w = mkWorld();
  const { button, list, items } = mkMenu(w);
  let opened = 0;
  let closed = 0;
  const release = bindAfMenu(button, list, { document: w.doc, onOpen: () => (opened += 1), onClose: () => (closed += 1) });
  check("button gets aria-haspopup=menu", button.attrs["aria-haspopup"] === "menu");
  check("button starts aria-expanded=false", button.attrs["aria-expanded"] === "false");
  check("list gets an id and the button aria-controls it", !!list.attrs.id && button.attrs["aria-controls"] === list.attrs.id);
  check("list gets role=menu and starts hidden", list.attrs.role === "menu" && list.hidden);
  check("items get role=menuitem + tabindex=-1", items.every((i) => i.attrs.role === "menuitem" && i.attrs.tabindex === "-1"));
  button.focus();
  click(w, button);
  check("click opens: list shown, aria-expanded=true, onOpen", !list.hidden && button.attrs["aria-expanded"] === "true" && opened === 1);
  check("open focuses the first item", w.doc.activeElement === items[0]);
  check("open places the list (fixed coordinates) and flips leftward at the right edge", list.style.left === "1132px" && list.style.top === "136px" && list.attrs["data-placement"] === "bottom-end", JSON.stringify(list.style) + list.attrs["data-placement"]);
  w.key("ArrowDown");
  check("ArrowDown moves to the next item", w.doc.activeElement === items[1]);
  w.key("ArrowDown"); w.key("ArrowDown");
  check("ArrowDown wraps to the first", w.doc.activeElement === items[0]);
  w.key("ArrowUp");
  check("ArrowUp wraps to the last", w.doc.activeElement === items[2]);
  w.key("Home");
  check("Home jumps to the first", w.doc.activeElement === items[0]);
  w.key("End");
  check("End jumps to the last", w.doc.activeElement === items[2]);
  const esc = w.key("Escape");
  check("Escape closes, returns focus to the button, is consumed", list.hidden && w.doc.activeElement === button && esc.defaultPrevented && closed === 1);
  w.key("ArrowDown");
  check("ArrowDown on the button opens on the first item", !list.hidden && w.doc.activeElement === items[0]);
  w.key("Escape");
  w.key("ArrowUp");
  check("ArrowUp on the button opens on the last item", !list.hidden && w.doc.activeElement === items[2]);
  w.key("Escape");
  w.key("Enter");
  check("Enter on the button opens", !list.hidden && w.doc.activeElement === items[0]);
  w.key("Tab");
  check("Tab closes without pulling focus back to the button", list.hidden && w.doc.activeElement === items[0]);
  button.focus();
  click(w, button);
  click(w, button);
  check("a second click on the button closes", list.hidden && w.doc.activeElement === button);
  click(w, button);
  const outside = w.doc.body.append(E(w.doc, "input", { id: "outside" }));
  outside.focus();
  w.dispatch("pointerdown", outside);
  check("a press outside closes; focus stays where the press put it", list.hidden && w.doc.activeElement === outside);
  button.focus();
  click(w, button);
  click(w, items[1]);
  check("choosing an item closes and returns focus to the button", list.hidden && w.doc.activeElement === button);
  click(w, button);
  items[0].addEventListener("click", () => outside.focus());
  click(w, items[0]);
  check("an item that moves focus (opens a modal) keeps it", list.hidden && w.doc.activeElement === outside);
  button.focus();
  click(w, button);
  w.dispatch("resize", w.win);
  for (const l of [...(w.win.listeners.resize || [])]) l.f(mkEvent("resize", w.win, {}));
  check("a resize closes", list.hidden);
  release();
  click(w, button);
  check("after release the button no longer opens and listeners are gone", list.hidden && !(w.win.listeners.keydown || []).length && !(w.doc.listeners.pointerdown || []).length);
  release();
  check("release is idempotent", list.hidden);
}
// 1b) hidden / disabled items are skipped; items re-read at use time
{
  const w = mkWorld();
  const { button, list, items } = mkMenu(w);
  items[0].hidden = true;
  items[2].setAttribute("disabled", "");
  bindAfMenu(button, list, { document: w.doc });
  button.focus();
  click(w, button);
  check("hidden and disabled items are not focus stops", w.doc.activeElement === items[1]);
  w.key("ArrowDown");
  check("movement skips them (single stop wraps onto itself)", w.doc.activeElement === items[1]);
  w.key("Escape");
  const added = list.append(E(w.doc, "button", { class: "af-menu__item", id: "late" }));
  click(w, button);
  w.key("End");
  check("an item added after binding is picked up (and gets role=menuitem)", w.doc.activeElement === added && added.attrs.role === "menuitem");
}
// 1c) Escape in a menu inside a bound modal closes the menu only
{
  const w = mkWorld();
  const { doc } = w;
  const body = E(doc, "div", { class: "af-modal__body" });
  const dialog = E(doc, "div", { class: "af-modal", role: "dialog" }, body);
  const backdrop = E(doc, "div", { class: "af-modal-backdrop" }, dialog);
  doc.body.append(backdrop);
  const button = body.append(E(doc, "button", { class: "af-menu__button" }));
  const item = E(doc, "button", { class: "af-menu__item" });
  const list = body.append(E(doc, "div", { class: "af-menu__list" }, item));
  button.rect = { top: 100, bottom: 132, left: 100, right: 132, width: 32, height: 32 };
  list.rect = { width: 200, height: 80 };
  // bindAfModal uses querySelector with attribute selectors; give it a tolerant matcher.
  const origMatches = FakeEl.prototype.matches;
  FakeEl.prototype.matches = function (sel) {
    return sel.split(/,\s*/).some((s) => {
      s = s.trim();
      if (/^\.[a-z_-]+$/i.test(s)) return this.classList.contains(s.slice(1));
      if (s.startsWith("button")) return this.tag === "button" && !this.hasAttribute("disabled");
      if (s.startsWith("[data-af-autofocus]") || s.startsWith("[autofocus]")) return this.hasAttribute(s.slice(1, -1));
      return false;
    });
  };
  doc.documentElement.classList = doc.documentElement.classList;
  let modalClosed = 0;
  const releaseModal = bindAfModal(backdrop, { onClose: () => (modalClosed += 1), document: doc, lockScroll: false });
  bindAfMenu(button, list, { document: doc });
  button.focus();
  click(w, button);
  check("menu inside modal opens", !list.hidden && doc.activeElement === item);
  w.key("Escape");
  check("Escape closes the menu and NOT the enclosing modal", list.hidden && modalClosed === 0 && doc.activeElement === button, `modalClosed=${modalClosed}`);
  w.key("Escape");
  check("the next Escape closes the modal", modalClosed === 1);
  releaseModal();
  FakeEl.prototype.matches = origMatches;
}

// 2) placement
{
  const vp = { width: 1440, height: 900 };
  const size = { width: 200, height: 160 };
  let p = afMenuPlacement({ top: 100, bottom: 132, left: 400, right: 432 }, size, vp);
  check("below + start by default", p.top === 136 && p.left === 400 && !p.up && !p.leftward, JSON.stringify(p));
  p = afMenuPlacement({ top: 800, bottom: 832, left: 400, right: 432 }, size, vp);
  check("flips upward near the bottom", p.up && p.top === 800 - 4 - 160, JSON.stringify(p));
  p = afMenuPlacement({ top: 100, bottom: 132, left: 1400, right: 1432 }, size, vp);
  check("flips leftward near the right edge (right edges aligned)", p.leftward && p.left === 1432 - 200, JSON.stringify(p));
  p = afMenuPlacement({ top: 100, bottom: 132, left: 10, right: 42 }, { width: 360, height: 100 }, { width: 390, height: 844 });
  check("clamped inside a phone viewport", p.left >= 8 && p.left + 360 <= 390 - 8, JSON.stringify(p));
  p = afMenuPlacement({ top: 20, bottom: 52, left: 10, right: 42 }, { width: 200, height: 2000 }, { width: 390, height: 844 });
  check("never above the top margin", p.top >= 8, JSON.stringify(p));
}

// 3) AfMenu markup
{
  const html = renderToStaticMarkup(
    React.createElement(AfMenu, {
      label: "More actions for alice",
      title: "Entities have no token to rotate",
      items: [
        { id: "workspace", label: "Workspace", onSelect() {} },
        { id: "rotate", label: "Rotate token", onSelect() {}, hidden: true },
        { id: "archive", label: "Archive", danger: true, onSelect() {} },
      ],
    }),
  );
  check("AfMenu: wrapper .af-menu", html.startsWith('<div class="af-menu">'), html.slice(0, 60));
  check("AfMenu: labelled button with aria-haspopup", /<button type="button" class="af-menu__button" aria-label="More actions for alice" title="Entities have no token to rotate" aria-haspopup="menu" aria-expanded="false">/.test(html), html);
  check("AfMenu: list role=menu, hidden", /<div class="af-menu__list" role="menu" hidden="">/.test(html), html);
  check("AfMenu: items role=menuitem", (html.match(/role="menuitem"/g) || []).length === 2);
  check("AfMenu: hidden item left out", !html.includes("Rotate token"));
  check("AfMenu: danger class", /class="af-menu__item af-menu__item--danger"[^>]*>Archive</.test(html), html);
  check("AfMenu: no disabled item ever", !html.includes("disabled"));
  const none = renderToStaticMarkup(React.createElement(AfMenu, { label: "x", items: [{ id: "a", label: "A", onSelect() {}, hidden: true }] }));
  check("AfMenu: nothing rendered without a visible item", none === "");
}

// 4) CSS contract
{
  const css = readFileSync(join(root, "src", "theme.css"), "utf8");
  const block = (css.split("/* af-menu:begin")[1] || "").split("/* af-menu:end */")[0];
  check("theme.css has the af-menu block", block.length > 200);
  const rule = (sel) => { const m = block.match(new RegExp(`(^|\\n)${sel.replace(/[.[\]"=]/g, "\\$&")} \\{([^}]*)\\}`)); return m ? m[2] : ""; };
  const list = rule(".af-menu__list");
  check(".af-menu__list is position: fixed above modals", /position: fixed;/.test(list) && /z-index: var\(--z-popover/.test(list), list);
  check(".af-menu__list uses a solid surface + kit tokens", /background: var\(--bg-secondary\)/.test(list) && /border: 1px solid var\(--ui-border-2\)/.test(list));
  check(".af-menu__list[hidden] is display none", /display: none/.test(rule('.af-menu__list[hidden]')));
  check("touch: button and items use --tap-min (44 px)", /@media \(pointer: coarse\)[\s\S]*\.af-menu__button \{[^}]*min-width: var\(--tap-min\)[^}]*height: var\(--tap-min\)[\s\S]*\.af-menu__item \{[^}]*min-height: var\(--tap-min\)/.test(block));
  check("no disabled item styling (unavailable actions are not rendered)", !/disabled/.test(block.slice(block.indexOf("*/") + 2).replace(/\/\*[\s\S]*?\*\//g, "")));
  check(".af-menu__item is a left-aligned full-width row (hosts' centred buttons do not leak in)", /justify-content: flex-start;/.test(rule(".af-menu__item")) && /text-align: left;/.test(rule(".af-menu__item")) && /width: 100%;/.test(rule(".af-menu__item")));
  check(".af-menu__item--danger uses --error", /color: var\(--error\)/.test(rule(".af-menu__item--danger")));
  check(".af-modal--wide is min(1120px, 100vw - 32px)", /\.af-modal--wide \{\s*width: min\(1120px, calc\(100vw - 32px\)\);\s*\}/.test(css));
  check(".af-modal--wide becomes the full-screen sheet on phones", /@media \(max-width: 767\.98px\)[\s\S]*\n  \.af-modal--wide \{\s*width: 100%;\s*\}/.test(css));
  const modalHtml = renderToStaticMarkup(React.createElement(kit.AfModal, { open: true, onClose() {}, title: "Manage", size: "wide", portal: false, id: "m" }));
  check("AfModal size=wide renders af-modal--wide", modalHtml.includes('class="af-modal af-modal--wide"'), modalHtml.slice(0, 120));
}

// 5) islands export
{
  const src = readFileSync(join(root, "islands", "console_islands.tsx"), "utf8");
  check("islands import bindAfMenu and expose bindMenu in the api", /import \{ bindAfMenu \} from "\.\.\/src\/af_menu_core\.js"/.test(src) && /\n  bindMenu,\n/.test(src) && /export function bindMenu\(/.test(src));
}

if (failures) {
  console.error(`check_menu: ${failures} of ${checks} checks FAILED`);
  process.exit(1);
}
console.log(`check_menu: ${checks} checks green`);
