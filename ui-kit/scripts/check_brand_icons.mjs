#!/usr/bin/env node
/**
 * Brand marks (operator finding 2026-10-29: the engines' and providers' official logos, not
 * two-letter badges). Over the compiled dist and docs/icons.md:
 *  1. every id the provider cards use (BRAND_CARD_IDS: the engines and AbstractCore's cloud
 *     providers) has a mark OR a documented text fallback, never both, never neither;
 *  2. every mark carries, next to its drawing, its source file URL, its terms/licence page, the
 *     licence or terms in words, what they restrict, and the date it was taken; a Simple Icons mark
 *     comes from Simple Icons, a brand mark from the brand;
 *  3. every mark is self-contained: no script, no event handler, no style, no external reference
 *     (a reference may only point at its own `af-brand-<id>-` ids, and each is defined), no image;
 *  4. every fallback says why there is no logo, with a short readable badge;
 *  5. BrandMark and brandMarkHtml render the mark (svg) or the badge (text), with the brand's name;
 *  6. docs/icons.md lists every brand id with its source and licence.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

const here = dirname(fileURLToPath(import.meta.url));
const kit = await import(join(here, "..", "dist", "index.js"));
const doc = readFileSync(join(here, "..", "..", "docs", "icons.md"), "utf8");
let failures = 0;
let checks = 0;
function check(name, cond, detail) {
  checks += 1;
  if (cond) return;
  failures += 1;
  console.error(`  FAIL ${name}${detail !== undefined ? ` — ${detail}` : ""}`);
}
const { BRAND_ICONS, BRAND_FALLBACKS, BRAND_CARD_IDS, BrandMark, brandMarkHtml, brandIconSvg } = kit;
const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const ids = [...BRAND_CARD_IDS.engines, ...BRAND_CARD_IDS.providers];

check("the engines the console cards show", JSON.stringify([...BRAND_CARD_IDS.engines].sort()) === JSON.stringify(["huggingface", "llamacpp", "lmstudio", "mlx", "ollama", "vllm"]), BRAND_CARD_IDS.engines.join(","));
for (const id of ["openai", "anthropic", "openrouter", "portkey"]) check(`AbstractCore cloud provider ${id} is a card id`, BRAND_CARD_IDS.providers.includes(id));

// 1.
for (const id of ids) {
  const icon = own(BRAND_ICONS, id);
  const fb = own(BRAND_FALLBACKS, id);
  check(`1 ${id}: a mark or a documented fallback`, icon || fb);
  check(`1 ${id}: not both`, !(icon && fb));
}
for (const id of [...Object.keys(BRAND_ICONS), ...Object.keys(BRAND_FALLBACKS)]) check(`1 ${id} is used by a card`, ids.includes(id));

// 2 + 3.
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const URL_RE = /^https:\/\/[^\s"<>]+$/;
for (const [id, m] of Object.entries(BRAND_ICONS)) {
  check(`2 ${id}: id matches its key`, m.id === id);
  check(`2 ${id}: name`, typeof m.name === "string" && m.name.length > 1);
  check(`2 ${id}: source is the file's https URL`, URL_RE.test(m.source || "") && /\.svg(\?|$)/.test(m.source), m.source);
  check(`2 ${id}: terms page URL`, URL_RE.test(m.terms || ""), m.terms);
  check(`2 ${id}: licence in words`, typeof m.licence === "string" && m.licence.length >= 20, m.licence);
  check(`2 ${id}: restrictions recorded (may be empty only for a brand with none)`, typeof m.restrictions === "string");
  check(`2 ${id}: retrieved date`, DATE.test(m.retrieved || ""), m.retrieved);
  check(`2 ${id}: origin`, m.origin === "brand" || m.origin === "simple-icons", m.origin);
  if (m.origin === "simple-icons") check(`2 ${id}: a Simple Icons mark comes from simple-icons, CC0`, /simple-icons@\d+\.\d+\.\d+\/icons\//.test(m.source) && /CC0/.test(m.licence), m.source);
  else check(`2 ${id}: a brand mark is not a Simple Icons file`, !/simple-icons/.test(m.source), m.source);
  check(`3 ${id}: viewBox`, /^-?[\d.]+ -?[\d.]+ [\d.]+ [\d.]+$/.test(m.viewBox || ""), m.viewBox);
  const body = String(m.body || "");
  check(`3 ${id}: draws shapes`, /<(path|polygon|rect|circle|use)\b/.test(body));
  check(`3 ${id}: no script, handler, style, image or foreign object`, !/<script|\son[a-z]+=|\sstyle=|<style|<image|<foreignObject|javascript:/i.test(body));
  check(`3 ${id}: no class (a class could pick up page styles)`, !/\sclass=/.test(body));
  check(`3 ${id}: no external URL`, !/https?:|\/\/|data:/i.test(body));
  const refs = [...body.matchAll(/(?:href="#|url\(#)([^")]+)/g)].map((x) => x[1]);
  const defined = new Set([...body.matchAll(/\sid="([^"]+)"/g)].map((x) => x[1]));
  check(`3 ${id}: every id is namespaced af-brand-${id}-`, [...defined].every((d) => d.startsWith(`af-brand-${id}-`)), [...defined].join(","));
  check(`3 ${id}: every reference is its own and defined`, refs.every((r) => r.startsWith(`af-brand-${id}-`) && defined.has(r)), refs.join(","));
  check(`3 ${id}: no href other than an internal one`, !/href="[^#]/.test(body));
}
// 4.
for (const [id, f] of Object.entries(BRAND_FALLBACKS)) {
  check(`4 ${id}: id matches its key`, f.id === id);
  check(`4 ${id}: a short readable badge`, typeof f.text === "string" && /^[A-Za-z0-9]{2,3}$/.test(f.text), f.text);
  check(`4 ${id}: says why there is no logo`, typeof f.reason === "string" && f.reason.length >= 20, f.reason);
  check(`4 ${id}: retrieved date`, DATE.test(f.retrieved || ""));
  check(`4 ${id}: terms page when a brand has one`, f.terms === "" || URL_RE.test(f.terms), f.terms);
}
// 5.
for (const id of ids) {
  const html = renderToStaticMarkup(React.createElement(BrandMark, { id }));
  const str = brandMarkHtml(id);
  const name = own(BRAND_ICONS, id) ? BRAND_ICONS[id].name : BRAND_FALLBACKS[id].name;
  if (own(BRAND_ICONS, id)) {
    check(`5 ${id}: BrandMark renders the svg`, /<svg viewBox="/.test(html) && html.includes(`data-brand="${id}"`) && !html.includes("af-brand-mark--text"), html.slice(0, 200));
    check(`5 ${id}: brandMarkHtml = the same mark`, str.includes(brandIconSvg(id)) && str.startsWith('<span class="af-brand-mark"'));
  } else {
    check(`5 ${id}: the text badge`, html.includes("af-brand-mark--text") && html.includes(`>${BRAND_FALLBACKS[id].text}<`) && !html.includes("<svg"), html);
    check(`5 ${id}: brandMarkHtml badge`, str.includes("af-brand-mark--text") && str.includes(`>${BRAND_FALLBACKS[id].text}<`));
  }
  check(`5 ${id}: named for assistive tech`, html.includes(`aria-label="${name.replace(/&/g, "&amp;")}"`) && html.includes('role="img"'), html.slice(0, 160));
}
check("5 an unlisted id gets initials, never another brand's mark", brandMarkHtml("groq", "Groq").includes(">Gr<") && !brandMarkHtml("groq").includes("<svg"));
check("5 names are escaped", !brandMarkHtml("x", '"><img src=x>').includes("<img"));
// 6.
for (const [id, m] of Object.entries(BRAND_ICONS)) check(`6 docs/icons.md lists ${id} with its source`, doc.includes(`| \`${id}\` |`) && doc.includes(m.source), id);
for (const id of Object.keys(BRAND_FALLBACKS)) check(`6 docs/icons.md lists the ${id} fallback`, doc.includes(`| \`${id}\` |`), id);

if (failures) {
  console.error(`check_brand_icons: ${failures}/${checks} FAILED`);
  process.exit(1);
}
console.log(`check_brand_icons: OK (${Object.keys(BRAND_ICONS).length} marks + ${Object.keys(BRAND_FALLBACKS).length} text fallbacks cover ${ids.length} card ids; each mark has source, licence and date, and is self-contained; ${checks} checks)`);
