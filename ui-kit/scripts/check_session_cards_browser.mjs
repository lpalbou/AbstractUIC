// Real-browser consumption checks. No Gateway or inference.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFileSync,mkdirSync} from 'node:fs';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {build} from 'esbuild';
const root=fileURLToPath(new URL('../',import.meta.url));
const {chromium}=await import(process.env.SESSION_PLAYWRIGHT_MODULE?pathToFileURL(resolve(process.env.SESSION_PLAYWRIGHT_MODULE)).href:'playwright');
const bundle=await build({stdin:{contents:`
import React,{useState} from 'react';import {createRoot} from 'react-dom/client';
import {SessionCard,useSessionReads,SessionReadMarker} from './dist/session_cards.js';
function App(){const [p,set]=useState({revision:'initial',scope:'demo',covered:false,down:true});window.setTest=set;
const receipt={sessionId:'a',revision:p.revision,updatedAt:window.receiptAt},reads=useSessionReads(p.scope);
return <><aside><SessionCard sessionId="a" title="A compact conversation with a two-line title" unread={reads.isUnread(receipt)} selected turnCount={4} toolCount={115} updatedAt={Date.now()-540000} nowMs={Date.now()} onOpen={()=>{}} onArchive={()=>{}}/>
<SessionCard sessionId="b" title="Please review this tool approval" unread needsAttention turnCount={2} updatedAt={Date.now()} nowMs={Date.now()} onOpen={()=>{}}/>
<SessionCard sessionId="c" title="Working on your question" working turnCount={1} nowMs={Date.now()} onOpen={()=>{}}/></aside>
<main><div style={{height:p.down?1600:20}}>Loaded answer</div><SessionReadMarker ownerKey={p.scope} receipt={receipt} enabled relatedReceipts={p.related} onRead={r=>{window.consumed.push([p.scope,r.revision]);reads.markRead(r)}}/></main>
{p.covered&&<div style={{position:'fixed',inset:0,background:'var(--ui-bg)',zIndex:100}}>A drawer covers the answer</div>}</>}
window.consumed=[];window.receiptAt=new Date(Date.now()+1000).toISOString();createRoot(document.getElementById('root')).render(<App/>);`,resolveDir:root,loader:'tsx'},bundle:true,write:false,format:'esm'});
const css=readFileSync(resolve(root,'src/theme.css'),'utf8');
const server=createServer((req,res)=>{res.setHeader('Content-Type',req.url==='/app.js'?'text/javascript':req.url==='/theme.css'?'text/css':'text/html');res.end(req.url==='/app.js'?bundle.outputFiles[0].contents:req.url==='/theme.css'?css:`<!doctype html><html data-theme="dark"><link rel="stylesheet" href="/theme.css"><style>body{margin:0;background:var(--ui-bg);color:var(--ui-fg);font-family:system-ui}aside{position:fixed;top:20px;left:20px;width:290px;display:grid;gap:10px}main{margin-left:340px;width:300px}button{font:inherit}</style><div id="root"></div><script type="module" src="/app.js"></script></html>`)});
await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
try{
browser=await chromium.launch();const context=await browser.newContext({viewport:{width:900,height:650}}),page=await context.newPage(),errors=[];
page.on('pageerror',e=>errors.push(e.message));const base=`http://127.0.0.1:${server.address().port}`;await page.goto(base);await page.locator('.af-session-card').first().waitFor();const archive=page.locator('.af-session-card__archive').first();assert.equal(await archive.evaluate(el=>getComputedStyle(el).opacity),'0');assert.equal(await archive.evaluate(el=>el.getBoundingClientRect().width),28);await page.locator('.af-session-card').first().hover();assert.equal(await archive.evaluate(el=>getComputedStyle(el).opacity),'1');await page.locator('.af-session-card__open').first().click();await page.mouse.move(850,600);assert.equal(await archive.evaluate(el=>getComputedStyle(el).opacity),'0');await page.locator('.af-session-card__open').first().focus();await page.keyboard.press('Shift');assert.equal(await archive.evaluate(el=>getComputedStyle(el).opacity),'1');await page.keyboard.press('Tab');assert.equal(await archive.evaluate(el=>document.activeElement===el),true);await page.locator('main').click();const titleStyle=await page.locator('.af-session-card__title').first().evaluate(el=>({weight:getComputedStyle(el).fontWeight,size:parseFloat(getComputedStyle(el).fontSize)}));assert.equal(titleStyle.weight,'400');assert.equal(titleStyle.size,13);assert.equal(await page.locator('.af-session-card__attention').evaluate(el=>getComputedStyle(el).fontWeight),'400');await page.waitForTimeout(400);
assert.deepEqual(await page.evaluate(()=>window.consumed),[],'Offscreen answer stays unread');
await page.evaluate(()=>window.setTest({revision:'covered',scope:'demo',covered:true,down:false}));await page.waitForTimeout(450);
assert.deepEqual(await page.evaluate(()=>window.consumed),[],'Covered answer stays unread');
await page.evaluate(()=>window.setTest({revision:'covered',scope:'demo',covered:false,down:false}));await page.mouse.click(800,100);await page.waitForTimeout(450);
assert.deepEqual(await page.evaluate(()=>window.consumed),[['demo','covered']]);
const other=await context.newPage();await other.goto(base);
await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,get:()=>window.testHidden});window.testHidden=true;document.dispatchEvent(new Event('visibilitychange'));});
await page.evaluate(()=>window.setTest({revision:'background',scope:'demo',covered:false,down:false}));await page.waitForTimeout(450);
assert.deepEqual(await page.evaluate(()=>window.consumed),[['demo','covered']],'Unfocused tab stays unread');
await page.bringToFront();await page.evaluate(()=>{window.testHidden=false;document.dispatchEvent(new Event('visibilitychange'));});await page.waitForTimeout(450);
assert.deepEqual(await page.evaluate(()=>window.consumed),[['demo','covered'],['demo','background']]);
await page.evaluate(()=>window.setTest({revision:'old-owner',scope:'demo',covered:false,down:false}));await page.waitForTimeout(50);
await page.evaluate(()=>window.setTest({revision:'new-owner',scope:'other',covered:false,down:true}));await page.waitForTimeout(400);
assert.equal(await page.evaluate(()=>window.consumed.some(x=>x[1]==='old-owner')),false);
await other.evaluate(()=>window.setTest({revision:'background',scope:'demo',covered:true,down:false}));await other.waitForTimeout(100);
assert.equal(await other.locator('.af-session-card').first().getAttribute('data-unread'),null);
await other.evaluate(()=>window.setTest({revision:'background',scope:'other',covered:true,down:false}));await other.waitForTimeout(100);
assert.equal(await other.locator('.af-session-card').first().getAttribute('data-unread'),'true');
await other.evaluate(()=>window.setTest({revision:'cross-live',scope:'demo',covered:true,down:false}));await other.waitForTimeout(100);
assert.equal(await other.locator('.af-session-card').first().getAttribute('data-unread'),'true');
await page.evaluate(()=>window.setTest({revision:'cross-live',scope:'demo',covered:false,down:false}));await page.waitForTimeout(450);
assert.equal(await other.locator('.af-session-card').first().getAttribute('data-unread'),null,'Real storage event updates the other client');
const dir=process.env.SESSION_CAPTURE_DIR;if(dir){mkdirSync(dir,{recursive:true});await page.evaluate(()=>window.setTest({revision:'unread',scope:'demo',covered:false,down:true}));for(const theme of ['dark','light']){await page.evaluate(t=>document.documentElement.className="theme-"+t,theme);await page.screenshot({path:resolve(dir,`cards-${theme}.png`)});}}
await page.bringToFront();
await page.evaluate(()=>window.setTest({revision:'opened-latest',scope:'demo',covered:false,down:false,related:[{sessionId:'a',revision:'earlier-answer',updatedAt:window.receiptAt}]}));await page.waitForTimeout(400);
assert.ok(await page.evaluate(()=>window.consumed.some(x=>x[1]==='earlier-answer')),'Opening the visible latest answer consumes the existing session snapshot');
assert.ok(await page.evaluate(()=>window.consumed.some(x=>x[1]==='opened-latest')));
await page.evaluate(()=>window.setTest({revision:'opened-latest',scope:'demo',covered:false,down:false,related:[{sessionId:'a',revision:'late-answer',updatedAt:window.receiptAt}]}));await page.waitForTimeout(400);
assert.equal(await page.evaluate(()=>window.consumed.some(x=>x[1]==='late-answer')),false,'Later arrivals cannot broaden an already consumed opening');
assert.deepEqual(errors,[]);console.log('session_cards_browser: PASS (offscreen, covered, background, scope race, shared receipts, account isolation)');
}finally{await browser?.close();server.close();}
