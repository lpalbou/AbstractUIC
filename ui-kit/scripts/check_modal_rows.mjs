#!/usr/bin/env node
/**
 * Modal / account-row / nav-group / helper-floor checks (ui-kit 0.4.0;
 * docs/modal.md).
 *
 * 1. theme.css carries the af-modal contract: blurred dim backdrop with a
 *    reduced-transparency solid fallback, the min(960px, 100vw - 32px) x 90vh
 *    dialog, the scrolling body, the < 768 px full-screen sheet (one scroll,
 *    safe-area padding), [hidden] support for plain-HTML hosts.
 * 2. Row tint tokens exist for dark (base :root) and light (grouped light
 *    block), and TEXT ON A TINTED ROW keeps >= 4.5:1 in every theme: --af-row-text
 *    and --af-row-text-muted composited over the tint over bg-primary,
 *    bg-secondary and bg-card; chip text over the chip wash over the tint.
 * 3. .af-row--*, .af-kind-chip--*, .af-nav-group__caption, .af-nav-footer exist.
 * 4. Helper floor: --af-helper-size is 13 px on desktop and 14 px under
 *    (pointer: coarse), (max-width: 1023.98px); every kit helper rule reads it.
 *
 * Pure text + arithmetic over src/theme.css (no browser).
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const css = readFileSync(join(here, "..", "src", "theme.css"), "utf8");

let failures = 0;
let checks = 0;
function check(name, cond, detail) {
  checks += 1;
  if (cond) return;
  failures += 1;
  console.error(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`);
}
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "");
const flat = strip(css);
/** Declarations of the first top-level rule whose selector list equals `selector` (outside @media). */
function ruleBody(selector, within = flat) {
  const re = new RegExp(`(^|[}\\n])\\s*${selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*\\{([^{}]*)\\}`);
  const m = within.match(re);
  return m ? m[2] : null;
}
function decls(body) {
  const out = {};
  for (const m of String(body || "").matchAll(/([a-z-]+)\s*:\s*([^;]+);/g)) out[m[1]] = m[2].trim();
  return out;
}
/** Body of the first @media block whose query text equals `query`, containing `needle`. */
function mediaBody(query, needle) {
  let idx = 0;
  const head = `@media ${query} {`;
  while ((idx = flat.indexOf(head, idx)) >= 0) {
    let depth = 0;
    let i = idx + head.length - 1;
    const start = i + 1;
    for (; i < flat.length; i++) {
      if (flat[i] === "{") depth++;
      else if (flat[i] === "}") {
        depth--;
        if (depth === 0) break;
      }
    }
    const body = flat.slice(start, i);
    if (!needle || body.includes(needle)) return body;
    idx = i;
  }
  return null;
}

// ---------------------------------------------------------------- 1) modal
const bd = decls(ruleBody(".af-modal-backdrop"));
check("backdrop is fixed, full-viewport", bd.position === "fixed" && bd.inset === "0", JSON.stringify(bd));
check("backdrop dims at 0.45", bd.background === "rgba(0, 0, 0, 0.45)", bd.background);
check("backdrop blurs 8px (+ -webkit-)", bd["backdrop-filter"] === "blur(8px)" && bd["-webkit-backdrop-filter"] === "blur(8px)", JSON.stringify(bd));
check("backdrop z-index is the --z-modal token", bd["z-index"] === "var(--z-modal, 950)");
check("--z-modal sits between drawers and the connect modal", /--z-drawer: 900;\s*--z-modal: 950;\s*--z-connect-modal: 1000;/.test(flat));
check("backdrop padding clears the safe areas", /var\(--safe-top\)/.test(bd.padding || "") && /var\(--safe-bottom\)/.test(bd.padding || ""), bd.padding);
check(".af-modal-backdrop[hidden] hides (plain-HTML hosts toggle hidden)", decls(ruleBody(".af-modal-backdrop[hidden]")).display === "none");
const rt = mediaBody("(prefers-reduced-transparency: reduce)", ".af-modal-backdrop");
const rtd = decls(rt && ruleBody(".af-modal-backdrop", "\n" + rt));
check("reduced transparency: no blur, solid denser dim", rtd["backdrop-filter"] === "none" && rtd["-webkit-backdrop-filter"] === "none" && rtd.background === "rgba(0, 0, 0, 0.72)", JSON.stringify(rtd));
const md = decls(ruleBody(".af-modal"));
check("modal width min(960px, 100vw - 32px), border-box (the border is inside the 960)", md.width === "min(960px, calc(100vw - 32px))" && md["box-sizing"] === "border-box", JSON.stringify([md.width, md["box-sizing"]]));
check("modal max-height 90vh/90dvh", /max-height: 90vh;\s*max-height: 90dvh;/.test(ruleBody(".af-modal") || ""));
check("modal is a flex column with a solid surface", md.display === "flex" && md["flex-direction"] === "column" && md.background === "var(--bg-secondary)", JSON.stringify(md));
const body = decls(ruleBody(".af-modal__body"));
check("desktop: the BODY scrolls (min-height 0, overflow-y auto)", body["overflow-y"] === "auto" && body["min-height"] === "0" && body.flex === "1 1 auto", JSON.stringify(body));
check("header / title / close / footer rules exist", [".af-modal__header", ".af-modal__title", ".af-modal__close", ".af-modal__footer"].every((s) => ruleBody(s)));
check("title stays on the label scale's heading side (600 weight)", decls(ruleBody(".af-modal__title"))["font-weight"] === "600");
check("html.af-modal-open locks the page scroll", /html\.af-modal-open,\s*html\.af-modal-open body\s*\{\s*overflow: hidden;/.test(flat));
const sheet = mediaBody("(max-width: 767.98px)", ".af-modal__body");
check("phone sheet block exists", !!sheet);
if (sheet) {
  const sm = decls(ruleBody(".af-modal,\n  .af-modal--narrow", "\n" + sheet));
  check("phone: full-screen sheet (100% x --vh-full, no radius)", sm.width === "100%" && sm.height === "var(--vh-full, 100vh)" && sm["max-height"] === "none" && sm["border-radius"] === "0", JSON.stringify(sm));
  check("phone: the SHEET is the one scroller", sm["overflow-y"] === "auto" && decls(ruleBody(".af-modal__body", "\n" + sheet)).overflow === "visible");
  const sh = decls(ruleBody(".af-modal__header", "\n" + sheet));
  const sf = decls(ruleBody(".af-modal__footer", "\n" + sheet));
  check("phone: header pinned + clears the notch", sh.position === "sticky" && /var\(--safe-top\)/.test(sh.padding || ""), JSON.stringify(sh));
  check("phone: footer pinned + clears the home indicator", sf.position === "sticky" && /var\(--safe-bottom\)/.test(sf.padding || ""), JSON.stringify(sf));
  check("phone: the footer note takes its own line (buttons never squeezed)", decls(ruleBody(".af-modal__footer-note", "\n" + sheet))["flex-basis"] === "100%");
  check("phone: backdrop has no gutter", decls(ruleBody(".af-modal-backdrop", "\n" + sheet)).padding === "0");
}
check("touch: close button is a 44 px target", /@media \(pointer: coarse\) \{\s*\.af-modal__close \{\s*width: var\(--tap-min\);\s*height: var\(--tap-min\);/.test(flat));

// ---------------------------------------------------------------- 2) row tints + contrast
function parseBlocks(text) {
  const blocks = {};
  for (const m of text.matchAll(/((?::root|\.|[a-z])[^{}]*?)\{([^{}]*)\}/g)) {
    const selector = m[1];
    const vars = {};
    for (const vm of m[2].matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/g)) vars[vm[1]] = vm[2].trim();
    if (!Object.keys(vars).length) continue;
    const names = new Set();
    if (/^\s*:root\s*$/.test(selector)) names.add(":root");
    for (const sm of selector.matchAll(/theme-([a-z0-9-]+)/g)) names.add(sm[1]);
    for (const n of names) blocks[n] = Object.assign(blocks[n] || {}, vars);
  }
  return blocks;
}
// Only the top-level (non-@media, non-@supports) rules: the tokens' defining blocks.
const topLevel = (() => {
  let out = "";
  let depth = 0;
  let atDepth = -1;
  for (let i = 0; i < flat.length; i++) {
    const c = flat[i];
    if (c === "@" && depth === 0) atDepth = 0;
    if (c === "{") {
      depth++;
      if (atDepth === 0 && depth === 1) atDepth = 1;
    } else if (c === "}") {
      depth--;
      if (atDepth === 1 && depth === 0) {
        atDepth = -1;
        continue;
      }
    }
    if (atDepth === -1) out += c;
  }
  return out;
})();
const blocks = parseBlocks(topLevel);
const root = blocks[":root"];
check("dark (base :root) defines --af-row-tint-admin|user|entity", ["admin", "user", "entity"].every((k) => root[`--af-row-tint-${k}`]), JSON.stringify(Object.keys(root).filter((k) => k.startsWith("--af-row"))));
const lightThemes = ["light", "solarized-light", "catppuccin-latte", "rose-pine-dawn", "one-light", "everforest-light"];
check("the light group block defines its own row tints", lightThemes.every((t) => blocks[t] && ["admin", "user", "entity"].every((k) => blocks[t][`--af-row-tint-${k}`])));

function parseColor(s) {
  if (!s) return null;
  s = s.trim();
  let m = s.match(/^#([0-9a-f]{6})$/i);
  if (m) return [parseInt(m[1].slice(0, 2), 16), parseInt(m[1].slice(2, 4), 16), parseInt(m[1].slice(4, 6), 16), 1];
  m = s.match(/^#([0-9a-f]{3})$/i);
  if (m) return [17 * parseInt(m[1][0], 16), 17 * parseInt(m[1][1], 16), 17 * parseInt(m[1][2], 16), 1];
  m = s.match(/^rgba?\(([\d.\s,%]+)\)$/i);
  if (m) {
    const p = m[1].split(",").map((x) => parseFloat(x));
    return [p[0], p[1], p[2], p.length > 3 ? p[3] : 1];
  }
  if (s === "transparent") return [0, 0, 0, 0];
  return null;
}
function resolve(theme, name, depth = 0) {
  if (depth > 8) return null;
  const raw = (blocks[theme] && blocks[theme][name]) ?? root[name];
  if (!raw) return null;
  return value(theme, raw, depth);
}
function value(theme, raw, depth) {
  raw = raw.trim();
  const vm = raw.match(/^var\((--[a-z0-9-]+)(?:,\s*(.+))?\)$/);
  if (vm) return resolve(theme, vm[1], depth + 1) || parseColor(vm[2] || "");
  // color-mix(in srgb, X N%, transparent) == X at alpha N% (premultiplied mix with transparent)
  const cm = raw.match(/^color-mix\(in srgb,\s*(.+?)\s+([\d.]+)%,\s*transparent\)$/);
  if (cm) {
    const c = value(theme, cm[1], depth + 1);
    return c ? [c[0], c[1], c[2], c[3] * (parseFloat(cm[2]) / 100)] : null;
  }
  const cm2 = raw.match(/^color-mix\(in srgb,\s*(.+?)\s+([\d.]+)%,\s*(.+)\)$/);
  if (cm2) {
    const a = value(theme, cm2[1], depth + 1);
    const b = value(theme, cm2[3], depth + 1);
    const p = parseFloat(cm2[2]) / 100;
    if (!a || !b) return null;
    const al = a[3] * p + b[3] * (1 - p);
    if (al === 0) return [0, 0, 0, 0];
    return [0, 1, 2].map((i) => (a[i] * a[3] * p + b[i] * b[3] * (1 - p)) / al).concat([al]);
  }
  return parseColor(raw);
}
const over = (fg, bg) => [0, 1, 2].map((i) => fg[i] * fg[3] + bg[i] * (1 - fg[3])).concat([1]);
function lum([r, g, b]) {
  const f = (c) => ((c /= 255) <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}
const contrast = (a, b) => {
  const l1 = lum(a);
  const l2 = lum(b);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
};
const themes = [":root", ...Object.keys(blocks).filter((k) => k !== ":root" && resolve(k, "--bg-primary") && blocks[k]["--bg-primary"])];
let worst = { ratio: 99 };
const table = [];
let resolvedAll = true;
for (const t of themes) {
  const bgP = resolve(t, "--bg-primary");
  const bgS = over(resolve(t, "--bg-secondary") || bgP, bgP);
  // --bg-card as the browser sees it where color-mix is supported (88% of bg-secondary over bg-primary)
  const bgC = over([...bgS.slice(0, 3), 0.88], bgP);
  const row = { theme: t };
  for (const kind of ["admin", "user", "entity"]) {
    const tint = resolve(t, `--af-row-tint-${kind}`);
    const mark = resolve(t, `--af-row-mark-${kind}`);
    if (!tint || !mark) {
      resolvedAll = false;
      continue;
    }
    let min = 99;
    for (const base of [bgP, bgS, bgC]) {
      const rowBg = over(tint, base);
      for (const tok of ["--af-row-text", "--af-row-text-muted"]) {
        const r = contrast(over(resolve(t, tok), rowBg), rowBg);
        if (r < min) min = r;
        if (r < worst.ratio) worst = { ratio: r, theme: t, kind, tok };
      }
      // chip: text-primary over the chip wash (mark 18%, user: overlay bg) over the tinted row
      const chipBg = over(kind === "user" ? resolve(t, "--ui-overlay-bg") || [0, 0, 0, 0] : [...mark.slice(0, 3), mark[3] * 0.10], rowBg);
      const r = contrast(over(resolve(t, "--af-row-text"), chipBg), chipBg);
      if (r < min) min = r;
      if (r < worst.ratio) worst = { ratio: r, theme: t, kind, tok: "chip" };
    }
    row[kind] = min.toFixed(2);
  }
  table.push(row);
}
check("every theme resolves the row tint + mark tokens", resolvedAll);
check(`--af-row-text / --af-row-text-muted on tinted rows and kind chips >= 4.5:1 in all ${themes.length} themes`, worst.ratio >= 4.5, JSON.stringify(worst));
if (process.argv.includes("--report")) console.table(table);
// Tints are VISIBLE: admin/entity differ from the bare surface by some margin in every theme.
let faint = null;
for (const t of themes) {
  const bgS = over(resolve(t, "--bg-secondary") || resolve(t, "--bg-primary"), resolve(t, "--bg-primary"));
  for (const kind of ["admin", "entity"]) {
    const tint = resolve(t, `--af-row-tint-${kind}`);
    if (!tint) continue;
    const d = Math.max(...[0, 1, 2].map((i) => Math.abs(over(tint, bgS)[i] - bgS[i])));
    if (d < 6 && !faint) faint = `${t} ${kind} delta ${d.toFixed(1)}`;
  }
}
check("admin/entity tints are visible (>= 6/255 channel shift) in every theme", !faint, faint);

// ---------------------------------------------------------------- 3) row / chip / nav classes
for (const k of ["admin", "user", "entity"]) {
  check(`.af-row--${k} paints its tint on the row block and <tr> cells`, new RegExp(`\\.af-row--${k},\\s*\\.af-row--${k} > td,\\s*\\.af-row--${k} > th \\{\\s*background-color: var\\(--af-row-tint-${k}\\);`).test(flat));
  check(`tr.af-row--${k} marks its first cell`, flat.includes(`tr.af-row--${k} > :first-child { box-shadow: inset 3px 0 0 var(--af-row-mark-${k}); }`));
  check(`stacked .af-row--${k} block carries the mark`, flat.includes(`.af-row--${k}:not(tr) { box-shadow: inset 3px 0 0 var(--af-row-mark-${k}); }`));
  check(`.af-kind-chip--${k} exists`, !!ruleBody(`.af-kind-chip--${k}`));
  check(`.af-row-legend__swatch--${k} exists`, flat.includes(`.af-row-legend__swatch--${k} {`));
}
check("tinted rows use --af-row-text; .af-row__muted uses --af-row-text-muted", /\.af-row--admin,\s*\.af-row--user,\s*\.af-row--entity \{\s*color: var\(--af-row-text\);/.test(flat) && decls(ruleBody(".af-row__muted")).color === "var(--af-row-text-muted)");
check("a <tr> never doubles the wash", /tr\.af-row--admin,\s*tr\.af-row--user,\s*tr\.af-row--entity \{\s*background-color: transparent;/.test(flat));
const chip = decls(ruleBody(".af-kind-chip"));
check(".af-kind-chip text is --af-row-text (never the tint)", chip.color === "var(--af-row-text, var(--text-primary))", JSON.stringify(chip));
const cap = decls(ruleBody(".af-nav-group__caption"));
check(".af-nav-group__caption: small uppercase caption in the secondary text colour", cap["text-transform"] === "uppercase" && cap.color === "var(--text-secondary)" && cap["font-size"] === "var(--font-size-xs)" && Number(cap["font-weight"]) <= 600, JSON.stringify(cap));
check(".af-nav-group + .af-nav-group spacing", !!ruleBody(".af-nav-group + .af-nav-group"));
const foot = decls(ruleBody(".af-nav-footer"));
check(".af-nav-footer pins to the bottom of a flex column", foot["margin-top"] === "auto" && /var\(--safe-bottom\)/.test(foot.padding || ""), JSON.stringify(foot));
check(".af-nav-footer__button is 44 px on touch", /@media \(pointer: coarse\) \{\s*\.af-nav-footer__button \{\s*min-height: var\(--tap-min\);/.test(flat));

// ---------------------------------------------------------------- 4) helper floor
check("--af-helper-size desktop floor is 13 px (top-level :root)", /--af-helper-size: max\(var\(--font-size-sm\), 13px\);/.test(topLevel));
const touch = mediaBody("(pointer: coarse), (max-width: 1023.98px)", "--af-helper-size");
check("touch / < 1024 px raises --af-helper-size to 14 px", !!touch && /--af-helper-size: max\(var\(--font-size-sm\), 14px\);/.test(touch), touch);
for (const sel of [".af-switch__desc", ".af-switch__reason", ".af-form__help", ".af-field-help", ".af-modal__footer-note", ".af-row-legend"]) {
  check(`${sel} reads --af-helper-size`, decls(ruleBody(sel))["font-size"] === "var(--af-helper-size)", JSON.stringify(decls(ruleBody(sel))["font-size"]));
}
check("no helper rule hard-codes the old 13 px floor any more", !flat.includes("max(var(--font-size-sm), 13px);\n  font-weight: 400;\n  white-space"));

if (failures) {
  console.error(`check_modal_rows: ${failures}/${checks} checks FAILED`);
  process.exit(1);
}
console.log(`check_modal_rows: ${checks} checks OK (worst tinted-row contrast ${worst.ratio.toFixed(2)}:1, ${worst.theme} ${worst.kind} ${worst.tok})`);
