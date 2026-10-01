#!/usr/bin/env node
/**
 * AfModal / bindAfModal behaviour checks (ui-kit 0.4.0; docs/modal.md).
 *
 * 1. bindAfModal over a minimal fake DOM (no jsdom — the kit's checks stay
 *    dependency-free): focus moves in (autofocus > body > first), Tab and
 *    Shift+Tab wrap inside, focus from outside comes back, Escape closes (and
 *    honours defaultPrevented / closeOnEscape:false), a backdrop press+click
 *    closes but a drag that started in the dialog does not, only the TOPMOST
 *    of nested modals reacts, html.af-modal-open is set while any modal is
 *    bound, release() unbinds and returns focus to the opener.
 * 2. AfModal SSR markup: role=dialog, aria-modal, aria-labelledby -> the h2,
 *    labelled close button, body / footer / note, narrow size, closed = nothing.
 * 3. AfModal wires bindAfModal (open-keyed effect) and the islands expose it.
 * A real-browser run of the same behaviour lives in the round-2 gallery
 * (untracked/round2/shots/kit/gallery.mjs, not shipped).
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const kit = await import(join(root, "dist", "index.js"));
const { AfModal, bindAfModal, afModalTabTarget, AF_MODAL_FOCUSABLE } = kit;

let failures = 0;
let checks = 0;
function check(name, cond, detail) {
  checks += 1;
  if (cond) return;
  failures += 1;
  console.error(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`);
}

// ------------------------------------------------------------ minimal fake DOM
function parseSimple(sel) {
  // tag? (.class)* ([attr] | [attr="v"])* (:not([attr]) | :not([attr="v"]))*
  const m = sel.trim().match(/^([a-z]+)?((?:\.[a-z0-9_-]+)*)((?:\[[^\]]+\])*)((?::not\(\[[^\]]+\]\))*)$/i);
  if (!m) throw new Error(`fake DOM cannot parse selector ${sel}`);
  const attr = (s) => {
    const a = s.match(/^\[([a-z-]+)(?:=["']([^"']*)["'])?\]$/i);
    return { name: a[1], value: a[2] };
  };
  return {
    tag: m[1] ? m[1].toLowerCase() : null,
    classes: (m[2] || "").split(".").filter(Boolean),
    has: (m[3] || "").match(/\[[^\]]+\]/g)?.map(attr) || [],
    not: (m[4] || "").match(/\[[^\]]+\]/g)?.map(attr) || [],
  };
}
function matchOne(el, p) {
  if (p.tag && el.tag !== p.tag) return false;
  if (!p.classes.every((c) => el.classList.contains(c))) return false;
  const ok = (a) => el.attrs[a.name] !== undefined && (a.value === undefined || el.attrs[a.name] === a.value);
  return p.has.every(ok) && !p.not.some(ok);
}
const matches = (el, sel) => sel.split(/,\s*/).some((s) => matchOne(el, parseSimple(s)));
class FakeEl {
  constructor(doc, tag, attrs = {}, children = []) {
    this.ownerDocument = doc;
    this.tag = tag;
    this.attrs = { ...attrs };
    this.children = [];
    this.parent = null;
    this.listeners = {};
    this.isConnected = true;
    const cls = new Set(String(attrs.class || "").split(/\s+/).filter(Boolean));
    this.classList = { add: (c) => cls.add(c), remove: (c) => cls.delete(c), contains: (c) => cls.has(c) };
    for (const c of children) this.append(c);
  }
  append(c) { c.parent = this; this.children.push(c); return c; }
  getAttribute(n) { return this.attrs[n] ?? null; }
  setAttribute(n, v) { this.attrs[n] = String(v); }
  hasAttribute(n) { return this.attrs[n] !== undefined; }
  contains(n) { for (let x = n; x; x = x.parent) if (x === this) return true; return false; }
  closest(sel) { for (let x = this; x && x instanceof FakeEl; x = x.parent) if (matches(x, sel)) return x; return null; }
  descendants() { return this.children.flatMap((c) => [c, ...c.descendants()]); }
  querySelectorAll(sel) { return this.descendants().filter((d) => matches(d, sel)); }
  querySelector(sel) { return this.querySelectorAll(sel)[0] || null; }
  focus() { this.ownerDocument.activeElement = this; this.ownerDocument.focusLog.push(this.attrs.id || this.tag); }
  addEventListener(t, f) { (this.listeners[t] ||= []).push(f); }
  removeEventListener(t, f) { this.listeners[t] = (this.listeners[t] || []).filter((g) => g !== f); }
  fire(t, props = {}) { const e = mkEvent(t, this, props); for (const f of [...(this.listeners[t] || [])]) f(e); return e; }
}
function mkEvent(type, target, props) {
  const e = { type, target, defaultPrevented: false, preventDefault() { e.defaultPrevented = true; }, ...props };
  return e;
}
function mkDoc() {
  const doc = { listeners: {}, focusLog: [], activeElement: null };
  doc.documentElement = new FakeEl(doc, "html");
  doc.body = doc.documentElement.append(new FakeEl(doc, "body"));
  doc.addEventListener = (t, f) => (doc.listeners[t] ||= []).push(f);
  doc.removeEventListener = (t, f) => (doc.listeners[t] = (doc.listeners[t] || []).filter((g) => g !== f));
  doc.key = (key, extra = {}) => { const e = mkEvent("keydown", doc.activeElement, { key, ...extra }); for (const f of [...(doc.listeners.keydown || [])]) f(e); return e; };
  doc.focusin = (target) => { for (const f of [...(doc.listeners.focusin || [])]) f(mkEvent("focusin", target, {})); };
  return doc;
}
const E = (doc, tag, attrs, ...children) => new FakeEl(doc, tag, attrs, children);
function mkModal(doc, { autofocus = false, bodyItems = true } = {}) {
  const close = E(doc, "button", { class: "af-modal__close", id: "close" });
  const items = bodyItems
    ? [E(doc, "input", { id: "email", ...(autofocus ? {} : {}) }), E(doc, "button", { id: "off", disabled: "" }), E(doc, "div", { hidden: "" }, E(doc, "button", { id: "hidden-btn" })), E(doc, "a", { href: "#", id: "link" }), ...(autofocus ? [E(doc, "button", { id: "auto", "data-af-autofocus": "" })] : [])]
    : [];
  const body = E(doc, "div", { class: "af-modal__body" }, ...items);
  const save = E(doc, "button", { id: "save" });
  const dialog = E(doc, "div", { class: "af-modal", role: "dialog", "aria-modal": "true" }, E(doc, "div", { class: "af-modal__header" }, close), body, E(doc, "div", { class: "af-modal__footer" }, save));
  const backdrop = E(doc, "div", { class: "af-modal-backdrop" }, dialog);
  doc.body.append(backdrop);
  return { backdrop, dialog, close, save, body };
}

// 1a) focus in, scroll lock, focus return
{
  const doc = mkDoc();
  const opener = doc.body.append(E(doc, "button", { id: "opener" }));
  opener.focus();
  const { backdrop } = mkModal(doc);
  let closed = 0;
  const release = bindAfModal(backdrop, { onClose: () => (closed += 1), document: doc });
  check("focus moves to the first focusable in the BODY (not the close button)", doc.activeElement.attrs.id === "email", doc.activeElement.attrs.id);
  check("html gets af-modal-open while bound", doc.documentElement.classList.contains("af-modal-open"));
  // Tab trap
  const save = backdrop.descendants().find((d) => d.attrs.id === "save");
  const close = backdrop.descendants().find((d) => d.attrs.id === "close");
  const link = backdrop.descendants().find((d) => d.attrs.id === "link");
  save.focus();
  let e = doc.key("Tab");
  check("Tab on the last focusable wraps to the first (close button)", e.defaultPrevented && doc.activeElement === close, doc.activeElement.attrs.id);
  e = doc.key("Tab", { shiftKey: true });
  check("Shift+Tab on the first focusable wraps to the last", e.defaultPrevented && doc.activeElement === save, doc.activeElement.attrs.id);
  link.focus();
  e = doc.key("Tab");
  check("Tab in the middle is left to the browser", !e.defaultPrevented && doc.activeElement === link);
  check("disabled and hidden-subtree buttons are not focus stops", !kit.afModalFocusables(backdrop).some((d) => d.attrs.id === "off" || d.attrs.id === "hidden-btn"), kit.afModalFocusables(backdrop).map((d) => d.attrs.id).join(","));
  opener.focus();
  e = doc.key("Tab");
  check("Tab with focus outside the dialog brings it back inside", e.defaultPrevented && doc.activeElement === close, doc.activeElement.attrs.id);
  opener.focus();
  doc.focusin(opener);
  check("focus that escapes (focusin outside) returns inside", backdrop.contains(doc.activeElement), doc.activeElement.attrs.id);
  // Escape
  e = doc.key("Escape");
  check("Escape calls onClose once and consumes the event", closed === 1 && e.defaultPrevented, `closed=${closed}`);
  const pre = mkEvent("keydown", doc.activeElement, { key: "Escape", defaultPrevented: true });
  for (const f of doc.listeners.keydown) f(pre);
  check("an Escape another layer consumed is ignored", closed === 1);
  // backdrop
  backdrop.fire("mousedown", { target: backdrop });
  backdrop.fire("click", { target: backdrop });
  check("press + click on the backdrop calls onClose", closed === 2, `closed=${closed}`);
  const dialog = backdrop.children[0];
  backdrop.fire("mousedown", { target: dialog });
  backdrop.fire("click", { target: backdrop });
  check("a drag that started inside the dialog does not close", closed === 2, `closed=${closed}`);
  backdrop.fire("mousedown", { target: dialog });
  backdrop.fire("click", { target: dialog });
  check("a click inside the dialog does not close", closed === 2);
  release();
  check("release returns focus to the opener", doc.activeElement === opener, doc.activeElement && doc.activeElement.attrs.id);
  check("release drops html.af-modal-open", !doc.documentElement.classList.contains("af-modal-open"));
  doc.key("Escape");
  backdrop.fire("mousedown", { target: backdrop });
  backdrop.fire("click", { target: backdrop });
  check("after release nothing closes any more (listeners removed)", closed === 2 && (doc.listeners.keydown || []).length === 0 && (doc.listeners.focusin || []).length === 0);
  release();
  check("release is idempotent", doc.activeElement === opener);
}
// 1b) autofocus, options, empty dialog
{
  const doc = mkDoc();
  const { backdrop } = mkModal(doc, { autofocus: true });
  let closed = 0;
  const release = bindAfModal(backdrop, { onClose: () => (closed += 1), closeOnEscape: false, closeOnBackdrop: false, lockScroll: false, document: doc });
  check("[data-af-autofocus] wins the first focus", doc.activeElement.attrs.id === "auto", doc.activeElement.attrs.id);
  check("lockScroll:false leaves <html> alone", !doc.documentElement.classList.contains("af-modal-open"));
  doc.key("Escape");
  backdrop.fire("mousedown", { target: backdrop });
  backdrop.fire("click", { target: backdrop });
  check("closeOnEscape:false / closeOnBackdrop:false are honoured", closed === 0);
  release();
  const doc2 = mkDoc();
  const bare = E(doc2, "div", { class: "af-modal-backdrop" }, E(doc2, "div", { class: "af-modal", role: "dialog" }));
  doc2.body.append(bare);
  const r2 = bindAfModal(bare, { onClose() {}, document: doc2 });
  check("a dialog without focusables focuses the dialog itself (tabindex -1)", doc2.activeElement === bare.children[0] && bare.children[0].attrs.tabindex === "-1");
  const e = doc2.key("Tab");
  check("Tab in a dialog without focusables stays on the dialog", e.defaultPrevented && doc2.activeElement === bare.children[0]);
  r2();
}
// 1c) nested: only the topmost reacts
{
  const doc = mkDoc();
  const a = mkModal(doc);
  const b = mkModal(doc);
  const calls = [];
  const ra = bindAfModal(a.backdrop, { onClose: () => calls.push("a"), document: doc });
  const rb = bindAfModal(b.backdrop, { onClose: () => calls.push("b"), document: doc });
  doc.key("Escape");
  a.backdrop.fire("mousedown", { target: a.backdrop });
  a.backdrop.fire("click", { target: a.backdrop });
  check("nested: Escape / backdrop reach only the topmost modal", JSON.stringify(calls) === '["b"]', JSON.stringify(calls));
  rb();
  check("nested: html.af-modal-open stays while the lower modal is bound", doc.documentElement.classList.contains("af-modal-open"));
  doc.key("Escape");
  check("nested: after the top is released the lower one reacts", JSON.stringify(calls) === '["b","a"]', JSON.stringify(calls));
  ra();
  check("nested: the last release drops html.af-modal-open", !doc.documentElement.classList.contains("af-modal-open"));
}
// 1d) the pure tab decision
check("afModalTabTarget: empty list -> null", afModalTabTarget([], null, false, false) === null);
check("afModalTabTarget: outside -> first / last", afModalTabTarget([1, 2, 3], 9, false, false) === 1 && afModalTabTarget([1, 2, 3], 9, true, false) === 3);
check("afModalTabTarget: wraps at both ends only", afModalTabTarget([1, 2, 3], 3, false, true) === 1 && afModalTabTarget([1, 2, 3], 1, true, true) === 3 && afModalTabTarget([1, 2, 3], 2, false, true) === null);
check("focusable selector excludes disabled and tabindex=-1", AF_MODAL_FOCUSABLE.includes("button:not([disabled])") && AF_MODAL_FOCUSABLE.includes('[tabindex]:not([tabindex="-1"])'));

// 2) SSR markup
const h = React.createElement;
const html = renderToStaticMarkup(h(AfModal, { open: true, portal: false, id: "m", title: "Email — alice", onClose() {}, footerNote: "From the audit log.", footer: h("button", { type: "button" }, "Done") }, h("p", null, "Body")));
check("backdrop wraps the dialog", html.startsWith('<div class="af-modal-backdrop"><div class="af-modal" id="m" role="dialog" aria-modal="true" aria-labelledby="m-title">'), html.slice(0, 160));
check("title is an h2 whose id names the dialog", html.includes('<h2 class="af-modal__title" id="m-title">Email — alice</h2>'));
check("close button is labelled", html.includes('<button type="button" class="af-modal__close" aria-label="Close"><span aria-hidden="true">×</span></button>'));
check("body / footer / note render", html.includes('<div class="af-modal__body"><p>Body</p></div>') && html.includes('<div class="af-modal__footer"><p class="af-modal__footer-note">From the audit log.</p><button type="button">Done</button></div>'));
check("closed renders nothing", renderToStaticMarkup(h(AfModal, { open: false, portal: false, title: "x", onClose() {} })) === "");
const narrow = renderToStaticMarkup(h(AfModal, { open: true, portal: false, id: "n", title: "x", size: "narrow", closeLabel: "Close Logs", describedBy: "d", onClose() {} }));
check("narrow size, custom close label, aria-describedby; no footer when none given", narrow.includes('class="af-modal af-modal--narrow"') && narrow.includes('aria-label="Close Logs"') && narrow.includes('aria-describedby="d"') && !narrow.includes("af-modal__footer"));
const auto = renderToStaticMarkup(h(AfModal, { open: true, portal: false, title: "x", onClose() {} }));
const autoId = (auto.match(/ id="([^"]+)" role="dialog"/) || [])[1];
check("default id is generated and the title id follows it", !!autoId && auto.includes(`aria-labelledby="${autoId}-title"`) && auto.includes(`id="${autoId}-title"`), auto.slice(0, 200));

// 3) wiring
const src = readFileSync(join(root, "src", "af_modal.tsx"), "utf8");
check("AfModal binds bindAfModal on the backdrop in an open-keyed effect", /return bindAfModal\(backdropRef\.current, \{/.test(src) && /\}, \[props\.open\]\);/.test(src));
check("AfModal's close button calls onClose", /className="af-modal__close"[^>]*onClick=\{\(\) => onCloseRef\.current\(\)\}/.test(src));
const islands = readFileSync(join(root, "islands", "console_islands.tsx"), "utf8");
check("console islands expose bindModal", /export function bindModal\(/.test(islands) && /\n  bindModal,\n/.test(islands));

if (failures) {
  console.error(`check_modal: ${failures}/${checks} checks FAILED`);
  process.exit(1);
}
console.log(`check_modal: ${checks} checks green`);
