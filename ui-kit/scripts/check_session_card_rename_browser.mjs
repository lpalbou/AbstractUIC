// Real-browser checks of the optional SessionCard rename (no Gateway). Needs a built dist/.
//   SESSION_PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs node scripts/check_session_card_rename_browser.mjs
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFileSync} from 'node:fs';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {build} from 'esbuild';
const root=fileURLToPath(new URL('../',import.meta.url));
const {chromium}=await import(process.env.SESSION_PLAYWRIGHT_MODULE?pathToFileURL(resolve(process.env.SESSION_PLAYWRIGHT_MODULE)).href:'playwright');
const bundle=await build({stdin:{contents:`
import React,{useState} from 'react';import {createRoot} from 'react-dom/client';
import {SessionCard} from './dist/session_cards.js';
// The host: a list with its own key handler, a page-level key listener, a controllable rename.
window.calls=[];window.opens=0;window.archives=0;window.listKeys=[];window.pageKeys=[];window.mode='ok';
window.addEventListener('keydown',e=>window.pageKeys.push(e.key));
const LONG='A very long conversation name that keeps going well past what two lines of a narrow sidebar can show at all';
function App(){const [titles,setTitles]=useState({a:'Fix the parser',b:LONG,c:'\\u05e9\\u05dc\\u05d5\\u05dd \\u05e2\\u05d5\\u05dc\\u05dd',d:'Plain card'});window.setTitles=setTitles;
const rename=id=>title=>{window.calls.push([id,title]);
  if(window.mode==='sync')return;
  return new Promise((ok,no)=>{window.settle=v=>{if(v){setTitles(t=>({...t,[id]:title||'First message'}));ok();}else no(new Error('refused'));};});};
return <ul onKeyDown={e=>window.listKeys.push(e.key)} style={{listStyle:'none',padding:0,margin:0,display:'grid',gap:8}}>
{['a','b','c'].map(id=><li key={id}><SessionCard sessionId={id} title={titles[id]} turnCount={2} toolCount={3} updatedAt={Date.now()-60000} nowMs={Date.now()}
  onOpen={()=>{window.opens++;}} onArchive={()=>{window.archives++;}} onRename={rename(id)}/></li>)}
<li><SessionCard sessionId="d" title={titles.d} nowMs={Date.now()} onOpen={()=>{}} onArchive={()=>{}}/></li></ul>}
createRoot(document.getElementById('root')).render(<App/>);`,resolveDir:root,loader:'tsx'},bundle:true,write:false,format:'esm'});
const css=readFileSync(resolve(root,'src/theme.css'),'utf8');
const server=createServer((req,res)=>{res.setHeader('Content-Type',req.url==='/app.js'?'text/javascript':req.url==='/theme.css'?'text/css':'text/html');res.end(req.url==='/app.js'?bundle.outputFiles[0].contents:req.url==='/theme.css'?css:`<!doctype html><html class="theme-dark"><link rel="stylesheet" href="/theme.css"><style>body{margin:0;background:var(--ui-bg);color:var(--ui-fg);font-family:system-ui}#root{position:fixed;top:20px;left:20px;width:290px}button{font:inherit}</style><div id="root"></div><p id="elsewhere" style="margin-left:400px">Elsewhere</p><script type="module" src="/app.js"></script></html>`)});
await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
const ok=[];const pass=name=>ok.push(name);
try{
browser=await chromium.launch();const base=`http://127.0.0.1:${server.address().port}`;
const context=await browser.newContext({viewport:{width:900,height:650}}),page=await context.newPage(),errors=[];
page.on('pageerror',e=>errors.push(e.message));await page.goto(base);await page.locator('.af-session-card').first().waitFor();
const card=id=>page.locator('.af-session-card').filter({has:page.locator(`[data-session-id="${id}"]`)});
const cardA=page.locator('li').nth(0).locator('.af-session-card');
const rename=cardA.locator('.af-session-card__rename'),archive=cardA.locator('.af-session-card__archive'),open=cardA.locator('.af-session-card__open');
const input=cardA.locator('input');
const state=()=>page.evaluate(()=>({calls:window.calls,opens:window.opens,archives:window.archives,listKeys:window.listKeys,pageKeys:window.pageKeys}));
const reset=()=>page.evaluate(()=>{window.calls=[];window.opens=0;window.archives=0;window.listKeys=[];window.pageKeys=[];window.mode='ok';});
const active=()=>page.evaluate(()=>{const a=document.activeElement;return a?.className+'|'+(a?.closest('[data-session-id]')?.getAttribute('data-session-id')||a?.closest('li')?.querySelector('[data-session-id]')?.getAttribute('data-session-id')||'');});
const opacity=l=>l.evaluate(el=>getComputedStyle(el).opacity);

// Hover and keyboard focus reveal Rename like archive; Tab order is open, Rename, Archive.
await page.mouse.move(850,600);assert.equal(await opacity(rename),'0');assert.equal(await rename.evaluate(el=>el.getBoundingClientRect().width),28);
await cardA.hover();assert.equal(await opacity(rename),'1');assert.equal(await opacity(archive),'1');
await page.mouse.move(850,600);await open.focus();await page.keyboard.press('Shift');assert.equal(await opacity(rename),'1');assert.equal(await opacity(archive),'1');
await page.keyboard.press('Tab');assert.equal(await rename.evaluate(el=>document.activeElement===el),true);assert.equal(await opacity(archive),'1','archive stays shown while Rename has focus');
await page.keyboard.press('Tab');assert.equal(await archive.evaluate(el=>document.activeElement===el),true);assert.equal(await opacity(rename),'1','Rename stays shown while archive has focus');
assert.equal(await page.locator('li').nth(3).locator('.af-session-card__rename').count(),0,'no Rename without onRename');
pass('hover/focus reveal and tab order');

// The Rename action: an input outside the open button, prefilled, all selected, labelled, capped.
await reset();await cardA.hover();await rename.click();await input.waitFor();
assert.equal(await open.count(),0,'the open button gives way to the editor');
assert.equal(await input.evaluate(el=>el.closest('button')),null,'the input is not inside a button');
assert.equal(await input.inputValue(),'Fix the parser');
assert.deepEqual(await input.evaluate(el=>[document.activeElement===el,el.selectionStart,el.selectionEnd,el.maxLength,el.getAttribute('aria-label'),el.dir]),[true,0,14,120,'Rename conversation','auto']);
assert.equal(await cardA.locator('.af-session-card__archive,.af-session-card__rename').count(),0,'no archive while editing');
pass('editor opens from Rename');

// Escape cancels without a call and gives focus back to the open button; no key leaks.
await page.keyboard.type('Something else');await page.keyboard.press('ArrowDown');await page.keyboard.press('Escape');
let s=await state();assert.deepEqual(s.calls,[]);assert.equal(await open.evaluate(el=>document.activeElement===el),true);
assert.equal(await cardA.locator('.af-session-card__title').textContent(),'Fix the parser');
assert.deepEqual(s.listKeys,[],'no key reaches the list');assert.deepEqual(s.pageKeys,[],'no key reaches the page');
pass('Escape cancels, focus returns');

// F2 on the focused row; Enter commits the trimmed text once; the input is busy while pending.
await reset();await open.focus();await page.keyboard.press('F2');await input.waitFor();
await page.keyboard.type('  Snake game  ');await page.keyboard.press('Enter');await page.keyboard.press('Enter');
s=await state();assert.deepEqual(s.calls,[['a','Snake game']],'one call, trimmed');
assert.deepEqual(await input.evaluate(el=>[el.disabled,el.getAttribute('aria-busy')]),[true,'true']);
assert.equal(await cardA.locator('.af-session-card__marker.is-working').count(),1,'busy mark while saving');
await page.keyboard.press('Escape');assert.equal(await input.count(),1,'Escape does not abandon a pending save');
await page.evaluate(()=>window.settle(true));await open.waitFor();
assert.equal(await cardA.locator('.af-session-card__title').textContent(),'Snake game');
assert.equal(await open.evaluate(el=>document.activeElement===el),true,'focus back on the row');
s=await state();assert.equal(s.opens,0,'renaming never opens the conversation');assert.deepEqual(s.listKeys,['F2'],'only the row key that started editing reaches the list');
pass('F2, Enter, pending, success');

// An unchanged name makes no call; an empty one calls back with "".
await reset();await page.keyboard.press('F2');await input.waitFor();await page.keyboard.press('Enter');await open.waitFor();
assert.deepEqual((await state()).calls,[],'unchanged = no call');
await page.keyboard.press('F2');await input.waitFor();await page.keyboard.press('Control+A');await page.keyboard.press('Delete');await page.keyboard.press('Enter');
assert.deepEqual((await state()).calls,[['a','']]);await page.evaluate(()=>window.settle(true));await open.waitFor();
assert.equal(await cardA.locator('.af-session-card__title').textContent(),'First message','the host shows its automatic name again');
await page.keyboard.press('F2');await input.waitFor();await page.keyboard.press('Control+A');await page.keyboard.type('   ');await page.keyboard.press('Enter');
assert.deepEqual((await state()).calls,[['a',''],['a','']],'only spaces is an empty name');
await page.evaluate(()=>window.settle(true));await open.waitFor();
pass('unchanged and empty');

// Blur cancels (a stray click never renames) and does not pull focus back to the row.
await reset();await open.focus();await page.keyboard.press('F2');await input.waitFor();await page.keyboard.type('Typed then clicked away');
await page.locator('#elsewhere').click();await open.waitFor();
assert.deepEqual((await state()).calls,[]);assert.equal(await open.evaluate(el=>document.activeElement===el),false);
pass('blur cancels');

// A refused rename keeps the editor open with the typed text, enabled and focused; Escape then leaves.
await reset();await open.focus();await page.keyboard.press('F2');await input.waitFor();await page.keyboard.type('Refused name');await page.keyboard.press('Enter');
assert.equal(await input.isDisabled(),true);await page.evaluate(()=>window.settle(false));
await page.waitForFunction(()=>!document.querySelector('.af-session-card input')?.disabled);
assert.deepEqual(await input.evaluate(el=>[el.value,document.activeElement===el,el.hasAttribute('aria-busy')]),['Refused name',true,false]);
await page.evaluate(()=>{window.mode='ok';});await page.keyboard.press('Enter');assert.deepEqual((await state()).calls,[['a','Refused name'],['a','Refused name']],'retry with Enter');
await page.evaluate(()=>window.settle(false));await page.waitForFunction(()=>!document.querySelector('.af-session-card input')?.disabled);
await page.keyboard.press('Escape');await open.waitFor();assert.equal(await open.evaluate(el=>document.activeElement===el),true);
pass('rejection keeps text');

// A synchronous host (no promise) closes the editor at once.
await reset();await page.evaluate(()=>{window.mode='sync';});await page.keyboard.press('F2');await input.waitFor();await page.keyboard.type('Sync');await page.keyboard.press('Enter');
await open.waitFor();assert.deepEqual((await state()).calls,[['a','Sync']]);
pass('synchronous host');

// Double-click on the title edits; clicks and keys inside the input never open, archive or bubble.
await reset();await cardA.locator('.af-session-card__title').dblclick();await input.waitFor();
const opensAfterDbl=(await state()).opens;
await input.click();await input.dblclick();await page.keyboard.press('ArrowUp');await page.keyboard.press('Home');await page.keyboard.type('x');await page.keyboard.press('Space');
s=await state();assert.equal(s.opens,opensAfterDbl,'clicks inside never open');assert.equal(s.archives,0);assert.deepEqual(s.listKeys,[],'keys inside never reach the list');assert.deepEqual(s.pageKeys,[],'nor the page');
await page.keyboard.press('Escape');await open.waitFor();
pass('double-click and containment');

// IME: Enter while composing does not commit.
await reset();await page.keyboard.press('F2');await input.waitFor();await page.keyboard.type('Kanji');
await input.evaluate(el=>{el.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true,isComposing:true}));
  const e=new KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true});Object.defineProperty(e,'keyCode',{get:()=>229});el.dispatchEvent(e);});
assert.deepEqual((await state()).calls,[]);assert.equal(await input.count(),1,'still editing');
await page.keyboard.press('Escape');await open.waitFor();
pass('IME composition');

// Over-long input stops at 120 characters.
await reset();await page.keyboard.press('F2');await input.waitFor();await page.keyboard.type('x'.repeat(200));
assert.equal((await input.inputValue()).length,120);await page.keyboard.press('Escape');await open.waitFor();
pass('maxLength');

// Long and right-to-left names: no overflow, the direction follows the text, in the row and the input.
for(const el of await page.locator('.af-session-card').all())assert.equal(await el.evaluate(n=>n.scrollWidth<=n.clientWidth),true,'no horizontal overflow');
const rtl=page.locator('li').nth(2).locator('.af-session-card');
assert.equal(await rtl.locator('.af-session-card__title').evaluate(el=>getComputedStyle(el).direction),'rtl');
await rtl.locator('.af-session-card__open').focus();await page.keyboard.press('F2');await rtl.locator('input').waitFor();
assert.equal(await rtl.locator('input').evaluate(el=>getComputedStyle(el).direction),'rtl');await page.keyboard.press('Escape');
const long=page.locator('li').nth(1).locator('.af-session-card');await long.locator('.af-session-card__open').focus();await page.keyboard.press('F2');
assert.equal(await long.evaluate(n=>n.scrollWidth<=n.clientWidth),true,'the editor of a long name fits the row');
assert.equal((await long.locator('input').inputValue()).length>100,true);await page.keyboard.press('Escape');
pass('long and RTL names');

// A list refresh that renames the row from elsewhere does not clobber the text being typed.
await reset();await open.focus();await page.keyboard.press('F2');await input.waitFor();await page.keyboard.type('My draft');
await page.evaluate(()=>window.setTitles(t=>({...t,a:'Renamed on another device'})));await page.waitForTimeout(50);
assert.equal(await input.inputValue(),'My draft');await page.keyboard.press('Escape');await open.waitFor();
assert.equal(await cardA.locator('.af-session-card__title').textContent(),'Renamed on another device');
pass('refresh during edit');
assert.deepEqual(errors,[]);

// Touch / no-hover: Rename is visible and a 44 px target, like archive.
const touch=await browser.newContext({viewport:{width:400,height:700},hasTouch:true,isMobile:true});const tp=await touch.newPage();await tp.goto(base);
const tr=tp.locator('.af-session-card__rename').first();await tr.waitFor();
assert.deepEqual(await tr.evaluate(el=>[getComputedStyle(el).opacity,el.getBoundingClientRect().width]),['1',44]);
await tr.tap();await tp.locator('.af-session-card input').first().waitFor();
pass('touch');
console.log('session_card_rename_browser: PASS ('+ok.join(', ')+')');
}finally{await browser?.close();server.close();}
