#!/usr/bin/env node
/**
 * Responsive contract guard (ui-kit 0.3.0, responsive workstream 2026-09-30).
 *
 * Pins, over src/theme.css + the built dist (run after `npm run build`):
 *  A. every width @media query uses a NAMED breakpoint (479.98 / 767.98 /
 *     1023.98 / 1439.98 max, 1440 min) and every height query is the `short`
 *     axis (max-height: 500px) — no stray magic numbers creep back;
 *  B. the dist AF_BREAKPOINTS / AF_MEDIA equal the CSS values (one contract);
 *  C. the responsive tokens exist on :root (removing one fails loud);
 *  D. touch floors: coarse pointers raise --tap-min to 44px and
 *     --font-size-input to >= 16px; html text-size-adjust is pinned;
 *  E. the kit's query containers are declared.
 * Optional argv[2]: a candidate theme.css path.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const css_path = process.argv[2] || join(here, "..", "src", "theme.css");
const css = readFileSync(css_path, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
const { AF_BREAKPOINTS, AF_MEDIA } = await import(join(here, "..", "dist", "responsive.js"));

let failures = 0;
const fail = (msg) => {
  failures += 1;
  console.error(`  FAIL ${msg}`);
};

// A. named breakpoints only
const ALLOWED_MAX = new Set(["479.98px", "767.98px", "1023.98px", "1439.98px"]);
const ALLOWED_MIN = new Set(["1440px"]);
for (const m of css.matchAll(/@media([^{]*)\{/g)) {
  const q = m[1];
  for (const w of q.matchAll(/max-width:\s*([\d.]+px)/g)) if (!ALLOWED_MAX.has(w[1])) fail(`@media max-width ${w[1]} is not a named breakpoint (${q.trim()})`);
  for (const w of q.matchAll(/min-width:\s*([\d.]+px)/g)) if (!ALLOWED_MIN.has(w[1])) fail(`@media min-width ${w[1]} is not a named breakpoint (${q.trim()})`);
  for (const h of q.matchAll(/(max|min)-height:\s*([\d.]+px)/g)) if (!(h[1] === "max" && h[2] === "500px")) fail(`@media ${h[1]}-height ${h[2]} is not the short axis (${q.trim()})`);
}

// B. JS contract == CSS values
const expect_bp = { xs: 480, sm: 768, md: 1024, lg: 1440 };
for (const [k, v] of Object.entries(expect_bp)) if (AF_BREAKPOINTS[k] !== v) fail(`AF_BREAKPOINTS.${k} = ${AF_BREAKPOINTS[k]}, expected ${v}`);
for (const k of ["xs", "sm", "md", "lg"]) {
  const want = `(max-width: ${expect_bp[k] - 0.02}px)`;
  if (AF_MEDIA[k] !== want) fail(`AF_MEDIA.${k} = ${AF_MEDIA[k]}, expected ${want}`);
  // The kit's own components switch at xs and sm (md/lg are app-shell breakpoints).
  if ((k === "xs" || k === "sm") && !css.includes(`max-width: ${expect_bp[k] - 0.02}px`)) fail(`theme.css never uses the ${k} breakpoint`);
}
if (AF_MEDIA.xl !== "(min-width: 1440px)") fail(`AF_MEDIA.xl = ${AF_MEDIA.xl}`);
if (AF_MEDIA.short !== "(max-height: 500px)") fail(`AF_MEDIA.short = ${AF_MEDIA.short}`);
if (AF_MEDIA.touch !== "(pointer: coarse)") fail(`AF_MEDIA.touch = ${AF_MEDIA.touch}`);

// C. tokens on :root
const TOKENS = [
  "--font-size-2xl", "--font-size-body", "--font-size-input", "--font-size-code",
  "--space-1", "--space-2", "--space-3", "--space-4", "--space-5", "--space-6", "--gutter",
  "--tap-min", "--control-h", "--row-pad-y", "--row-pad-x", "--control-pad-x",
  "--vh-full", "--keyboard-inset", "--safe-top", "--safe-right", "--safe-bottom", "--safe-left",
  "--content-max", "--reading-max", "--form-max", "--drawer-w",
];
const root_bodies = [...css.matchAll(/(?:^|})\s*:root\s*\{([^}]*)\}/g)].map((m) => m[1]).join("\n");
for (const t of TOKENS) if (!new RegExp(`${t}\\s*:`).test(root_bodies)) fail(`token ${t} missing from :root`);
if (!/--vh-full:\s*100dvh/.test(css)) fail("--vh-full never upgrades to 100dvh");
for (const f of ["--font-size-lg", "--font-size-md", "--font-size-base"]) {
  const m = root_bodies.match(new RegExp(`${f}:\\s*([^;]+);`));
  if (!m || /vw|clamp/.test(m[1])) fail(`${f} must stay fixed px x scale (apps use it as a legibility floor): ${m ? m[1] : "missing"}`);
}
for (const f of ["--font-size-xl", "--font-size-2xl"]) {
  const m = root_bodies.match(new RegExp(`${f}:\\s*([^;]+);`));
  if (!m || !/clamp\(/.test(m[1]) || !/var\(--font-scale\)/.test(m[1])) fail(`${f} must be a clamp() times --font-scale: ${m ? m[1] : "missing"}`);
}

// D. touch floors + text-size-adjust
const coarse = [...css.matchAll(/@media\s*\(pointer:\s*coarse\)\s*\{([\s\S]*?)\n\}/g)].map((m) => m[1]).join("\n");
if (!/--tap-min:\s*44px/.test(coarse)) fail("coarse pointers must set --tap-min: 44px");
if (!/--font-size-input:\s*max\(16px/.test(coarse)) fail("coarse pointers must floor --font-size-input at 16px");
if (!/html\s*\{[^}]*text-size-adjust:\s*100%/.test(css)) fail("html text-size-adjust: 100% missing");

// F. touch minimums apply to INTERACTIVE boxes only (kit round 2): a chip
// keeps its pill geometry (hit area via ::after), the panel select trigger
// reaches --control-h despite its 34px higher-specificity pin, About links
// and checkbox rows are 44px rows.
for (const rule of coarse.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
  const sels = rule[1].split(",").map((x) => x.trim());
  if (/min-(height|width):\s*var\(--tap-min\)/.test(rule[2])) {
    for (const sel of sels) if (/af-chip|af-auto-badge|af-topbar__dot|af-auto__facts/.test(sel)) fail(`non-interactive/pill element ${sel} gets a touch minimum box (use a ::after hit area)`);
  }
}
const coarse_has = (sel, decl) => [...coarse.matchAll(/([^{}]+)\{([^{}]*)\}/g)].some((r) => r[1].split(",").map((x) => x.trim()).includes(sel) && decl.test(r[2]));
if (!coarse_has(".af-select--panel .af-select-trigger", /min-height:\s*var\(--control-h\)/)) fail("coarse: .af-select--panel .af-select-trigger must use --control-h");
if (!coarse_has(".af-chip--button::after", /width:\s*max\(100%,\s*var\(--tap-min\)\)/)) fail("coarse: interactive chips need a 44px ::after hit area");
for (const sel of [".af-about-card__link", ".af-gateway-signin__checkbox", ".af-email__check", ".af-auto__linkbtn", ".af-topbar__pill"]) {
  if (!coarse_has(sel, /min-height:\s*var\(--tap-min\)/)) fail(`coarse: ${sel} must reach --tap-min`);
}

// G. primary reading text in kit surfaces opts into --font-size-body on touch.
for (const sel of [".af-auto", ".af-critical__consequence", ".af-critical__fallback", ".af-about-card__link"]) {
  if (!coarse_has(sel, /font-size:\s*var\(--font-size-body\)/)) fail(`coarse: ${sel} must use --font-size-body (primary reading text, docs/responsive.md)`);
}

// H. kit round 3: native selects are sizeable in WebKit only without the
// native appearance; disclosure content must not clip a chip's hit area.
if (!/select:not\(\[multiple\]\):where\(:not\(\[size\]\), \[size="1"\]\)\s*\{[^}]*appearance:\s*none[^}]*min-height:\s*var\(--tap-min\)[^}]*background-image:\s*var\(--af-select-chevron\)/.test(coarse)) fail("coarse: single-choice selects need appearance:none + min-height var(--tap-min) + the chevron at (0,1,1) specificity (WebKit ignores min-height on native selects; apps' element-level resets must not erase the chevron)");
{
  // The consoles' theme sync copies only the FIRST top-level :root block: the token must live there.
  const first_root = (css.match(/(?:^|\n):root\s*\{([^}]*)\}/) || [, ""])[1];
  if (!/--af-select-chevron:\s*url\(/.test(first_root)) fail("--af-select-chevron must be declared in the FIRST :root block (consoles sync only that block; appearance:none drops the native arrow)");
}
if (!coarse_has(".af-disclosure__content", /overflow-x:\s*clip/)) fail("coarse: .af-disclosure__content must clip on x only (overflow:hidden clips the chip hit area)");
if (!coarse_has(".af-disclosure__chevron:not(.af-disclosure__chevron--spacer)::after", /width:\s*max\(100%,\s*var\(--tap-min\)\)/)) fail("coarse: the disclosure chevron needs a 44px ::after hit area");

// I. fixed bottom surfaces follow --keyboard-inset (docs/responsive.md).
if (!/@media \(max-width: 767\.98px\), \(max-height: 500px\)\s*\{[\s\S]*?padding: var\(--safe-top\) 0 var\(--keyboard-inset, 0px\);/.test(css)) fail("sheet overlays must pad the bottom by --keyboard-inset (pinned actions under the keyboard)");
if (!/\.af-drawer \{[^}]*bottom: var\(--keyboard-inset, 0px\)/.test(css)) fail(".af-drawer must sit above the keyboard (bottom: var(--keyboard-inset, 0px))");

// J. block presence (reviewer B): deleting the general coarse-pointer touch
// block or the bottom-sheet dialog rule must fail. Declarations are RESOLVED
// per selector (every rule whose selector list names it, in the block), so
// splitting or reordering rules passes but dropping a property does not.
const blocks_of = (re) => {
  const out = [];
  for (const m of css.matchAll(re)) {
    let i = m.index + m[0].length, depth = 1;
    while (depth && i < css.length) { if (css[i] === "{") depth += 1; else if (css[i] === "}") depth -= 1; i += 1; }
    out.push(css.slice(m.index + m[0].length, i - 1));
  }
  return out.join("\n");
};
const resolve = (block, sel) => {
  const decls = {};
  for (const r of block.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (!r[1].split(",").map((x) => x.trim()).includes(sel)) continue;
    for (const d of r[2].matchAll(/([a-z-]+)\s*:\s*([^;]+);/g)) decls[d[1]] = d[2].trim();
  }
  return decls;
};
const coarse_all = blocks_of(/@media\s*\(pointer:\s*coarse\)\s*\{/g);
for (const sel of [".af-gateway-signin button", ".af-gateway-signin input:not([type=\"checkbox\"])", ".af-steer__send", ".af-critical__actions button", ".af-auto__btn", ".af-tool-policy__filter input", ".af-appearance__close", ".af-phase-radio__btn"]) {
  if (resolve(coarse_all, sel)["min-height"] !== "var(--tap-min)") fail(`coarse touch block: ${sel} must resolve min-height: var(--tap-min)`);
}
for (const sel of [".af-topbar__btn", ".af-drawer__close"]) {
  const d = resolve(coarse_all, sel);
  if (d["min-width"] !== "var(--tap-min)" || d["min-height"] !== "var(--tap-min)") fail(`coarse touch block: icon button ${sel} must be tap-min in both axes`);
}
const sheet = blocks_of(/@media \(max-width: 767\.98px\), \(max-height: 500px\)\s*\{/g);
if (!sheet) fail("bottom-sheet block @media (max-width: 767.98px), (max-height: 500px) is missing");
for (const sel of [".af-connect-overlay", ".af-critical__overlay", ".af-appearance-overlay", ".af-sheet-overlay"]) {
  const d = resolve(sheet, sel);
  if (d["align-items"] !== "flex-end") fail(`sheet mode: ${sel} must align its dialog to the bottom (align-items: flex-end), got ${d["align-items"]}`);
  if (!/var\(--keyboard-inset/.test(d["padding"] || "")) fail(`sheet mode: ${sel} must pad the bottom by --keyboard-inset`);
}
for (const sel of [".af-connect-modal", ".af-appearance", ".af-critical", ".af-sheet"]) {
  const d = resolve(sheet, sel);
  const want = { width: "100%", "max-height": "100%", "box-sizing": "border-box", "border-bottom-left-radius": "0", "border-bottom-right-radius": "0" };
  for (const [k, v] of Object.entries(want)) if (d[k] !== v) fail(`sheet mode: ${sel} must resolve ${k}: ${v} (got ${d[k]})`);
}
for (const sel of [".af-gateway-signin__actions", ".af-appearance__actions", ".af-critical__actions"]) {
  const d = resolve(sheet, sel);
  if (d.position !== "sticky" || d.bottom !== "0") fail(`sheet mode: ${sel} must be pinned (position: sticky; bottom: 0)`);
}

// K. tool policy rows never push the approval select past the row edge:
// the name column shrinks (minmax(0, 1fr)), the select is capped, rows do not
// shrink in the scrolling list, and a narrow editor wraps the select under
// the name (scoped so it beats the later base rule).
{
  const base = resolve(css.replace(/@(media|container|supports)[^{]*\{[\s\S]*?\n\}/g, ""), ".af-tool-row");
  if (!/^auto minmax\(0, 1fr\) auto/.test(base["grid-template-columns"] || "")) fail(`.af-tool-row must use grid-template-columns: auto minmax(0, 1fr) auto (got ${base["grid-template-columns"]})`);
  if (base["flex-shrink"] !== "0") fail(".af-tool-row must not shrink in the scrolling list (flex-shrink: 0)");
  if (resolve(css, ".af-tool-row__approval select")["max-width"] !== "100%") fail(".af-tool-row__approval select must be capped at max-width: 100%");
  if (resolve(css, ".af-tool-row__meta")["min-width"] !== "0") fail(".af-tool-row__meta must have min-width: 0");
  const narrow = blocks_of(/@container af-tool-policy \(max-width: 359\.98px\)\s*\{/g);
  if (!/^auto minmax\(0, 1fr\)$/.test(resolve(narrow, ".af-tool-policy .af-tool-row")["grid-template-columns"] || "")) fail("narrow tool policy (< 360px) must drop to two columns with .af-tool-policy .af-tool-row");
  if (resolve(narrow, ".af-tool-policy .af-tool-row__approval")["grid-column"] !== "2") fail("narrow tool policy must wrap the approval select under the name (grid-column: 2)");
}

// E. containers
for (const [sel, name] of [[".af-gateway-signin", "af-signin"], [".af-appearance", "af-dialog"], [".af-auto", "af-auto"], [".af-tool-policy", "af-tool-policy"], [".af-drawer__body", "af-drawer"]]) {
  const re = new RegExp(`${sel.replace(/[.]/g, "\\.")}\\s*\\{[^}]*container:\\s*${name}\\s*/\\s*inline-size`);
  if (!re.test(css)) fail(`${sel} must declare container ${name} / inline-size`);
}
for (const name of ["af-signin", "af-dialog", "af-auto", "af-tool-policy"]) if (!css.includes(`@container ${name} `)) fail(`no @container ${name} rule uses the declared container`);

if (failures) {
  console.error(`check_responsive: ${failures} failure(s)`);
  process.exit(1);
}
console.log(`check_responsive: OK (${TOKENS.length} tokens, named breakpoints only, touch floors, containers)`);
