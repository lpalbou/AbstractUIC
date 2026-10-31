// Optional real-browser harness: PANEL_CHAT_PLAYWRIGHT_MODULE may point to an installed
// Playwright ESM entrypoint. This keeps browser downloads out of the package's default tests.
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { build } from "esbuild";
const { chromium } = await import(process.env.PANEL_CHAT_PLAYWRIGHT_MODULE || "@playwright/test");
const root = new URL("../", import.meta.url).pathname;
const result = await build({
  absWorkingDir: root, bundle: true, write: false, format: "esm", target: "es2020",
  stdin: { resolveDir: root, sourcefile: "avatar-browser-harness.jsx", loader: "jsx", contents: `
    import React, {useState} from 'react';
    import {createRoot} from 'react-dom/client';
    import {AvatarConversation} from './dist/avatar_conversation.js';
    import {useAvatarConversationPreferences} from './dist/conversation_preferences.js';
    window.events=[];
    const publicMessage=(id,text)=>({id,role:'assistant',kind:'public_update',runId:'run',content:text,publicUpdate:{id,text,runId:'run',sourceCallIds:['call-'+id]}});
    function Harness(){
      const [input,setInput]=useState({sessionKey:'session',scope:'owner-one',messages:[publicMessage('one','First public update')],connection:'connected'});
      window.update=(next)=>setInput((old)=>({...old,...next}));
      window.publicMessage=publicMessage;
      const prefs=useAvatarConversationPreferences(input.scope);
      const options={...input, avatar:<div aria-label='Host avatar'>Host avatar</div>, preferences:prefs.preferences,
        onPreferencesChange:(p)=>{prefs.setPreferences(p);window.events.push('prefs');},
        onCue:(c)=>window.events.push('cue:'+c.id), narrate:true,onNarrate:(m)=>window.events.push('narrate:'+m.id),
        onInterruptSpeech:()=>window.events.push('interrupt'),onReplyContext:(m)=>window.events.push('reply:'+(m?.id||'none')),
        voiceControl:<button onClick={()=>window.events.push('voice')}>Record voice</button>};
      return <><button onClick={()=>prefs.setMode(prefs.mode==='chat'?'avatar':'chat')}>Mode {prefs.mode}</button><AvatarConversation {...options}/></>;
    }
    createRoot(document.getElementById('root')).render(<Harness/>);
  ` },
});
const css = readFileSync(new URL("../src/panel_chat.css", import.meta.url), "utf8");
const server = createServer((req, res) => {
  if (req.url === "/entry.js") { res.setHeader("content-type", "text/javascript"); res.end(result.outputFiles[0].text); }
  else if (req.url === "/style.css") { res.setHeader("content-type", "text/css"); res.end(css); }
  else { res.setHeader("content-type", "text/html"); res.end('<html><head><link rel="stylesheet" href="/style.css"></head><body><div id="root"></div><script type="module" src="/entry.js"></script></body></html>'); }
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE } : {}) });
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: "reduce" });
  const errors = [];
  page.on("pageerror", (error) => errors.push(String(error)));
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  const captions = page.getByLabel("Public subtitles");
  await captions.getByText("First public update", { exact: true }).waitFor();
  assert.equal((await page.evaluate(() => window.events)).filter((event) => event.startsWith("narrate")).length, 0);
  await captions.hover();
  await page.evaluate(() => window.update({ messages: [window.publicMessage("one", "First public update"), window.publicMessage("two", "Second public update")] }));
  await page.waitForTimeout(30);
  assert((await captions.textContent()).includes("First public update"), "hover freezes subtitle text");
  await page.getByLabel("Host avatar").hover();
  await captions.getByText("Second public update", { exact: true }).waitFor();
  assert(!(await page.evaluate(() => window.events)).includes("narrate:two"), "missed narration is consumed while reading");
  await page.getByRole("button", { name: "Pause subtitles", exact: true }).click();
  await page.evaluate(() => window.update({ messages: [window.publicMessage("three", "Third public update")] }));
  await page.waitForTimeout(30);
  assert((await captions.textContent()).includes("Second public update"));
  await page.getByRole("button", { name: "Return to latest", exact: true }).click();
  await captions.getByText("Third public update", { exact: true }).waitFor();
  await page.getByRole("button", { name: "Conversation history", exact: true }).click();
  await page.evaluate(() => window.update({ messages: [window.publicMessage("one", "First public update"), window.publicMessage("four", "Fourth public update")] }));
  const history = page.getByRole("list", { name: "Public conversation history" });
  await history.getByText("Fourth public update", { exact: true }).waitFor();
  assert((await captions.textContent()).includes("Third public update"), "history freezes public subtitles");
  await history.getByRole("button", { name: "Reply to this", exact: true }).first().click();
  await captions.getByText("First public update", { exact: true }).waitFor();
  assert((await page.evaluate(() => window.events)).includes("reply:one"));
  await page.getByRole("button", { name: "Clear reply context", exact: true }).click();
  await captions.getByText("Fourth public update", { exact: true }).waitFor();
  await page.evaluate(() => window.events.length = 0);
  await page.getByRole("button", { name: "Record voice", exact: true }).click();
  assert.deepEqual((await page.evaluate(() => window.events)).slice(0, 2), ["interrupt", "voice"]);
  await page.getByText("Conversation cues", { exact: true }).click();
  const approval = page.getByRole("group", { name: "Permission requests" });
  await approval.getByLabel("Audio cue", { exact: true }).check();
  assert((await page.evaluate(() => window.events)).includes("prefs"));
  await page.getByRole("button", { name: "Mode chat", exact: true }).click();
  await page.getByRole("button", { name: "Mode avatar", exact: true }).waitFor();
  await page.reload();
  await page.getByRole("button", { name: "Mode avatar", exact: true }).waitFor();
  await page.getByText("Conversation cues", { exact: true }).click();
  assert(await page.getByRole("group", { name: "Permission requests" }).getByLabel("Audio cue", { exact: true }).isChecked());
  await page.evaluate(() => window.update({ scope: "owner-two", sessionKey: "new-session", messages: [window.publicMessage("new", "New session update")] }));
  await page.getByRole("button", { name: "Mode chat", exact: true }).waitFor();
  await captions.getByText("New session update", { exact: true }).waitFor();
  assert.equal(await page.getByRole("list", { name: "Public conversation history" }).count(), 0);
  await page.getByText("Conversation cues", { exact: true }).click();
  assert(!(await page.getByRole("group", { name: "Permission requests" }).getByLabel("Audio cue", { exact: true }).isChecked()));
  assert.equal((await page.evaluate(() => window.events)).filter((event) => event === "narrate:new").length, 0);
  await page.evaluate(() => window.update({ listening: true, attention: { id: "approval-new", kind: "approval" } }));
  await page.waitForFunction(() => document.querySelector('[aria-label="Avatar conversation"]')?.getAttribute('data-state') === 'approval');
  assert.equal(await page.getByLabel("Avatar conversation").getAttribute("data-state"), "approval");
  assert((await page.getByRole("status").textContent()).includes("Permission"));
  await page.getByLabel("Host avatar").hover();
  await page.evaluate(() => { window.events.length = 0; window.update({ listening: false, attention: null, messages: [window.publicMessage("live", "Fresh live public update")] }); });
  await captions.getByText("Fresh live public update", { exact: true }).waitFor();
  assert((await page.evaluate(() => window.events)).includes("narrate:live"), "fresh foreground public update reaches host speech callback");
  await page.evaluate(() => { window.events.length = 0; window.update({ connection: "reconnecting", messages: [window.publicMessage("offline", "Recovered update")] }); });
  await page.waitForTimeout(30);
  await page.evaluate(() => window.update({ connection: "connected" }));
  await page.waitForTimeout(30);
  assert(!(await page.evaluate(() => window.events)).includes("narrate:offline"), "reconnection never speaks recovered content");
  await page.evaluate(() => window.update({ messages: [window.publicMessage("offline", "Recovered update"), { role: "assistant", content: "PRIVATE raw marker" }, { role: "system", kind: "tool_activity", content: "PRIVATE raw tool" }, { id: "final", role: "assistant", kind: "final", content: "Final public reply", reasoning: "PRIVATE final reasoning", attachments: [{ label: "Result file", onClick: () => window.events.push("file-open") }] }] }));
  await page.getByRole("button", { name: "Conversation history", exact: true }).click();
  assert(!(await page.getByRole("list", { name: "Public conversation history" }).textContent()).includes("PRIVATE"));
  await page.getByRole("list", { name: "Public conversation history" }).getByRole("button", { name: "Result file" }).click();
  assert((await page.evaluate(() => window.events)).includes("file-open"), "final evidence actions stay reachable in avatar history");
  await page.getByRole("button", { name: "Return to latest", exact: true }).click();
  await captions.focus();
  await page.evaluate(() => window.update({ messages: [window.publicMessage("focused", "Focus-pinned update")] }));
  await page.waitForTimeout(30);
  assert(!(await captions.textContent()).includes("Focus-pinned update"), "keyboard reading pins subtitles");
  await page.getByRole("button", { name: "Return to latest", exact: true }).click();
  await captions.getByText("Focus-pinned update", { exact: true }).waitFor();
  await page.getByLabel("Host avatar").hover();
  await page.evaluate(() => { window.events.length = 0; window.update({ replaying: true, messages: [window.publicMessage("historical", "Restored history update")] }); });
  await page.waitForTimeout(30);
  await page.evaluate(() => window.update({ replaying: false }));
  await page.waitForTimeout(30);
  assert(!(await page.evaluate(() => window.events)).includes("narrate:historical"), "history hydration is silent even on a connected stream");
  await page.evaluate(() => window.update({ status: "paused", messages: [window.publicMessage("paused", "Paused run update")] }));
  await page.waitForFunction(() => document.querySelector('[aria-label="Avatar conversation"]')?.getAttribute('data-state') === 'paused');
  assert(!(await page.evaluate(() => window.events)).includes("narrate:paused"));
  assert((await page.getByRole("status").textContent()).includes("Paused"));
  assert.deepEqual(errors, []);
  console.log("avatar browser: reading freeze, follow/history/reply, voice interruption, scoped preference reload, session reset and state precedence passed");
} finally { await browser.close(); await new Promise((resolve) => server.close(resolve)); }
