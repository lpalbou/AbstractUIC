import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFileSync, mkdirSync } from "node:fs";
import { build } from "esbuild";
import { pathToFileURL, fileURLToPath } from "node:url";
import { resolve } from "node:path";
const root = fileURLToPath(new URL("../", import.meta.url));
const { chromium } = await import(
  pathToFileURL(
    process.env.CHAT_PLAYWRIGHT_MODULE ||
      resolve(
        root,
        "../../abstractassistant/web/node_modules/playwright/index.mjs",
      ),
  ).href
);
const bundle = await build({
  stdin: {
    contents: `
import React,{useState} from 'react';import {createRoot} from 'react-dom/client';import {WorkflowChat} from './dist/conversation.js';
window.calls=[];window.blockOld=false;window.failInput=false;window.oldResolvers=[];window.releaseOld=()=>window.oldResolvers.splice(0).forEach(r=>r());
async function gateway(path,init={}){window.calls.push(path);if(path.endsWith('/input_data')){if(path.includes('/historic/'))return Response.json({input_data:{}});if(window.failInput)return new Response('History unavailable',{status:503});return Response.json({input_data:{context:{attachments:[{$artifact:'user-file',filename:'notes.txt',run_id:'memory'}]}}});}
if(path.endsWith('/historic'))return Response.json({status:'completed',output:{attachments:[{$artifact:'historical-file',filename:'older-report.txt'}]}});
if(path.includes('old-file'))await new Promise(r=>window.oldResolvers.push(r));
if(path.endsWith('/content'))return new Response(path.includes('active-file')?'<script>window.pwned=true</script>':'A file from the Gateway',{headers:{'Content-Type':path.includes('active-file')?'text/html':'text/plain'}});
return Response.json({tags:{filename:path.includes('user-file')?'notes.txt':path.includes('active-file')?'untrusted.html':path.includes('historical-file')?'older-report.txt':path.includes('only-file')?'attachment-only.pdf':'report.json'}});}
const tools=['web_search','skim_websearch','fetch_url'].map((name,i)=>({id:'tool'+i,role:'system',runId:'run',content:'',toolActivity:{id:'tool'+i,runId:'run',name,status:'completed',arguments:{url:'https://example.org/input'},output:JSON.stringify({success:true,results:[{url:'https://example.org/result',title:'A result'}]})}}));
function App(){const [scope,setScope]=useState('alice'),[mode,setMode]=useState('normal'),[version,setVersion]=useState(0);window.setVersion=setVersion;window.setScope=setScope;window.setMode=setMode;
const messages=mode==='old'?[{id:'old',role:'assistant',runId:'old-run',content:'Old account',artifactIds:['old-file']}]:[
{id:'historic-prompt',role:'user',runId:'historic',content:'An older file-only reply'},
{id:'user',role:'user',runId:'run',content:'Here is a file and https://example.org/question'},
...tools,{id:'answer',role:'assistant',runId:'run',content:'Your report: https://example.org/answer',artifactIds:['ai-file','active-file']}];
return <WorkflowChat artifactFetch={gateway} attachmentScope={scope} attachmentRun={mode==='only'?{runId:'run',output:{attachments:[{$artifact:'only-file',filename:'attachment-only.pdf'}]}}:{runId:'run',output:{response:String(version)}}} messages={mode==='only'?messages.filter(m=>m.role!=='assistant'):messages} draft="" onDraftChange={()=>{}} onSend={()=>{}}/>;}
createRoot(document.getElementById('root')).render(<App/>);`,
    resolveDir: root,
    loader: "tsx",
  },
  bundle: true,
  write: false,
  format: "esm",
});
const css =
  readFileSync(resolve(root, "src/panel_chat.css"), "utf8") +
  readFileSync(resolve(root, "../ui-kit/src/theme.css"), "utf8");
const server = createServer((req, res) => {
  res.setHeader(
    "Content-Type",
    req.url === "/app.js"
      ? "text/javascript"
      : req.url === "/style.css"
        ? "text/css"
        : "text/html",
  );
  res.end(
    req.url === "/app.js"
      ? bundle.outputFiles[0].contents
      : req.url === "/style.css"
        ? css
        : '<!doctype html><html class="theme-dark"><link rel="stylesheet" href="/style.css"><style>body{margin:0;background:var(--bg-primary);color:var(--text-primary);font-family:system-ui}#root{height:100vh;max-width:1050px;margin:auto}</style><div id="root"></div><script type="module" src="/app.js"></script>',
  );
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
let browser;
try {
  browser = await chromium.launch({
    channel: "chrome",
    args: ["--mute-audio"],
  });
  const context = await browser.newContext({
      viewport: { width: 1200, height: 1000 },
    }),
    page = await context.newPage(),
    errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  await page.getByRole("button", { name: "notes.txt", exact: true }).waitFor();
  await page
    .getByRole("button", { name: "report.json", exact: true })
    .waitFor();
  await page
    .getByRole("button", { name: "older-report.txt", exact: true })
    .waitFor();
  assert.equal(
    await page
      .locator(".pc-chat-item--assistant")
      .getByRole("button", { name: "older-report.txt", exact: true })
      .count(),
    1,
  );
  assert.equal(
    await page
      .locator(".pc-chat-item--user")
      .getByRole("button", { name: "notes.txt", exact: true })
      .count(),
    1,
  );
  assert.equal(
    await page
      .locator(".pc-chat-item--assistant")
      .getByRole("button", { name: "report.json", exact: true })
      .count(),
    1,
  );
  assert.equal(
    await page.evaluate(() => window.calls.some((p) => p.endsWith("/content"))),
    false,
    "Bytes load only when activated",
  );
  for (const link of await page.locator('a[href^="https://"]').all()) {
    assert.equal(await link.getAttribute("target"), "_blank");
    assert.match(await link.getAttribute("rel"), /noopener/);
  }
  for (const row of await page.locator(".pc-tool-activity").all()) {
    await row.locator("summary").first().click();
    assert.equal(await row.locator(".pc-json-viewer").count(), 1);
    assert.equal(
      await row.locator('a[href="https://example.org/result"]').count(),
      1,
    );
  }
  const popup = context.waitForEvent("page");
  await page.getByRole("button", { name: "notes.txt", exact: true }).click();
  const opened = await popup;
  await opened.waitForLoadState();
  assert.match(opened.url(), /^blob:/);
  await opened.close();
  const sourcePopup = context.waitForEvent("page");
  await page
    .getByRole("button", { name: "untrusted.html", exact: true })
    .click();
  const sourcePage = await sourcePopup;
  await sourcePage.waitForLoadState();
  assert.equal(
    await sourcePage.evaluate(() => window.pwned),
    undefined,
    "Active documents open as inert source",
  );
  assert.match(await sourcePage.locator("body").innerText(), /script/);
  await sourcePage.close();
  await page.evaluate(() => {
    window.setMode("old");
  });
  await page.getByText("Old account", { exact: true }).waitFor();
  await page
    .getByRole("button", { name: "Attachment old-file", exact: true })
    .click();
  await page.evaluate(() => window.setScope("bob"));
  await page.waitForTimeout(100);
  const before = context.pages().length;
  await page.evaluate(() => window.releaseOld());
  await page.waitForTimeout(200);
  assert.equal(
    context.pages().length,
    before,
    "Switching owner cancels a pending file open",
  );
  await page.evaluate(() => {
    window.setMode("only");
    window.setScope("charlie");
  });
  await page
    .getByRole("button", { name: "attachment-only.pdf", exact: true })
    .waitFor();
  assert.equal(
    await page
      .locator(".pc-chat-item--assistant")
      .getByRole("button", { name: "attachment-only.pdf", exact: true })
      .count(),
    1,
  );
  assert.equal(await page.locator("a a").count(), 0, "Links never nest");
  await page.evaluate(() => {
    window.failInput = true;
    window.setScope("retry-owner");
    window.setMode("normal");
  });
  await page
    .getByRole("button", { name: "Retry attachment check", exact: true })
    .waitFor();
  await page.evaluate(() => {
    window.failInput = false;
  });
  await page
    .getByRole("button", { name: "Retry attachment check", exact: true })
    .click();
  await page.getByRole("button", { name: "notes.txt", exact: true }).waitFor();
  const historicalReads = await page.evaluate(
    () => window.calls.filter((p) => p.endsWith("/historic")).length,
  );
  await page.evaluate(() => window.setVersion(1));
  await page.waitForTimeout(150);
  assert.equal(
    await page.evaluate(
      () => window.calls.filter((p) => p.endsWith("/historic")).length,
    ),
    historicalReads,
    "Settled historical outputs stay cached across current output changes",
  );
  const dir = process.env.CHAT_CAPTURE_DIR;
  if (dir) {
    mkdirSync(dir, { recursive: true });
    await page.evaluate(() => window.setMode("normal"));
    await page
      .getByRole("button", { name: "report.json", exact: true })
      .waitFor();
    await page.screenshot({
      path: resolve(dir, "message-files-and-links.png"),
    });
  }
  assert.deepEqual(errors, []);
  console.log(
    "message_files_browser: PASS (both roles, lazy authenticated bytes, safe new tabs, inert HTML source, owner cancellation, file-only reply, structured search JSON)",
  );
} finally {
  await browser?.close();
  server.close();
}
