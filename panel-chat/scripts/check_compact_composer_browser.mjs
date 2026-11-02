// Real-browser input check. Optional Playwright installation; no network/model calls.
// PANEL_CHAT_PLAYWRIGHT_MODULE may point to an installed @playwright/test ESM entrypoint.
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { build } from "esbuild";
const { chromium } = await import(process.env.PANEL_CHAT_PLAYWRIGHT_MODULE || "@playwright/test");
const root = new URL("../", import.meta.url).pathname;
const result = await build({ absWorkingDir: root, bundle: true, write: false, format: "esm", target: "es2020", stdin: { resolveDir: root, sourcefile: "compact-composer-browser.jsx", loader: "jsx", contents: `
  import React,{useState} from 'react';
  import {createRoot} from 'react-dom/client';
  import {WorkflowChat} from './dist/workflow_chat.js';
  import {ChatComposer} from './dist/chat_composer.js';
  window.calls=[]; window.events=[]; window.succeed=false;
  function App(){
    const[draft,setDraft]=useState(''),[variant,setVariant]=useState('compact'),[busy,setBusy]=useState(false);
    window.updateBusy=setBusy;window.setComposerVariant=setVariant;
    return <><div id="default"><ChatComposer value="Default draft" onChange={()=>{}} onSubmit={()=>{}}/></div>
    <div id="workflow"><WorkflowChat messages={[]} draft={draft} onDraftChange={setDraft} composerVariant={variant} busy={busy}
      onSend={async(text)=>{window.calls.push(text);if(!window.succeed)throw Error('fixture rejected this send');setDraft('');}}
      onAttach={()=>window.events.push('attach')} attachments={<span>example.txt</span>}
      composerTrailingActions={<><button id="trail" className="pc-workflow-chat__icon-button" aria-label="Voice tools" onClick={()=>window.events.push('trail')}>Voice</button><span className="af-voice-mic"><button className="pc-workflow-chat__icon-button" aria-label="Microphone" onClick={()=>window.events.push('mic')}>Mic</button></span></>}
      composerExtras={<><button className="pc-workflow-chat__icon-button" onClick={()=>window.events.push('workspace')}>Workspace</button></>}
      onCancel={async(signal)=>{window.events.push('stop:'+signal.aborted);setBusy(false);}}/>
    </div></>;
  }
  createRoot(document.getElementById('root')).render(<App/>);
` } });
const css = readFileSync(new URL("../src/panel_chat.css", import.meta.url), "utf8");
const server = createServer((request, response) => {
  if (request.url === "/entry.js") { response.setHeader("content-type", "text/javascript"); response.end(result.outputFiles[0].text); }
  else if (request.url === "/style.css") { response.setHeader("content-type", "text/css"); response.end(css); }
  else { response.setHeader("content-type", "text/html"); response.end('<html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/style.css"><style>body{margin:16px;background:#171b22;color:#eee;font:14px system-ui;--text-primary:#eee;--bg-primary:#171b22}#workflow,#default{max-width:640px;margin:20px auto}#default{display:none}.pc-workflow-chat__transcript:empty{display:none}</style></head><body><div id="root"></div><script type="module" src="/entry.js"></script></body></html>'); }
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE } : {}) });
const option = process.argv.indexOf("--shots");
const shots = option < 0 ? "" : process.argv[option + 1];
try {
  const page = await browser.newPage({ viewport: { width: 740, height: 800 }, reducedMotion: "reduce" });
  const errors = [];
  page.on("pageerror", (error) => errors.push(String(error)));
  await page.goto(origin);
  const scope = page.locator("#workflow"), field = scope.getByRole("textbox", { name: "Message", exact: true });
  await field.waitFor();
  assert.equal(await page.locator("#default textarea").getAttribute("rows"), "2");
  assert.equal(await page.locator("#default .pc-composer--compact").count(), 1);
  assert.equal(await field.getAttribute("rows"), "2");
  {
    // Host trailing controls sit in the trailing slot, left of Send and vertically aligned with it.
    assert.equal(await page.locator("#default .pc-composer__trailing").count(), 0, "no empty trailing slot");
    const trail = await page.locator("#workflow .pc-composer__trailing #trail").boundingBox();
    const send = await page.locator("#workflow .pc-composer__send--compact").boundingBox();
    assert(trail && send && trail.x + trail.width <= send.x + 1 && Math.abs((trail.y + trail.height / 2) - (send.y + send.height / 2)) < 8, "trailing control beside Send");
    await page.click("#workflow #trail"); assert(await page.evaluate(() => window.events.includes('trail')));
    await page.setViewportSize({ width: 390, height: 844 });
    const attach = await page.locator("#workflow .pc-composer__icon-action").boundingBox();
    assert(attach && attach.width >= 36 && attach.height >= 36, "Attach keeps a usable target on a phone");
    await page.setViewportSize({ width: 740, height: 800 });
  }
  const initialHeight = await field.evaluate((node) => node.getBoundingClientRect().height);
  await field.fill("First line\nSecond line\nThird line\nFourth line\nFifth line\nSixth line");
  await page.waitForFunction((initial) => document.querySelector('#workflow textarea').getBoundingClientRect().height > initial + 30, initialHeight);
  const circle = await scope.getByRole("button", { name: "Send", exact: true }).boundingBox();
  assert(Math.abs(circle.width - circle.height) < 1 && circle.width <= 44);
  const attach = scope.getByRole("button", { name: "Attach file", exact: true });
  assert((await attach.boundingBox()).x < circle.x);
  const micBox = await scope.getByRole("button", { name: "Microphone", exact: true }).boundingBox();
  assert(micBox.width >= 44 && micBox.height >= 44);
  assert(circle.x - (micBox.x + micBox.width) < 24, "the known voice wrapper aligns beside Send");
  await attach.click(); await scope.getByRole("button", { name: "Microphone", exact: true }).click();
  await scope.getByRole("button", { name: "Workspace", exact: true }).click();
  assert.deepEqual(await page.evaluate(() => window.events), ["trail", "attach", "mic", "workspace"]);
  await field.fill("Kept after failure"); await field.press("Shift+Enter");
  assert.equal(await field.inputValue(), "Kept after failure\n");
  await field.dispatchEvent("keydown", { key: "Enter", code: "Enter", keyCode: 229, isComposing: true, bubbles: true });
  assert.equal(await page.evaluate(() => window.calls.length), 0);
  await field.press("Enter");
  await scope.getByRole("alert").filter({ hasText: "fixture rejected this send" }).waitFor();
  assert.equal(await field.inputValue(), "Kept after failure\n");
  assert(await scope.getByText("example.txt", { exact: true }).isVisible());
  await page.evaluate(() => window.succeed = true);
  await scope.getByRole("button", { name: "Try again", exact: true }).click();
  await page.waitForFunction(() => document.querySelector('#workflow textarea').value === '');
  assert.equal(await page.evaluate(() => window.calls.length), 2);
  await field.press("Enter"); assert.equal(await page.evaluate(() => window.calls.length), 2);
  await field.fill("Preserved while switching");
  await page.evaluate(() => { window.savedTextarea = document.querySelector('#workflow textarea'); window.setComposerVariant('legacy'); });
  await scope.locator(".pc-composer--compact").waitFor({ state: "detached" });
  assert.equal(await field.inputValue(), "Preserved while switching");
  assert(await page.evaluate(() => window.savedTextarea === document.querySelector('#workflow textarea')));
  await page.evaluate(() => window.setComposerVariant('compact'));
  await scope.locator(".pc-composer--compact").waitFor();
  await page.evaluate(() => window.updateBusy(true));
  await scope.getByRole("button", { name: "Thinking…", exact: true }).waitFor();
  await field.press("Enter"); assert.equal(await page.evaluate(() => window.calls.length), 2);
  await scope.getByRole("button", { name: "Stop", exact: true }).click();
  assert((await page.evaluate(() => window.events)).includes("stop:true"));
  await page.setViewportSize({ width: 320, height: 700 });
  await field.fill(Array(25).fill("Long line in a narrow composer").join("\n"));
  assert(await field.evaluate((node) => node.scrollHeight > node.clientHeight));
  assert((await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)) <= 1);
  for (const name of ["Attach file", "Microphone", "Workspace", "Send"]) assert(await scope.getByRole("button", { name, exact: true }).isVisible());
  if (shots) { mkdirSync(shots, { recursive: true }); await page.screenshot({ path: resolve(shots, "compact-composer-320.png") }); }
  assert.deepEqual(errors, []);

  const fallback = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true });
  await fallback.addInitScript(() => { const supports = CSS.supports.bind(CSS); CSS.supports = (...args) => String(args[0]).includes('field-sizing') ? false : supports(...args); });
  await fallback.goto(origin);
  await fallback.addStyleTag({ content: ".pc-composer--compact textarea{field-sizing:fixed!important}" });
  const fallbackField = fallback.locator("#workflow textarea");
  await fallbackField.waitFor();
  const baseline = await fallbackField.evaluate((node) => node.getBoundingClientRect().height);
  await fallbackField.fill("A longer paragraph that needs several lines at a narrow pane width. ".repeat(3));
  await fallback.waitForFunction((height) => { const field = document.querySelector('#workflow textarea'); return field.style.height && field.getBoundingClientRect().height > height + 20; }, baseline);
  const narrowHeight = await fallbackField.evaluate((node) => node.getBoundingClientRect().height);
  await fallback.setViewportSize({ width: 740, height: 844 });
  await fallback.waitForFunction((height) => document.querySelector('#workflow textarea').getBoundingClientRect().height < height, narrowHeight);
  const touch = await fallback.locator('#workflow .pc-composer__send--compact').boundingBox();
  assert(touch.width >= 44 && Math.abs(touch.width - touch.height) < 1);
  console.log("compact composer browser: multiline/native+fallback growth, resize, IME/Enter/Shift+Enter gates, failed-send draft/files, actions/Stop, touch and same-node variant switching passed");
} finally { await browser.close(); await new Promise((resolve) => server.close(resolve)); }
