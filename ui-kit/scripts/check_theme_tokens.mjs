#!/usr/bin/env node
/**
 * Theme token integrity guard for ui-kit/src/theme.css.
 *
 * Pins two invariants born from the 2026-07-11 adversarial review (the
 * solarized-light gap: a theme redefined the base semantic hues but not the
 * derived -subtle/-border tokens, so dark-blue :root values leaked into a
 * cream theme):
 *
 *   A. COVERAGE — any theme block that redefines a base semantic color
 *      (--accent/--info/--success/--warning/--error) must also define BOTH
 *      derived tokens (--<name>-subtle, --<name>-border). Derived tokens
 *      encode the hue of their base; inheriting another palette's rgba is
 *      never right.
 *   B. HUE MATCH — where a theme defines a base color as #rrggbb and its
 *      derived tokens as rgba(r, g, b, a), the rgb triplet must equal the
 *      base color exactly (one hue family per color role — the 0114 lesson
 *      applied at the kit layer).
 *
 * Dependency-free by design: run with `node scripts/check_theme_tokens.mjs`
 * (optionally passing a candidate CSS file path).
 *
 * Notes for theme authors:
 * - Invariant B only compares mechanically-comparable pairs (#hex base vs
 *   rgba() derivative). A derivative expressed via var()/color-mix() skips B
 *   deliberately — that is the escape hatch if a theme ever needs a derived
 *   tint decoupled from its base hue.
 * - Declarations inside conditional at-rules (@supports/@media) that target
 *   :root merge into the default bucket; a conditional block redefining
 *   SEMANTIC tokens could mask a coverage gap in the unconditional block.
 *   Keep semantic tokens out of conditional blocks (only --bg-card lives
 *   there today).
 * - Known non-coverage (accepted): themes defining a derivative in a wrong
 *   hue WITHOUT redefining the base; --border-accent; light themes omitting
 *   the surface sets (--ui-pill-, --ui-chip-, --ui-code- families).
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
// Optional argv[2] lets CI or a reviewer point the guard at any candidate file.
const css_path = process.argv[2] || join(here, "..", "src", "theme.css");
const css = readFileSync(css_path, "utf8");

const SEMANTIC = ["accent", "info", "success", "warning", "error"];

/* Entity-semantic vocabulary (c594 contract with observer): the names are the
 * contract, values may tune per theme. This list is the contract MINIMUM;
 * the effective required set is this union whatever `--entity-*` names the
 * default :root actually declares, so widening the vocabulary in :root
 * automatically widens the coverage requirement for every light theme (and
 * removing a contract name from :root fails loudly). */
const ENTITY_TOKENS_MIN = [
  "--entity-identity",
  "--entity-memory",
  "--entity-diary",
  "--entity-standing",
  "--entity-scar",
  "--entity-bond",
  "--entity-accent",
];

/** Strip comments so commented-out declarations never count. */
const stripped = css.replace(/\/\*[\s\S]*?\*\//g, "");

/**
 * Collect custom-property declarations per theme selector. Handles grouped
 * selectors (`:root.theme-a, :root.theme-b { ... }`) by attributing the
 * block's declarations to every listed theme. `:root` alone is the default
 * theme and is checked too.
 */
function collect_blocks(source) {
  const themes = new Map(); // name -> Map(prop -> value)
  const block_re = /([^{}]+)\{([^{}]*)\}/g;
  let match;
  while ((match = block_re.exec(source)) !== null) {
    const selectors = match[1].split(",").map((s) => s.trim()).filter(Boolean);
    const body = match[2];
    const decls = new Map();
    // Custom properties plus `color-scheme` (the light/dark marker invariant C
    // keys on — it is a normal property, not a custom one).
    const decl_re = /(--[a-z0-9-]+|color-scheme)\s*:\s*([^;]+);/gi;
    let d;
    while ((d = decl_re.exec(body)) !== null) {
      decls.set(d[1].trim(), d[2].trim());
    }
    if (decls.size === 0) continue;
    for (const sel of selectors) {
      let name = null;
      if (sel === ":root") name = ":root (default)";
      else {
        const m = sel.match(/^:root\.(theme-[a-z0-9-]+)$/);
        if (m) name = m[1];
      }
      if (!name) continue;
      const bucket = themes.get(name) || new Map();
      for (const [k, v] of decls) bucket.set(k, v);
      themes.set(name, bucket);
    }
  }
  return themes;
}

function parse_hex(value) {
  const m = String(value).trim().match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (!m) return null;
  let hex = m[1];
  if (hex.length === 3) hex = hex.split("").map((c) => c + c).join("");
  return [
    parseInt(hex.slice(0, 2), 16),
    parseInt(hex.slice(2, 4), 16),
    parseInt(hex.slice(4, 6), 16),
  ];
}

function parse_rgba(value) {
  const m = String(value).trim().match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*[\d.]+\s*)?\)$/i);
  if (!m) return null;
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

const themes = collect_blocks(stripped);
const failures = [];

for (const [theme, decls] of themes) {
  for (const name of SEMANTIC) {
    const base = decls.get(`--${name}`);
    if (!base) continue; // theme inherits the base color — derived tokens may inherit too

    for (const suffix of ["subtle", "border"]) {
      const derived_key = `--${name}-${suffix}`;
      const derived = decls.get(derived_key);
      if (!derived) {
        failures.push(
          `${theme}: defines --${name} (${base}) but not ${derived_key} — the :root value (another palette's hue) will leak into this theme.`
        );
        continue;
      }
      const base_rgb = parse_hex(base);
      const derived_rgb = parse_rgba(derived);
      // Only enforce hue-match where both sides are mechanically comparable;
      // var()/color-mix indirections are legitimate and skip the check.
      if (base_rgb && derived_rgb) {
        const same = base_rgb.every((c, i) => c === derived_rgb[i]);
        if (!same) {
          failures.push(
            `${theme}: ${derived_key} rgb(${derived_rgb.join(", ")}) does not match --${name} ${base} rgb(${base_rgb.join(", ")}) — one hue family per color role.`
          );
        }
      }
    }
  }
}

// Invariant C — entity-semantic vocabulary coverage.
//   C1: the dark default (:root) carries at least the contract minimum set.
//   C2: every LIGHT theme carries the FULL effective set (grouped light block
//       or its own) — a partial set mixes dark values into a light palette
//       exactly like the solarized-light leak. "Light" = a color-scheme value
//       containing "light" (covers `light` and `light dark`), OR membership
//       in theme.ts's `group: "light"` (invariant D closes the gap where a
//       new light theme forgets to declare color-scheme at all).
//   C3: ANY theme block touching one --entity-* token must define the full
//       effective set (all-or-nothing — partial overrides mix palettes).
const root_decls = themes.get(":root (default)") || new Map();
const entity_tokens = new Set(ENTITY_TOKENS_MIN);
for (const key of root_decls.keys()) {
  if (key.startsWith("--entity-")) entity_tokens.add(key);
}
for (const token of ENTITY_TOKENS_MIN) {
  if (!root_decls.has(token)) {
    failures.push(`:root (default): missing entity-semantic token ${token} (the c594 vocabulary is a full-set contract).`);
  }
}

// Invariant D — theme.ts is a second source of "which themes are light"; a
// light theme registered there but missing `color-scheme: light` in CSS would
// silently skip C2 while inheriting dark entity values AND dark UA widgets.
const theme_ts_path = join(dirname(css_path), "theme.ts");
let ts_light_ids = [];
try {
  const ts = readFileSync(theme_ts_path, "utf8");
  const spec_re = /id:\s*"([a-z0-9-]+)"[^}]*group:\s*"light"/g;
  let m;
  while ((m = spec_re.exec(ts)) !== null) ts_light_ids.push(`theme-${m[1]}`);
} catch {
  // theme.ts beside the css is the repo layout; a custom argv[2] candidate
  // file may not have one — skip D rather than fail on layout.
  ts_light_ids = [];
}

const is_light_theme = (theme, decls) => {
  const scheme = (decls.get("color-scheme") || "").trim();
  if (scheme.includes("light")) return true;
  return ts_light_ids.includes(theme);
};

for (const [theme, decls] of themes) {
  if (theme === ":root (default)") continue;
  const light = is_light_theme(theme, decls);
  const touches_entity = [...decls.keys()].some((k) => k.startsWith("--entity-"));
  if (!light && !touches_entity) continue;
  for (const token of entity_tokens) {
    if (!decls.has(token)) {
      failures.push(
        light
          ? `${theme}: light theme missing ${token} — the dark default value would leak into a light palette.`
          : `${theme}: defines some --entity-* tokens but not ${token} — partial overrides mix palettes (all-or-nothing).`
      );
    }
  }
}

for (const id of ts_light_ids) {
  const decls = themes.get(id);
  if (!decls) {
    failures.push(`${id}: registered as group "light" in theme.ts but has no CSS block defining tokens.`);
    continue;
  }
  const scheme = (decls.get("color-scheme") || "").trim();
  if (!scheme.includes("light")) {
    failures.push(`${id}: registered as group "light" in theme.ts but its CSS never sets color-scheme: light (UA widgets render dark).`);
  }
}

// Invariant E — every fallback-less var(--x) reference resolves to a token
// DECLARED somewhere in this stylesheet (observer's 2026-07-14 find: the
// phase-radio focus ring referenced --accent-primary, which exists nowhere,
// making the outline declaration invalid at computed-value time = an
// INVISIBLE focus ring; same class as their --border-primary find). A
// reference carrying a fallback (`var(--x, blue)`) is exempt — that is the
// deliberate consumer-supplied-token escape hatch.
const declared = new Set();
{
  const decl_re = /(--[a-zA-Z0-9-]+)\s*:/g;
  let m;
  while ((m = decl_re.exec(stripped)) !== null) declared.add(m[1]);
}
{
  // Match var( --name ) with no fallback: closing paren directly after the
  // name (whitespace allowed). var(--name, ...) does not match.
  const ref_re = /var\(\s*(--[a-zA-Z0-9-]+)\s*\)/g;
  const reported = new Set();
  let m;
  while ((m = ref_re.exec(stripped)) !== null) {
    const name = m[1];
    if (!declared.has(name) && !reported.has(name)) {
      reported.add(name);
      failures.push(
        `undefined token: var(${name}) is referenced without a fallback but ${name} is never declared — the declaration is invalid at computed-value time (silent visual void).`
      );
    }
  }
}

if (failures.length > 0) {
  console.error(`theme token integrity: ${failures.length} failure(s)\n`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}

console.log(`theme token integrity: OK (${themes.size} theme blocks checked, invariants A+B+C+D+E hold)`);
