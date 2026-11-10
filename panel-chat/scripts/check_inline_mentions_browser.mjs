// Optional real-browser check (Chromium and WebKit) of the INLINE @ mention (operator 2026-11-10:
// "@castor" is a chip inside the sentence, never above it). Drives WorkflowChat as Code and
// Assistant mount it, at desktop and phone (400 px) width:
//   pick -> the chip sits in the text where "@cas" was; typing goes on around it; two chips; a chip
//   at the end; Backspace after it / Delete before it / typing over a selection removes it; undo
//   and redo bring it back and take it again; the caret steps over a chip and a click never lands
//   inside one; a copy of chips pastes back as chips, plain "@name" text never becomes one; an IME
//   composition (Chromium, CDP) keeps the chips; Enter sends {text, mentions: [{id, name, kind,
//   index, start}]}, Shift+Enter is a newline; a draft the host clears and restores keeps its
//   chips; the mirror that draws the chips lays the words out exactly where the field does
//   (pixel comparison, wrapped at 400 px and scrolled past the max height); the field's
//   accessible description names each chip ("mention: Castor"); the first-use notice and the
//   host's "stays out" line (read from the chips' markup, as Code does) both show.
// PANEL_CHAT_PLAYWRIGHT_MODULE may point to an installed Playwright ESM entrypoint;
// `--shots <dir>` saves screenshots; `--engines chromium,webkit` picks the engines.
// No model, network or gateway.
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { build } from "esbuild";
const playwright = await import(process.env.PANEL_CHAT_PLAYWRIGHT_MODULE || "@playwright/test");
const root = new URL("../", import.meta.url).pathname;
const result = await build({
  absWorkingDir: root, bundle: true, write: false, format: "esm", target: "es2020",
  stdin: { resolveDir: root, sourcefile: "inline-mentions-browser.jsx", loader: "jsx", contents: `
    import React, {useEffect, useState} from 'react';
    import {createRoot} from 'react-dom/client';
    import {WorkflowChat} from './dist/index.js';
    const names = [
      {id:'castor', name:'Castor', kind:'entity', avatar:{style:'watch-lotus', color:'#3366cc'}, hint:'Research partner'},
      {id:'pollux', name:'Pollux', kind:'entity', avatar:{style:null, color:'#c2410c'}, hint:'Keeps the garden notes'},
      {id:'basic-agent', name:'Basic agent', kind:'agent', hint:'The default agent'},
    ];
    window.sent = [];
    // Code's own reading of the chips (abstractcode/web mention_chip_kinds.ts): their markup.
    function useChipKinds(el) {
      const [kinds, setKinds] = useState([]);
      useEffect(() => {
        if (!el) return;
        const read = () => setKinds((now) => { const next = [...el.querySelectorAll('.pc-mention-chip__name[data-mention-kind]')].map((n) => n.getAttribute('data-mention-kind')); return next.join() === now.join() ? now : next; });
        read();
        const o = new MutationObserver(read);
        o.observe(el, {childList:true, subtree:true, attributes:true, attributeFilter:['data-mention-kind']});
        return () => o.disconnect();
      }, [el]);
      return kinds;
    }
    const messages = [
      {id:'u1', role:'user', content:'Which of the two plans should we take for the spring garden?'},
      {id:'e1', role:'assistant', content:'The second plan: it keeps the north bed fallow for a season.', author:{kind:'entity', name:'Castor', entity_id:'ent-castor', identity_ref:null, avatar:{style:'watch-lotus', color:'#3366cc'}}},
    ];
    function App(){
      const [draft, setDraft] = useState('');
      const [el, setEl] = useState(null);
      window.setDraft = setDraft;
      window.draft = draft;
      const kinds = useChipKinds(el);
      const hint = kinds.includes('entity') && !kinds.includes('agent') ? 'The agent stays out of this message.' : null;
      return <div ref={setEl} className="host"><WorkflowChat messages={messages} draft={draft} onDraftChange={setDraft} composerVariant='compact'
        onSend={async (text, ctx) => { window.sent.push({text, mentions: ctx.mentions}); setDraft(''); }}
        mentionCandidates={async (q) => names.filter((n) => n.name.toLowerCase().startsWith(q.toLowerCase()))}
        mentionNotice={(c) => c.kind === 'entity' ? c.name + ' will read this conversation\\'s history.' : null}
        mentionSessionKey='session-1' mentionStatus={hint}/></div>;
    }
    createRoot(document.getElementById('root')).render(<App/>);
  ` },
});
const css = readFileSync(new URL("../../ui-kit/src/theme.css", import.meta.url), "utf8") + "\n" + readFileSync(new URL("../src/panel_chat.css", import.meta.url), "utf8");
const wasm = readFileSync(new URL("../../ui-kit/src/avatars/avatar_core.wasm", import.meta.url));
// Test-only views for the alignment comparison: chips neutral (plain text), field or mirror shown.
const probeCss = `
  html.neutral .pc-mention-chip--inline{background:none!important;box-shadow:none!important;color:inherit!important}
  html.neutral .pc-mention-chip__at{color:inherit!important}
  html.neutral .pc-mention-chip__mark{display:none!important}
  html.fieldview .pc-composer__mirror{visibility:hidden!important}
  html.fieldview .pc-composer__textarea{-webkit-text-fill-color:currentColor!important}
  html.probe .pc-composer__textarea{caret-color:transparent!important}`;
const server = createServer((req, res) => {
  const url = new URL(req.url, "http://x");
  if (url.pathname === "/entry.js") { res.setHeader("content-type", "text/javascript"); res.end(result.outputFiles[0].text); }
  else if (url.pathname === "/style.css") { res.setHeader("content-type", "text/css"); res.end(css + probeCss); }
  else if (url.pathname === "/avatars/avatar_core.wasm") { res.setHeader("content-type", "application/wasm"); res.end(wasm); }
  else {
    const light = url.searchParams.get("theme") === "light";
    res.setHeader("content-type", "text/html");
    res.end(`<html class="${light ? "theme-light" : ""}"><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/style.css"><style>html,body,#root{margin:0;height:100%;font:14px system-ui}#root{display:flex;flex-direction:column;max-width:760px;margin:0 auto;padding:0 16px;box-sizing:border-box}.host{height:100%;display:flex;flex-direction:column}.pc-workflow-chat{height:100%;background:var(--bg-primary);color:var(--text-primary)}body{background:var(--bg-primary)}</style></head><body><div id="root"></div><script type="module" src="/entry.js"></script></body></html>`);
  }
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${server.address().port}/`;
const option = process.argv.indexOf("--shots");
const shots = option < 0 ? "" : resolve(process.argv[option + 1]);
if (shots) mkdirSync(shots, { recursive: true });
const engineArg = process.argv.indexOf("--engines");
const engines = (engineArg < 0 ? "chromium,webkit" : process.argv[engineArg + 1]).split(",").filter(Boolean);
const MOD = process.platform === "darwin" ? "Meta" : "Control";

let checks = 0;
const eq = (a, b, label) => { assert.deepEqual(a, b, label); checks += 1; };
const ok = (cond, label) => { assert.ok(cond, label); checks += 1; };

for (const engine of engines) {
  const browser = await playwright[engine].launch({ headless: true });
  try {
    for (const [label, viewport] of [["desktop", { width: 1000, height: 820 }], ["400px", { width: 400, height: 860 }]]) {
      const tag = `${engine}-${label}`;
      const context = await browser.newContext({ viewport, reducedMotion: "reduce", deviceScaleFactor: 2, ...(engine === "chromium" ? { permissions: ["clipboard-read", "clipboard-write"] } : {}) });
      const page = await context.newPage();
      const errors = [];
      page.on("pageerror", (e) => errors.push(String(e)));
      page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
      await page.goto(base);
      const field = page.getByRole("textbox", { name: "Message", exact: true });
      await field.waitFor();
      const list = page.getByRole("listbox", { name: "Mention someone" });
      const value = () => field.inputValue();
      const chips = () => page.evaluate(() => [...document.querySelectorAll(".pc-composer__mirror .pc-mention-chip--inline")].map((n) => n.getAttribute("data-mention-key")));
      const selection = () => field.evaluate((el) => [el.selectionStart, el.selectionEnd]);
      // The selection settles on `selectionchange` (a task after the call): wait for it.
      const caretTo = (at, end = at) => field.evaluate((el, [a, b]) => new Promise((done) => { el.focus(); el.setSelectionRange(a, b); setTimeout(done, 30); }), [at, end]);
      const pick = async (query) => {
        await field.pressSequentially("@" + query);
        await list.getByRole("option").first().waitFor();
        await page.waitForFunction(() => document.querySelectorAll('.pc-mention-option').length === 1);
        await page.keyboard.press("Enter");
        await list.waitFor({ state: "detached" });
      };
      const composer = page.locator(".pc-workflow-chat__composer");
      const shot = async (name) => {
        if (!shots) return;
        const b = await composer.boundingBox();
        const top = Math.max(0, b.y - 64);
        await page.screenshot({ path: resolve(shots, `${tag}-${name}.png`), clip: { x: 0, y: top, width: viewport.width, height: Math.min(viewport.height - top, b.y + b.height - top + 12) } });
      };
      // The words the mirror draws sit exactly where the field draws them: the field's own glyphs
      // (made visible) and the mirror's (chips neutral) give the same pixels.
      const aligned = async (what) => {
        await page.evaluate(() => document.documentElement.classList.add("neutral", "probe"));
        const box = await field.boundingBox();
        const clip = { x: box.x, y: box.y, width: box.width, height: box.height };
        await page.waitForTimeout(50);
        const mirrorShot = (await page.screenshot({ clip })).toString("base64");
        await page.evaluate(() => document.documentElement.classList.add("fieldview"));
        await page.waitForTimeout(50);
        const fieldShot = (await page.screenshot({ clip })).toString("base64");
        await page.evaluate(() => document.documentElement.classList.remove("neutral", "probe", "fieldview"));
        const diff = await page.evaluate(async ([a, b]) => {
          const load = (src) => new Promise((r) => { const i = new Image(); i.onload = () => r(i); i.src = "data:image/png;base64," + src; });
          const [ia, ib] = await Promise.all([load(a), load(b)]);
          const pixels = (img) => { const c = document.createElement("canvas"); c.width = img.width; c.height = img.height; const g = c.getContext("2d"); g.drawImage(img, 0, 0); return g.getImageData(0, 0, img.width, img.height).data; };
          const pa = pixels(ia), pb = pixels(ib);
          let ink = 0, off = 0;
          const at = { x0: Infinity, x1: -1, y0: Infinity, y1: -1 };
          for (let i = 0; i < pa.length; i += 4) {
            const d = Math.abs(pa[i] - pb[i]) + Math.abs(pa[i + 1] - pb[i + 1]) + Math.abs(pa[i + 2] - pb[i + 2]);
            // Glyph anti-aliasing differs by a few levels between the two renderers; a shift of
            // even one device pixel (half a CSS pixel here) gives hundreds of edges far past 240.
            if (d > 240) {
              off += 1;
              const x = (i / 4) % ia.width, y = Math.floor(i / 4 / ia.width);
              at.x0 = Math.min(at.x0, x); at.x1 = Math.max(at.x1, x); at.y0 = Math.min(at.y0, y); at.y1 = Math.max(at.y1, y);
            }
          }
          // How much text there is to compare (pixels unlike the field's background).
          for (let i = 0; i < pb.length; i += 4) if (Math.abs(pb[i] - pb[0]) + Math.abs(pb[i + 1] - pb[1]) + Math.abs(pb[i + 2] - pb[2]) > 60) ink += 1;
          return { ink, off, ...(off ? { at } : {}) };
        }, [mirrorShot, fieldShot]);
        const good = diff.ink > 200 && diff.off <= Math.max(4, diff.ink * 0.01);
        if (!good && shots) {
          const { writeFileSync } = await import("node:fs");
          const slug = what.replace(/[^a-z0-9]+/gi, "-");
          writeFileSync(resolve(shots, `${tag}-misaligned-${slug}-mirror.png`), Buffer.from(mirrorShot, "base64"));
          writeFileSync(resolve(shots, `${tag}-misaligned-${slug}-field.png`), Buffer.from(fieldShot, "base64"));
        }
        ok(good, `${tag}: ${what}: the mirror's words sit on the field's (${JSON.stringify(diff)})`);
      };
      const description = () => field.evaluate((el) => (el.getAttribute("aria-describedby") || "").split(" ").map((id) => document.getElementById(id)?.textContent || "").join(" ").trim());
      const lines = () => page.locator(".pc-mention-notice").allTextContents();

      // 1. The pick puts the chip in the text, where "@cas" was; typing goes on around it.
      await field.click();
      await field.pressSequentially("Hi ");
      await pick("cas");
      eq(await value(), "Hi @Castor ", `${tag}: the chip's "@Castor" replaces the typed @cas, one space after`);
      eq(await selection(), [11, 11], `${tag}: the caret is after the chip and its space`);
      eq(await chips(), ["entity:castor"], `${tag}: one chip, drawn in the text`);
      ok(await field.evaluate((el) => el.hasAttribute("data-mention-overlay")), `${tag}: the field's glyphs give way to the mirror`);
      await field.pressSequentially("how are you doing ?");
      eq(await value(), "Hi @Castor how are you doing ?", `${tag}: typing goes on after the chip`);
      eq(await chips(), ["entity:castor"], `${tag}: the chip stays`);
      eq(await page.locator(".pc-composer__mirror button, .pc-composer button[aria-label^='Remove']").count(), 0, `${tag}: no x on a chip`);
      eq(await description(), "mention: Castor", `${tag}: the field's description names the chip`);
      eq((await lines()).sort(), ["Castor will read this conversation's history.", "The agent stays out of this message."].sort(), `${tag}: both info lines (first-use notice, host's line from the chips' markup)`);
      const geo = await page.evaluate(() => {
        const chip = document.querySelector(".pc-mention-chip--inline").getBoundingClientRect();
        const t = document.querySelector(".pc-composer__textarea"), m = document.querySelector(".pc-composer__mirror");
        const f = t.getBoundingClientRect(), r = m.getBoundingClientRect();
        const b = parseFloat(getComputedStyle(t).borderLeftWidth) || 0, bt = parseFloat(getComputedStyle(t).borderTopWidth) || 0;
        const near = (x) => Math.abs(x) < 0.02;
        return { inside: chip.left >= f.left && chip.right <= f.right && chip.top >= f.top && chip.bottom <= f.bottom, line1: chip.top - f.top < 30, left: near(r.left - f.left - b), top: near(r.top - f.top - bt), w: Math.abs(r.width - t.clientWidth) < 1, heights: [m.scrollHeight, t.scrollHeight] };
      });
      ok(geo.inside && geo.line1 && geo.left && geo.top && geo.w && geo.heights[0] === geo.heights[1], `${tag}: the chip is on the first line, inside the field; the mirror covers the field exactly ${JSON.stringify(geo)}`);
      await aligned("a chip mid-sentence");
      await page.waitForFunction(() => { const c = document.querySelector(".pc-mention-chip--inline canvas"); return c && c.width > 0; });
      await page.waitForTimeout(150);
      await shot("a-chip-inline-mid-sentence");

      // 2. A second chip; then the send.
      await caretTo(30);
      await field.pressSequentially(" and ");
      await pick("pol");
      eq(await value(), "Hi @Castor how are you doing ? and @Pollux ", `${tag}: the second chip`);
      eq(await chips(), ["entity:castor", "entity:pollux"], `${tag}: two chips, in text order`);
      eq(await description(), "mention: Castor, mention: Pollux", `${tag}: both named`);
      await aligned("two chips");
      await page.waitForTimeout(100);
      await shot("b-two-chips");

      // 3. The caret steps over a chip; a click never lands inside one.
      await caretTo(3);
      await page.keyboard.press("ArrowRight");
      eq(await selection(), [10, 10], `${tag}: ArrowRight at a chip's start steps over it`);
      await page.keyboard.press("ArrowLeft");
      eq(await selection(), [3, 3], `${tag}: ArrowLeft at its end steps back over it`);
      await page.keyboard.press("Shift+ArrowRight");
      eq(await selection(), [3, 10], `${tag}: Shift+ArrowRight selects the chip whole`);
      const chipBox = await page.locator(".pc-mention-chip--inline").first().boundingBox();
      await page.mouse.click(chipBox.x + chipBox.width * 0.55, chipBox.y + chipBox.height / 2);
      await page.waitForTimeout(100);
      const [clicked] = await selection();
      ok(clicked === 3 || clicked === 10, `${tag}: a click inside a chip puts the caret at one of its edges (${clicked})`);

      // 4. Backspace just after a chip takes it whole; undo brings it back, redo takes it again.
      // Each engine groups its own undo steps (WebKit undoes a whole typing run at once, plain
      // text too): Chromium is held to the exact steps, every engine to chips that follow the words.
      const TWO = "Hi @Castor how are you doing ? and @Pollux ";
      const restore = async () => {
        await page.keyboard.press(`${MOD}+a`);
        await page.keyboard.press("Backspace");
        await field.pressSequentially("Hi ");
        await pick("cas");
        await field.pressSequentially("how are you doing ? and ");
        await pick("pol");
        eq([await value(), await chips()], [TWO, ["entity:castor", "entity:pollux"]], `${tag}: back to two chips`);
      };
      // Every state undo/redo walks through has a Castor chip exactly when "@Castor" is back at 3,
      // and one of them is the chip's words with the chip (engines that undo a whole run at once
      // land on an earlier state first: redo walks forward to it).
      const castorBack = async (what) => {
        const seen = [[await value(), await chips()]];
        for (const keys of [`${MOD}+z`, `${MOD}+z`, `${MOD}+Shift+z`, `${MOD}+Shift+z`, `${MOD}+Shift+z`]) {
          if (seen.some(([v, c]) => v.startsWith("Hi @Castor ") && c.includes("entity:castor"))) break;
          await page.keyboard.press(keys);
          seen.push([await value(), await chips()]);
        }
        ok(seen.every(([v, c]) => v.startsWith("Hi @Castor ") === c.includes("entity:castor")), `${tag}: ${what}: a chip exactly when its words are there ${JSON.stringify(seen)}`);
        // Chromium is held to the exact steps; WebKit may keep the whole session as one undo
        // step (it does at 400 px, plain text too), so there only the agreement above holds.
        if (engine === "chromium") ok(seen.some(([v, c]) => v.startsWith("Hi @Castor ") && c.includes("entity:castor")), `${tag}: ${what}: the words and the chip come back together ${JSON.stringify(seen)}`);
      };
      await field.blur();
      await caretTo(10);
      await page.keyboard.press("Backspace");
      eq(await value(), "Hi  how are you doing ? and @Pollux ", `${tag}: Backspace after the chip removes "@Castor" whole`);
      eq(await chips(), ["entity:pollux"], `${tag}: the other chip stays, moved with the text`);
      eq(await lines(), ["The agent stays out of this message.", "Pollux will read this conversation's history."], `${tag}: Castor's notice goes with its chip, Pollux's stays`);
      await page.waitForTimeout(100);
      await shot("d-after-deleting-one");
      if (engine === "chromium") {
        await page.keyboard.press(`${MOD}+z`);
        eq([await value(), await chips()], [TWO, ["entity:castor", "entity:pollux"]], `${tag}: undo brings the words back, and the chip with them`);
        await page.keyboard.press(`${MOD}+Shift+z`);
        eq([await value(), await chips()], ["Hi  how are you doing ? and @Pollux ", ["entity:pollux"]], `${tag}: redo takes it again`);
        await page.keyboard.press(`${MOD}+z`);
        eq(await chips(), ["entity:castor", "entity:pollux"], `${tag}: undone once more`);
      } else await castorBack("undo of the Backspace");
      await restore();

      // 5. Delete just before a chip; typing over a selection that cuts into a chip.
      await caretTo(3);
      await page.keyboard.press("Delete");
      eq([await value(), await chips()], ["Hi  how are you doing ? and @Pollux ", ["entity:pollux"]], `${tag}: Delete before the chip removes it whole`);
      await restore();
      await field.blur();
      await caretTo(1, 6);
      eq(await selection(), [1, 10], `${tag}: a selection that cuts into a chip takes it whole`);
      await page.keyboard.type("ey");
      eq([await value(), await chips()], ["Hey how are you doing ? and @Pollux ", ["entity:pollux"]], `${tag}: typing over it removes the chip`);
      await castorBack("undo of the typing");
      await restore();

      // 6. Copy / paste: a copy of chips pastes back as chips; plain "@name" text never becomes one.
      await caretTo(0, 14);
      const copied = await field.evaluate((el) => { const dt = new DataTransfer(); el.dispatchEvent(new ClipboardEvent("copy", { clipboardData: dt, bubbles: true, cancelable: true })); return { plain: dt.getData("text/plain"), chips: dt.getData("application/x-abstractframework-mentions+json") }; });
      eq(copied.plain, "Hi @Castor how", `${tag}: a copy holds the plain words`);
      eq(JSON.parse(copied.chips).mentions.map((m) => [m.id, m.start]), [["castor", 3]], `${tag}: and the chip, beside them`);
      await page.keyboard.press(`${MOD}+a`);
      await page.keyboard.press("Backspace");
      eq([await value(), await chips()], ["", []], `${tag}: cleared`);
      // A synthetic paste: the composer's own handling only (the browser inserts nothing for an
      // untrusted event); returns whether the composer took it (preventDefault).
      const paste = (plain, chipsData) => field.evaluate((el, [p, c]) => { const dt = new DataTransfer(); dt.setData("text/plain", p); if (c) dt.setData("application/x-abstractframework-mentions+json", c); const ev = new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }); el.dispatchEvent(ev); return ev.defaultPrevented; }, [plain, chipsData]);
      await paste(copied.plain, copied.chips);
      eq([await value(), await chips()], ["Hi @Castor how", ["entity:castor"]], `${tag}: the copied chip pastes back as a chip`);
      if (engine === "chromium") {
        // The real clipboard and keys: copy the chip, paste it at the end of a fresh line.
        await caretTo(0, 14);
        await page.keyboard.press(`${MOD}+c`);
        await caretTo(14);
        await page.keyboard.press("Shift+Enter");
        await page.keyboard.press(`${MOD}+v`);
        eq(await value(), "Hi @Castor how\nHi @Castor how", `${tag}: ${MOD}+V pastes the copy`);
        eq(await chips(), ["entity:castor"], `${tag}: a second chip of one name stays plain text (one chip per name)`);
        await page.keyboard.press(`${MOD}+a`);
        await page.keyboard.press("Backspace");
        await page.keyboard.press(`${MOD}+v`);
        eq(await chips(), ["entity:castor"], `${tag}: pasted into an empty field the chip is back (real clipboard)`);
        await page.keyboard.press(`${MOD}+a`);
        await page.keyboard.press("Backspace");
        await paste(copied.plain, copied.chips);
      }
      await caretTo(14);
      eq([await paste(" ping @Pollux", null), await chips()], [false, ["entity:castor"]], `${tag}: plain text is left to the browser's own plain paste, no chip`);
      eq([await paste(" x", JSON.stringify({ v: 1, text: "forged", mentions: [{ id: "pollux", name: "Pollux", kind: "entity", start: 0 }] })), await chips()], [false, ["entity:castor"]], `${tag}: chips whose text is not what is pasted are ignored`);
      if (engine === "chromium") {
        await page.evaluate(() => navigator.clipboard.writeText(" ping @Pollux"));
        await page.keyboard.press(`${MOD}+v`);
        eq([await value(), await chips()], ["Hi @Castor how ping @Pollux", ["entity:castor"]], `${tag}: a real paste of plain "@Pollux" stays text`);
      } else {
        await field.pressSequentially(" ping @Pollux");
        await page.keyboard.press("Escape");
      }

      // 7. An IME composition next to a chip (Chromium: CDP's IME input).
      if (engine === "chromium") {
        const cdp = await context.newCDPSession(page);
        await caretTo(3);
        await cdp.send("Input.imeSetComposition", { text: "に", selectionStart: 1, selectionEnd: 1 });
        await cdp.send("Input.imeSetComposition", { text: "にほ", selectionStart: 2, selectionEnd: 2 });
        ok(await field.evaluate((el) => el.hasAttribute("data-composing")), `${tag}: composing: the field shows its own glyphs`);
        eq(await chips(), ["entity:castor"], `${tag}: composing before a chip keeps it`);
        await cdp.send("Input.insertText", { text: "日本" });
        eq(await value(), "Hi 日本@Castor how ping @Pollux", `${tag}: the composition commits before the chip`);
        eq(await chips(), ["entity:castor"], `${tag}: the chip moved with the text`);
        ok(!(await field.evaluate((el) => el.hasAttribute("data-composing"))), `${tag}: composition over`);
        await page.keyboard.press(`${MOD}+z`);
      }

      // 8. A chip at the end; Backspace after it.
      await page.keyboard.press(`${MOD}+a`);
      await page.keyboard.press("Backspace");
      await field.pressSequentially("Over to you ");
      await pick("bas");
      await page.keyboard.press("Backspace");
      eq([await value(), await chips()], ["Over to you @Basic agent", ["agent:basic-agent"]], `${tag}: a chip at the very end`);
      eq(await lines(), [], `${tag}: an agent chip: no notice, no "stays out" line`);
      await aligned("a chip at the end");
      await shot("c-chip-at-the-end");
      await page.keyboard.press("Backspace");
      eq([await value(), await chips()], ["Over to you ", []], `${tag}: Backspace after it removes it`);

      // 9. Wrapping and scrolling: many lines, chips across them; the mirror follows the field.
      await page.keyboard.press(`${MOD}+a`);
      await page.keyboard.press("Backspace");
      await field.pressSequentially("Could the two of you compare the frost dates with the plan ");
      await pick("cas");
      await field.pressSequentially("drew up last spring, and then ");
      await pick("pol");
      await field.pressSequentially("check the seed order against it before Friday?");
      await aligned("wrapped text with chips");
      await page.keyboard.press("Shift+Enter");
      eq((await value()).endsWith("?\n"), true, `${tag}: Shift+Enter is a newline, not a send`);
      eq(await page.evaluate(() => window.sent.length), 0, `${tag}: nothing sent yet`);
      await aligned("a last empty line");
      for (let i = 0; i < 8; i += 1) await page.keyboard.press("Shift+Enter");
      await field.pressSequentially("and one more line ");
      await pick("bas");
      const scrolled = await field.evaluate((el) => ({ top: el.scrollTop, max: el.scrollHeight > el.clientHeight, mirror: document.querySelector(".pc-composer__mirror").scrollTop }));
      ok(scrolled.max && scrolled.top > 0 && scrolled.top === scrolled.mirror, `${tag}: past the max height the field scrolls and the mirror with it ${JSON.stringify(scrolled)}`);
      await aligned("scrolled past the max height");
      await page.keyboard.press(`${MOD}+z`);
      await page.keyboard.press(`${MOD}+a`);
      await page.keyboard.press("Backspace");

      // 10. The send: text as shown, chips in text order, numbered and placed.
      await field.pressSequentially("Hi ");
      await pick("pol");
      await field.pressSequentially("and ");
      await pick("cas");
      await field.pressSequentially("what do you think?");
      await caretTo(3);
      await page.keyboard.press("Enter");
      await page.waitForFunction(() => window.sent.length === 1);
      eq(await page.evaluate(() => window.sent[0]), {
        text: "Hi @Pollux and @Castor what do you think?",
        mentions: [{ id: "pollux", name: "Pollux", kind: "entity", index: 0, start: 3 }, { id: "castor", name: "Castor", kind: "entity", index: 1, start: 15 }],
      }, `${tag}: the send`);
      await page.waitForFunction(() => window.draft === "");
      eq(await chips(), [], `${tag}: cleared with the draft`);

      // 11. A draft the host clears and restores (a failed send's words) keeps its chips.
      await field.pressSequentially("Ask ");
      await pick("cas");
      await page.evaluate(() => window.setDraft(""));
      await page.waitForFunction(() => !document.querySelector(".pc-composer__mirror"));
      await page.evaluate(() => window.setDraft("Ask @Castor "));
      await page.waitForFunction(() => document.querySelectorAll(".pc-mention-chip--inline").length === 1);
      eq(await chips(), ["entity:castor"], `${tag}: the restored words bring their chip back`);
      await field.click();
      await page.keyboard.press(`${MOD}+a`);
      await page.keyboard.press("Backspace");
      await page.evaluate(() => window.setDraft("Ask @Castor "));
      await page.waitForTimeout(50);
      eq(await chips(), [], `${tag}: after the person's own edit, a typed-back "@Castor" is text`);
      await page.evaluate(() => window.setDraft(""));

      // 12. The light theme, two chips at phone width.
      await page.goto(base + "?theme=light");
      await field.waitFor();
      await field.click();
      await field.pressSequentially("Hi ");
      await pick("cas");
      await field.pressSequentially("how are you doing ? and ");
      await pick("pol");
      await page.waitForFunction(() => { const c = document.querySelector(".pc-mention-chip--inline canvas"); return c && c.width > 0; });
      await page.waitForTimeout(150);
      await aligned("light theme");
      await shot("e-two-chips-light");
      eq(errors, [], `${tag}: no page errors`);
      await context.close();
    }
  } finally {
    await browser.close();
  }
}
server.close();
console.log(`check_inline_mentions_browser: ${checks} checks green on ${engines.join(" + ")} at desktop and 400 px (inline pick, typing around, two chips, chip at the end, Backspace/Delete/select-type removal, undo/redo, caret stepping, copy/paste, IME, wrap + scroll alignment, send serialization, restored draft, description, info lines)${shots ? `; shots in ${shots}` : ""}`);
