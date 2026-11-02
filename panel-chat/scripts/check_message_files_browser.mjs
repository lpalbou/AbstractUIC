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
window.failMeta=false;window.releaseMetadata=()=>{};window.calls=[];window.blockOld=false;window.failInput=false;window.oldResolvers=[];window.releaseOld=()=>window.oldResolvers.splice(0).forEach(r=>r());
async function gateway(path,init={}){window.calls.push(path);if(path.includes('blocked-state')&&!path.endsWith('/content')){await new Promise(r=>window.releaseMetadata=r);return Response.json({tags:{source:'node_trace_offload'}});}if(window.failMeta&&path.includes('user-file')&&!path.endsWith('/content'))return new Response('Forbidden',{status:403});if(path.endsWith('/input_data')){if(path.includes('/historic/'))return Response.json({input_data:{}});if(window.failInput)return new Response('History unavailable',{status:503});return Response.json({input_data:{context:{attachments:[{$artifact:'user-file',filename:'notes.txt',run_id:'memory'}]}}});}
if(path.endsWith('/historic'))return Response.json({status:'completed',output:{attachments:[{$artifact:'historical-file',filename:'older-report.txt'}]}});
if(path.includes('old-file')&&path.endsWith('/content'))await new Promise(r=>window.oldResolvers.push(r));
if(path.endsWith('/content')&&path.includes('image-file')){const c=document.createElement('canvas');c.width=window.widePhoto?1200:500;c.height=window.widePhoto?400:800;c.getContext('2d').fillRect(0,0,c.width,c.height);return new Response(Uint8Array.from(atob(c.toDataURL().split(',')[1]),c=>c.charCodeAt(0)),{headers:{'Content-Type':'image/png'}});}
if(path.endsWith('/content')&&path.includes('ai-file'))return Response.json({report:'requested JSON file'});
if(path.endsWith('/content'))return new Response(path.includes('active-file')?'<script>window.pwned=true</script>':'A file from the Gateway',{headers:{'Content-Type':path.includes('active-file')?'text/html':'text/plain'}});
return Response.json({tags:{filename:path.includes('old-file')?'Old file':path.includes('user-file')?'notes.txt':path.includes('active-file')?'untrusted.html':path.includes('historical-file')?'older-report.txt':path.includes('image-file')?'photo.png':path.includes('only-file')?'attachment-only.pdf':'report.json'}});}
const tools=['web_search','skim_websearch','fetch_url'].map((name,i)=>({id:'tool'+i,role:'system',runId:'run',content:'',toolActivity:{id:'tool'+i,runId:'run',name,status:'completed',arguments:{url:'https://example.org/input'},output:JSON.stringify({success:true,results:[{url:'https://example.org/result',title:'A result'}]})}}));
function App(){const [scope,setScope]=useState('alice'),[mode,setMode]=useState('normal'),[version,setVersion]=useState(0);window.setVersion=setVersion;window.setScope=setScope;window.setMode=setMode;
const messages=mode==='internal'?[{id:'state',role:'assistant',runId:'run',content:'No files delivered',artifactRefs:[{id:'blocked-state',runId:'run',name:'state.json'}]}]:mode==='old'?[{id:'old',role:'assistant',runId:'old-run',content:'Old account',artifactRefs:[{id:'old-file',runId:'old-run',name:'Old file'}]}]:[
{id:'historic-prompt',role:'user',runId:'historic',content:'An older file-only reply'},
{id:'user',role:'user',runId:'run',content:'Here is a file and https://example.org/question'},
...tools,{id:'answer',role:'assistant',runId:'run',content:'Your report: https://example.org/answer',artifactIds:['scratchpad-file','session-file'],artifactRefs:[{id:'ai-file',runId:'run',name:'report.json'},{id:'active-file',runId:'run',name:'untrusted.html'},{id:'image-file',runId:'run',name:'photo.png'}]}];
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
  const pagesBefore = context.pages().length;
  await page.getByRole("button", { name: "notes.txt", exact: true }).click();
  await page
    .getByRole("dialog", { name: "notes.txt", exact: true })
    .getByText("A file from the Gateway", { exact: true })
    .waitFor();
  await page.keyboard.press("Escape");
  assert.equal(await page.getByRole("dialog").count(), 0);
  assert.equal(
    await page.evaluate(() => document.activeElement.textContent.trim()),
    "notes.txt",
  );
  await page.getByRole("button", { name: "report.json", exact: true }).click();
  await page
    .getByRole("dialog", { name: "report.json", exact: true })
    .getByText(/requested JSON file/)
    .waitFor();
  if(process.env.CHAT_CAPTURE_DIR){mkdirSync(process.env.CHAT_CAPTURE_DIR,{recursive:true});await page.getByRole('dialog',{name:'report.json',exact:true}).screenshot({path:resolve(process.env.CHAT_CAPTURE_DIR,'json-preview-modal.png')});}
  const downloadEvent=page.waitForEvent('download');
  await page.getByRole('dialog',{name:'report.json',exact:true}).getByRole('button',{name:'Download report.json',exact:true}).click();
  assert.equal((await downloadEvent).suggestedFilename(),'report.json');
  await page.keyboard.press("Escape");
  await page
    .getByRole("button", { name: "untrusted.html", exact: true })
    .click();
  await page
    .getByRole("dialog", { name: "untrusted.html", exact: true })
    .getByText(/script/)
    .waitFor();
  assert.equal(await page.evaluate(() => window.pwned), undefined);
  assert.equal(await page.locator("iframe").count(), 0);
  await page.keyboard.press("Escape");
  await page.evaluate(() => {
    window.createdUrls = [];
    window.revokedUrls = [];
    const create = URL.createObjectURL.bind(URL),
      revoke = URL.revokeObjectURL.bind(URL);
    URL.createObjectURL = (b) => {
      const url = create(b);
      window.createdUrls.push(url);
      return url;
    };
    URL.revokeObjectURL = (url) => {
      window.revokedUrls.push(url);
      revoke(url);
    };
  });
  await page.getByRole("button", { name: "photo.png", exact: true }).click();
  await page
    .getByRole("dialog", { name: "photo.png", exact: true })
    .locator("img")
    .waitFor();
  await page.waitForFunction(() => document.querySelector('.pc-artifact-preview__content')?.style.getPropertyValue('--pc-media-width') === '500px');
  const fit = await page.getByRole('dialog').evaluate(el => {
    const box=el.getBoundingClientRect(), img=el.querySelector('img').getBoundingClientRect();
    const header=el.querySelector('.af-modal__header').getBoundingClientRect();
    const download=el.querySelector('[aria-label="Download photo.png"]').getBoundingClientRect();
    return {width:box.width,height:box.height,imageWidth:img.width,imageHeight:img.height,aligned:download.top>=header.top && download.bottom<=header.bottom,headCount:[...el.querySelectorAll('.af-modal__title,.af-file-viewer__name')].filter(n=>n.getClientRects().length).length};
  });
  assert(fit.width < 600 && fit.width >= fit.imageWidth, JSON.stringify(fit));
  assert(fit.width-fit.imageWidth < 32 && fit.height-fit.imageHeight < 100, 'Portrait dialog hugs image');
  assert(fit.aligned); assert.equal(fit.headCount,1,'One visible filename');
  if(process.env.CHAT_CAPTURE_DIR) await page.getByRole('dialog').screenshot({path:resolve(process.env.CHAT_CAPTURE_DIR,'portrait-preview.png')});
  const blobUrl = await page
    .getByRole("dialog")
    .locator("img")
    .getAttribute("src");
  await page.keyboard.press("Escape");
  assert.equal(
    await page.evaluate((url) => window.revokedUrls.includes(url), blobUrl),
    true,
  );
  await page.evaluate(()=>window.widePhoto=true);
  await page.setViewportSize({width:390,height:700});
  await page.getByRole('button',{name:'photo.png',exact:true}).click();
  await page.waitForFunction(() => document.querySelector('.pc-artifact-preview__content')?.style.getPropertyValue('--pc-media-width') === '1200px');
  const mobileFit=await page.getByRole('dialog').boundingBox();
  assert(mobileFit.width<=360 && mobileFit.x>=14 && mobileFit.y>=0 && mobileFit.y+mobileFit.height<=700);
  const mobileImage=await page.getByRole('dialog').locator('img').boundingBox();
  assert(mobileFit.height-mobileImage.height<100,'Landscape preview has no empty full-screen panel');
  await page.keyboard.press('Escape');
  await page.setViewportSize({width:1200,height:1000});
  assert.equal(
    context.pages().length,
    pagesBefore,
    "Attachments preview in app without opening tabs",
  );
  assert.equal(
    await page.getByText(/Attachment (scratchpad|session)/).count(),
    0,
  );
  await page.evaluate(() => {
    window.setMode("old");
  });
  await page.getByText("Old account", { exact: true }).waitFor();
  await page.getByRole("button", { name: "Old file", exact: true }).click();
  await page.evaluate(() => window.setScope("bob"));
  await page.waitForTimeout(100);
  const before = context.pages().length;
  assert.equal(await page.getByRole("dialog").count(), 0);
  await page.evaluate(() => window.releaseOld());
  await page.waitForTimeout(200);
  assert.equal(
    context.pages().length,
    before,
    "Switching owner cancels a pending file preview",
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
  await page.evaluate(() => window.setMode("internal"));
  const blocked = page.getByRole("button", { name: "state.json", exact: true });
  await blocked.waitFor();
  assert.equal(await blocked.isDisabled(), true);
  assert.equal(
    await page.evaluate(() =>
      window.calls.some(
        (p) => p.includes("blocked-state") && p.endsWith("/content"),
      ),
    ),
    false,
  );
  await page.evaluate(() => window.releaseMetadata());
  await blocked.waitFor({ state: "detached" });
  await page.evaluate(() => {
    window.failMeta = true;
    window.setMode("normal");
    window.setScope("metadata-error-owner");
  });
  await page
    .getByRole("button", { name: "Retry notes.txt", exact: true })
    .waitFor();
  assert.equal(
    await page
      .getByRole("button", { name: "notes.txt", exact: true })
      .isDisabled(),
    true,
  );
  await page.evaluate(() => (window.failMeta = false));
  await page
    .getByRole("button", { name: "Retry notes.txt", exact: true })
    .click();
  await page.getByRole("button", { name: "notes.txt", exact: true }).waitFor();
  await page.waitForFunction(() =>
    [...document.querySelectorAll(".pc-chat-attachment-chip")].some(
      (e) => e.textContent === "notes.txt" && !e.disabled,
    ),
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
    "message_files_browser: PASS (both roles, lazy authenticated bytes, in-app modals, inert HTML source, owner cancellation, file-only reply, structured search JSON)",
  );
} finally {
  await browser?.close();
  server.close();
}
