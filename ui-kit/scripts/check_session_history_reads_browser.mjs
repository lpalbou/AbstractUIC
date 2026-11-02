// Real controller + shared receipt marker: a pre-read latest answer must not
// finish consumption before slower earlier views have joined the transcript.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFileSync} from 'node:fs';
import {build} from 'esbuild';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {SseParser,ReplayViewFold} from '../../panel-chat/dist/replay_view.js';
const root=fileURLToPath(new URL('../',import.meta.url));
const {chromium}=await import(pathToFileURL(process.env.CHAT_PLAYWRIGHT_MODULE || resolve(root,'../../abstractassistant/web/node_modules/playwright/index.mjs')).href);
function fixture(name){const frames=new SseParser().push(readFileSync(resolve(root,`../panel-chat/scripts/fixtures/replay_view/${name}/stream.sse`),'utf8'));const fold=new ReplayViewFold();for(const frame of frames)fold.apply(frame);return {...fold.view,session_id:'history-regression'};}
const earlier=fixture('l_answer_then_completion'),latest=fixture('a2_delegated_approval_completed');
const bundle=await build({stdin:{resolveDir:root,loader:'tsx',contents:`
import React from 'react';import {createRoot} from 'react-dom/client';
import {useWorkflowSession} from '../panel-chat/dist/use_workflow_session.js';
import {SessionReadMarker,useSessionReads} from './dist/session_reads.js';
import {sessionActivityFromRuns,sessionOpeningReceipts} from './dist/session_activity.js';
const earlier=${JSON.stringify(earlier)},latest=${JSON.stringify(latest)};
let release;const gate=new Promise(r=>release=r);window.releaseHistory=release;window.writes=[];
const facts=sessionActivityFromRuns({items:[{run_id:latest.root_run_id,session_id:latest.session_id,status:'completed',created_at:'2026-10-31T01:00:00Z'}, {run_id:earlier.root_run_id,session_id:earlier.session_id,status:'completed',created_at:'2026-10-31T00:00:00Z'}]})[latest.session_id];
const event=p=>({sequence:1,session_id:p.sessionId,run_id:JSON.parse(p.revision)[0],status:JSON.parse(p.revision)[1],at:'2026-10-31T00:00:00Z',event_id:p.revision});
const saved=[event(facts.content[0])];const client={load:async()=>saved.slice(),mark:async batch=>{window.writes.push(batch);const rows=batch.map(event);saved.push(...rows);return rows;}};
const transport={getRun:async id=>({run_id:id,status:'completed'}),getHistory:async()=>({ledgers:{}}),getLedger:async()=>({items:[]}),submitCommand:async()=>({}),streamLedger:async(_id,_after,_step,signal)=>new Promise(r=>signal.addEventListener('abort',r,{once:true})),replayView:{
getView:async id=>{if(id===earlier.root_run_id)await gate;const view=id===earlier.root_run_id?earlier:latest;return {notModified:false,view,etag:JSON.stringify(view.cursor.token),bytes:1};},
listSessionTurns:async()=>[{run_id:earlier.root_run_id},{run_id:latest.root_run_id}],streamView:async(_id,opts)=>{opts.onOpen?.();return {bytes:0};}}};
function App(){const {snapshot}=useWorkflowSession({transport,runId:latest.root_run_id});const reads=useSessionReads('test-account',facts.content,client);
return <><output id="unread">{String(facts.content.some(reads.isUnread))}</output><output id="history">{String(snapshot.historyLoading)}</output><output id="shown">{snapshot.messages.filter(m=>m.role==='assistant').length}</output>
<div>Visible latest answer</div>{!snapshot.loading&&!snapshot.historyLoading&&!snapshot.error&&<SessionReadMarker ownerKey="test-account" receipt={facts.content[0]} relatedReceipts={sessionOpeningReceipts(snapshot.messages,facts.content,latest.root_run_id)} enabled onRead={reads.markRead}/>}</>;}
createRoot(document.getElementById('root')).render(<App/>);`},bundle:true,write:false,format:'esm'});
const server=createServer((req,res)=>{res.setHeader('Content-Type',req.url==='/app.js'?'text/javascript':'text/html');res.end(req.url==='/app.js'?bundle.outputFiles[0].contents:'<!doctype html><div id="root"></div><script type="module" src="/app.js"></script>');});
await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
try{browser=await chromium.launch({channel:'chrome'});const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(`http://127.0.0.1:${server.address().port}`);
await page.waitForFunction(()=>document.getElementById('unread').textContent==='true' && Number(document.getElementById('shown').textContent)>0);
await page.waitForTimeout(400);assert.equal(await page.locator('#history').textContent(),'true');assert.equal(await page.locator('.af-session-read-marker').count(),0);assert.deepEqual(await page.evaluate(()=>window.writes),[],'The current answer cannot prematurely freeze the opening batch');
await page.evaluate(()=>window.releaseHistory());await page.waitForFunction(()=>document.getElementById('history').textContent==='false' && document.getElementById('unread').textContent==='false');
const writes=await page.evaluate(()=>window.writes);assert.equal(writes.length,1);assert.equal(writes[0].length,1,'Only the older unread outcome needs a new server acknowledgment');assert.equal(JSON.parse(writes[0][0].revision)[0],earlier.root_run_id);
assert.deepEqual(errors,[]);console.log('session_history_reads_browser: PASS (real progressive controller, latest already read, delayed older history, one committed batch clears card)');
}finally{await browser?.close();await new Promise(r=>server.close(r));}
