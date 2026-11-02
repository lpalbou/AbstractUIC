import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {build} from 'esbuild';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
const root=fileURLToPath(new URL('../',import.meta.url));
const {chromium}=await import(pathToFileURL(process.env.CHAT_PLAYWRIGHT_MODULE || resolve(root,'../../abstractassistant/web/node_modules/playwright/index.mjs')).href);
const bundle=await build({stdin:{resolveDir:root,loader:'tsx',contents:`
import React,{useMemo,useState} from 'react';import {createRoot} from 'react-dom/client';
import {useSessionReads} from './dist/session_reads.js';import {createSessionReadClient} from './dist/session_read_client.js';
const receipts=Array.from({length:205},(_,i)=>({sessionId:'s',revision:JSON.stringify(['run'+i,'completed']),updatedAt:'2026-10-31T00:00:00Z'}));
function App(){const [scope,setScope]=useState('alice');window.setScope=setScope;
const client=useMemo(()=>createSessionReadClient((path,init={})=>fetch('/'+path,{...init,headers:{...init.headers,'X-Test-Principal':scope}})),[scope]);
const reads=useSessionReads(scope,receipts,client);window.reads=reads;window.mark=i=>reads.markRead(receipts[i]);window.markAll=()=>receipts.forEach(reads.markRead);
return <><output id="loading">{String(reads.loading)}</output><output id="error">{reads.error}</output><output id="unread">{receipts.map(p=>reads.isUnread(p)?'1':'0').join('')}</output></>;}
createRoot(document.getElementById('root')).render(<React.StrictMode><App/></React.StrictMode>);`},bundle:true,write:false,format:'esm'});
const rows=new Map(), calls=[];
let fail=false,incomplete=false,holdGet=false,releaseGet;
const server=createServer(async(req,res)=>{
  if(req.url.startsWith('/api/')){
    const owner=req.headers['x-test-principal'], url=new URL(req.url,'http://local');calls.push({owner,method:req.method,url:req.url});
    const current=rows.get(owner)||[];
    if(req.method==='POST'){
      let body='';for await(const chunk of req)body+=chunk;
      if(fail){res.writeHead(503);res.end();return;}
      const receipts=JSON.parse(body).receipts;assert(receipts.length<=100);
      const events=receipts.map(r=>({...r,sequence:1,at:'2026-10-31T00:00:00Z',event_id:JSON.stringify([owner,r.run_id,r.status])}));
      if(!incomplete){for(const e of events)if(!current.some(r=>r.event_id===e.event_id))current.push(e);rows.set(owner,current);}
      res.setHeader('Content-Type','application/json');res.end(JSON.stringify({items:incomplete?[]:events}));return;
    }
    const ids=new Set(url.searchParams.getAll('run_id'));assert(ids.size<=100);
    const value={items:current.filter(r=>ids.has(r.run_id)),more:false};
    if(holdGet){holdGet=false;await new Promise(r=>releaseGet=r);}
    res.setHeader('Content-Type','application/json');res.end(JSON.stringify(value));return;
  }
  res.setHeader('Content-Type',req.url==='/app.js'?'text/javascript':'text/html');
  res.end(req.url==='/app.js'?bundle.outputFiles[0].contents:'<!doctype html><div id="root"></div><script type="module" src="/app.js"></script>');
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
let browser;
try{
 browser=await chromium.launch({channel:'chrome'});
 const a=await browser.newContext(),b=await browser.newContext();const p=await a.newPage(),q=await b.newPage();const errors=[];
 for(const page of [p,q]){page.on('pageerror',e=>errors.push(e.message));await page.goto(`http://127.0.0.1:${server.address().port}`);await page.waitForFunction(()=>document.getElementById('loading').textContent==='false');}
 assert.equal(await p.locator('#unread').textContent(),'1'.repeat(205),'No synthetic first-use reads');
 fail=true;await p.evaluate(()=>window.mark(0));await p.waitForFunction(()=>document.getElementById('error').textContent.includes('503'));
 assert.equal((await p.locator('#unread').textContent())[0],'1','Failed POST remains unread');
 fail=false;incomplete=true;await p.evaluate(()=>window.reads.refresh());await p.waitForFunction(()=>document.getElementById('error').textContent.includes('confirm'));
 assert.equal((await p.locator('#unread').textContent())[0],'1','Incomplete acknowledgment remains unread');
 incomplete=false;await p.evaluate(()=>window.reads.refresh());await p.waitForFunction(()=>document.getElementById('unread').textContent[0]==='0');
 assert.equal((await q.locator('#unread').textContent())[0],'1','No shared browser storage');
 await q.evaluate(()=>window.reads.refresh());await q.waitForFunction(()=>document.getElementById('unread').textContent[0]==='0');
 // A load started before the successful write must not undo it when it arrives late.
 holdGet=true;await p.evaluate(()=>{void window.reads.refresh();});
 while(!releaseGet)await new Promise(r=>setTimeout(r,5));
 await p.evaluate(()=>window.mark(1));await p.waitForFunction(()=>document.getElementById('unread').textContent[1]==='0');releaseGet();
 await p.waitForTimeout(100);assert.equal((await p.locator('#unread').textContent())[1],'0');
 await p.evaluate(()=>window.markAll());await p.waitForFunction(()=>document.getElementById('unread').textContent==='0'.repeat(205));
 assert.equal(rows.get('alice').length,205,'Large opening drains all batched revisions');
 await q.reload();await q.waitForFunction(()=>document.getElementById('loading').textContent==='false');assert.equal(await q.locator('#unread').textContent(),'0'.repeat(205),'Independent browser replays durable reads');
 await q.evaluate(()=>window.setScope('bob'));await q.waitForFunction(()=>document.getElementById('unread').textContent==='1'.repeat(205));
 assert(!rows.has('bob'),'Changing account cannot copy another account receipts');
 assert.equal(await q.evaluate(()=>localStorage.length),0,'Shared read mode never writes a local baseline');
 assert.deepEqual(errors,[]);console.log('Remote session reads: independent browsers, failures, incomplete ACKs, stale loads, 205 revisions, reload, account isolation PASS');
}finally{await browser?.close();await new Promise(r=>server.close(r));}
