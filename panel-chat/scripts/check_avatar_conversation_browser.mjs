// Optional real-browser harness (Chrome): the Avatar view inside WorkflowChat, as hosts mount it.
// PANEL_CHAT_PLAYWRIGHT_MODULE may point to an installed Playwright ESM entrypoint and
// PLAYWRIGHT_CHROMIUM_EXECUTABLE to a local Chrome. AVATAR_SHOTS=<dir> also saves screenshots.
// No model, network or gateway.
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdirSync, readFileSync } from "node:fs";
import { build } from "esbuild";
const { chromium } = await import(process.env.PANEL_CHAT_PLAYWRIGHT_MODULE || "@playwright/test");
const root = new URL("../", import.meta.url).pathname;
const result = await build({
  absWorkingDir: root, bundle: true, write: false, format: "esm", target: "es2020",
  stdin: { resolveDir: root, sourcefile: "avatar-browser-harness.jsx", loader: "jsx", contents: `
    import React, {useEffect, useRef, useState} from 'react';
    import {createRoot} from 'react-dom/client';
    import {WorkflowChat} from './dist/conversation.js';
    window.events=[];
    const pub=(id,text)=>({id:'public:'+id,role:'assistant',kind:'public_update',runId:'run',content:text,publicUpdate:{id,text,runId:'run',sourceCallIds:['call-'+id]}});
    window.pub=pub;
    function Orb(){const ref=useRef(null);useEffect(()=>{const c=ref.current,g=c.getContext('2d');g.fillStyle='#7189c0';g.beginPath();g.arc(160,160,150,0,7);g.fill();},[]);return <canvas ref={ref} width={320} height={320} role='img' aria-label='Host avatar' style={{width:320,height:320}}/>;}
    function Harness(){
      const [input,setInput]=useState({sessionKey:'session',messages:[{role:'user',content:'Tell me a story'},pub('one','I am choosing a setting.')],connection:'connected',status:'working'});
      const [draft,setDraft]=useState('');
      window.update=(next)=>setInput((old)=>({...old,...next}));
      return <WorkflowChat messages={input.messages} draft={draft} onDraftChange={setDraft} onSend={()=>{}} composerVariant='compact'
        avatarConversation={{...input, avatar:<Orb/>, narrate:true, onNarrate:(m)=>window.events.push('narrate:'+m.id),
          onInterruptSpeech:()=>window.events.push('interrupt'), onReplyContext:(m)=>window.events.push('reply:'+(m?.id||'none')),
          voiceControl:<button type='button' onClick={()=>window.events.push('voice')}>Talk</button>,
          playbackControl:<span role='group' aria-label='Voice controls'><button type='button' aria-pressed='false'>Read new replies aloud</button><button type='button'>Silence voice</button></span>}}/>;
    }
    createRoot(document.getElementById('root')).render(<Harness/>);
  ` },
});
const css = readFileSync(new URL("../src/panel_chat.css", import.meta.url), "utf8");
const themes = {
  dark: "--text-primary:#e6e9f5;--text-secondary:#a9b1cf;--ui-surface-0:#12131c;--ui-surface-1:#1d1f2c;--ui-border-1:#3a4060;background:#12131c;color:#e6e9f5",
  light: "--text-primary:#1d2030;--text-secondary:#4a5068;--ui-surface-0:#ffffff;--ui-surface-1:#f2f3f8;--ui-border-1:#c9cddc;background:#ffffff;color:#1d2030",
};
const server = createServer((req, res) => {
  const theme = new URL(req.url, "http://x").searchParams.get("theme") === "light" ? "light" : "dark";
  if (req.url === "/entry.js") { res.setHeader("content-type", "text/javascript"); res.end(result.outputFiles[0].text); }
  else if (req.url === "/style.css") { res.setHeader("content-type", "text/css"); res.end(css); }
  else { res.setHeader("content-type", "text/html"); res.end(`<html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/style.css"><style>html,body,#root{margin:0;height:100%;font:16px system-ui}#root{display:flex;flex-direction:column}.pc-workflow-chat{height:100%;${themes[theme]}}</style></head><body><div id="root"></div><script type="module" src="/entry.js"></script></body></html>`); }
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const base = `http://127.0.0.1:${server.address().port}/`;
const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE } : {}) });
const STORY = "### The Tidekeeper\n\nOnce, far beyond the last lighthouse, a little ship named **The Tidekeeper** sailed through space. Its captain, Mira, had grown up beside the sea and [charted](https://example.org/chart) every current.\n\n- The ocean of stars\n- The quiet harbour\n\n" + "She listened to the waves of light and wrote down what they told her. ".repeat(12);
const geometry = (page) => page.evaluate(() => {
  const r = (el) => el.getBoundingClientRect();
  const view = document.querySelector(".pc-avatar-conversation"), list = document.querySelector(".pc-avatar-conversation__captions");
  const composer = document.querySelector(".pc-workflow-chat__composer"), actions = document.querySelector(".pc-avatar-conversation__actions");
  const buttons = [...actions.querySelectorAll("button")].map((b) => ({ name: b.textContent, h: r(b).height, w: r(b).width, bottom: r(b).bottom, top: r(b).top }));
  const avatar = document.querySelector("canvas");
  return { viewOverflow: view.scrollHeight - view.clientHeight, composerTop: r(composer).top, actionsBottom: r(actions).bottom, listBottom: list ? r(list).bottom : 0,
    lines: list ? list.clientHeight / parseFloat(getComputedStyle(list.querySelector(".pc-chat-content p")).lineHeight) : 0,
    textSize: list ? parseFloat(getComputedStyle(list.querySelector(".pc-chat-content p")).fontSize) : 0, listSize: list ? parseFloat(getComputedStyle(list).fontSize) : 0, buttons, avatar: r(avatar) };
});
try {
  for (const [viewport, theme, lines] of [[{ width: 1440, height: 900 }, "dark", 4], [{ width: 1440, height: 900 }, "light", 4], [{ width: 400, height: 844 }, "dark", 3], [{ width: 400, height: 844 }, "light", 3]]) {
    const page = await browser.newPage({ viewport, reducedMotion: "reduce" });
    const errors = [];
    page.on("pageerror", (error) => errors.push(String(error)));
    await page.clock.install();
    await page.goto(`${base}?theme=${theme}`);
    const captions = page.getByLabel("Public subtitles");
    await captions.getByText("I am choosing a setting.", { exact: true }).waitFor();
    assert.equal((await page.evaluate(() => window.events)).filter((e) => e.startsWith("narrate")).length, 0, "opening never narrates");

    // Realtime roll: each new public update enters at the bottom; older ones move up.
    for (const [i, text] of ["I picked the ocean.", "Now naming the ship.", "Writing the first scene.", "Adding a harbour.", "Almost done."].entries()) {
      await page.evaluate(([id, t]) => { document.__msgs = [...(document.__msgs || [{ role: "user", content: "Tell me a story" }, window.pub("one", "I am choosing a setting.")]), window.pub(id, t)]; window.update({ messages: document.__msgs }); }, [`u${i}`, text]);
      await captions.getByText(text, { exact: true }).waitFor();
    }
    const order = await captions.locator(":scope > li").allInnerTexts();
    assert.deepEqual(order.slice(-3), ["Writing the first scene.", "Adding a harbour.", "Almost done."], "newest caption last");
    assert(await captions.evaluate((el) => el.scrollTop > 0 && el.lastElementChild.getBoundingClientRect().bottom <= el.getBoundingClientRect().bottom + 1), "the newest caption is fully visible; older ones scrolled up");
    await page.waitForFunction(() => document.querySelector(".pc-avatar-conversation__captions").hasAttribute("data-scrolled"), null, { timeout: 3000, polling: 100 }).catch(async (e) => { throw new Error("wait #1: " + JSON.stringify(await captions.evaluate((el) => ({ attrs: [...el.attributes].map((a) => a.name), top: el.scrollTop, h: el.clientHeight, sh: el.scrollHeight })))); }); // older captions fade at the top edge
    assert((await page.evaluate(() => window.events)).includes("narrate:public:u4"), "a fresh public update reaches the host's narration");

    // Nothing cycles: a minute later the captions are exactly where they were.
    const before = await captions.evaluate((el) => [el.innerText, el.scrollTop]);
    await page.clock.runFor(60_000);
    assert.deepEqual(await captions.evaluate((el) => [el.innerText, el.scrollTop]), before, "captions never auto-cycle");

    // The final answer is one caption, rendered through the shared renderer, shown from its start.
    await page.evaluate((story) => { document.__msgs = [...document.__msgs, { id: "final", role: "assistant", kind: "final", content: story }]; window.update({ messages: document.__msgs, status: "completed", attention: { id: "run:completed", kind: "completion" } }); }, STORY);
    const final = captions.locator(':scope > li[data-kind="answer"]');
    await final.getByRole("heading", { name: "The Tidekeeper" }).waitFor();
    const finalText = await final.innerText();
    assert(!finalText.includes("**") && !finalText.includes("###"), "no raw Markdown in captions");
    assert.equal(await final.locator("strong").first().innerText(), "The Tidekeeper");
    assert.equal(await final.getByRole("link", { name: "charted" }).getAttribute("href"), "https://example.org/chart");
    assert.equal(await final.count(), 1, "the answer is not paginated");
    assert(await final.evaluate((li) => { const box = li.parentElement.getBoundingClientRect(), top = li.getBoundingClientRect().top; return top >= box.top - 1 && top <= box.top + 24; }), "a long answer is shown from its first line");
    assert.equal(await final.getAttribute("data-attention"), "completion");
    await page.waitForFunction(() => document.querySelector(".pc-avatar-conversation__captions").hasAttribute("data-more"), null, { timeout: 3000, polling: 100 }).catch(async (e) => { throw new Error("wait #2: " + JSON.stringify(await captions.evaluate((el) => ({ attrs: [...el.attributes].map((a) => a.name), top: el.scrollTop, h: el.clientHeight, sh: el.scrollHeight })))); }); // more of the answer below: the bottom edge fades
    assert(await captions.evaluate((el) => { const lh = parseFloat(getComputedStyle(el).lineHeight); const rows = el.clientHeight / lh; const tops = [...el.querySelectorAll(".pc-chat-content :is(p, li, h3)")].map((n) => (n.getBoundingClientRect().top - el.getBoundingClientRect().top + el.scrollTop) / lh); return Math.abs(rows - Math.round(rows)) < 0.02 && tops.every((t) => Math.abs(t - Math.round(t)) < 0.05); }), "every caption line sits on the line grid, so no line is ever half shown");
    await captions.evaluate((el) => { el.style.scrollBehavior = "auto"; el.scrollTop = el.scrollHeight; });
    await page.waitForFunction(() => !document.querySelector(".pc-avatar-conversation__captions").hasAttribute("data-more"), null, { timeout: 3000, polling: 100 }).catch(async (e) => { throw new Error("wait #3: " + JSON.stringify(await captions.evaluate((el) => ({ attrs: [...el.attributes].map((a) => a.name), top: el.scrollTop, h: el.clientHeight, sh: el.scrollHeight })))); }); // at the end, no bottom fade
    await captions.evaluate((el) => { el.scrollTop = el.querySelector('li[data-kind="answer"]').offsetTop; el.style.scrollBehavior = ""; });
    await page.waitForFunction(() => document.querySelector(".pc-avatar-conversation__captions").hasAttribute("data-more"), null, { timeout: 3000, polling: 100 }).catch(async (e) => { throw new Error("wait #4: " + JSON.stringify(await captions.evaluate((el) => ({ attrs: [...el.attributes].map((a) => a.name), top: el.scrollTop, h: el.clientHeight, sh: el.scrollHeight })))); });
    await page.waitForFunction(() => !document.querySelector(".pc-avatar-conversation__captions").hasAttribute("data-scrolled"), null, { timeout: 3000, polling: 100 }).catch(async (e) => { throw new Error("wait #5: " + JSON.stringify(await captions.evaluate((el) => ({ attrs: [...el.attributes].map((a) => a.name), top: el.scrollTop, h: el.clientHeight, sh: el.scrollHeight })))); }); // the answer's first line is not faded
    assert.equal(await page.getByText("The result is ready in conversation history.").count(), 0);

    // Layout: nothing of the avatar view sits under the composer; targets are at least 44 px.
    const g = await geometry(page);
    assert(g.viewOverflow <= 1, `the avatar view fits its area without scrolling (${g.viewOverflow}px over) at ${viewport.width}px`);
    assert(g.actionsBottom <= g.composerTop + 1 && g.listBottom <= g.composerTop + 1, `captions and actions sit above the composer at ${viewport.width}px`);
    for (const b of g.buttons) assert(b.h >= 44 && b.w >= 44 && b.bottom <= g.composerTop + 1, `${b.name}: ≥44 px and above the composer`);
    assert(await page.evaluate(() => { const bs = [...document.querySelectorAll(".pc-avatar-conversation__actions button")].map((b) => b.getBoundingClientRect()); return bs.every((x, i) => bs.every((y, j) => i === j || x.right <= y.left - 4 || y.right <= x.left - 4 || x.bottom <= y.top - 4 || y.bottom <= x.top - 4)); }), "action buttons never touch or overlap");
    assert(g.avatar.height >= 48 && g.avatar.bottom <= g.composerTop, `the avatar stays visible above the composer (${g.avatar.height}px)`);
    assert(g.textSize >= 16 && g.textSize === g.listSize, `captions are set at caption size, not chat size (${g.textSize}px)`);
    assert(Math.abs(g.lines - lines) < 0.2, `${lines} caption lines at ${viewport.width}px (got ${g.lines.toFixed(2)})`);
    for (const forbidden of ["Previous subtitle", "Next subtitle", "Pause subtitles", "Return to latest"]) assert.equal(await page.getByRole("button", { name: forbidden }).count(), 0, `no ${forbidden}`);
    await page.getByRole("button", { name: "Conversation history", exact: true }).click({ trial: true });
    await page.getByRole("button", { name: "Talk", exact: true }).click({ trial: true });
    if (process.env.AVATAR_SHOTS) { mkdirSync(process.env.AVATAR_SHOTS, { recursive: true }); await page.screenshot({ path: `${process.env.AVATAR_SHOTS}/panel-chat-avatar-${viewport.width}-${theme}.png` }); }

    // History: opens in place of the captions, actions stay reachable; reply selection returns to the captions.
    await page.getByRole("button", { name: "Conversation history", exact: true }).click();
    const history = page.getByRole("list", { name: "Public conversation history" });
    await history.getByText("Almost done.", { exact: true }).waitFor();
    const historyText = await history.innerText();
    assert(!/Public update|Sources|call-u\d/.test(historyText) && historyText.includes("Update") && historyText.includes("Answer"), "history uses plain labels and no technical ids");
    const gh = await geometry(page);
    assert(gh.viewOverflow <= 1 && gh.actionsBottom <= gh.composerTop + 1, "history keeps the actions above the composer");
    await history.getByRole("button", { name: "Reply to this", exact: true }).first().click();
    await page.getByText("Replying to the selected exchange.").waitFor();
    assert.equal(await history.count(), 0, "choosing a reply returns to the captions");
    assert((await page.evaluate(() => window.events)).includes("reply:public:one"));
    await page.getByRole("button", { name: "Clear reply context", exact: true }).click();
    assert((await page.evaluate(() => window.events)).at(-1) === "reply:none");

    // Voice: old speech is interrupted before capture starts.
    await page.evaluate(() => window.events.length = 0);
    await page.getByRole("button", { name: "Talk", exact: true }).click();
    assert.deepEqual((await page.evaluate(() => window.events)).slice(0, 2), ["interrupt", "voice"]);

    // A new message from the person starts a new turn: earlier captions leave.
    await page.evaluate(() => { document.__msgs = [...document.__msgs, { role: "user", content: "Another story" }]; window.update({ messages: document.__msgs, status: "working", attention: null }); });
    await page.waitForFunction(() => document.querySelectorAll(".pc-avatar-conversation__captions > li").length === 0);
    // Reconnection and history hydration never speak.
    await page.evaluate(() => { window.events.length = 0; window.update({ connection: "reconnecting", messages: [...document.__msgs, window.pub("offline", "Recovered update")] }); });
    await captions.getByText("Recovered update", { exact: true }).waitFor();
    await page.evaluate(() => window.update({ connection: "connected" }));
    await page.evaluate(() => window.update({ replaying: true, messages: [...document.__msgs, window.pub("offline", "Recovered update"), window.pub("hist", "Restored history update")] }));
    await captions.getByText("Restored history update", { exact: true }).waitFor();
    await page.evaluate(() => window.update({ replaying: false }));
    assert(!(await page.evaluate(() => window.events)).some((e) => e.startsWith("narrate")), "reconnect and replay are silent");
    assert.deepEqual(errors, []);
    await page.close();
  }
  console.log("avatar browser: realtime rolling captions (order, fade, no cycling), shared Markdown rendering, one-piece answer, history/reply/voice, silent replay, and 1440/400 px dark/light geometry above the composer passed");
} finally { await browser.close(); await new Promise((resolve) => server.close(resolve)); }
