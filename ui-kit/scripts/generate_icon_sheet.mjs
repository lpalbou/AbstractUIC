#!/usr/bin/env node
/**
 * Icon contact sheet (ui-kit 0.8.6): renders EVERY kit icon (ICON_NAMES from the compiled dist)
 * with its name into docs/assets/icons-light.svg and docs/assets/icons-dark.svg, the sheets
 * docs/icons.md shows. `--check` fails when a sheet on disk differs from a fresh render (an icon
 * added or redrawn without regenerating the sheet).
 *
 *   npm run build -w @abstractframework/ui-kit && node ui-kit/scripts/generate_icon_sheet.mjs [--check]
 */
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const outDir = join(root, "..", "docs", "assets");
const kit = await import(join(root, "dist", "index.js"));

const COLS = 8;
const CELL_W = 124;
const CELL_H = 88;
const ICON = 28;
const PAD = 16;

const THEMES = {
  light: { bg: "#ffffff", fg: "#1f2328", muted: "#57606a", line: "#d0d7de" },
  dark: { bg: "#0d1117", fg: "#e6edf3", muted: "#9da7b3", line: "#30363d" },
};

function sheet(theme) {
  const t = THEMES[theme];
  const names = kit.ICON_NAMES;
  const rows = Math.ceil(names.length / COLS);
  const width = PAD * 2 + COLS * CELL_W;
  const height = PAD * 2 + rows * CELL_H;
  const cells = names.map((name, i) => {
    const cx = PAD + (i % COLS) * CELL_W;
    const cy = PAD + Math.floor(i / COLS) * CELL_H;
    const icon = renderToStaticMarkup(
      React.createElement(kit.Icon, { name, size: ICON, x: cx + (CELL_W - ICON) / 2, y: cy + 14, color: t.fg }),
    );
    const label = `<text x="${cx + CELL_W / 2}" y="${cy + 66}" text-anchor="middle" font-family="ui-monospace, SFMono-Regular, Menlo, monospace" font-size="11" fill="${t.muted}">${name}</text>`;
    const box = `<rect x="${cx + 2}" y="${cy + 2}" width="${CELL_W - 4}" height="${CELL_H - 4}" rx="8" fill="none" stroke="${t.line}"/>`;
    return `${box}${icon}${label}`;
  });
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="AbstractUIC icons (${theme})">\n` +
    `<rect width="100%" height="100%" fill="${t.bg}"/>\n` +
    cells.join("\n") +
    `\n</svg>\n`
  );
}

const check = process.argv.includes("--check");
let stale = 0;
mkdirSync(outDir, { recursive: true });
for (const theme of Object.keys(THEMES)) {
  const file = join(outDir, `icons-${theme}.svg`);
  const fresh = sheet(theme);
  if (check) {
    if (!existsSync(file) || readFileSync(file, "utf8") !== fresh) {
      stale += 1;
      console.error(`generate_icon_sheet: ${file} is stale — run node ui-kit/scripts/generate_icon_sheet.mjs`);
    }
  } else {
    writeFileSync(file, fresh);
  }
}
if (stale) process.exit(1);
console.log(`generate_icon_sheet: ${check ? "up to date" : "written"} (${kit.ICON_NAMES.length} icons, light + dark)`);
