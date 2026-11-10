// Optional real-browser check (Chrome) of "@entity from any chat window": the composer's
// @ list (keyboard and pointer), chips (in the text: check_inline_mentions_browser.mjs has the
// editing behaviours) and notice, the send payload, and the author header
// (entity orb, agent mark, no author = today's header), at desktop and phone (400 px) width.
// PANEL_CHAT_PLAYWRIGHT_MODULE may point to an installed Playwright ESM entrypoint and
// PLAYWRIGHT_CHROMIUM_EXECUTABLE to a local Chrome. `--shots <dir>` also saves screenshots.
// No model, network or gateway.
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { build } from "esbuild";
const { chromium } = await import(process.env.PANEL_CHAT_PLAYWRIGHT_MODULE || "@playwright/test");
const root = new URL("../", import.meta.url).pathname;
const result = await build({
  absWorkingDir: root, bundle: true, write: false, format: "esm", target: "es2020",
  stdin: { resolveDir: root, sourcefile: "mentions-browser.jsx", loader: "jsx", contents: `
    import React, {useState} from 'react';
    import {createRoot} from 'react-dom/client';
    import {WorkflowChat} from './dist/index.js';
    const names = [
      {id:'castor', name:'Castor', kind:'entity', avatar:{style:'watch-lotus', color:'#3366cc'}, hint:'Research partner'},
      {id:'pollux', name:'Pollux', kind:'entity', avatar:{style:null, color:'#c2410c'}, hint:'Keeps the garden notes'},
      {id:'basic-agent', name:'Basic agent', kind:'agent', hint:'The default agent'},
    ];
    window.sent = []; window.queries = [];
    const author = (kind, name, avatar) => ({kind, name, entity_id: kind === 'entity' ? 'ent-' + name.toLowerCase() : null, identity_ref: null, avatar: avatar || null});
    const messages = [
      {id:'u1', role:'user', content:'Which of the two plans should we take for the spring garden?'},
      {id:'e1', role:'assistant', content:'The second plan: it keeps the **north bed** fallow for a season, which the soil notes from last year asked for.', author: author('entity', 'Castor', {style:'watch-lotus', color:'#3366cc'})},
      {id:'p1', role:'assistant', content:'Agreed, and the seed order for it is already in the shared folder.', author: author('entity', 'Pollux', {style:null, color:'#c2410c'})},
      {id:'a1', role:'assistant', content:'I compared both plans against the calendar; the second fits the frost dates.', author: author('agent', 'Basic agent')},
      {id:'n1', role:'assistant', content:'An answer from an older gateway, with no author: the header is unchanged.', author: null},
    ];
    function App(){
      const [draft, setDraft] = useState('');
      const [host, setHost] = useState({});
      window.setHost = setHost;
      return <WorkflowChat messages={messages} draft={draft} onDraftChange={setDraft} composerVariant='compact'
        onSend={async (text, ctx) => { window.sent.push({text, mentions: ctx.mentions}); setDraft(''); }}
        mentionCandidates={async (q) => { window.queries.push(q); return names.filter((n) => n.name.toLowerCase().startsWith(q.toLowerCase())); }}
        mentionNotice={(c) => c.kind === 'entity' ? c.name + ' will read this conversation\\'s history.' : null}
        mentionSessionKey='session-1' mentionsUnavailable={host.unavailable} mentionStatus={host.status}/>;
    }
    createRoot(document.getElementById('root')).render(<App/>);
  ` },
});
const css = readFileSync(new URL("../../ui-kit/src/theme.css", import.meta.url), "utf8") + "\n" + readFileSync(new URL("../src/panel_chat.css", import.meta.url), "utf8");
const wasm = readFileSync(new URL("../../ui-kit/src/avatars/avatar_core.wasm", import.meta.url));
const server = createServer((req, res) => {
  const url = new URL(req.url, "http://x");
  if (url.pathname === "/entry.js") { res.setHeader("content-type", "text/javascript"); res.end(result.outputFiles[0].text); }
  else if (url.pathname === "/style.css") { res.setHeader("content-type", "text/css"); res.end(css); }
  else if (url.pathname === "/avatars/avatar_core.wasm") { res.setHeader("content-type", "application/wasm"); res.end(wasm); }
  else {
    const light = url.searchParams.get("theme") === "light";
    res.setHeader("content-type", "text/html");
    res.end(`<html class="${light ? "theme-light" : ""}"><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/style.css"><style>html,body,#root{margin:0;height:100%;font:14px system-ui}#root{display:flex;flex-direction:column;max-width:760px;margin:0 auto;padding:0 16px;box-sizing:border-box}.pc-workflow-chat{height:100%;background:var(--bg-primary);color:var(--text-primary)}body{background:var(--bg-primary)}</style></head><body><div id="root"></div><script type="module" src="/entry.js"></script></body></html>`);
  }
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${server.address().port}/`;
const option = process.argv.indexOf("--shots");
const shots = option < 0 ? "" : resolve(process.argv[option + 1]);
if (shots) mkdirSync(shots, { recursive: true });
const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE } : {}) });
const shot = async (target, name) => { if (shots) await target.screenshot({ path: resolve(shots, `${name}.png`) }); };
try {
  for (const [label, viewport] of [["desktop", { width: 1000, height: 820 }], ["400px", { width: 400, height: 860 }]]) {
    const page = await browser.newPage({ viewport, reducedMotion: "reduce", deviceScaleFactor: 2 });
    const errors = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    // Known and not this feature's: Markdown keys inline text runs by position, so "a **b** c"
    // repeats key 0 (React's duplicate-key warning from inside Markdown). Every other error counts.
    page.on("console", (m) => { if (m.type() === "error" && !(m.text().includes("two children with the same key") && m.text().includes("at Markdown"))) errors.push(m.text()); });
    await page.goto(base);
    const field = page.getByRole("textbox", { name: "Message", exact: true });
    await field.waitFor();
    const card = (id) => page.locator(".pc-chat-item").filter({ hasText: { e1: "north bed", p1: "seed order", a1: "frost dates", n1: "older gateway" }[id] });
    // (c)(d)(e) the author header.
    await page.waitForFunction(() => { const c = document.querySelector('[data-author="entity"] canvas'); return c && c.width > 0; });
    await page.waitForTimeout(300);
    const header = await page.evaluate(() => [...document.querySelectorAll(".pc-chat-item--assistant")].map((el) => {
      // A flex item: an inline-flex tile computes as "flex".
      const tile = el.querySelector(".pc-chat-avatar"), box = tile.getBoundingClientRect();
      return { author: el.getAttribute("data-author"), name: el.querySelector(".pc-chat-role").textContent, tag: el.querySelector(".pc-chat-author-kind")?.textContent || null, tile: getComputedStyle(tile).display, w: Math.round(box.width), canvas: Boolean(tile.querySelector("canvas")) };
    }));
    assert.deepEqual(header, [
      { author: "entity", name: "Castor", tag: "entity", tile: "flex", w: 22, canvas: true },
      { author: "entity", name: "Pollux", tag: "entity", tile: "flex", w: 22, canvas: false },
      { author: "agent", name: "Basic agent", tag: "agent", tile: "flex", w: 22, canvas: false },
      { author: null, name: "Agent", tag: null, tile: "none", w: 0, canvas: false },
    ], `${label}: who answered, per bubble`);
    // The orb is drawn (not a blank canvas).
    const inked = await page.evaluate(() => { const c = document.querySelector('[data-author="entity"] canvas'); const d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 0) n += 1; return n; });
    assert(inked > 20, `${label}: the entity orb is drawn (${inked} px)`);
    await shot(card("e1"), `${label}-c-entity-bubble`);
    await shot(card("a1"), `${label}-d-agent-bubble`);
    await shot(card("n1"), `${label}-e-author-null-bubble`);
    await shot(card("p1"), `${label}-c2-entity-without-design-bubble`);

    // (a) typing @ opens the list.
    await field.click();
    await field.pressSequentially("Ask @");
    const list = page.getByRole("listbox", { name: "Mention someone" });
    await list.waitFor();
    assert.equal(await list.getByRole("option").count(), 3, `${label}: three names`);
    const geo = await page.evaluate(() => { const r = document.querySelector(".pc-mention-popover").getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top, vw: innerWidth, overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth }; });
    assert(geo.left >= 0 && geo.right <= geo.vw && geo.top >= 0 && geo.overflowX <= 0, `${label}: the list fits the screen ${JSON.stringify(geo)}`);
    if (viewport.width <= 480) {
      // A phone: the list spans the composer (review 2026-11-09 N8: its 22rem cap left a 36 px gap).
      const span = await page.evaluate(() => { const p = document.querySelector(".pc-mention-popover").getBoundingClientRect(), c = document.querySelector(".pc-mention-popover").parentElement.getBoundingClientRect(); return { gap: Math.round(c.right - p.right), left: Math.round(p.left - c.left) }; });
      assert(Math.abs(span.gap) <= 1 && Math.abs(span.left) <= 1, `${label}: the list spans the composer ${JSON.stringify(span)}`);
    }
    const composer = page.locator(".pc-workflow-chat__composer");
    const around = async (name) => {
      const a = await page.locator(".pc-mention-popover").boundingBox().catch(() => null), b = await composer.boundingBox();
      const top = Math.max(0, Math.min(a ? a.y : b.y, b.y) - 12);
      if (shots) await page.screenshot({ path: resolve(shots, `${name}.png`), clip: { x: 0, y: top, width: viewport.width, height: Math.min(viewport.height - top, b.y + b.height - top + 12) } });
    };
    await page.waitForTimeout(200);
    await around(`${label}-a-autocomplete-open`);
    // Keyboard: ArrowDown + Enter picks the second name; focus and caret stay in the field.
    await page.keyboard.press("ArrowDown");
    assert.equal(await field.getAttribute("aria-activedescendant"), await list.getByRole("option").nth(1).getAttribute("id"));
    await page.keyboard.press("Enter");
    assert.equal(await field.inputValue(), "Ask @Pollux ", `${label}: the typed @ became a chip, in the text`);
    assert(await field.evaluate((el) => document.activeElement === el && el.selectionStart === 12), `${label}: focus stays, the caret after the chip`);
    assert.equal(await list.count(), 0, `${label}: the list closed`);
    // Pointer: click a name.
    await field.pressSequentially("@c");
    await list.getByRole("option", { name: /Castor/ }).click();
    assert(await field.evaluate((el) => document.activeElement === el), `${label}: a click keeps the focus in the field`);
    // Escape closes without sending; the @ stays as text.
    await field.pressSequentially("and @x");
    await page.getByText("No name matches").waitFor();
    await page.keyboard.press("Escape");
    assert.equal(await page.locator(".pc-mention-popover").count(), 0, `${label}: Escape closes the list`);
    for (let i = 0; i < 6; i += 1) await page.keyboard.press("Backspace");
    await field.pressSequentially("what do you two think of the second plan?");
    assert.equal(await field.inputValue(), "Ask @Pollux @Castor what do you two think of the second plan?");
    const chipsNow = await page.locator(".pc-mention-chip__name").allTextContents();
    assert.deepEqual(chipsNow, ["Pollux", "Castor"], `${label}: two chips in text order`);
    assert.equal(await page.locator(".pc-mention-notice").count(), 2, `${label}: one notice per entity on first use`);
    await page.waitForTimeout(150);
    // (b) a message with two chips.
    await around(`${label}-b-two-chips`);
    await page.keyboard.press("Enter");
    await page.waitForFunction(() => window.sent.length === 1);
    assert.deepEqual(await page.evaluate(() => window.sent[0]), { text: "Ask @Pollux @Castor what do you two think of the second plan?", mentions: [{ id: "pollux", name: "Pollux", kind: "entity", index: 0, start: 4 }, { id: "castor", name: "Castor", kind: "entity", index: 1, start: 12 }] }, `${label}: the send`);
    await page.locator(".pc-mention-chip").first().waitFor({ state: "detached" });
    // A plain @ that was never picked is sent as text, with no mention.
    await field.pressSequentially("ping @castor");
    await page.keyboard.press("Escape");
    await page.keyboard.press("Enter");
    await page.waitForFunction(() => window.sent.length === 2);
    assert.deepEqual(await page.evaluate(() => window.sent[1]), { text: "ping @castor", mentions: [] }, `${label}: an unpicked @ is text`);
    await shot(page, `${label}-full-dark`);
    // (f) the host's sentences: an outcome after a send, and an older gateway without the route.
    await page.evaluate(() => window.setHost({ status: "Castor is in another conversation." }));
    await page.getByText("Castor is in another conversation.").waitFor();
    await page.evaluate(() => window.setHost({ unavailable: "This gateway does not offer mentions yet." }));
    await field.pressSequentially("hello @");
    await page.locator('.pc-mention-popover[data-status="unavailable"]').getByText("This gateway does not offer mentions yet.").waitFor();
    assert.equal(await list.count(), 0, `${label}: no names to pick on an older gateway`);
    await around(`${label}-f-older-gateway-sentence`);
    await page.keyboard.press("Escape");
    await field.fill("");
    await page.goto(base + "?theme=light");
    await field.waitFor();
    await page.waitForFunction(() => { const c = document.querySelector('[data-author="entity"] canvas'); return c && c.width > 0; });
    await field.click();
    await field.pressSequentially("Ask @");
    await list.waitFor();
    await page.waitForTimeout(300);
    await shot(page, `${label}-full-light-list-open`);
    assert.deepEqual(errors, [], `${label}: no page errors`);
    await page.close();
  }
  console.log(`check_mentions_browser: list/keys/pointer/chips/notice/send and author headers OK at desktop and 400 px${shots ? `; shots in ${shots}` : ""}`);
} finally {
  await browser.close();
  server.close();
}
