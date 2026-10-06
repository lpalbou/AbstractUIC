#!/usr/bin/env node
/**
 * Icon set (ui-kit 0.8.6): every icon is declared once, documented once, and renders.
 *
 * - the `IconName` union in src/icon.tsx, the exported `ICON_NAMES` and the names table in
 *   docs/icons.md are the SAME set (no duplicates, nothing missing on either side);
 * - every name renders through `Icon` (renderToStaticMarkup over the compiled dist) to an <svg>
 *   with at least one drawn shape, on its grid (24: stroke 2; 16: stroke 1.4);
 * - no two icons draw the same shapes (a copy-pasted case is caught);
 * - an unknown name draws nothing (the switch has no catch-all glyph).
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const kit = await import(join(root, "dist", "index.js"));
const src = readFileSync(join(root, "src", "icon.tsx"), "utf8");
const doc = readFileSync(join(root, "..", "docs", "icons.md"), "utf8");

let failures = 0;
let checks = 0;
function check(name, cond, detail) {
  checks += 1;
  if (!cond) {
    failures += 1;
    console.error(`FAIL ${name}${detail ? ` — ${detail}` : ""}`);
  }
}
const diff = (a, b) => [...a].filter((x) => !b.has(x));

// The union ends at the first `";` (comments inside it may contain semicolons).
const unionStart = src.indexOf("export type IconName =");
const unionBlock = src.slice(unionStart, src.indexOf('";', unionStart) + 2).replace(/\/\/.*$/gm, "");
const union = [...unionBlock.matchAll(/\|\s*"([A-Za-z0-9]+)"/g)].map((m) => m[1]);
const listed = [...kit.ICON_NAMES];
const tableRows = [...doc.matchAll(/^\| `([A-Za-z0-9]+)` \| (16|24) \|/gm)];
const documented = tableRows.map((m) => m[1]);
const grid16 = new Set(tableRows.filter((m) => m[2] === "16").map((m) => m[1]));

check("IconName union parsed", union.length >= 60, `${union.length}`);
check("union has no duplicates", new Set(union).size === union.length);
check("ICON_NAMES has no duplicates", new Set(listed).size === listed.length);
check("docs table has no duplicates", new Set(documented).size === documented.length);
const U = new Set(union), L = new Set(listed), D = new Set(documented);
check("every union name is in ICON_NAMES", diff(U, L).length === 0, diff(U, L).join(", "));
check("every ICON_NAMES entry is in the union", diff(L, U).length === 0, diff(L, U).join(", "));
check("every icon is documented in docs/icons.md", diff(L, D).length === 0, diff(L, D).join(", "));
check("docs/icons.md documents no unknown icon", diff(D, L).length === 0, diff(D, L).join(", "));

const R14 = ["image", "video", "camera", "music", "database", "branch", "loop", "variable", "minus", "divide", "function", "zoomIn", "zoomOut", "fitView", "lock"];
for (const n of R14) check(`round-14 icon ${n} exists`, L.has(n));

const seen = new Map();
for (const name of listed) {
  const html = renderToStaticMarkup(React.createElement(kit.Icon, { name, size: 16 }));
  const inner = html.replace(/^<svg[^>]*>/, "").replace(/<\/svg>$/, "");
  const shapes = (inner.match(/<(path|circle|rect|ellipse|line|polyline|polygon)\b/g) || []).length;
  check(`${name} renders an svg`, html.startsWith("<svg") && html.endsWith("</svg>"));
  check(`${name} draws at least one shape`, shapes > 0, html);
  const is16 = grid16.has(name);
  check(`${name} on its documented grid`, html.includes(is16 ? 'viewBox="0 0 16 16"' : 'viewBox="0 0 24 24"'));
  check(`${name} stroke width`, html.includes(is16 ? 'stroke-width="1.4"' : 'stroke-width="2"'));
  check(`${name} uses currentColor`, html.includes('stroke="currentColor"'));
  if (seen.has(inner)) check(`${name} differs from ${seen.get(inner)}`, false);
  seen.set(inner, name);
}
const titled = renderToStaticMarkup(React.createElement(kit.Icon, { name: "lock", title: "Locked" }));
check("title makes an image with a name", titled.includes('role="img"') && titled.includes("<title>Locked</title>"));
const unknown = renderToStaticMarkup(React.createElement(kit.Icon, { name: "noSuchIcon" }));
check("an unknown name draws nothing", !/<(path|circle|rect|ellipse)\b/.test(unknown));

if (failures) {
  console.error(`check_icons: ${failures}/${checks} FAILED`);
  process.exit(1);
}
console.log(`check_icons: OK (${listed.length} icons: union = ICON_NAMES = docs/icons.md, each renders on its grid, all distinct; ${checks} checks)`);
