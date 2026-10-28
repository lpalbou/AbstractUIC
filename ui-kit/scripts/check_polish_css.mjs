#!/usr/bin/env node
/**
 * Release-closing polish (2026-10-28, ui-kit 0.9.3): the theme rules behind three visible
 * defects, each pinned so removing the fix is red (over src/theme.css, comments stripped):
 *  A. "Create a voice" / "Manage voices" are styled cards, not browser-default fieldsets:
 *     the card, the legend, the segmented mode switch (selected = accent tint), stacked
 *     labels, themed fields and the accent-tinted "Create voice" action;
 *  B. a tool row's one-word risk/toolset badge never breaks mid-word ("DESTRO/Y"): it does
 *     not wrap and does not shrink; the title row wraps so the badge moves under the name;
 *  C. ProviderModelPicker: the long named default ellipsizes, the short "Custom" never does.
 * Optional argv[2]: a candidate theme.css path.
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
// Declarations of every top-level rule whose selector list names `selector` exactly
// (rules inside @media blocks are not matched: the base look must not depend on a query).
const top = css.replace(/@media[^{]*\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g, "").replace(/@container[^{]*\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g, "");
const rules = (selector) =>
  [...top.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
    .filter((m) => m[1].split(",").map((s) => s.trim()).includes(selector))
    .map((m) => m[2])
    .join(";");
const has = (selector, re) => re.test(rules(selector));

// A. Create a voice / Manage voices
for (const sel of [".af-voice-create", ".af-voice-library"]) {
  check(`A ${sel} is a bordered card`, has(sel, /border:\s*1px solid var\(--ui-border-1\)/) && has(sel, /border-radius:\s*var\(--radius-md\)/), rules(sel));
  check(`A ${sel} legend is styled`, has(`${sel} > legend`, /font-weight:\s*600/), rules(`${sel} > legend`));
}
check("A the create card stacks its fields", has(".af-voice-create", /display:\s*grid/) && has(".af-voice-create > label", /display:\s*grid/), rules(".af-voice-create > label"));
check("A the mode switch is the segmented pill", has(".af-voice-create__modes", /border-radius:\s*999px/) && has(".af-voice-create__modes > button", /border:\s*0/));
check("A the selected mode is accent-tinted", has('.af-voice-create__modes > button[aria-selected="true"]', /background:\s*color-mix\(in srgb, var\(--accent\) 22%/));
check("A fields are themed", has(".af-voice-create textarea", /background:\s*var\(--bg-input/) && has('.af-voice-create input:not([type="file"])', /border:\s*1px solid var\(--border-default\)/));
check("A the file picker button is themed", has('.af-voice-create input[type="file"]::file-selector-button', /border:\s*1px solid var\(--ui-border-1\)/));
check("A Create voice is the accent-tinted primary", has('.af-voice-create > [data-action="create-voice"]', /background:\s*color-mix\(in srgb, var\(--accent\) 22%/));
check("A touch floor covers the create fields (its buttons: the voice block's own coarse rule)", /@media \(pointer: coarse\)\s*\{[^}]*\.af-voice-create input:not\(\[type="file"\]\),/.test(css) && /\.af-voice-create button\s*\{\s*min-height:\s*44px/.test(css));

// B. tool row badge
check("B the badge never wraps inside itself", has(".af-tool-row__badge", /white-space:\s*nowrap/), rules(".af-tool-row__badge"));
check("B the badge never shrinks", has(".af-tool-row__badge", /flex:\s*0 0 auto/), rules(".af-tool-row__badge"));
check("B the title row wraps", has(".af-tool-row__title", /flex-wrap:\s*wrap/), rules(".af-tool-row__title"));

// C. provider picker segmented control
check("C Custom never shrinks", has(".af-pmp__seg-btn:last-child", /flex:\s*0 0 auto/), rules(".af-pmp__seg-btn:last-child"));
check("C the named default may shrink", has(".af-pmp__seg-btn:first-child", /min-width:\s*0/), rules(".af-pmp__seg-btn:first-child"));

console.log(failures ? `check_polish_css: ${failures} of ${checks} failed` : `check_polish_css: OK (${checks} checks: voice creation cards, tool-row badge, picker Custom)`);
if (failures) process.exit(1);
