#!/usr/bin/env node
/**
 * panel-chat responsive-layer guard (responsive workstream 2026-09-30;
 * reviewer B: the layer had no guard). Pins, over src/panel_chat.css and the
 * generated transcript.css:
 *  A. the query containers (pc-thread on .pc-chat-thread in BOTH files,
 *     pc-composer, pc-chat) and that each is used by an @container rule;
 *  B. container thresholds stay at the desktop-safe 359.98px (0.2.1 rule: a
 *     420px desktop drawer keeps the 0.2.0 look) and viewport queries use only
 *     the named breakpoints;
 *  C. touch (pointer: coarse): 44px approval / workflow buttons, .pc-btn,
 *     icon buttons, JSON viewer toggles; composer textarea >= 16px
 *     (--font-size-input), never --font-size-lg;
 *  D. the composer auto-grows (field-sizing + --pc-composer-rows) with a
 *     viewport cap, and composers pad the home indicator (--safe-bottom).
 * Optional argv[2]: a candidate panel_chat.css path.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const strip = (t) => t.replace(/\/\*[\s\S]*?\*\//g, "");
const css = strip(readFileSync(process.argv[2] || join(here, "..", "src", "panel_chat.css"), "utf8"));
const transcript = strip(readFileSync(join(here, "..", "transcript.css"), "utf8"));
let failures = 0;
const fail = (m) => { failures += 1; console.error(`  FAIL ${m}`); };

const blocks_of = (src, re) => {
  const out = [];
  for (const m of src.matchAll(re)) {
    let i = m.index + m[0].length, depth = 1;
    while (depth && i < src.length) { if (src[i] === "{") depth += 1; else if (src[i] === "}") depth -= 1; i += 1; }
    out.push(src.slice(m.index + m[0].length, i - 1));
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

// A. containers
const has_container = (src, sel, name) => new RegExp(`${sel.replace(/[.]/g, "\\.")}\\s*(,[^{]*)?\\{[^}]*container:\\s*${name}\\s*/\\s*inline-size`).test(src) || [...src.matchAll(/([^{}]+)\{([^{}]*)\}/g)].some((r) => r[1].split(",").map((x) => x.trim()).includes(sel) && new RegExp(`container:\\s*${name}\\s*/\\s*inline-size`).test(r[2]));
if (!has_container(css, ".pc-chat-thread", "pc-thread")) fail(".pc-chat-thread must be the pc-thread container (panel_chat.css)");
if (!has_container(transcript, ".pc-chat-thread", "pc-thread")) fail(".pc-chat-thread must be the pc-thread container in the generated transcript.css");
if (!has_container(css, ".pc-composer", "pc-composer")) fail(".pc-composer must be the pc-composer container");
for (const sel of [".pc-workflow-chat", ".pc-assistant"]) if (!has_container(css, sel, "pc-chat")) fail(`${sel} must be a pc-chat container`);
for (const name of ["pc-thread", "pc-composer", "pc-chat"]) if (!css.includes(`@container ${name} `)) fail(`no @container ${name} rule uses the declared container`);

// B. thresholds
for (const m of css.matchAll(/@container\s+(pc-[a-z]+)\s*\(max-width:\s*([\d.]+px)\)/g)) if (m[2] !== "359.98px") fail(`@container ${m[1]} (max-width: ${m[2]}): container rules fire below 360px only (a 420px desktop drawer keeps the 0.2.0 look)`);
const NAMED = new Set(["479.98px", "767.98px", "1023.98px", "1439.98px"]);
for (const m of css.matchAll(/@media([^{]*)\{/g)) for (const w of m[1].matchAll(/max-width:\s*([\d.]+px)/g)) if (!NAMED.has(w[1])) fail(`@media max-width ${w[1]} is not a named breakpoint`);
if (!/@media \(max-width: 479\.98px\)\s*\{[^}]*\.pc-tool-activity__preview/.test(css)) fail("phones must keep stacked tool rows via the 479.98px viewport fallback");

// C. touch
const coarse = blocks_of(css, /@media\s*\(pointer:\s*coarse\)\s*\{/g);
for (const sel of [".pc-btn", ".pc-workflow-interaction button", ".pc-workflow-chat__stop", ".pc-workflow-chat__error button", ".pc-assistant__suggestion", ".pc-ws__btn", ".pc-ws__entry", ".pc-tool-activity__summary"]) {
  const v = resolve(coarse, sel)["min-height"] || "";
  if (!/^var\(--tap-min, 44px\)$|^44px$/.test(v)) fail(`coarse: ${sel} must reach 44px (min-height var(--tap-min, 44px)), got "${v}"`);
}
for (const sel of [".pc-workflow-chat__icon-button", ".pc-ws__icon-btn", ".pc-json-string__toggle"]) {
  const d = resolve(coarse, sel);
  if (!/tap-min|44px/.test(d["min-width"] || "") || !/tap-min|44px/.test(d["min-height"] || "")) fail(`coarse: ${sel} must be 44px in both axes`);
}
{
  const d = resolve(coarse, ".pc-chat-icon-btn");
  if (!/tap-min/.test(d.width || "") || !/tap-min/.test(d.height || "")) fail("coarse: .pc-chat-icon-btn must be tap-min sized");
}
if (!/tap-min/.test(resolve(coarse, ".pc-json-viewer__summary")["padding-block"] || "")) fail("coarse: JSON viewer disclosure lines must pad to a 44px row");
{
  const f = resolve(coarse, ".pc-composer__textarea")["font-size"] || "";
  if (!/--font-size-input/.test(f) || /^var\(--font-size-lg/.test(f)) fail(`coarse: the composer textarea must use --font-size-input (>= 16px; --font-size-lg is fluid-safe only by accident), got "${f}"`);
}
if (!/--font-size-input/.test(resolve(coarse, ".pc-workflow-interaction textarea")["font-size"] || "")) fail("coarse: the ask-user textarea must use --font-size-input");

// D. composer growth + safe area
const supports = blocks_of(css, /@supports\s*\(field-sizing:\s*content\)\s*\{/g);
const fs = resolve(supports, ".pc-composer__textarea");
if (fs["field-sizing"] !== "content" || !/--pc-composer-rows/.test(fs["min-height"] || "")) fail("the composer textarea must auto-grow (field-sizing: content, min-height from --pc-composer-rows)");
if (!/\.pc-composer__textarea\s*\{[^}]*max-height:\s*calc\(var\(--vh-full, 100vh\) \* 0\.4\)/.test(css)) fail("the composer textarea growth must be capped at 40% of --vh-full");
for (const sel of [".pc-workflow-chat__composer", ".pc-assistant__composer"]) {
  const all = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].filter((r) => r[1].split(",").map((x) => x.trim()).includes(sel)).map((r) => r[2]).join(";");
  if (!/padding-bottom:\s*max\(10px, var\(--safe-bottom, 0px\)\)/.test(all)) fail(`${sel} must clear the home indicator (padding-bottom: max(10px, var(--safe-bottom, 0px)))`);
}

if (failures) { console.error(`check_responsive (panel-chat): ${failures} failure(s)`); process.exit(1); }
console.log("check_responsive (panel-chat): OK (containers, desktop-safe thresholds, 44px touch targets, 16px composer, auto-grow, safe area)");
