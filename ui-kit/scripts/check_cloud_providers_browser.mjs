#!/usr/bin/env node
// Real-browser check of the cloud provider cards (operator 2026-11-01): simpler cards with ONE
// status and ONE button (Connect / Edit), the Connect / Edit modal (AfModal: a dialog on desktop, the
// full-screen sheet below 768 px), Test connection → Save → the card's Connected badge, Edit →
// Disconnect. The gateway is a STUB inside the page (no gateway, no network, no model).
//
//   node scripts/check_cloud_providers_browser.mjs [--playwright <module path>] [--chrome <binary>] [--shots <dir>]
//
// --playwright: an installed @playwright/test (or playwright) ESM entry when this package has none;
// --chrome: a Chrome/Chromium binary; --shots: write cards + modal screenshots at 1280×800 and 390×844.
// Run after `npm run build` (it bundles dist/).
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";

const flag = (name) => { const i = process.argv.indexOf(name); return i < 0 ? "" : process.argv[i + 1] || ""; };
const pw = flag("--playwright");
const { chromium } = await import(pw ? pathToFileURL(resolve(pw)).href : "playwright");
const chrome = flag("--chrome");
const shots = flag("--shots");
const root = fileURLToPath(new URL("../", import.meta.url));
const KEY = "sk-browser-check-" + "7".repeat(24);

const bundle = await build({
  bundle: true, write: false, format: "esm", target: "es2020",
  define: { "process.env.NODE_ENV": '"production"' },
  stdin: { resolveDir: root, loader: "tsx", sourcefile: "cloud-cards-browser.tsx", contents: `
import React from "react";
import { createRoot } from "react-dom/client";
import { CloudProviderCards } from "./dist/index.js";
// The stub gateway: AbstractCore's providers (with TypeSafe and System One), one stored OpenAI key.
const DISCOVERY = { items: [
  { name: "anthropic", display_name: "Anthropic", local_provider: false },
  { name: "openai", display_name: "OpenAI", local_provider: false },
  { name: "openai-compatible", display_name: "OpenAI-Compatible", local_provider: true },
  { name: "openrouter", display_name: "OpenRouter", local_provider: false },
  { name: "portkey", display_name: "Portkey", local_provider: false },
  { name: "typesafe", display_name: "TypeSafe (Jev)", local_provider: false },
  { name: "systemone", display_name: "System One endpoint", local_provider: false },
] };
const rows = new Map([["openai-key", { id: "openai-key", provider_family: "openai", display_name: "OpenAI (API key)", api_key_set: true, api_key_fingerprint: "ab12cd34ef" }]]);
window.calls = [];
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function request(path, init) {
  window.calls.push({ path, method: init.method, body: init.body });
  await wait(120);
  if (path.endsWith("/discovery/providers")) return DISCOVERY;
  if (path.endsWith("/discover-models")) return { ok: true, models: Array.from({ length: 48 }, (_, i) => "m" + i) };
  if (path.endsWith("/config/provider-endpoint-profiles") && init.method === "GET") return { profiles: [...rows.values()] };
  if (path.endsWith("/config/provider-endpoint-profiles") && init.method === "POST") {
    const b = init.body;
    if (rows.has(b.id)) throw Object.assign(new Error("exists"), { status: 409 });
    rows.set(b.id, { id: b.id, provider_family: b.provider_family, display_name: b.display_name, base_url: b.base_url, api_key_set: true, api_key_fingerprint: "c0ffee0099" });
    return { ok: true };
  }
  const one = /\\/config\\/provider-endpoint-profiles\\/([^/]+)$/.exec(path);
  if (one && init.method === "DELETE") { rows.delete(decodeURIComponent(one[1])); return { ok: true, deleted: true }; }
  if (one && init.method === "PUT") return { ok: true };
  throw new Error("unexpected " + init.method + " " + path);
}
createRoot(document.getElementById("root")).render(<CloudProviderCards request={request} base="/api/gateway" />);
` },
});
const css = readFileSync(resolve(root, "src/theme.css"), "utf8");
const server = createServer((req, res) => {
  if (req.url === "/app.js") { res.setHeader("content-type", "text/javascript"); res.end(bundle.outputFiles[0].contents); return; }
  if (req.url === "/theme.css") { res.setHeader("content-type", "text/css"); res.end(css); return; }
  res.setHeader("content-type", "text/html");
  res.end(`<!doctype html><html data-theme="light"><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/theme.css"><style>body{margin:0;padding:16px;background:var(--bg-primary);color:var(--text-primary);font-family:var(--font-sans,system-ui)}</style></head><body><div id="root"></div><script type="module" src="/app.js"></script></body></html>`);
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const origin = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ headless: true, ...(chrome ? { executablePath: chrome } : {}) });
const shot = async (page, name) => { if (!shots) return; mkdirSync(shots, { recursive: true }); await page.screenshot({ path: resolve(shots, name), fullPage: false }); };
let checks = 0;
const ok = (cond, msg) => { checks += 1; assert(cond, msg); };
try {
  for (const viewport of [{ width: 1280, height: 800 }, { width: 390, height: 844 }]) {
    const phone = viewport.width < 768;
    const tag = `${viewport.width}x${viewport.height}`;
    const page = await browser.newPage({ viewport, reducedMotion: "reduce", ...(phone ? { hasTouch: true, isMobile: true } : {}) });
    const errors = [];
    const logs = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    page.on("console", (m) => logs.push(m.text()));
    await page.goto(origin);
    const card = (id) => page.locator(`[data-cloud-provider="${id}"]`);
    await card("openai").locator("[data-cloud-status]").filter({ hasText: "Connected" }).waitFor();

    // The cards: mark, name, ONE status, ONE button; no field on a card.
    ok(await page.locator(".af-cloud-card").count() === 8, `${tag}: eight cards`);
    ok(await page.locator(".af-cloud-card input").count() === 0, `${tag}: no field on a card`);
    for (const id of ["anthropic", "openai", "typesafe", "systemone", "ovh", "openai-compatible"]) ok(await card(id).locator("button").count() === 1, `${tag}: ${id} has ONE button`);
    ok((await card("openai").locator("[data-cloud-status]").textContent()) === "Connected · key ab12cd34", `${tag}: OpenAI's connected badge`);
    ok(await card("openai").locator(".af-cloud-card__dot").isVisible(), `${tag}: the green dot`);
    ok((await card("openai").locator("button").textContent()) === "Edit" && (await card("anthropic").locator("button").textContent()) === "Connect", `${tag}: Edit when connected, Connect otherwise`);
    ok(await card("typesafe").locator(".af-brand-mark svg image").count() === 1, `${tag}: TypeSafe's own icon`);
    ok(await card("systemone").locator(".af-brand-mark--glyph svg rect").count() === 2, `${tag}: System One's server glyph`);
    ok(await page.locator(".af-brand-mark--text").count() === 1, `${tag}: only the generic card keeps a text badge (API)`);
    const dot = await card("openai").locator(".af-cloud-card__dot").evaluate((n) => getComputedStyle(n).backgroundColor);
    ok(/rgb\(/.test(dot) && dot !== "rgba(0, 0, 0, 0)", `${tag}: the dot is coloured (${dot})`);
    if (phone) {
      const box = await card("anthropic").locator("button").boundingBox();
      ok(box.height >= 44, `${tag}: Connect is a 44 px target (${box.height})`);
    }
    ok(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth) <= 1, `${tag}: no horizontal scroll`);
    await shot(page, `cloud-cards-${tag}.png`);

    // Connect Anthropic: the modal, Test, Save.
    await card("anthropic").getByRole("button", { name: "Connect Anthropic" }).click();
    const dialog = page.getByRole("dialog", { name: "Connect Anthropic" });
    await dialog.waitFor();
    const key = dialog.getByLabel("API key");
    ok(await key.evaluate((n) => n === document.activeElement), `${tag}: the key field has focus`);
    ok((await key.getAttribute("type")) === "password", `${tag}: the key is masked`);
    await key.fill(KEY);
    // WHILE the modal is open with a typed key: no value attribute, and the key nowhere in the page.
    ok(!(await key.getAttribute("value")), `${tag}: the key field has no value attribute`);
    ok(!(await page.content()).includes(KEY) && !(await page.evaluate(() => document.documentElement.outerHTML)).includes("sk-browser-check"), `${tag}: the typed key is not in the page markup`);
    await dialog.getByRole("button", { name: "Test connection" }).click();
    await dialog.locator("[data-cloud-modal-line]").filter({ hasText: "Key works · 48 models" }).waitFor();
    ok(await page.evaluate(() => window.calls.filter((c) => c.method === "POST" && !c.path.endsWith("discover-models")).length) === 0, `${tag}: Test stores nothing`);
    const box = await page.locator(".af-modal").boundingBox();
    if (phone) {
      ok(Math.round(box.width) === viewport.width && Math.round(box.height) >= viewport.height - 1, `${tag}: the modal is the full-screen sheet (${box.width}×${box.height})`);
      const field = await key.boundingBox();
      ok(field.width >= viewport.width - 40 && field.height >= 44, `${tag}: the key field is full width, 44 px tall (${field.width}×${field.height})`);
      for (const name of ["Cancel", "Test connection", "Save"]) {
        const b = await dialog.getByRole("button", { name, exact: true }).boundingBox();
        ok(b.height >= 44, `${tag}: ${name} is a 44 px target (${b.height})`);
      }
    } else {
      ok(box.width <= 560 && box.width >= 400, `${tag}: a narrow dialog (${box.width})`);
    }
    await shot(page, `cloud-modal-${tag}.png`);
    await dialog.getByRole("button", { name: "Save", exact: true }).click();
    await dialog.waitFor({ state: "detached" });
    await card("anthropic").locator("[data-cloud-status]").filter({ hasText: "Connected · key c0ffee00 · 48 models" }).waitFor();
    ok((await card("anthropic").locator("button").textContent()) === "Edit", `${tag}: Anthropic now offers Edit`);
    const html = await page.content();
    ok(!html.includes(KEY) && !logs.some((l) => l.includes(KEY)), `${tag}: the key is nowhere in the page or the console`);
    ok(await page.evaluate(() => document.activeElement && document.activeElement.textContent) !== null, `${tag}: focus returned`);

    // Edit OpenAI: the keep-or-replace hint, Escape closes; then Disconnect with its confirmation.
    await card("openai").getByRole("button", { name: "Edit OpenAI" }).click();
    const edit = page.getByRole("dialog", { name: "Edit OpenAI" });
    await edit.waitFor();
    ok(await edit.getByText("Leave empty to keep the stored key; paste a new key to replace it.").isVisible(), `${tag}: the keep-or-replace hint`);
    ok((await edit.getByLabel("API key").inputValue()) === "", `${tag}: the key field starts empty on Edit`);
    await shot(page, `cloud-modal-edit-${tag}.png`);
    await page.keyboard.press("Escape");
    await edit.waitFor({ state: "detached" });
    await card("openai").getByRole("button", { name: "Edit OpenAI" }).click();
    await edit.getByRole("button", { name: "Disconnect" }).click();
    await edit.getByText("Remove OpenAI (API key)? Models that use it stop working.").waitFor();
    ok(await page.evaluate(() => window.calls.some((c) => c.method === "DELETE")) === false, `${tag}: nothing removed before the confirmation`);
    await edit.getByRole("button", { name: "Disconnect" }).click();
    await edit.waitFor({ state: "detached" });
    await card("openai").locator("[data-cloud-status]").filter({ hasText: "Not connected" }).waitFor();
    ok((await card("openai").locator("button").textContent()) === "Connect", `${tag}: OpenAI is back to Connect`);

    // System One: a required, editable Base URL (focused) and an optional key; tested at that URL.
    await card("systemone").getByRole("button", { name: "Connect System One endpoint" }).click();
    const so = page.getByRole("dialog", { name: "Connect System One endpoint" });
    await so.waitFor();
    const url = so.getByLabel("Base URL");
    ok(await url.evaluate((n) => n === document.activeElement && !n.readOnly && n.required && n.placeholder === "http://127.0.0.1:8000"), `${tag}: System One's Base URL is focused, editable, required`);
    ok(await so.getByLabel("API key (optional)").isVisible() && await so.getByText("Only if the endpoint asks for one.").isVisible(), `${tag}: System One's key is optional`);
    await url.fill("http://127.0.0.1:8000");
    await so.getByRole("button", { name: "Test connection" }).click();
    await so.locator("[data-cloud-modal-line]").filter({ hasText: "Connection works · 48 models" }).waitFor();
    ok(await page.evaluate(() => { const c = window.calls.filter((x) => x.path.endsWith("discover-models")).pop(); return c.body.provider_family === "systemone" && c.body.base_url === "http://127.0.0.1:8000" && !("api_key" in c.body); }), `${tag}: System One tested at its Base URL without a key`);
    if (phone) {
      const u = await url.boundingBox();
      ok(u.width >= viewport.width - 40 && u.height >= 44, `${tag}: System One's Base URL is full width, 44 px tall (${u.width}×${u.height})`);
    }
    await shot(page, `cloud-modal-systemone-${tag}.png`);
    await so.getByRole("button", { name: "Cancel" }).click();
    await so.waitFor({ state: "detached" });

    // The generic card: Name first (focused), Base URL, API key.
    await card("openai-compatible").getByRole("button", { name: "Connect Other OpenAI-compatible endpoint" }).click();
    const gen = page.getByRole("dialog", { name: "Connect Other OpenAI-compatible endpoint" });
    await gen.waitFor();
    ok(await gen.getByLabel("Name").evaluate((n) => n === document.activeElement), `${tag}: Name has focus first`);
    ok(await gen.locator("input").evaluateAll((ns) => ns.map((n) => n.type).join(",")) === "text,url,password", `${tag}: Name, Base URL, API key`);
    await gen.getByRole("button", { name: "Cancel" }).click();
    await gen.waitFor({ state: "detached" });
    assert.deepEqual(errors, [], `${tag}: no page error`);
    await page.close();
  }
} finally {
  await browser.close();
  server.close();
}
console.log(`check_cloud_providers_browser: OK (${checks} checks at 1280×800 and 390×844: cards with marks and ONE button, Connect → Test → Save, Edit → Disconnect, System One Base URL, phone sheet with 44 px targets${shots ? `; screenshots in ${shots}` : ""})`);
