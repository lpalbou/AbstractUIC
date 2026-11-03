#!/usr/bin/env node
/**
 * Floating layers are opaque (ui-kit 0.9.14). `--bg-card` is translucent in most themes
 * (88% of `--bg-secondary` in dark, rgba(255,255,255,0.88-0.92) in light): a popover, menu,
 * drawer, dialog or sticky bar painted with it lets the content underneath show through (the
 * select picker's list showed the field's text between the search box and the first option).
 * Each layer below must paint with `--bg-secondary`, a solid colour in every theme block, which
 * this check also verifies. Optional argv[2]: a candidate theme.css path.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const css = readFileSync(process.argv[2] || join(here, "..", "src", "theme.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
let failures = 0;
let checks = 0;
const check = (name, cond, detail) => {
  checks += 1;
  if (!cond) {
    failures += 1;
    console.error(`  FAIL ${name}${detail !== undefined ? ` — ${detail}` : ""}`);
  }
};
// Top-level rules only (a layer's base look must not depend on a media or container query).
const top = css.replace(/@media[^{]*\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g, "").replace(/@container[^{]*\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g, "").replace(/@supports[^{]*\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g, "");
const backgrounds = (selector) =>
  [...top.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
    .filter((m) => m[1].split(",").map((s) => s.trim()).includes(selector))
    .flatMap((m) => [...m[2].matchAll(/(?:^|;)\s*background(?:-color)?\s*:\s*([^;]+)/g)].map((d) => d[1].trim()));

const FLOATING = [
  ".af-select-popover",
  ".af-menu__list",
  ".af-workflow-picker__list",
  ".af-tooltip",
  ".af-critical",
  ".af-appearance",
  ".af-sheet",
  ".af-drawer",
  ".af-schedule .af-appearance__actions",
  ".af-rail--overlay .af-rail__panel-wrap",
];
for (const selector of FLOATING) {
  const values = backgrounds(selector);
  check(`${selector} paints a background`, values.length > 0, "no background declaration found");
  for (const value of values) check(`${selector} is opaque`, value === "var(--bg-secondary)", value);
}

// --bg-secondary is a solid hex colour in every block that sets it.
const secondary = [...css.matchAll(/--bg-secondary:\s*([^;]+);/g)].map((m) => m[1].trim());
check("--bg-secondary is set by the theme blocks", secondary.length >= 20, `${secondary.length} blocks`);
for (const value of secondary) check("--bg-secondary is a solid colour", /^#[0-9a-f]{6}$/i.test(value), value);

console.log(failures ? `check_opaque_surfaces: ${failures} of ${checks} failed` : `check_opaque_surfaces: OK (${checks} checks: ${FLOATING.length} floating layers on --bg-secondary, solid in ${secondary.length} theme blocks)`);
if (failures) process.exit(1);
