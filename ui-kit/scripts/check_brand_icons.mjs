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
 *     (a reference may only point at its own `af-brand-<id>-` ids, and each is defined), no external image (Portkey embeds the official PNG);
 *  4. every fallback says why there is no logo, with a short readable badge or a kit glyph (a
 *     protocol, not a brand: System One gets the kit's `server` glyph);
 *  5. BrandMark and brandMarkHtml render the mark (svg) or the badge (text), with the brand's name;
 *  6. docs/icons.md lists every brand id with its source and licence;
 *  7. a logo is shown only where BRAND_LOGO_PERMITTED allows it (operator ruling 2026-11-02, backlog
 *     1100): every mark has a row, the brands awaiting written permission render their NAME and no
 *     logo (no svg, no embedded image) through BrandMark, brandMarkHtml and brandIconSvg, at both
 *     sizes, and docs/icons.md says which.
 */
import { createHash } from "node:crypto";
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
const { BRAND_ICONS, BRAND_FALLBACKS, BRAND_LOGO_PERMITTED, BRAND_CARD_IDS, BrandMark, brandMarkHtml, brandIconSvg, brandMarkInfo, ICON_NAMES } = kit;
const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const ids = [...BRAND_CARD_IDS.engines, ...BRAND_CARD_IDS.providers, ...BRAND_CARD_IDS.models];

check("the engines the console cards show", JSON.stringify([...BRAND_CARD_IDS.engines].sort()) === JSON.stringify(["huggingface", "llamacpp", "lmstudio", "mlx", "ollama", "vllm"]), BRAND_CARD_IDS.engines.join(","));
for (const id of ["openai", "anthropic", "openrouter", "portkey", "typesafe", "systemone", "ovh", "openai-compatible"]) check(`cloud card ${id} is a card id`, BRAND_CARD_IDS.providers.includes(id));
// Operator 2026-10-29: every brand without a mark says WHY in the brand's own words, with the URL.
// The official artwork stays recorded (BRAND_ICONS) even where it may not be shown yet (7.).
for (const id of ["anthropic", "portkey", "ovh", "typesafe"]) check(`${id}: official artwork recorded, no protocol fallback`, own(BRAND_ICONS, id) && !own(BRAND_FALLBACKS, id));
// Operator 2026-11-01 ("add the missing official brand icons"): TypeSafe's own icon from typesafe.ai
// with its terms; System One is a protocol, so the kit's neutral server glyph, never initials.
check("typesafe: TypeSafe's own site icon, with its terms", own(BRAND_ICONS, "typesafe") && BRAND_ICONS.typesafe.origin === "brand" && BRAND_ICONS.typesafe.terms === "https://typesafe.ai/legal/terms" && /NOT covered by this kit's MIT licence/.test(BRAND_ICONS.typesafe.licence) && !!BRAND_ICONS.typesafe.raster);
check("systemone: the kit's server glyph through the fallback, with the reason", own(BRAND_FALLBACKS, "systemone") && BRAND_FALLBACKS.systemone.glyph === "server" && /protocol, not a brand/.test(BRAND_FALLBACKS.systemone.reason));
// No provider card falls back to initials: every card id has artwork, a glyph or a documented badge.
for (const id of BRAND_CARD_IDS.providers) check(`no initials for provider card ${id}`, brandMarkInfo(id).kind !== "unknown", brandMarkInfo(id).kind);
check("openai: the official mark, outside the kit's MIT grant", own(BRAND_ICONS, "openai") && /NOT covered by this kit's MIT licence/.test(BRAND_ICONS.openai.licence));

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
  // The SVG file itself, or the brand's own archive that ships it (its member .svg named in the licence).
  check(`2 ${id}: source is the file's https URL`, URL_RE.test(m.source || "") && (/\.(svg|png|jpe?g|webp)(\?|$)/.test(m.source) || m.source === "https://www.anthropic.com/press-kit" || (/\.zip$/.test(m.source) && /\.svg\b/.test(m.licence))), m.source);
  check(`2 ${id}: terms page URL`, URL_RE.test(m.terms || ""), m.terms);
  check(`2 ${id}: licence in words`, typeof m.licence === "string" && m.licence.length >= 20, m.licence);
  check(`2 ${id}: restrictions recorded (may be empty only for a brand with none)`, typeof m.restrictions === "string");
  check(`2 ${id}: retrieved date`, DATE.test(m.retrieved || ""), m.retrieved);
  check(`2 ${id}: origin`, m.origin === "brand" || m.origin === "simple-icons", m.origin);
  if (m.origin === "simple-icons") check(`2 ${id}: a Simple Icons mark comes from simple-icons, CC0`, /simple-icons@\d+\.\d+\.\d+\/icons\//.test(m.source) && /CC0/.test(m.licence), m.source);
  else check(`2 ${id}: a brand mark is not a Simple Icons file`, !/simple-icons/.test(m.source), m.source);
  check(`3 ${id}: viewBox`, /^-?[\d.]+ -?[\d.]+ [\d.]+ [\d.]+$/.test(m.viewBox || ""), m.viewBox);
  const body = String(m.body || "");
  const png = id === "portkey" && /^<image width="981" height="324" href="data:image\/png;base64,[A-Za-z0-9+/=]+"\/>$/.test(body) && body.includes("iVBORw0KGgo");
  const raster = m.raster && /^<image width="(\d+)" height="(\d+)" href="data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)"\/>$/.exec(body);
  if (m.raster) {
    check(`3 ${id}: bounded raster dimensions and matching MIME`, raster && Number(raster[1]) === m.raster.width && Number(raster[2]) === m.raster.height && m.raster.width > 0 && m.raster.height > 0 && m.raster.width <= 4096 && m.raster.height <= 4096 && raster[3] === m.raster.mime);
    const bytes = Buffer.from(raster ? raster[4] : '', 'base64');
    check(`3 ${id}: original raster hash and byte limit`, bytes.length > 0 && bytes.length < 300000 && createHash('sha256').update(bytes).digest('hex') === m.raster.sha256);
    check(`3 ${id}: encoded image signature matches MIME`, raster && (raster[3] === 'image/webp' ? bytes.subarray(0,4).toString() === 'RIFF' && bytes.subarray(8,12).toString() === 'WEBP' : raster[3] === 'image/png' ? bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])) : bytes[0] === 255 && bytes[1] === 216));
  }
  const embedded = png || !!raster;
  check(`3 ${id}: draws shapes or its inline PNG`, embedded || /<(path|polygon|rect|circle|use)\b/.test(body));
  check(`3 ${id}: no script, handler, style, image or foreign object`, !/<script|\son[a-z]+=|\sstyle=|<style|<foreignObject|javascript:/i.test(body) && (embedded || !/<image/i.test(body)));
  check(`3 ${id}: no class (a class could pick up page styles)`, !/\sclass=/.test(body));
  check(`3 ${id}: no external URL`, embedded || !/https?:|\/\/|data:/i.test(body));
  const refs = [...body.matchAll(/(?:href="#|url\(#)([^")]+)/g)].map((x) => x[1]);
  const defined = new Set([...body.matchAll(/\sid="([^"]+)"/g)].map((x) => x[1]));
  check(`3 ${id}: every id is namespaced af-brand-${id}-`, [...defined].every((d) => d.startsWith(`af-brand-${id}-`)), [...defined].join(","));
  check(`3 ${id}: every reference is its own and defined`, refs.every((r) => r.startsWith(`af-brand-${id}-`) && defined.has(r)), refs.join(","));
  check(`3 ${id}: no href other than an internal one`, embedded || !/href="[^#]/.test(body));
}
// 4.
for (const [id, f] of Object.entries(BRAND_FALLBACKS)) {
  check(`4 ${id}: id matches its key`, f.id === id);
  check(`4 ${id}: a short readable badge or a kit glyph (one of them)`, f.glyph ? f.text === "" && ICON_NAMES.includes(f.glyph) : typeof f.text === "string" && /^[A-Za-z0-9]{2,3}$/.test(f.text), f.glyph || f.text);
  check(`4 ${id}: says why there is no logo`, typeof f.reason === "string" && f.reason.length >= 20, f.reason);
  check(`4 ${id}: retrieved date`, DATE.test(f.retrieved || ""));
  check(`4 ${id}: terms page when a brand has one`, f.terms === "" || URL_RE.test(f.terms), f.terms);
}
// 5.
const shown = (id) => own(BRAND_ICONS, id) && BRAND_LOGO_PERMITTED[id].logoPermitted;
for (const id of ids) {
  const html = renderToStaticMarkup(React.createElement(BrandMark, { id }));
  const str = brandMarkHtml(id);
  const name = own(BRAND_ICONS, id) ? BRAND_ICONS[id].name : BRAND_FALLBACKS[id].name;
  if (own(BRAND_ICONS, id) && !shown(id)) {
    const badge = BRAND_LOGO_PERMITTED[id].badge;
    check(`5 ${id}: BrandMark shows the name badge`, html.includes("af-brand-mark--text") && html.includes(`>${badge}<`), html.slice(0, 200));
    check(`5 ${id}: brandMarkHtml shows the name badge`, str.includes("af-brand-mark--text") && str.includes(`>${badge}<`), str.slice(0, 200));
  } else if (own(BRAND_ICONS, id)) {
    check(`5 ${id}: BrandMark renders the svg`, /<svg viewBox="/.test(html) && html.includes(`data-brand="${id}"`) && !html.includes("af-brand-mark--text"), html.slice(0, 200));
    check(`5 ${id}: brandMarkHtml = the same mark`, str.includes(brandIconSvg(id)) && str.startsWith('<span class="af-brand-mark"'));
  } else if (BRAND_FALLBACKS[id].glyph) {
    check(`5 ${id}: the kit glyph (an svg, no text)`, html.includes("af-brand-mark--glyph") && /<svg[^>]*viewBox="0 0 16 16"/.test(html) && html.includes("<rect") && !html.includes("af-brand-mark--text"), html);
    check(`5 ${id}: brandMarkHtml draws the same glyph`, str.includes("af-brand-mark--glyph") && /<svg[^>]*viewBox="0 0 16 16"/.test(str) && str.includes("<rect") && str.includes('stroke-width="1.4"') && !/className|strokeWidth/.test(str), str);
  } else {
    check(`5 ${id}: the text badge`, html.includes("af-brand-mark--text") && html.includes(`>${BRAND_FALLBACKS[id].text}<`) && !html.includes("<svg"), html);
    check(`5 ${id}: brandMarkHtml badge`, str.includes("af-brand-mark--text") && str.includes(`>${BRAND_FALLBACKS[id].text}<`));
  }
  check(`5 ${id}: named for assistive tech`, html.includes(`aria-label="${name.replace(/&/g, "&amp;")}"`) && html.includes('role="img"'), html.slice(0, 160));
}
check("5 an unlisted id gets initials, never another brand's mark", brandMarkHtml("groq", "Groq").includes(">Gr<") && !brandMarkHtml("groq").includes("<svg"));
check("5 names are escaped", !brandMarkHtml("x", '"><img src=x>').includes("<img"));
for (const id of BRAND_CARD_IDS.models) {
  check(`compact ${id}: HTML size prop`, brandMarkHtml(id, undefined, 'sm').includes('af-brand-mark--sm'));
  check(`compact ${id}: React size prop`, renderToStaticMarkup(React.createElement(BrandMark, {id, size:'sm'})).includes('af-brand-mark--sm'));
}
// 6.
for (const [id, m] of Object.entries(BRAND_ICONS)) check(`6 docs/icons.md lists ${id} with its source`, doc.includes(`| \`${id}\` |`) && doc.includes(m.source), id);
// 7. The ruling, written out here so a flip in the table is a deliberate, reviewed change of this list.
const AWAITING = ["anthropic", "deepseek", "google", "meta", "microsoft", "mistral", "nvidia", "ollama", "ovh", "portkey"];
for (const id of ["openai", "openrouter", "huggingface", "lmstudio"]) check(`7 ${id}: its logo is shown (its terms allow it)`, own(BRAND_LOGO_PERMITTED, id) && BRAND_LOGO_PERMITTED[id].logoPermitted === true);
check("7 exactly the brands awaiting written permission hide their logo", JSON.stringify(Object.keys(BRAND_LOGO_PERMITTED).filter((id) => !BRAND_LOGO_PERMITTED[id].logoPermitted).sort()) === JSON.stringify(AWAITING), Object.keys(BRAND_LOGO_PERMITTED).filter((id) => !BRAND_LOGO_PERMITTED[id].logoPermitted).join(","));
check("7 every mark has a permission row and every row a mark", JSON.stringify(Object.keys(BRAND_ICONS).sort()) === JSON.stringify(Object.keys(BRAND_LOGO_PERMITTED).sort()));
for (const [id, p] of Object.entries(BRAND_LOGO_PERMITTED)) {
  check(`7 ${id}: a boolean and a readable name badge`, typeof p.logoPermitted === "boolean" && typeof p.badge === "string" && /^[A-Za-z][A-Za-z0-9 .]{1,13}$/.test(p.badge), JSON.stringify(p));
  const row = doc.split("\n").find((l) => l.startsWith(`| \`${id}\` |`)) || "";
  check(`7 docs/icons.md row of ${id} says ${p.logoPermitted ? "logo" : "name badge"}`, p.logoPermitted ? row.includes("| logo |") : row.includes(`| name badge "${p.badge}" (backlog 1100) |`), row.slice(0, 120));
}
for (const id of AWAITING) {
  for (const size of ["md", "sm"]) {
    const outs = [renderToStaticMarkup(React.createElement(BrandMark, { id, size })), brandMarkHtml(id, undefined, size)];
    for (const out of outs) check(`7 ${id} (${size}): no logo drawn, the name instead`, !/<svg|<image|data:image/i.test(out) && out.includes(`>${BRAND_LOGO_PERMITTED[id].badge}<`) && out.includes("af-brand-mark--text"), out.slice(0, 160));
  }
  check(`7 ${id}: brandIconSvg gives no logo`, brandIconSvg(id) === "");
  check(`7 ${id}: brandMarkInfo is the name badge with the reason`, brandMarkInfo(id).kind === "text" && /backlog 1100/.test(brandMarkInfo(id).fallback.reason));
}
for (const id of Object.keys(BRAND_FALLBACKS)) check(`6 docs/icons.md lists the ${id} fallback`, doc.includes(`| \`${id}\` |`), id);

if (failures) {
  console.error(`check_brand_icons: ${failures}/${checks} FAILED`);
  process.exit(1);
}
console.log(`check_brand_icons: OK (${Object.keys(BRAND_ICONS).length} marks + ${Object.keys(BRAND_FALLBACKS).length} text fallbacks cover ${ids.length} card ids; each mark has source, licence and date, and is self-contained; ${checks} checks)`);
