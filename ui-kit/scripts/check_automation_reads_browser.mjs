// Real consumption and monotone attention cursors; no Gateway writes or model calls.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFileSync} from 'node:fs';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import {build} from 'esbuild';
const root=fileURLToPath(new URL('../',import.meta.url));
const {chromium}=await import(pathToFileURL(resolve(process.env.SESSION_PLAYWRIGHT_MODULE)).href);
const base=JSON.parse(readFileSync(resolve(root,'scripts/fixtures/automations/list.json'),'utf8')).items[0];
const bundle=await build({stdin:{contents:`
import React,{useState} from 'react';import {createRoot} from 'react-dom/client';import {AutomationPanel} from './dist/automations/AutomationPanel.js';
const base=${JSON.stringify(base)};
function App(){const [p,set]=useState({owner:'a',revision:0,covered:false});window.setTest=set;window.bump=()=>set(x=>({...x,revision:x.revision+1}));
const items=[1,2].map(n=>({kind:'notify',automation_id:p.owner,run_id:'run-'+n,index:n,at:'2026-10-31T00:00:00Z',title:'Result '+n,body:'The full notification text',cursor:'att1:'+n}));
const summary={...base,automation_id:p.owner,attention:{...base.attention,unseen_count:2,items,cursor:'att1:2',pending_waits:0,waits:[]}};
return <><div style={{height:1000}}>An offscreen panel is not read</div><AutomationPanel key={p.owner} summary={summary} occurrences={[]} triggerSources={[]} hideHeader openAt="none" onSeen={async c=>{window.calls.push([p.owner,c]);if(window.fail)throw new Error('offline');}} onCommand={async()=>({})} onRevise={async()=>({})} onDiscuss={async()=>({})} onLoadMore={()=>{}} onOpenRun={()=>{}} onAnswerWait={async()=>{}}/>{p.covered&&<div style={{position:'fixed',inset:0,zIndex:100,background:'black'}}>Covered by another surface</div>}</>}
window.calls=[];window.fail=false;createRoot(document.getElementById('root')).render(<App/>);`,resolveDir:root,loader:'tsx'},bundle:true,write:false,format:'esm'});
const server=createServer((req,res)=>{res.setHeader('Content-Type',req.url==='/app.js'?'text/javascript':'text/html');res.end(req.url==='/app.js'?bundle.outputFiles[0].contents:'<!doctype html><style>body{margin:0;font-family:system-ui}li{min-height:800px;display:flex;flex-direction:column}.af-session-read-marker{margin-top:auto}li+li{margin-top:250px}</style><div id="root"></div><script type="module" src="/app.js"></script>')});
await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
try{browser=await chromium.launch({channel:'chrome'});const page=await browser.newPage({viewport:{width:900,height:650}}),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(`http://127.0.0.1:${server.address().port}`);await page.locator('[data-cursor="att1:1"]').waitFor();await page.waitForTimeout(400);assert.deepEqual(await page.evaluate(()=>window.calls),[],'Mounting offscreen must not mark seen');
const marker=n=>page.locator(`[data-cursor="att1:${n}"] .af-session-read-marker`);
await marker(2).scrollIntoViewIfNeeded();await page.waitForTimeout(400);assert.deepEqual(await page.evaluate(()=>window.calls),[],'A later notice cannot skip an unread prefix');
await page.evaluate(()=>window.setTest(x=>({...x,covered:true})));await marker(1).scrollIntoViewIfNeeded();await page.waitForTimeout(400);assert.deepEqual(await page.evaluate(()=>window.calls),[],'Covered content is not consumed');
await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,get:()=>window.hiddenTest});window.hiddenTest=true;document.dispatchEvent(new Event('visibilitychange'));window.setTest(x=>({...x,covered:false}));});await page.waitForTimeout(400);assert.deepEqual(await page.evaluate(()=>window.calls),[],'Background content is not consumed');
await page.evaluate(()=>{window.hiddenTest=false;document.dispatchEvent(new Event('visibilitychange'));});await page.waitForTimeout(400);assert.deepEqual(await page.evaluate(()=>window.calls),[['a','att1:2']]);
await page.evaluate(()=>window.bump());await page.waitForTimeout(350);assert.equal(await page.evaluate(()=>window.calls.length),1,'No duplicate acknowledgement on replay');
await page.evaluate(()=>{window.setTest(x=>({...x,owner:'b'}));window.scrollTo(0,0);});await page.waitForTimeout(350);assert.equal(await page.evaluate(()=>window.calls.length),1,'New owner never inherits consumption');
await marker(1).scrollIntoViewIfNeeded();await page.waitForTimeout(60);await page.evaluate(()=>window.setTest(x=>({...x,owner:'c'})));await page.evaluate(()=>window.scrollTo(0,0));await page.waitForTimeout(350);assert.equal(await page.evaluate(()=>window.calls.length),1,'Switch cancels old dwell timer');
await page.evaluate(()=>window.fail=true);await marker(1).scrollIntoViewIfNeeded();await page.waitForTimeout(450);assert.deepEqual(await page.evaluate(()=>window.calls),[['a','att1:2'],['c','att1:1']]);await page.waitForTimeout(400);assert.equal(await page.evaluate(()=>window.calls.length),2,'Refusal causes no local retry loop');
await page.evaluate(()=>{window.fail=false;window.bump();});await page.waitForTimeout(350);assert.deepEqual(await page.evaluate(()=>window.calls),[['a','att1:2'],['c','att1:1'],['c','att1:1']],'Fresh data retries the consumed prefix');assert.deepEqual(errors,[]);
console.log('automation_reads_browser: PASS (offscreen, later-before-earlier, covered, background, replay, owner switch, dwell cancellation, refusal and retry)');
}finally{await browser?.close();server.close();}
