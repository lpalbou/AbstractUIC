#!/usr/bin/env node
/**
 * Filter bar checks (operator design finding 2026-10-29, docs/filter-bar.md).
 *
 * 1. AfFilterBar renders the markup contract: the first line (scope switch, search field,
 *    submit, toggles, end), one row per facet (group named by the label, the label in its
 *    own column, the chips in the chips column, the trailing control after the chips), every
 *    chip the kit chip at the filter size with aria-pressed, the facet/value hooks, the count
 *    as muted text outside the label, and a disabled facet disables every chip.
 * 2. ONE source: the plain-HTML functions (afFilterFacetsHtml, afFilterScopeHtml) produce the
 *    same markup as the React component, and escape what they are given.
 * 3. theme.css carries the af-filterbar block with the rules behind the operator's words:
 *    the label in a FIXED column and the chips wrapping in the second column (also on
 *    phones: the label never stacks over the chips), one chip height, the count muted
 *    small, the search field and its toggles on ONE line, the sticky first line.
 *
 * renderToStaticMarkup over the compiled dist (no jsdom), like check_state_toggles.mjs.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const kit = await import(join(root, "dist", "index.js"));
const { AfFilterBar, AfSwitch, afFilterFacetsHtml, afFilterScopeHtml, afFilterChipName } = kit;

let failures = 0;
let checks = 0;
function check(name, cond, detail) {
  checks += 1;
  if (cond) return;
  failures += 1;
  console.error(`  FAIL ${name}${detail !== undefined ? ` — ${detail}` : ""}`);
}
const noop = () => {};

const FACETS = [
  {
    id: "quant",
    label: "Quantization",
    value: "8bit",
    options: [
      { value: "all", label: "All" },
      { value: "4bit", label: "4-bit", count: 186 },
      { value: "8bit", label: "8-bit", count: 128 },
      { value: "other", label: "Other", count: 0 },
    ],
  },
  { id: "provider", label: "Provider", value: "all", options: [{ value: "all", label: "All" }, { value: "ollama", label: "Ollama", count: 94 }] },
  { id: "status", label: "Status", value: "all", disabled: true, options: [{ value: "all", label: "All" }, { value: "downloaded", label: "Downloaded", count: 3 }] },
];

// 1) the React component
const html = renderToStaticMarkup(
  React.createElement(AfFilterBar, {
    facets: FACETS,
    onSelect: noop,
    ariaLabel: "Filter the model catalog",
    scope: { label: "Search in", value: "catalog", options: [{ value: "catalog", label: "Catalog" }, { value: "hf", label: "Hugging Face" }], onChange: noop },
    search: { value: "qwen", onChange: noop, ariaLabel: "Search the model catalog", placeholder: "Search", onSubmit: noop, submitLabel: "Search" },
    toggles: React.createElement(AfSwitch, { label: "Fits this computer", checked: true, variant: "sm" }),
    end: React.createElement("span", { className: "count" }, "3 of 9"),
    trailing: { quant: React.createElement(AfSwitch, { label: "Every quant", checked: false, variant: "sm" }) },
    sticky: true,
  }),
);
check("root is .af-filterbar (sticky modifier)", /^<div class="af-filterbar af-filterbar--sticky">/.test(html), html.slice(0, 80));
const lead = (html.match(/<div class="af-filterbar__lead"[\s\S]*?<div class="af-filterbar__facets">/) || [""])[0];
check("the first line is a search landmark", /<div class="af-filterbar__lead" role="search" aria-label="Filter the model catalog">/.test(lead), lead.slice(0, 120));
check("scope switch: a named group of pressed buttons", lead.includes('<div class="af-filterbar__scope" role="group" aria-label="Search in">') && lead.includes('data-af-scope="catalog" aria-pressed="true"') && lead.includes('data-af-scope="hf" aria-pressed="false"'));
const line = (lead.match(/<div class="af-filterbar__line">([\s\S]*?)<\/div><div class="af-filterbar__end">/) || [, ""])[1];
check("the search field and the toggles share ONE line element", /^<input type="search" class="af-filterbar__search"/.test(line) && line.includes('class="af-filterbar__toggles"') && line.includes("Fits this computer"), line);
check("the search field is the search type with its name and the search enter key", /aria-label="Search the model catalog"/.test(line) && /enterkeyhint="search"/i.test(line));
check("the submit button sits on the line", line.includes('<button type="button" class="af-filterbar__submit">Search</button>'));
check("the end slot closes the first line", lead.includes('<div class="af-filterbar__end"><span class="count">3 of 9</span></div>'));
check("the toggles are the kit switch", /class="af-switch af-switch--sm"/.test(line));

const facets = (html.match(/<div class="af-filterbar__facets">([\s\S]*)<\/div><\/div>$/) || [, ""])[1];
const rows = facets.split('<div class="af-filterbar__facet').slice(1);
check("one row per facet", rows.length === 3, rows.length);
check("a row is a group named by its label", facets.includes('role="group" aria-label="Quantization" data-af-facet-row="quant"'));
check("the label is the first child, in its own element (the fixed column)", /^"[^>]*><span class="af-filterbar__label" aria-hidden="true">Quantization<\/span><div class="af-filterbar__chips">/.test(rows[0]), rows[0].slice(0, 160));
const chip = (value) => (facets.match(new RegExp(`<button[^>]*data-af-value="${value}"[^>]*>[\\s\\S]*?</button>`)) || [""])[0];
check("chips are the kit chip at the filter size", /class="af-chip af-chip--neutral af-chip--button af-filterbar__chip"/.test(chip("4bit")), chip("4bit"));
check("chips carry the facet and value hooks", /data-af-facet="quant" data-af-value="4bit"/.test(chip("4bit")));
check("the selected chip is aria-pressed=true, the others false", /aria-pressed="true"/.test(chip("8bit")) && /aria-pressed="false"/.test(chip("4bit")) && /aria-pressed="false"/.test(chip("all")));
check("the count is muted text OUTSIDE the label", /<span class="af-chip__label">4-bit<\/span><span class="af-filterbar__count" aria-hidden="true">186<\/span>/.test(chip("4bit")), chip("4bit"));
check("the accessible name reads label, count", /aria-label="4-bit, 186"/.test(chip("4bit")) && afFilterChipName({ value: "x", label: "All" }) === "All");
check("no count, no count element", !/af-filterbar__count/.test(chip("all")));
check("a zero count marks the chip --zero", /af-filterbar__chip--zero/.test(chip("other")) && !/af-filterbar__chip--zero/.test(chip("4bit")));
check("trailing control ends the chips column of ITS facet", /<span class="af-filterbar__trailing"><button[^>]*class="af-switch af-switch--sm"[\s\S]*Every quant[\s\S]*<\/span><\/div><\/div>$/.test(rows[0]) && !rows[1].includes("af-filterbar__trailing"), rows[0].slice(-300));
check("a disabled facet disables every chip and none reads pressed", /af-filterbar__facet--disabled/.test(rows[2]) && (rows[2].match(/disabled=""/g) || []).length === 2 && !rows[2].includes('aria-pressed="true"'), rows[2]);

// 2) ONE source: the plain-HTML functions == the component
const norm = (s) => s.replace(/&#x27;/g, "&#39;");
const reactRows = renderToStaticMarkup(React.createElement(AfFilterBar, { facets: FACETS, onSelect: noop }));
const reactFacets = (reactRows.match(/<div class="af-filterbar__facets">([\s\S]*)<\/div><\/div>$/) || [, ""])[1];
check("afFilterFacetsHtml == AfFilterBar's facet rows", norm(afFilterFacetsHtml(FACETS)) === norm(reactFacets), `\n  html : ${afFilterFacetsHtml(FACETS)}\n  react: ${reactFacets}`);
const scopeProps = { label: "Search in", value: "hf", options: [{ value: "catalog", label: "Catalog" }, { value: "hf", label: "Hugging Face" }] };
const reactScope = (renderToStaticMarkup(React.createElement(AfFilterBar, { facets: [], onSelect: noop, scope: { ...scopeProps, onChange: noop } })).match(/<div class="af-filterbar__scope"[\s\S]*?<\/div>/) || [""])[0];
check("afFilterScopeHtml == AfFilterBar's scope switch", afFilterScopeHtml(scopeProps) === reactScope, `\n  html : ${afFilterScopeHtml(scopeProps)}\n  react: ${reactScope}`);
const evil = afFilterFacetsHtml([{ id: 'q"x', label: "<b>L</b>", value: "a", options: [{ value: 'a"b', label: "<i>&</i>", title: "it's" }] }], { 'q"x': "<span>ok</span>" });
check("plain HTML escapes ids, labels, values and titles", !evil.includes("<b>") && !evil.includes("<i>") && evil.includes("&lt;i&gt;&amp;&lt;/i&gt;") && evil.includes('data-af-value="a&quot;b"') && evil.includes("it&#39;s"), evil);
check("trailing markup is the host's (inserted as given)", evil.includes('<span class="af-filterbar__trailing"><span>ok</span></span>'));
check("empty facets render an empty facets element (hidden by :empty)", /<div class="af-filterbar__facets"><\/div>/.test(renderToStaticMarkup(React.createElement(AfFilterBar, { facets: [], onSelect: noop }))));

// 3) theme.css
const rawCss = readFileSync(join(root, "src", "theme.css"), "utf8");
const begin = rawCss.indexOf("/* af-filterbar:begin");
const end = rawCss.indexOf("/* af-filterbar:end */");
check("theme.css has the af-filterbar:begin .. af-filterbar:end block", begin >= 0 && end > begin);
const css = rawCss.slice(begin, end).replace(/\/\*[\s\S]*?\*\//g, "");
const top = css.replace(/@media[^{]*\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g, "");
const rules = (src, selector) =>
  [...src.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
    .filter((m) => m[1].split(",").map((s) => s.trim()).includes(selector))
    .map((m) => m[2])
    .join(";");
const has = (selector, re, src = top) => re.test(rules(src, selector));
check("facet row: a grid with the label in a FIXED column and the chips in the rest", has(".af-filterbar__facet", /display:\s*grid/) && has(".af-filterbar__facet", /grid-template-columns:\s*var\(--af-filterbar-label-w\)\s+minmax\(0,\s*1fr\)/), rules(top, ".af-filterbar__facet"));
check("the label width is a fixed length token", /--af-filterbar-label-w:\s*[\d.]+rem/.test(rules(top, ".af-filterbar")), rules(top, ".af-filterbar"));
check("the label sits in column 1 on one line", has(".af-filterbar__label", /grid-column:\s*1\b/) && has(".af-filterbar__label", /white-space:\s*nowrap/));
check("the chips sit in column 2 and wrap there", has(".af-filterbar__chips", /grid-column:\s*2\b/) && has(".af-filterbar__chips", /flex-wrap:\s*wrap/));
check("no width query stacks the label over the chips", ![...css.matchAll(/@media[^{]*\{((?:[^{}]*\{[^{}]*\})*)[^{}]*\}/g)].some((m) => /\.af-filterbar__(facet|chips|label)\s*\{[^}]*(grid-template-columns:\s*(1fr|minmax\(0,\s*1fr\))\s*;|grid-column:\s*(1\s*\/\s*-1|span))/.test(m[1])));
check("one chip height: height and min-height on the chip token", has(".af-filterbar__chip", /(^|;)\s*height:\s*var\(--af-filterbar-chip-h\)/) && has(".af-filterbar__chip", /min-height:\s*var\(--af-filterbar-chip-h\)/), rules(top, ".af-filterbar__chip"));
check("the label's line box is the chip height (labels align with the first chip row)", has(".af-filterbar__label", /line-height:\s*var\(--af-filterbar-chip-h\)/));
check("the scope buttons share the chip height", has(".af-filterbar__scope-btn", /(^|;)\s*height:\s*var\(--af-filterbar-chip-h\)/));
check("pressed chip turns to the accent hue", has('.af-filterbar__chip[aria-pressed="true"]', /--af-chip-hue:\s*var\(--accent\)/));
check("count: muted, small, tabular", has(".af-filterbar__count", /color:\s*var\(--text-muted\)/) && has(".af-filterbar__count", /font-size:\s*var\(--font-size-xs\)/) && has(".af-filterbar__count", /tabular-nums/));
check("search + toggles: ONE line that never wraps", has(".af-filterbar__line", /display:\s*flex/) && has(".af-filterbar__line", /flex-wrap:\s*nowrap/) && has(".af-filterbar__toggles", /flex:\s*none/));
check("the search field shrinks before anything wraps", has(".af-filterbar__search", /flex:\s*1 1 auto/) && has(".af-filterbar__search", /min-width:\s*[\d.]+rem/));
check("sticky: the wrapper yields its box, the first line sticks", has(".af-filterbar--sticky", /display:\s*contents/) && has(".af-filterbar--sticky > .af-filterbar__lead", /position:\s*sticky/));
check("a hidden submit stays hidden (its display is set)", has(".af-filterbar__submit[hidden]", /display:\s*none/));
check("touch: the scope buttons get the invisible 44 px hit area", /@media \(pointer: coarse\)[\s\S]*\.af-filterbar__scope-btn::after\s*\{[^}]*var\(--tap-min\)/.test(css));

console.log(failures ? `check_filter_bar: ${failures}/${checks} FAILED` : `check_filter_bar: OK (${checks} checks)`);
process.exit(failures ? 1 : 0);
