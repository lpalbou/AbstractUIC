// Theme contrast audit: computes WCAG contrast for the load-bearing token
// pairs of every theme in theme.css (text on backgrounds, status colors on
// cards, syntax colors on code backgrounds) plus duplicate-role detection
// (e.g. accent === success makes actions indistinguishable from confirmations).
//
// Modes:
//   node scripts/audit_theme_contrast.mjs           report all failures (< 4.5)
//   node scripts/audit_theme_contrast.mjs --strict  exit 1 on any failure < FAIL_FLOOR
//
// The strict floor is 3.0 (blatant illegibility), not 4.5: theme palettes may
// deliberately sit between 3.0 and 4.5 for de-emphasized roles, and a hard 4.5
// gate would make every new theme a fight. The report keeps the 4.5 target
// visible; the gate only blocks what an operator would call broken.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
const HERE = dirname(fileURLToPath(import.meta.url));
const css = readFileSync(join(HERE, "..", "src", "theme.css"), "utf8");
const STRICT = process.argv.includes("--strict");
const FAIL_FLOOR = 3.0;

// Parse rule-by-rule, attributing vars to EVERY theme named in the selector list.
function parseBlocks(css) {
  const blocks = {};
  const re = /((?::root|\.|[a-z])[^{}]*?)\{([^{}]*)\}/g;
  let m;
  while ((m = re.exec(css))) {
    const selector = m[1];
    const body = m[2];
    if (!body.includes("--")) continue;
    const vars = {};
    for (const vm of body.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/g)) vars[vm[1]] = vm[2].trim();
    if (Object.keys(vars).length === 0) continue;
    const names = new Set();
    if (/^\s*:root\s*$/.test(selector) || /^\s*:root\s*,/.test(selector)) names.add(":root");
    for (const sm of selector.matchAll(/theme-([a-z0-9-]+)/g)) names.add(sm[1]);
    if (names.size === 0 && selector.includes(":root")) names.add(":root");
    for (const n of names) blocks[n] = Object.assign(blocks[n] || {}, vars);
  }
  return blocks;
}
const blocks = parseBlocks(css);
const root = blocks[":root"];
const themes = Object.keys(blocks).filter((k) => k !== ":root");

function parseColor(s) {
  if (!s) return null;
  s = s.trim();
  let m = s.match(/^#([0-9a-f]{6})$/i);
  if (m) return [parseInt(m[1].slice(0,2),16), parseInt(m[1].slice(2,4),16), parseInt(m[1].slice(4,6),16), 1];
  m = s.match(/^#([0-9a-f]{3})$/i);
  if (m) return [17*parseInt(m[1][0],16), 17*parseInt(m[1][1],16), 17*parseInt(m[1][2],16), 1];
  m = s.match(/^rgba?\(([\d.\s,%]+)\)$/i);
  if (m) { const p = m[1].split(",").map((x) => parseFloat(x)); return [p[0], p[1], p[2], p.length > 3 ? p[3] : 1]; }
  return null;
}
function resolveVar(theme, name, depth=0) {
  if (depth > 5) return null;
  const raw = (blocks[theme] && blocks[theme][name]) ?? root[name];
  if (!raw) return null;
  const vm = raw.match(/^var\((--[a-z0-9-]+)(?:,\s*(.+))?\)$/);
  if (vm) return resolveVar(theme, vm[1], depth+1) || parseColor(vm[2] || "");
  return parseColor(raw);
}
function composite(fg, bg) {
  const a = fg[3];
  return [fg[0]*a + bg[0]*(1-a), fg[1]*a + bg[1]*(1-a), fg[2]*a + bg[2]*(1-a), 1];
}
function lum([r,g,b]) {
  const f = (c) => { c/=255; return c <= 0.03928 ? c/12.92 : Math.pow((c+0.055)/1.055, 2.4); };
  return 0.2126*f(r) + 0.7152*f(g) + 0.0722*f(b);
}
function contrast(a, b) {
  const l1 = lum(a), l2 = lum(b);
  return (Math.max(l1,l2)+0.05)/(Math.min(l1,l2)+0.05);
}
function solid(theme, name, base) {
  let c = resolveVar(theme, name);
  if (!c) return null;
  if (c[3] < 1 && base) c = composite(c, base);
  return c;
}

const failures = {};
function flag(theme, pair, ratio, need) {
  (failures[theme] = failures[theme] || []).push(`${pair}: ${ratio === 0 ? "same value" : ratio.toFixed(2)} (need ${need})`);
}

for (const t of themes) {
  const bgPrimary = solid(t, "--bg-primary");
  if (!bgPrimary) continue;
  const bgSecondary = solid(t, "--bg-secondary", bgPrimary) || bgPrimary;
  const bgCard = solid(t, "--bg-card", bgPrimary) || bgSecondary;
  const checks = [
    ["--text-primary/--bg-primary", solid(t,"--text-primary",bgPrimary), bgPrimary, 4.5],
    ["--text-secondary/--bg-secondary", solid(t,"--text-secondary",bgSecondary), bgSecondary, 4.5],
    ["--text-muted/--bg-card", solid(t,"--text-muted",bgCard), bgCard, 4.5],
    ["--accent/--bg-primary", solid(t,"--accent",bgPrimary), bgPrimary, 3.0],
    ["--error/--bg-card", solid(t,"--error",bgCard), bgCard, 4.5],
    ["--success/--bg-card", solid(t,"--success",bgCard), bgCard, 4.5],
    ["--warning/--bg-card", solid(t,"--warning",bgCard), bgCard, 4.5],
    ["--info/--bg-card", solid(t,"--info",bgCard), bgCard, 4.5],
    ["--syntax-string/--bg-secondary", solid(t,"--syntax-string",bgSecondary), bgSecondary, 4.5],
    ["--syntax-key/--bg-secondary", solid(t,"--syntax-key",bgSecondary), bgSecondary, 4.5],
    ["--syntax-number/--bg-secondary", solid(t,"--syntax-number",bgSecondary), bgSecondary, 4.5],
    ["--syntax-keyword/--bg-secondary", solid(t,"--syntax-keyword",bgSecondary), bgSecondary, 4.5],
  ];
  for (const [pair, fg, bg, need] of checks) {
    if (!fg || !bg) continue;
    const r = contrast(fg, bg);
    if (r < need) flag(t, pair, r, need);
  }
  const roles = ["--accent","--success","--error","--warning","--info"];
  const vals = {};
  for (const role of roles) {
    const raw = (blocks[t] && blocks[t][role]) || root[role];
    if (!raw) continue;
    (vals[raw] = vals[raw] || []).push(role);
  }
  for (const [v, rs] of Object.entries(vals)) if (rs.length > 1) flag(t, `IDENTICAL ${rs.join("=")} (${v})`, 0, "distinct");
}

console.log(`Themes parsed: ${themes.length}\n`);
const ranked = Object.entries(failures).sort((a,b) => b[1].length - a[1].length);
let total = 0;
for (const [t, fails] of ranked) {
  total += fails.length;
  console.log(`## ${t} — ${fails.length}`);
  for (const f of fails) console.log(`   ${f}`);
}
console.log(`\nTotal failures: ${total}; clean themes: ${themes.filter((t) => !failures[t]).join(", ") || "none"}`);
if (STRICT) {
  const hard = [];
  for (const [t, fails] of Object.entries(failures)) {
    for (const f of fails) {
      const m = f.match(/: ([\d.]+) \(need/);
      if ((m && parseFloat(m[1]) < FAIL_FLOOR) || f.includes("same value")) hard.push(`${t}: ${f}`);
    }
  }
  if (hard.length) {
    console.error(`\nSTRICT FAILURES (< ${FAIL_FLOOR} or duplicate roles):`);
    for (const h of hard) console.error("  " + h);
    process.exit(1);
  }
  console.log(`strict gate: OK (no pair under ${FAIL_FLOOR}, no duplicate roles)`);
}
