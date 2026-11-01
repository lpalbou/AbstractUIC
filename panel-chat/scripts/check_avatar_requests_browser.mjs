// Real React/CSS in Chrome. No model, external reads or simulated approval side effects.
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFileSync, mkdirSync } from "node:fs";
import { build } from "esbuild";
const { chromium } = await import(process.env.PANEL_CHAT_PLAYWRIGHT_MODULE || "@playwright/test");
const root = new URL("../", import.meta.url).pathname;
const WHY = "I want to compare the two restaurant pages so I can check their opening hours.";
const URLS = ["https://restaurant.example/menu", "https://riverside.example/opening-hours"];
const MISSING = "The reason for this request isn’t available here.";
const compiled = await build({ absWorkingDir: root, bundle: true, write: false, format: "esm", stdin: { resolveDir: root, loader: "jsx", contents: `
import React,{useState} from 'react';import{createRoot}from'react-dom/client';import{WorkflowChat,presentInteraction}from'./dist/conversation.js';
window.events=[];window.hold=false;window.rejectNext=false;
function Harness(){
 const[state,setState]=useState({mode:'pages',revision:1,technical:false});window.mode=mode=>setState(s=>({mode,revision:s.revision+1,technical:false}));
 const[draft,setDraft]=useState('');const question=state.mode==='question';
 const calls=state.mode==='six'?Array.from({length:6},(_,i)=>({name:'read_file',arguments:{file_path:'notes-'+i+'.txt',private_metadata:'SECRET_JSON'},call_id:'call-'+i})):state.mode==='unknown'?[{name:'execute_command',arguments:{command:'SECRET_COMMAND'},call_id:'unknown'}]:${JSON.stringify(URLS)}.map((url,i)=>({name:'fetch_url',arguments:{url,...(state.mode==='unsafe-web'?{method:'POST',data:'SECRET_JSON'}:{})},call_id:'page-'+i}));
 const runId='actor-run';const publicAction={text:state.mode==='six'?'I want to compare these six notes before choosing a summary.':${JSON.stringify(WHY)},run_id:state.mode==='unbound'?'unrelated-run':runId,update_id:'public-why:'+state.revision,iteration:2,call_ids:calls.map(c=>c.call_id)};
 const controller={approve:async(value,target)=>{window.events.push(['approve',value,target]);if(window.rejectNext){window.rejectNext=false;throw Error('SECRET_PROVIDER_FAILURE');}if(window.hold)await new Promise(resolve=>window.release=resolve);},resume:async(text,target)=>window.events.push(['answer',text,target]),emitEvent:async()=>{}};
 const wait=question?{reason:'user',wait_key:'question:'+state.revision,prompt:'Which restaurant should I keep?',details:{question:{id:'question:'+state.revision,purpose:'conversation',importance:'essential'}}}:{reason:'tool_approval',wait_key:'approval:'+state.revision,details:{kind:'tool_approval',tool_calls:calls,public_action:publicAction}};
 window.requestTarget={runId,waitKey:wait.wait_key};
 const interaction=presentInteraction({runId,wait},controller,{onPermissionsAll:async()=>window.events.push(['broad-all']),onAllowForSession:async()=>window.events.push(['broad-session'])});
 return <WorkflowChat messages={[]} draft={draft} onDraftChange={setDraft} onSend={()=>{}} interaction={interaction} busy composerVariant='compact'
  avatarConversation={state.technical?undefined:{sessionKey:'session',avatar:<div role='img' aria-label='Avatar' style={{width:320,height:320,borderRadius:'50%',background:'#94783a'}}/>,status:'working',connection:'connected',attention:{id:state.mode+state.revision,kind:question?'question':'approval'},onTechnicalView:()=>{window.events.push(['review']);setState(s=>({...s,technical:true}));}}}/>;
}createRoot(document.getElementById('root')).render(<Harness/>);` } });
const css = readFileSync(new URL("../src/panel_chat.css", import.meta.url), "utf8");
const server = createServer((request, response) => {
 if (request.url === "/entry.js") { response.setHeader("Content-Type", "text/javascript"); response.end(compiled.outputFiles[0].text); }
 else if (request.url === "/styles.css") { response.setHeader("Content-Type", "text/css"); response.end(css); }
 else { response.setHeader("Content-Type", "text/html"); response.end('<html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/styles.css"><style>html,body,#root{margin:0;height:100%;font:16px system-ui;background:#191a25;color:#bbc4e7}#root{display:flex;flex-direction:column}.pc-workflow-chat{height:100%;--text-primary:#bbc4e7;--text-secondary:#a9b1cf;--ui-surface-0:#191a25;--ui-surface-1:#232536;--ui-border-1:#434b70}</style></head><body><div id="root"></div><script type="module" src="/entry.js"></script></body></html>'); }
});
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined });
const visible = async locator => locator.evaluate(element => {
 const box = element.getBoundingClientRect(); let top = 0, bottom = innerHeight, left = 0, right = innerWidth;
 for (let parent = element.parentElement; parent; parent = parent.parentElement) {
  const style = getComputedStyle(parent), rect = parent.getBoundingClientRect();
  if (/auto|scroll|hidden|clip/.test(style.overflowY)) { top = Math.max(top, rect.top); bottom = Math.min(bottom, rect.bottom); }
  if (/auto|scroll|hidden|clip/.test(style.overflowX)) { left = Math.max(left, rect.left); right = Math.min(right, rect.right); }
 }
 return box.width > 0 && box.height > 0 && box.top >= top - 1 && box.bottom <= bottom + 1 && box.left >= left - 1 && box.right <= right + 1;
});
try {
 const page = await browser.newPage({ viewport: { width:1280, height:800 }, reducedMotion:"reduce" }); page.setDefaultTimeout(8000);
 const errors = []; page.on("pageerror", error => errors.push(String(error)));
 const checkPublic = async () => {
  const text = await page.locator('.pc-avatar-conversation__request').innerText();
  for (const raw of ['read_file','fetch_url','execute_command','SECRET_JSON','SECRET_COMMAND','"arguments"','"call_id"','Allow for this chat','Allow all enabled tools']) assert(!text.includes(raw), `Public request leaked ${raw}`);
  for (const label of ['Deny','Allow once']) { const button = page.getByRole('button',{name:label,exact:true}); if(await button.count()) assert.equal(await button.locator('svg').count(),1,`${label} has labeled iconography`); }
 };
 for (const viewport of [{width:1280,height:800},{width:1000,height:650},{width:390,height:844}]) {
  await page.setViewportSize(viewport); await page.goto('http://127.0.0.1:'+server.address().port);
  const allow = page.getByRole('button',{name:'Allow once',exact:true}); await allow.waitFor();
  await page.getByRole('heading',{name:'May I read these 2 webpages?',exact:true}).waitFor(); await checkPublic();
  for (const locator of [page.locator('.pc-workflow-interaction__prompt'),page.getByText(WHY,{exact:true}),...URLS.map(url=>page.getByText(url,{exact:true})),allow,page.getByRole('button',{name:'Deny',exact:true}),page.getByRole('button',{name:'Review details',exact:true})]) assert(await visible(locator),`Two-page why/targets/actions clipped at ${viewport.width}x${viewport.height}: ${await locator.textContent()}`);
  assert.equal((await page.evaluate(()=>window.events)).length,0,'Rendering never grants permission');
  if(process.env.AVATAR_REQUEST_SHOTS){mkdirSync(process.env.AVATAR_REQUEST_SHOTS,{recursive:true});await page.screenshot({path:process.env.AVATAR_REQUEST_SHOTS+'/approval-pages-'+viewport.width+'.png'});}
  await allow.click(); assert.deepEqual((await page.evaluate(()=>window.events)).map(e=>e.slice(0,2)),[['approve',true]]);
  await page.evaluate(()=>window.mode('six')); await page.getByRole('heading',{name:'May I read these 6 files?',exact:true}).waitFor(); await checkPublic();
  assert(await visible(page.getByText('I want to compare these six notes before choosing a summary.',{exact:true})));
  const last = page.getByText('notes-5.txt',{exact:true}); await last.scrollIntoViewIfNeeded();
  assert(await visible(last),'Six-batch targets are reachable inside their bounded context');
  assert(await visible(page.getByRole('button',{name:'Deny',exact:true})) && await visible(page.getByRole('button',{name:'Allow once',exact:true})),'Six-batch scrolling retains decision controls');
  await page.getByRole('button',{name:'Deny',exact:true}).click(); assert.deepEqual((await page.evaluate(()=>window.events)).at(-1).slice(0,2),['approve',false]);
  await page.evaluate(()=>window.mode('question')); const response=page.getByRole('textbox',{name:'Response',exact:true}); await response.waitFor(); assert(await visible(response),'Question input clipped');
  await response.fill('Keep Riverside'); await page.getByRole('button',{name:'Submit',exact:true}).click(); assert.deepEqual((await page.evaluate(()=>window.events)).at(-1).slice(0,2),['answer','Keep Riverside']);
 }
 await page.evaluate(()=>{window.events=[];window.mode('unbound');}); await page.getByText(MISSING,{exact:true}).waitFor(); assert.equal(await page.getByText(WHY,{exact:true}).count(),0,'Unbound observations cannot become a why'); await checkPublic();
 await page.evaluate(()=>window.mode('unknown')); await page.getByText('I can’t describe this request clearly here. Review the details before allowing it.',{exact:true}).waitFor(); assert.equal(await page.getByRole('button',{name:'Allow once',exact:true}).count(),0,'Unknown actions require technical review'); await checkPublic();
 await page.evaluate(()=>window.mode('unsafe-web')); await page.getByText('A website request that needs a closer look',{exact:true}).first().waitFor(); assert.equal(await page.getByRole('button',{name:'Allow once',exact:true}).count(),0,'POST/data requests require detailed review'); await checkPublic();
 await page.getByRole('button',{name:'Review details',exact:true}).click(); await page.locator('.pc-avatar-conversation').waitFor({state:'detached'}); assert.deepEqual(await page.evaluate(()=>window.events),[['review']],'Changing view sends no decision');
 await page.evaluate(()=>{window.events=[];window.mode('pages');window.rejectNext=true;});
 await page.locator('.pc-avatar-conversation').waitFor(); const allow = page.getByRole('button',{name:'Allow once',exact:true}); await allow.waitFor(); const target=await page.evaluate(()=>window.requestTarget); await allow.click();
 await page.getByRole('alert').filter({hasText:'Your choice could not be sent.'}).waitFor(); assert(!(await page.locator('body').innerText()).includes('SECRET_PROVIDER_FAILURE'),'Plain errors do not leak provider details');
 await page.evaluate(()=>window.hold=true); await page.getByRole('button',{name:'Try again',exact:true}).click(); await page.getByRole('button',{name:'Allowing…',exact:true}).waitFor();
 assert.equal((await page.evaluate(()=>window.events)).length,2,'Retry resends only the captured decision');
 await page.locator('[data-decision="approve"]').evaluate(element=>{element.click();element.click();}); assert.equal((await page.evaluate(()=>window.events)).length,2,'Duplicate clicks cannot bypass the in-flight guard');
 await page.evaluate(()=>window.release()); await page.getByText('Your choice was sent. I’m waiting for work to continue.',{exact:true}).waitFor();
 await page.locator('[data-decision="approve"]').evaluate(element=>element.click()); assert.equal((await page.evaluate(()=>window.events)).length,2,'Accepted choice stays single-use until the actual wait changes');
 const targets=(await page.evaluate(()=>window.events)).map(e=>({runId:e[2].runId,waitKey:e[2].waitKey}));assert.deepEqual(targets,[target,target],'Retry retains the exact original target');
 assert.deepEqual(errors,[]); console.log('avatar public requests PASS: exact bound why, no technical leak, two webpages, six-batch/questions, review-only unknowns, in-flight/error/retry and desktop/short/phone geometry');
} finally { await browser.close(); await new Promise(resolve=>server.close(resolve)); }
