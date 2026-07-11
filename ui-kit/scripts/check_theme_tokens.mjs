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
 * Dependency-free by design: run with `node scripts/check_theme_tokens.mjs`.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
// Optional argv[2] lets CI or a reviewer point the guard at any candidate file.
const css_path = process.argv[2] || join(here, "..", "src", "theme.css");
const css = readFileSync(css_path, "utf8");

const SEMANTIC = ["accent", "info", "success", "warning", "error"];

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
    const decl_re = /(--[a-z0-9-]+)\s*:\s*([^;]+);/gi;
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

if (failures.length > 0) {
  console.error(`theme token integrity: ${failures.length} failure(s)\n`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}

console.log(`theme token integrity: OK (${themes.size} theme blocks checked, invariants A+B hold)`);
