// Actual React/CSS in Chrome: pending requests must be readable/actionable without scrolling past an avatar.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFileSync,mkdirSync} from 'node:fs';
import {build} from 'esbuild';
const {chromium}=await import(process.env.PANEL_CHAT_PLAYWRIGHT_MODULE||'@playwright/test');
const root=new URL('../',import.meta.url).pathname;
const compiled=await build({absWorkingDir:root,bundle:true,write:false,format:'esm',stdin:{resolveDir:root,loader:'jsx',contents:`
import React,{useState} from 'react';import{createRoot}from'react-dom/client';import{WorkflowChat,presentInteraction}from'./dist/conversation.js';
window.events=[];function Harness(){const[state,setState]=useState({mode:'approval',history:false});window.mode=mode=>setState({mode});const[draft,setDraft]=useState('');
const controller={approve:async(value)=>window.events.push(['approve',value]),resume:async(text)=>window.events.push(['answer',text]),emitEvent:async()=>{}};
const wait=state.mode==='question'?{reason:'user',wait_key:'question:one',prompt:'Which restaurant should I keep?',details:{question:{id:'one',purpose:'conversation',importance:'essential'}}}:{reason:'tool_approval',wait_key:'approval:one',details:{kind:'tool_approval',tool_calls:Array.from({length:6},(_,i)=>({name:'read_file',arguments:{file_path:'notes-'+i+'.txt'},call_id:'call-'+i}))}};
const interaction=state.mode==='none'?null:presentInteraction({runId:'run',wait},controller);
const attention=state.mode==='none'?null:{id:state.mode,kind:state.mode==='question'?'question':'approval'};
return <WorkflowChat messages={[]} draft={draft} onDraftChange={setDraft} onSend={()=>{}} interaction={interaction} busy avatarConversation={{sessionKey:'session',avatar:<div role='img' aria-label='Avatar' style={{width:320,height:320,borderRadius:'50%',background:'#94783a'}}/>,status:'working',connection:'connected',attention}}/>;}
createRoot(document.getElementById('root')).render(<Harness/>);`}});
const css=readFileSync(new URL('../src/panel_chat.css',import.meta.url),'utf8');
const server=createServer((req,res)=>{if(req.url==='/entry.js'){res.setHeader('Content-Type','text/javascript');res.end(compiled.outputFiles[0].text);}else if(req.url==='/styles.css'){res.setHeader('Content-Type','text/css');res.end(css);}else{res.setHeader('Content-Type','text/html');res.end('<html><head><link rel="stylesheet" href="/styles.css"><style>html,body,#root{margin:0;height:100%;font:16px system-ui;background:#191a25;color:#bbc4e7}#root{display:flex;flex-direction:column}.pc-workflow-chat{height:100%;--text-primary:#bbc4e7;--text-secondary:#a9b1cf;--ui-surface-0:#191a25;--ui-surface-1:#232536;--ui-border-1:#434b70}</style></head><body><div id="root"></div><script type="module" src="/entry.js"></script></body></html>');}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE||undefined});
try{const page=await browser.newPage({viewport:{width:1280,height:800},reducedMotion:'reduce'});page.setDefaultTimeout(8000);const errors=[];page.on('pageerror',e=>errors.push(String(e)));
for(const viewport of [{width:1280,height:800},{width:1000,height:650},{width:390,height:844}]){
 await page.setViewportSize(viewport);await page.goto('http://127.0.0.1:'+server.address().port);const allow=page.getByRole('button',{name:'Allow once',exact:true});await allow.waitFor();
 const visible=async locator=>locator.evaluate(el=>{const b=el.getBoundingClientRect();let top=0,bottom=innerHeight;for(let p=el.parentElement;p;p=p.parentElement){const s=getComputedStyle(p);if(/auto|scroll|hidden|clip/.test(s.overflowY)){const r=p.getBoundingClientRect();top=Math.max(top,r.top);bottom=Math.min(bottom,r.bottom);}}return b.top>=top&&b.bottom<=bottom;});
 const prompt=page.getByText('Allow read_file to run?',{exact:false});
 assert(await visible(allow),'Approval action starts inside the visible transcript at '+viewport.width);
 assert(await visible(page.locator('.pc-workflow-interaction__prompt')),'Actual request is visible at '+viewport.width);
 assert.equal(await page.getByText('Public updates and replies will appear here.',{exact:true}).count(),0,'An actual request replaces the empty placeholder');
 assert.equal((await page.evaluate(()=>window.events)).length,0,'Rendering never gives permission');
 const shots=process.env.AVATAR_REQUEST_SHOTS;if(shots){mkdirSync(shots,{recursive:true});await page.screenshot({path:shots+'/approval-'+viewport.width+'.png'});}
 await allow.click();assert.deepEqual(await page.evaluate(()=>window.events),[['approve',true]]);
 await page.evaluate(()=>window.mode('question'));const response=page.getByRole('textbox',{name:'Response',exact:true});await response.waitFor();assert(await visible(response),'Question input visible at '+viewport.width);await response.fill('Keep Riverside');await page.getByRole('button',{name:'Submit',exact:true}).click();assert.deepEqual((await page.evaluate(()=>window.events)).at(-1),['answer','Keep Riverside']);
}
assert.deepEqual(errors,[]);console.log('avatar requests browser PASS: visible approval/question, six target batch, explicit decisions only, desktop/phone');
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
