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
    const pub=(id,text,kind='progress',sources=[])=>({id:'public:'+id,role:'assistant',kind:'public_update',runId:'run',content:text,publicUpdate:{id,text,runId:'run',sourceCallIds:sources,kind}});
    const tool=(callId,url)=>({id:'tool:'+callId,role:'system',kind:'tool_activity',content:'',toolActivity:{id:'run:'+callId,runId:'run',name:'fetch_url',callId,arguments:{url},status:'completed'}});
    window.pub=pub; window.tool=tool;
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
  const view = document.querySelector(".pc-avatar-conversation"), line = document.querySelector(".pc-avatar-conversation__line");
  const composer = document.querySelector(".pc-workflow-chat__composer"), actions = document.querySelector(".pc-avatar-conversation__actions");
  const panel = document.querySelector(".pc-avatar-conversation__findings");
  const visible = (el) => Boolean(el && el.getClientRects().length);
  const buttons = [...view.querySelectorAll(":is(.pc-avatar-conversation__actions, .pc-avatar-conversation__line-actions, .pc-avatar-conversation__findings-head) button")].filter(visible).map((b) => ({ name: b.textContent, h: r(b).height, w: r(b).width, bottom: r(b).bottom, top: r(b).top }));
  const avatar = document.querySelector("canvas");
  return { viewOverflow: view.scrollHeight - view.clientHeight, pageOverflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth, composerTop: r(composer).top, actionsBottom: r(actions).bottom,
    line: line ? { top: r(line).top, bottom: r(line).bottom, left: r(line).left, right: r(line).right, size: parseFloat(getComputedStyle(line).fontSize), height: r(line).height, lineHeight: parseFloat(getComputedStyle(line).lineHeight) } : null,
    panel: visible(panel) ? { left: r(panel).left, right: r(panel).right, top: r(panel).top, bottom: r(panel).bottom, width: r(panel).width } : null,
    buttons, avatar: r(avatar), viewLeft: r(view).left, viewRight: r(view).right };
});
const msgs = (page, add, extra = {}) => page.evaluate(([items, more]) => {
  document.__msgs = [...(document.__msgs || [{ role: "user", content: "Tell me a story" }, window.pub("one", "I am choosing a setting.")]), ...items.map(([fn, ...args]) => window[fn](...args))];
  window.update({ messages: document.__msgs, ...more });
}, [add, extra]);
const lineText = (page) => page.locator(".pc-avatar-conversation__line").innerText();
try {
  for (const [viewport, theme] of [[{ width: 1440, height: 900 }, "dark"], [{ width: 1440, height: 900 }, "light"], [{ width: 400, height: 844 }, "dark"], [{ width: 400, height: 844 }, "light"]]) {
    const wide = viewport.width > 720;
    const page = await browser.newPage({ viewport, reducedMotion: "reduce" });
    const errors = [];
    page.on("pageerror", (error) => errors.push(String(error)));
    await page.clock.install();
    await page.goto(`${base}?theme=${theme}`);
    const line = page.locator(".pc-avatar-conversation__line");
    await line.getByText("I am choosing a setting.", { exact: true }).waitFor();
    assert.equal((await page.evaluate(() => window.events)).filter((e) => e.startsWith("narrate")).length, 0, "opening never narrates");
    assert.equal(await page.getByRole("complementary", { name: "Findings" }).count(), 0, "no findings: no panel");
    assert.equal(await page.getByRole("button", { name: "Findings" }).count(), 0, "no findings: no Findings button");

    // One live line, replaced in real time by each new public update (progress or finding).
    const updates = [["pub", "u0", "Reading about ships of that era."], ["tool", "c1", "https://example.org/ships"], ["pub", "u1", "Ships of that era carried a **bell** to mark the watches.", "finding", ["c1"]],
      ["pub", "u2", "Now naming the ship."], ["pub", "u3", "The harbour in the story is based on Saint-Malo.", "finding"], ["pub", "u4", "Writing the first scene."]];
    for (const update of updates) {
      await msgs(page, [update]);
      if (update[0] === "pub") await page.waitForFunction((t) => document.querySelector(".pc-avatar-conversation__line")?.innerText.trim() === t.replace(/\*\*/g, ""), update[2]);
    }
    assert.equal(await line.count(), 1, "exactly one live line");
    assert.equal(await lineText(page), "Writing the first scene.");
    assert((await page.evaluate(() => window.events)).includes("narrate:public:u4"), "a fresh public update reaches the host's narration");

    // Findings: accumulated, newest last; floating beside the avatar (wide) or a sheet (narrow).
    const panel = page.getByRole("complementary", { name: "Findings" });
    const cards = panel.locator(".pc-avatar-conversation__finding");
    if (!wide) {
      assert.equal(await panel.isVisible(), false, "narrow: the sheet starts closed");
      await page.getByRole("button", { name: "Findings", exact: true }).click();
    } else assert.equal(await page.getByRole("button", { name: "Findings", exact: true }).isVisible(), false, "wide: the panel is always shown, no toggle");
    await panel.waitFor({ state: "visible" });
    assert.deepEqual((await cards.allInnerTexts()).map((t) => t.trim()), ["Ships of that era carried a bell to mark the watches.", "The harbour in the story is based on Saint-Malo."], "findings only, newest last, rendered (no raw Markdown)");
    let g = await geometry(page);
    if (wide) {
      assert(g.panel.left >= g.avatar.right && g.panel.left >= g.line.right, "the panel floats beside the avatar and never covers the live line");
      assert(g.panel.right <= g.viewRight + 1 && g.panel.bottom <= g.composerTop + 1, "the panel stays inside the view, above the composer");
    } else {
      assert(g.panel.bottom <= g.composerTop + 1 && g.panel.left <= g.viewLeft + 1 && g.panel.right >= g.viewRight - 1, "narrow: a bottom sheet across the whole view, above the composer");
      assert((await page.evaluate(() => window.events)).includes("interrupt"), "opening the findings interrupts speech");
    }
    if (process.env.AVATAR_SHOTS) { mkdirSync(process.env.AVATAR_SHOTS, { recursive: true }); await page.screenshot({ path: `${process.env.AVATAR_SHOTS}/panel-chat-avatar-${viewport.width}-${theme}${wide ? "" : "-findings"}.png` }); }
    // A finding opens to its full text and the result it cited.
    await cards.first().locator(".pc-avatar-conversation__expandable").click();
    const source = cards.first().getByRole("list", { name: "Sources" });
    await source.waitFor();
    assert.equal(await source.getByRole("link").getAttribute("href"), "https://example.org/ships", "the cited result, as a link");
    assert(!/c1|fetch_url|call/.test(await cards.first().innerText()), "no technical ids or tool names");
    assert.equal(await cards.nth(1).getByRole("list", { name: "Sources" }).count(), 0, "a finding with no cited result shows no sources");
    await cards.first().locator(".pc-avatar-conversation__expandable").press("Enter");
    assert.equal(await source.count(), 0, "Enter closes it again");
    if (!wide) {
      await page.getByRole("button", { name: "Close", exact: true }).click();
      await panel.waitFor({ state: "hidden" });
      if (process.env.AVATAR_SHOTS) await page.screenshot({ path: `${process.env.AVATAR_SHOTS}/panel-chat-avatar-${viewport.width}-${theme}.png` });
    }

    // Opening the line holds it: "Reply to this" and "Latest"; new updates do not move it.
    await page.evaluate(() => window.events.length = 0);
    await line.click();
    await page.getByRole("button", { name: "Reply to this", exact: true }).waitFor();
    await msgs(page, [["pub", "u5", "Adding a harbour."]]);
    await page.waitForTimeout(50);
    assert.equal(await lineText(page), "Writing the first scene.", "a held line stays while the person reads it");
    await page.getByRole("button", { name: "Reply to this", exact: true }).click();
    assert.equal(await page.getByRole("button", { name: "Reply to this", exact: true }).getAttribute("aria-pressed"), "true");
    assert.deepEqual((await page.evaluate(() => window.events)).filter((e) => e.startsWith("reply:")), ["reply:public:u4"]);
    await page.getByRole("button", { name: "Latest", exact: true }).click();
    await page.waitForFunction(() => document.querySelector(".pc-avatar-conversation__line")?.innerText.trim() === "Adding a harbour.");
    assert.equal(await page.getByRole("button", { name: "Latest", exact: true }).count(), 0, "following again: no Latest");
    assert.equal((await page.evaluate(() => window.events)).at(-1), "reply:none");
    // The person's next message ends a reply to a held line.
    await line.click();
    await page.getByRole("button", { name: "Reply to this", exact: true }).click();
    await page.evaluate(() => { document.__msgs = [...document.__msgs, { id: "g1", role: "user", kind: "guidance", source: "user_guidance", content: "Make the captain kinder" }]; window.update({ messages: document.__msgs }); });
    await page.waitForFunction(() => !document.querySelector(".pc-avatar-conversation__line[data-held]"));
    assert.equal((await page.evaluate(() => window.events)).at(-1), "reply:none", "the reply context ends when the person sends");

    // Nothing cycles: a minute later the line is exactly where it was.
    const before = await lineText(page);
    await page.clock.runFor(60_000);
    assert.equal(await lineText(page), before, "the line never auto-cycles");

    // The answer: one normal message through the shared renderer; the line yields to it.
    await page.evaluate((story) => { document.__msgs = [...document.__msgs, { id: "final", role: "assistant", kind: "final", content: story, statistics: { totalTokens: 9 } }]; window.update({ messages: document.__msgs, status: "completed", attention: { id: "run:completed", kind: "completion" } }); }, STORY);
    const answer = page.locator(".pc-avatar-conversation__answer");
    await answer.getByRole("heading", { name: "The Tidekeeper" }).waitFor();
    assert.equal(await line.count(), 0, "the answered turn shows the answer, not the line");
    assert(!(await answer.innerText()).includes("**") && !(await answer.innerText()).includes("###"), "no raw Markdown");
    assert.equal(await answer.getByRole("link", { name: "charted" }).getAttribute("href"), "https://example.org/chart");
    assert.equal(await page.getByRole("heading", { name: "The Tidekeeper" }).count(), 1, "the answer is shown once");
    assert.equal(await answer.getAttribute("data-attention"), "completion");
    if (wide) assert.equal(await cards.count(), 2, "findings stay after the answer");

    // Layout: nothing sits under the composer; targets are at least 44 px; no horizontal scroll.
    g = await geometry(page);
    assert(g.viewOverflow <= 1, `the avatar view fits its area without scrolling (${g.viewOverflow}px over) at ${viewport.width}px`);
    assert(g.pageOverflowX <= 0, "no horizontal page scroll");
    assert(g.actionsBottom <= g.composerTop + 1, `actions sit above the composer at ${viewport.width}px`);
    for (const b of g.buttons) assert(b.h >= 44 && b.bottom <= g.composerTop + 1, `${b.name}: ≥44 px and above the composer`);
    assert(g.avatar.height >= 48 && g.avatar.bottom <= g.composerTop, `the avatar stays visible above the composer (${g.avatar.height}px)`);
    for (const forbidden of ["Previous subtitle", "Next subtitle", "Pause subtitles", "Return to latest", "Conversation history", "Clear reply context"]) assert.equal(await page.getByRole("button", { name: forbidden }).count(), 0, `no ${forbidden}`);
    if (process.env.AVATAR_SHOTS) await page.screenshot({ path: `${process.env.AVATAR_SHOTS}/panel-chat-avatar-${viewport.width}-${theme}-answer.png` });

    // Voice: old speech is interrupted before capture starts.
    await page.evaluate(() => window.events.length = 0);
    await page.getByRole("button", { name: "Talk", exact: true }).click();
    assert.deepEqual((await page.evaluate(() => window.events)).slice(0, 2), ["interrupt", "voice"]);

    // A new message from the person starts a new turn: the answer leaves, findings stay.
    await page.evaluate(() => { document.__msgs = [...document.__msgs, { role: "user", content: "Another story" }]; window.update({ messages: document.__msgs, status: "working", attention: null }); });
    await page.waitForFunction(() => !document.querySelector(".pc-avatar-conversation__answer") && !document.querySelector(".pc-avatar-conversation__line"));
    assert.equal(await page.locator(".pc-avatar-conversation__finding").count(), 2, "findings accumulate across the conversation's runs");
    // Reconnection and history hydration never speak.
    await page.evaluate(() => { window.events.length = 0; window.update({ connection: "reconnecting", messages: [...document.__msgs, window.pub("offline", "Recovered update")] }); });
    await line.getByText("Recovered update", { exact: true }).waitFor();
    await page.evaluate(() => window.update({ connection: "connected" }));
    await page.evaluate(() => window.update({ replaying: true, messages: [...document.__msgs, window.pub("offline", "Recovered update"), window.pub("hist", "Restored history update")] }));
    await line.getByText("Restored history update", { exact: true }).waitFor();
    await page.evaluate(() => window.update({ replaying: false }));
    assert(!(await page.evaluate(() => window.events)).some((e) => e.startsWith("narrate")), "reconnect and replay are silent");
    assert.deepEqual(errors, []);
    await page.close();
  }
  console.log("avatar browser: one live line (replaced in real time, hold / Reply to this / Latest), findings panel (floating at 1440, sheet at 400, sources), answer once through the shared renderer, no cycling, silent replay, and 1440/400 px dark/light geometry above the composer passed");
} finally { await browser.close(); await new Promise((resolve) => server.close(resolve)); }
