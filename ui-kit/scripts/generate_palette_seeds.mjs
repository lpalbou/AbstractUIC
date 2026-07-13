#!/usr/bin/env node
/**
 * palette_seeds.json generator — the (a) upgrade path of the code⇄uic theme
 * coordination (dm:code--uic seq 3-5, 2026-07-12).
 *
 * Emits a 4-token reduction of every kit theme (name → {primary, surface,
 * secondary, muted}) derived FROM src/theme.css, so the abstractcode TUI can
 * parity-test its own palette registry against kit truth instead of carrying
 * copied hexes. The contract is deliberately narrow: 4 tokens is what a
 * terminal theme can honestly represent (a full web theme cannot ride this
 * file — that over-promise was rejected in the DM thread).
 *
 * Token map (web → TUI seed):
 *   primary   ← --accent        (brand/interactive hue)
 *   surface   ← --bg-primary    (app ground)
 *   secondary ← --bg-secondary  (raised surface)
 *   muted     ← --text-muted    (de-emphasized text)
 *
 * Resolution follows the CSS cascade truthfully: a theme's effective value is
 * :root defaults overridden by every `:root.theme-<id>` block in source order
 * (grouped light block first, own block later — same specificity, later wins).
 * The default `:root` theme is emitted under its theme.ts id "dark".
 *
 * Modes:
 *   node scripts/generate_palette_seeds.mjs           # write palette_seeds.json
 *   node scripts/generate_palette_seeds.mjs --check   # verify committed file matches (CI/test)
 *
 * Dependency-free by design, like the other ui-kit guards.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const css_path = join(here, "..", "src", "theme.css");
const theme_ts_path = join(here, "..", "src", "theme.ts");
const out_path = join(here, "..", "palette_seeds.json");

const SEED_TOKENS = {
  primary: "--accent",
  surface: "--bg-primary",
  secondary: "--bg-secondary",
  muted: "--text-muted",
};

/** Strip comments so commented-out declarations never count. */
const css = readFileSync(css_path, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");

/**
 * Collect custom-property declarations per selector bucket, preserving source
 * order per theme (grouped selectors attribute the block to every listed
 * theme; later declarations overwrite earlier ones — CSS cascade at equal
 * specificity). Same parsing shape as check_theme_tokens.mjs, kept local so
 * both guards stay independently runnable.
 */
function collect_theme_decls(source) {
  const root = new Map(); // :root defaults
  const themes = new Map(); // theme-<id> -> Map(prop -> value)
  const block_re = /([^{}]+)\{([^{}]*)\}/g;
  let match;
  while ((match = block_re.exec(source)) !== null) {
    const selectors = match[1].split(",").map((s) => s.trim()).filter(Boolean);
    const body = match[2];
    const decls = [];
    const decl_re = /(--[a-z0-9-]+)\s*:\s*([^;]+);/gi;
    let d;
    while ((d = decl_re.exec(body)) !== null) decls.push([d[1].trim(), d[2].trim()]);
    if (decls.length === 0) continue;
    for (const sel of selectors) {
      if (sel === ":root") {
        for (const [k, v] of decls) root.set(k, v);
        continue;
      }
      const m = sel.match(/^:root\.theme-([a-z0-9-]+)$/);
      if (!m) continue;
      const bucket = themes.get(m[1]) || new Map();
      for (const [k, v] of decls) bucket.set(k, v);
      themes.set(m[1], bucket);
    }
  }
  return { root, themes };
}

/** Normalize #rgb/#rrggbb to lowercase #rrggbb; null for anything else. */
function normalize_hex(value) {
  const m = String(value ?? "").trim().match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (!m) return null;
  let hex = m[1].toLowerCase();
  if (hex.length === 3) hex = hex.split("").map((c) => c + c).join("");
  return `#${hex}`;
}

const { root, themes } = collect_theme_decls(css);

// theme.ts is the registry of which ids exist (and keeps the seed file from
// emitting stray CSS blocks that are not registered themes).
const ts = readFileSync(theme_ts_path, "utf8");
const registered_ids = [];
{
  const id_re = /id:\s*"([a-z0-9-]+)"/g;
  let m;
  while ((m = id_re.exec(ts)) !== null) registered_ids.push(m[1]);
}

const failures = [];
const seeds = {};

for (const id of registered_ids) {
  // Effective declarations: :root defaults overridden by the theme's blocks.
  // The default theme ("dark") is :root itself.
  const effective = new Map(root);
  if (id !== "dark") {
    const bucket = themes.get(id);
    if (!bucket) {
      failures.push(`${id}: registered in theme.ts but has no :root.theme-${id} CSS block.`);
      continue;
    }
    for (const [k, v] of bucket) effective.set(k, v);
  }

  const seed = {};
  for (const [seed_key, css_token] of Object.entries(SEED_TOKENS)) {
    const hex = normalize_hex(effective.get(css_token));
    if (!hex) {
      failures.push(
        `${id}: ${css_token} resolves to "${effective.get(css_token)}" — seed tokens must be plain hex (parity file refuses non-mechanical values).`
      );
      continue;
    }
    seed[seed_key] = hex;
  }
  if (Object.keys(seed).length === Object.keys(SEED_TOKENS).length) {
    seeds[id] = seed;
  }
}

if (failures.length > 0) {
  console.error(`palette seeds: ${failures.length} failure(s)\n`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}

// Deterministic output: theme.ts declaration order (it is the curated
// dark-then-light grouping maintainers already read), stable key order.
const payload = {
  generated_from: "ui-kit/src/theme.css",
  generator: "ui-kit/scripts/generate_palette_seeds.mjs",
  token_map: SEED_TOKENS,
  themes: seeds,
};
const serialized = JSON.stringify(payload, null, 2) + "\n";

if (process.argv.includes("--check")) {
  let existing = null;
  try {
    existing = readFileSync(out_path, "utf8");
  } catch {
    console.error("palette seeds: palette_seeds.json missing — run node scripts/generate_palette_seeds.mjs");
    process.exit(1);
  }
  if (existing !== serialized) {
    console.error(
      "palette seeds: palette_seeds.json is stale vs src/theme.css — regenerate with node scripts/generate_palette_seeds.mjs"
    );
    process.exit(1);
  }
  console.log(`palette seeds: OK (${Object.keys(seeds).length} themes in parity with theme.css)`);
} else {
  writeFileSync(out_path, serialized);
  console.log(`palette seeds: wrote ${Object.keys(seeds).length} themes to palette_seeds.json`);
}
