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
for (const sel of [".af-about__link", ".af-gateway-signin__checkbox", ".af-email__check", ".af-auto__linkbtn", ".af-topbar__pill"]) {
  if (!coarse_has(sel, /min-height:\s*var\(--tap-min\)/)) fail(`coarse: ${sel} must reach --tap-min`);
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
