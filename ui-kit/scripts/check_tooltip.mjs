#!/usr/bin/env node
/**
 * Kit tooltip checks (round 9, DESIGN R9.2; docs/modal.md "Tooltip").
 *
 * 1. bindAfTooltips over a minimal fake DOM with a manual clock: nothing
 *    before 150 ms, shown at 150 ms with the anchor's sentence (textContent),
 *    role=tooltip, one element per binding; aria-describedby only when the
 *    sentence differs from the aria-label (and restored on hide); pointer
 *    leave hides (after the grace), moving onto the tooltip keeps it; touch
 *    hovers ignored; keyboard focus shows, focus after a pointer press does
 *    not; blur, press, scroll, resize hide; Escape hides and is consumed
 *    ONLY when a tooltip was visible; a re-rendered sentence is read at show
 *    time; an anchor removed meanwhile shows nothing; release() unbinds and
 *    removes the element.
 * 2. afTooltipPlacement: above and centred, flips below at the top edge,
 *    clamps 8 px inside the viewport at both sides (phone width too).
 * 3. AfTooltip SSR: the child gets data-af-tip, keeps its aria-label, gets no
 *    title; empty content leaves the child untouched.
 * 4. CSS contract (theme.css af-tooltip block): fixed, --z-tooltip above
 *    --z-popover, theme tokens (inverse surface) for light and dark, viewport
 *    max-width, hidden rule.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const kit = await import(join(root, "dist", "index.js"));
const { AfTooltip, bindAfTooltips, afTooltipPlacement, AF_TOOLTIP_DELAY_MS, AF_TOOLTIP_ATTR } = kit;

let failures = 0;
let checks = 0;
function check(name, cond, detail) {
  checks += 1;
  if (cond) return;
  failures += 1;
  console.error(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`);
}

// ------------------------------------------------------------ manual clock
let now = 0;
let timers = [];
let seq = 0;
globalThis.setTimeout = (f, ms) => { seq += 1; timers.push({ id: seq, at: now + (ms || 0), f }); return seq; };
globalThis.clearTimeout = (id) => { timers = timers.filter((t) => t.id !== id); };
function advance(ms) {
  const end = now + ms;
  for (;;) {
    timers.sort((a, b) => a.at - b.at);
    const t = timers[0];
    if (!t || t.at > end) break;
    timers.shift();
    now = t.at;
    t.f();
  }
  now = end;
}

// ------------------------------------------------------------ minimal fake DOM
class FakeEl {
  constructor(doc, tag, attrs = {}) {
    this.ownerDocument = doc;
    this.nodeType = 1;
    this.tag = tag;
    this.attrs = { ...attrs };
    this.children = [];
    this.parentNode = null;
    this.listeners = {};
    this.style = {};
    this.textContent = "";
    this.rect = { top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0 };
    this.focusVisible = null; // null = the selector "is unsupported" (throws)
  }
  get className() { return this.attrs.class || ""; }
  set className(v) { this.attrs.class = v; }
  get hidden() { return this.attrs.hidden !== undefined; }
  set hidden(v) { if (v) this.attrs.hidden = ""; else delete this.attrs.hidden; }
  get isConnected() { for (let x = this; x; x = x.parentNode) if (x === this.ownerDocument.documentElement) return true; return false; }
  appendChild(c) { c.parentNode = this; this.children.push(c); return c; }
  removeChild(c) { this.children = this.children.filter((x) => x !== c); c.parentNode = null; return c; }
  getAttribute(n) { return this.attrs[n] ?? null; }
  setAttribute(n, v) { this.attrs[n] = String(v); }
  hasAttribute(n) { return this.attrs[n] !== undefined; }
  removeAttribute(n) { delete this.attrs[n]; }
  contains(n) { for (let x = n; x; x = x.parentNode) if (x === this) return true; return false; }
  matches(sel) {
    if (sel === `[${AF_TOOLTIP_ATTR}]`) return this.hasAttribute(AF_TOOLTIP_ATTR);
    if (sel === ":focus-visible") { if (this.focusVisible === null) throw new Error("unsupported"); return this.focusVisible; }
    throw new Error(`fake DOM cannot match ${sel}`);
  }
  closest(sel) { for (let x = this; x && x instanceof FakeEl; x = x.parentNode) if (x.matches(sel)) return x; return null; }
  getBoundingClientRect() { return this.rect; }
  addEventListener(t, f, cap) { (this.listeners[t] ||= []).push({ f, cap: !!cap }); }
  removeEventListener(t, f, cap) { this.listeners[t] = (this.listeners[t] || []).filter((g) => !(g.f === f && g.cap === !!cap)); }
}
function mkWorld(width = 1440, height = 900) {
  const win = { innerWidth: width, innerHeight: height, listeners: {} };
  const doc = { nodeType: 9, listeners: {}, defaultView: win };
  for (const o of [win, doc]) {
    o.addEventListener = (t, f, cap) => (o.listeners[t] ||= []).push({ f, cap: !!cap });
    o.removeEventListener = (t, f, cap) => (o.listeners[t] = (o.listeners[t] || []).filter((g) => !(g.f === f && g.cap === !!cap)));
  }
  doc.contains = (n) => !!n && (n === doc || doc.documentElement.contains(n));
  doc.createElement = (tag) => new FakeEl(doc, tag);
  doc.documentElement = new FakeEl(doc, "html");
  doc.documentElement.parentNode = null;
  doc.body = doc.documentElement.appendChild(new FakeEl(doc, "body"));
  const dispatch = (type, target, props = {}) => {
    const e = { type, target, defaultPrevented: false, preventDefault() { e.defaultPrevented = true; }, ...props };
    for (const l of [...(win.listeners[type] || [])]) if (l.cap) l.f(e);
    for (const l of [...(doc.listeners[type] || [])]) if (l.cap) l.f(e);
    if (target instanceof FakeEl) for (let x = target; x && x instanceof FakeEl; x = x.parentNode) for (const l of [...(x.listeners[type] || [])]) l.f(e);
    for (const l of [...(doc.listeners[type] || [])]) if (!l.cap) l.f(e);
    if (target === win) for (const l of [...(win.listeners[type] || [])]) if (!l.cap) l.f(e);
    return e;
  };
  return { win, doc, dispatch };
}
function mkButton(w, attrs, rect) {
  const b = new FakeEl(w.doc, "button", attrs);
  const glyph = new FakeEl(w.doc, "svg");
  b.appendChild(glyph);
  w.doc.body.appendChild(b);
  b.rect = rect || { top: 400, bottom: 444, left: 700, right: 744, width: 44, height: 44 };
  return { b, glyph };
}
const tipEl = (w) => w.doc.body.children.find((c) => c.attrs.role === "tooltip");
const visible = (w) => { const t = tipEl(w); return !!t && !t.hidden; };

// 1a) hover: delay, sentence, ARIA, leave, hoverable
{
  const w = mkWorld();
  const { b, glyph } = mkButton(w, { "aria-label": "Archive alice", [AF_TOOLTIP_ATTR]: "Archive alice (kept, hidden)" });
  const release = bindAfTooltips(w.doc);
  const t = tipEl(w);
  check("one role=tooltip element appended to <body>, hidden", !!t && t.hidden && t.attrs.class === "af-tooltip" && !!t.attrs.id);
  check("default delay is 150 ms", AF_TOOLTIP_DELAY_MS === 150);
  t.rect = { top: 0, left: 0, right: 180, bottom: 30, width: 180, height: 30 };
  w.dispatch("pointerover", glyph, { pointerType: "mouse" });
  advance(149);
  check("nothing before 150 ms", !visible(w));
  advance(1);
  check("shown at 150 ms with the anchor's sentence", visible(w) && t.textContent === "Archive alice (kept, hidden)");
  check("aria-describedby -> tooltip when the sentence differs from aria-label", b.attrs["aria-describedby"] === t.attrs.id);
  check("placed above the anchor, centred", t.style.top === "364px" && t.style.left === "632px" && t.attrs["data-side"] === "top", JSON.stringify(t.style));
  w.dispatch("pointerout", b, { relatedTarget: t });
  advance(500);
  check("moving onto the tooltip keeps it (hoverable)", visible(w));
  w.dispatch("pointerout", t, { relatedTarget: w.doc.body });
  advance(99);
  check("leaving waits a short grace", visible(w));
  advance(1);
  check("then hides; aria-describedby removed; text cleared", !visible(w) && b.attrs["aria-describedby"] === undefined && t.textContent === "");
  w.dispatch("pointerover", glyph, { pointerType: "mouse" });
  advance(50);
  w.dispatch("pointerout", b, { relatedTarget: w.doc.body });
  advance(500);
  check("leaving before the delay cancels it", !visible(w));
  w.dispatch("pointerover", glyph, { pointerType: "touch" });
  advance(500);
  check("touch hovers are ignored", !visible(w));
  b.setAttribute(AF_TOOLTIP_ATTR, "Archive bob (kept, hidden)");
  w.dispatch("pointerover", glyph, { pointerType: "mouse" });
  advance(150);
  check("the sentence is read at show time (re-rendered labels)", t.textContent === "Archive bob (kept, hidden)");
  w.dispatch("pointerdown", b);
  check("a press hides at once", !visible(w));
  w.dispatch("pointerover", glyph, { pointerType: "mouse" });
  advance(150);
  w.dispatch("scroll", w.win);
  check("scroll hides", !visible(w));
  w.dispatch("pointerover", glyph, { pointerType: "mouse" });
  advance(150);
  w.dispatch("resize", w.win);
  check("resize hides", !visible(w));
  w.dispatch("pointerover", glyph, { pointerType: "mouse" });
  w.doc.body.removeChild(b);
  advance(150);
  check("an anchor removed before the delay shows nothing", !visible(w));
  release();
  check("release removes the tooltip element and every listener", !tipEl(w) && !(w.win.listeners.keydown || []).length && !(w.doc.listeners.pointerover || []).length && !(w.doc.listeners.pointerdown || []).length);
  release();
}
// 1b) keyboard focus, Escape, same label
{
  const w = mkWorld();
  const { b } = mkButton(w, { "aria-label": "Refresh", [AF_TOOLTIP_ATTR]: "Refresh" });
  const other = mkButton(w, { "aria-label": "Logs", [AF_TOOLTIP_ATTR]: "Activity log of alice", "aria-describedby": "hint1" }).b;
  bindAfTooltips(w.doc);
  const t = tipEl(w);
  w.dispatch("keydown", w.doc.body, { key: "Tab" });
  w.dispatch("focusin", b);
  advance(150);
  check("keyboard focus shows (fallback tracker: :focus-visible unsupported)", visible(w) && t.textContent === "Refresh");
  check("no aria-describedby when the sentence equals the aria-label", b.attrs["aria-describedby"] === undefined);
  const esc = w.dispatch("keydown", b, { key: "Escape" });
  check("Escape hides and is consumed when a tooltip was visible", !visible(w) && esc.defaultPrevented);
  const esc2 = w.dispatch("keydown", b, { key: "Escape" });
  check("Escape is NOT consumed when no tooltip is visible (an enclosing modal closes)", !esc2.defaultPrevented);
  w.dispatch("focusout", b);
  w.dispatch("pointerdown", other);
  w.dispatch("focusin", other);
  advance(500);
  check("focus that follows a pointer press does not show", !visible(w));
  w.dispatch("keydown", other, { key: "Tab" });
  w.dispatch("focusin", other);
  advance(150);
  check("keyboard focus on an anchor with an existing describedby appends the tooltip id", visible(w) && other.attrs["aria-describedby"] === `hint1 ${t.attrs.id}`);
  w.dispatch("focusout", other);
  check("blur hides and restores the anchor's own describedby", !visible(w) && other.attrs["aria-describedby"] === "hint1");
  other.focusVisible = false;
  w.dispatch("keydown", other, { key: "Tab" });
  w.dispatch("focusin", other);
  advance(500);
  check(":focus-visible, when supported, decides (false = no tooltip)", !visible(w));
  other.focusVisible = true;
  w.dispatch("focusin", other);
  advance(150);
  check(":focus-visible true shows", visible(w));
  const plain = new FakeEl(w.doc, "button", { "aria-label": "Plain" });
  w.doc.body.appendChild(plain);
  w.dispatch("focusout", other);
  w.dispatch("pointerover", plain, { pointerType: "mouse" });
  advance(500);
  check("elements without data-af-tip get nothing", !visible(w));
  const custom = mkWorld();
  const c = mkButton(custom, { [AF_TOOLTIP_ATTR]: "Delete" }).b;
  bindAfTooltips(custom.doc, { delayMs: 0 });
  custom.dispatch("pointerover", c, { pointerType: "mouse" });
  advance(0);
  check("delayMs option honoured", visible(custom));
}
// 2) placement
{
  const P = (a, s, v) => afTooltipPlacement(a, s, v);
  const vp = { width: 1440, height: 900 };
  const mid = P({ top: 400, bottom: 444, left: 700, right: 744 }, { width: 180, height: 30 }, vp);
  check("above + centred", mid.top === 364 && mid.left === 632 && mid.side === "top", JSON.stringify(mid));
  const top = P({ top: 10, bottom: 54, left: 700, right: 744 }, { width: 180, height: 30 }, vp);
  check("flips below at the top edge", top.side === "bottom" && top.top === 60, JSON.stringify(top));
  const right = P({ top: 400, bottom: 444, left: 1400, right: 1440 }, { width: 240, height: 30 }, vp);
  check("clamped 8 px from the right edge", right.left === 1440 - 8 - 240, JSON.stringify(right));
  const left = P({ top: 400, bottom: 444, left: 0, right: 44 }, { width: 240, height: 30 }, vp);
  check("clamped 8 px from the left edge", left.left === 8, JSON.stringify(left));
  const phone = P({ top: 300, bottom: 344, left: 330, right: 374 }, { width: 280, height: 48 }, { width: 390, height: 844 });
  check("phone width: inside [8, 382]", phone.left >= 8 && phone.left + 280 <= 382, JSON.stringify(phone));
}
// 3) AfTooltip SSR
{
  const html = renderToStaticMarkup(React.createElement(AfTooltip, { content: "Rotate alice's sign-in token" }, React.createElement("button", { type: "button", "aria-label": "Rotate alice's token" }, "↻")));
  check("child gets data-af-tip with the sentence", html.includes(`data-af-tip="Rotate alice&#x27;s sign-in token"`), html);
  check("child keeps its aria-label and gets no title", html.includes(`aria-label="Rotate alice&#x27;s token"`) && !html.includes("title="), html);
  const bare = renderToStaticMarkup(React.createElement(AfTooltip, { content: " " }, React.createElement("button", { type: "button" }, "x")));
  check("empty content leaves the child untouched", bare === `<button type="button">x</button>`, bare);
}
// 4) CSS
{
  const css = readFileSync(join(root, "src", "theme.css"), "utf8");
  const m = /\/\* af-tooltip:begin[\s\S]*?af-tooltip:end \*\//.exec(css);
  check("theme.css has the af-tooltip block", !!m);
  const block = m ? m[0] : "";
  const rule = (/\.af-tooltip \{([\s\S]*?)\}/.exec(block) || [])[1] || "";
  check("fixed + --z-tooltip", /position:\s*fixed/.test(rule) && /z-index:\s*var\(--z-tooltip/.test(rule));
  check("inverse surface from theme tokens (light and dark)", /background:\s*var\(--text-primary\)/.test(rule) && /color:\s*var\(--bg-primary\)/.test(rule));
  check("never wider than the viewport", /max-width:\s*min\(280px,\s*calc\(100vw - 16px\)\)/.test(rule));
  check("hidden rule", /\.af-tooltip\[hidden\]\s*\{\s*display:\s*none;/.test(block));
  const z = (n) => Number((new RegExp(`--z-${n}:\\s*(\\d+)`).exec(css) || [])[1]);
  check("--z-tooltip above --z-popover", z("tooltip") > z("popover"), `${z("tooltip")} vs ${z("popover")}`);
}

if (failures) {
  console.error(`check_tooltip: ${failures}/${checks} FAILED`);
  process.exit(1);
}
console.log(`check_tooltip: OK (${checks} checks)`);
