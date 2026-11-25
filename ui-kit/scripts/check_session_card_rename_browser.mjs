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
// The host: a list with its own key handler, a page-level key listener, a controllable rename, a
// composer elsewhere on the page, the editor's open/close reports and an error element of its own.
window.calls=[];window.opens=0;window.archives=0;window.listKeys=[];window.pageKeys=[];window.mode='ok';window.editing=[];
window.f2Prevented=[];window.addEventListener('keydown',e=>{window.pageKeys.push(e.key);if(e.key==='F2')window.f2Prevented.push(e.defaultPrevented);});
const LONG='A very long conversation name that keeps going well past what two lines of a narrow sidebar can show at all';
function App(){const [titles,setTitles]=useState({a:'Fix the parser',b:LONG,c:'\\u05e9\\u05dc\\u05d5\\u05dd \\u05e2\\u05d5\\u05dc\\u05dd',d:'Plain card',e:'\\u{1F600}'.repeat(130)});window.setTitles=setTitles;
const [offer,setOffer]=useState(true);window.setOffer=setOffer;const [dis,setDis]=useState(false);window.setDis=setDis;const [err,setErr]=useState('');window.setErr=setErr;
const rename=id=>title=>{window.calls.push([id,title]);
  if(window.mode==='sync')return;
  if(window.mode==='throw')throw new Error('sync refusal');
  return new Promise((ok,no)=>{window.settle=v=>{if(v){setTitles(t=>({...t,[id]:title||'First message'}));ok();}else no(new Error('refused'));};});};
return <ul onKeyDown={e=>window.listKeys.push(e.key)} style={{listStyle:'none',padding:0,margin:0,display:'grid',gap:8}}>
{['a','b','c'].map(id=><li key={id}><SessionCard sessionId={id} title={titles[id]} turnCount={2} toolCount={3} updatedAt={Date.now()-60000} nowMs={Date.now()}
  onOpen={()=>{window.opens++;}} onArchive={()=>{window.archives++;}} onRename={offer?rename(id):undefined} disabled={dis&&id==='a'}
  onRenameEditingChange={v=>window.editing.push([id,v])} renameErrorId={id==='a'&&err?err:undefined}/>{id==='a'&&err?<p id={err}>Not renamed</p>:null}</li>)}
<li><SessionCard sessionId="d" title={titles.d} nowMs={Date.now()} onOpen={()=>{}} onArchive={()=>{}}/></li>
<li><SessionCard sessionId="e" title={titles.e} nowMs={Date.now()} onOpen={()=>{}} onRename={rename('e')}/></li></ul>}
createRoot(document.getElementById('root')).render(<App/>);`,resolveDir:root,loader:'tsx'},bundle:true,write:false,format:'esm'});
const css=readFileSync(resolve(root,'src/theme.css'),'utf8');
const server=createServer((req,res)=>{res.setHeader('Content-Type',req.url==='/app.js'?'text/javascript':req.url==='/theme.css'?'text/css':'text/html');res.end(req.url==='/app.js'?bundle.outputFiles[0].contents:req.url==='/theme.css'?css:`<!doctype html><html class="theme-dark"><link rel="stylesheet" href="/theme.css"><style>body{margin:0;background:var(--ui-bg);color:var(--ui-fg);font-family:system-ui}#root{position:fixed;top:20px;left:20px;width:290px}button{font:inherit}</style><div id="root"></div><textarea id="composer" aria-label="composer" style="position:fixed;left:400px;top:80px"></textarea><p id="elsewhere" style="margin-left:400px">Elsewhere</p><script type="module" src="/app.js"></script></html>`)});
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
const reset=()=>page.evaluate(()=>{window.calls=[];window.opens=0;window.archives=0;window.listKeys=[];window.pageKeys=[];window.mode='ok';window.editing=[];});
const editingLog=()=>page.evaluate(()=>window.editing);
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
assert.deepEqual(await input.evaluate(el=>[el.readOnly,el.disabled,el.getAttribute('aria-busy'),document.activeElement===el]),[true,false,'true',true],'pending: read-only and busy, focus stays in the input');
await page.keyboard.type('zz');assert.equal(await input.inputValue(),'  Snake game  ','nothing typed while pending');
await page.locator('#elsewhere').click();assert.equal(await input.count(),1,'blur does not abandon a pending save');await input.focus();
assert.equal(await cardA.locator('.af-session-card__marker.is-working').count(),1,'busy mark while saving');
await page.keyboard.press('Escape');assert.equal(await input.count(),1,'Escape does not abandon a pending save');
await page.evaluate(()=>window.settle(true));await open.waitFor();
assert.equal(await cardA.locator('.af-session-card__title').textContent(),'Snake game');
assert.equal(await open.evaluate(el=>document.activeElement===el),true,'focus back on the row');
s=await state();assert.equal(s.opens,0,'renaming never opens the conversation');assert.deepEqual(s.listKeys,['F2'],'only the row key that started editing reaches the list');
assert.deepEqual(await editingLog(),[['a',true],['a',false]],'the host hears the editor open, then close after the save');
pass('F2, Enter, pending (read-only), success');

// Focus is never pulled from where the person went while a save was pending.
for(const ok of [true,false]){
  await reset();await open.focus();await page.keyboard.press('F2');await input.waitFor();await page.keyboard.type(ok?'Kept':'Refused');await page.keyboard.press('Enter');
  await page.locator('#composer').click();await page.keyboard.type('Dear team');
  await page.evaluate(v=>window.settle(v),ok);await page.waitForTimeout(100);
  assert.equal(await page.evaluate(()=>document.activeElement.id),'composer',`focus stays in the composer after ${ok?'success':'refusal'}`);
  await page.keyboard.type(' more');assert.equal(await page.locator('#composer').inputValue(),'Dear team more');
  s=await state();assert.equal(s.opens,0);assert.equal(s.calls.length,1);
  if(!ok){assert.equal(await input.inputValue(),'Refused','the refused text is still there');await input.focus();await page.keyboard.press('Escape');await open.waitFor();}
  await page.locator('#composer').fill('');
}
pass('no focus theft on settle');

// Held keys: a repeated Enter commits once and never opens; F2 with a modifier, or repeated, does nothing more.
await reset();await open.focus();await page.keyboard.press('F2');await input.waitFor();await page.keyboard.down('Enter');await page.keyboard.down('Enter');await page.keyboard.down('Enter');await page.keyboard.up('Enter');
await open.waitFor();s=await state();assert.deepEqual([s.calls,s.opens],[[],0],'held Enter on an unchanged name: no call, no open');
await page.evaluate(()=>{window.mode='sync';});await page.keyboard.press('F2');await input.waitFor();await page.keyboard.type('Held');await page.keyboard.down('Enter');await page.keyboard.down('Enter');await page.keyboard.up('Enter');
await open.waitFor();s=await state();assert.deepEqual([s.calls,s.opens],[[['a','Held']],0],'held Enter: one call, no open');
await page.evaluate(()=>window.setTitles(t=>({...t,a:'Fix the parser'})));
for(const k of ['Shift+F2','Control+F2','Alt+F2']){await open.focus();await page.keyboard.press(k);await page.waitForTimeout(50);assert.equal(await input.count(),0,`${k} does not edit`);}
await reset();await open.focus();await page.keyboard.down('F2');await page.keyboard.down('F2');await page.keyboard.up('F2');await input.waitFor();assert.deepEqual(await editingLog(),[['a',true]]);
await page.keyboard.press('Escape');await open.waitFor();
pass('held keys and modifiers');

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
assert.equal(await input.evaluate(el=>el.readOnly),true);await page.evaluate(()=>window.settle(false));
await page.waitForFunction(()=>!document.querySelector('.af-session-card input')?.readOnly);
assert.deepEqual(await input.evaluate(el=>[el.value,document.activeElement===el,el.hasAttribute('aria-busy')]),['Refused name',true,false]);
await page.evaluate(()=>{window.mode='ok';});await page.keyboard.press('Enter');assert.deepEqual((await state()).calls,[['a','Refused name'],['a','Refused name']],'retry with Enter');
await page.evaluate(()=>window.settle(false));await page.waitForFunction(()=>!document.querySelector('.af-session-card input')?.readOnly);
await page.evaluate(()=>window.setErr('rename-error-a'));await page.waitForTimeout(50);
assert.deepEqual(await input.evaluate(el=>[el.getAttribute('aria-invalid'),el.getAttribute('aria-describedby').split(' ').includes('rename-error-a')]),['true',true],'the host error describes the input');
const desc=await input.evaluate(el=>el.getAttribute('aria-describedby').split(' ').map(id=>document.getElementById(id)?.textContent).join(' | '));
assert.match(desc,/2 turns/,'the counts are the input description');assert.equal(await cardA.locator('.af-session-card__edit .af-session-card__meta').getAttribute('aria-hidden'),'true');
await page.evaluate(()=>window.setErr(''));
await page.keyboard.press('Escape');await open.waitFor();assert.equal(await open.evaluate(el=>document.activeElement===el),true);
pass('rejection keeps text; error and counts described');

// The host withdraws rename while the editor is open, or while a save is pending then refused: the editor closes.
await reset();await open.focus();await page.keyboard.press('F2');await input.waitFor();await page.evaluate(()=>window.setOffer(false));await page.waitForTimeout(50);
assert.equal(await input.count(),0,'withdrawn while editing');await page.evaluate(()=>window.setOffer(true));
await open.focus();await page.keyboard.press('F2');await input.waitFor();await page.keyboard.type('Late');await page.keyboard.press('Enter');
await page.evaluate(()=>window.setOffer(false));await page.waitForTimeout(50);assert.equal(await input.count(),1,'a pending save keeps the editor');
await page.evaluate(()=>window.settle(false));await page.waitForTimeout(50);assert.equal(await input.count(),0,'refused after withdrawal: closed');
await page.evaluate(()=>window.setOffer(true));await page.waitForTimeout(50);
await open.focus();await page.keyboard.press('F2');await input.waitFor();await page.evaluate(()=>window.setDis(true));await page.waitForTimeout(50);
assert.equal(await input.count(),0,'a card disabled while editing closes its editor');await page.evaluate(()=>window.setDis(false));await page.waitForTimeout(50);
pass('withdrawn rename, disabled card');

// F2 that starts editing is consumed (its default prevented); a synchronous throw keeps the editor and the text.
await reset();await page.evaluate(()=>{window.f2Prevented=[];window.mode='throw';});await open.focus();await page.keyboard.press('F2');await input.waitFor();
assert.deepEqual(await page.evaluate(()=>window.f2Prevented),[true],'F2 default prevented');
await page.keyboard.type('Thrown');await page.keyboard.press('Enter');await page.waitForTimeout(50);
assert.deepEqual([await input.inputValue(),(await state()).calls.length],['Thrown',1],'a host that throws at once keeps the editor and the text');
await page.keyboard.down('Enter');await page.keyboard.down('Enter');await page.keyboard.up('Enter');
assert.equal((await state()).calls.length,2,'a held Enter in the editor calls once more, not once per repeat');
assert.deepEqual(errors,[],'no page error from a synchronous refusal');

// The window losing focus (a focusout while the input keeps focus) does not cancel.
await input.evaluate(el=>el.dispatchEvent(new FocusEvent('focusout',{bubbles:true})));await page.waitForTimeout(50);
assert.equal(await input.count(),1,'window blur keeps the editor');
// Focus dropped on the page during a pending save comes back to the input after a refusal.
await page.evaluate(()=>{window.mode='ok';});await page.keyboard.press('Enter');await page.locator('#elsewhere').click();
assert.equal(await page.evaluate(()=>document.activeElement===document.body),true);
await page.evaluate(()=>window.settle(false));await page.waitForTimeout(100);
assert.equal(await input.evaluate(el=>document.activeElement===el),true,'refused: focus back in the input (it was on the page)');
await page.keyboard.press('Escape');await open.waitFor();
pass('F2 consumed, synchronous throw, window blur, refocus after refusal');

// A synchronous host (no promise) closes the editor at once.
await reset();await page.evaluate(()=>{window.mode='sync';});await open.focus();await page.keyboard.press('F2');await input.waitFor();await page.keyboard.type('Sync');await page.keyboard.press('Enter');
await open.waitFor();assert.deepEqual((await state()).calls,[['a','Sync']]);
pass('synchronous host');

// A double-click on the title is two opens, never an edit; clicks and keys inside the input never open, archive or bubble.
await reset();await cardA.locator('.af-session-card__title').dblclick();await page.waitForTimeout(50);
assert.equal(await input.count(),0,'double-click does not edit');
await reset();await open.focus();await page.keyboard.press('F2');await input.waitFor();await reset();
await input.click();await input.dblclick();await page.keyboard.press('ArrowUp');await page.keyboard.press('Home');await page.keyboard.type('x');await page.keyboard.press('Space');
s=await state();assert.equal(s.opens,0,'clicks inside never open');assert.equal(s.archives,0);assert.deepEqual(s.listKeys,[],'keys inside never reach the list');assert.deepEqual(s.pageKeys,[],'nor the page');
await page.keyboard.press('Escape');await open.waitFor();
pass('no double-click trigger; containment');

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

// A name longer than 120 characters is offered cut to 120 characters (code points, not UTF-16 units).
const emoji=page.locator('li').nth(4).locator('.af-session-card');await emoji.locator('.af-session-card__open').focus();await page.keyboard.press('F2');
assert.equal(await emoji.locator('input').evaluate(el=>Array.from(el.value).length),120);await page.keyboard.press('Escape');
await reset();await page.evaluate(()=>{window.mode='sync';});await open.focus();await page.keyboard.press('F2');await input.waitFor();
await input.evaluate(el=>{el.value='\u{1F600}'.repeat(130);});await page.keyboard.press('Enter');await open.waitFor();
assert.equal(Array.from((await state()).calls[0][1]).length,120,'never sends more than 120 characters');
await page.evaluate(()=>window.setTitles(t=>({...t,a:'Fix the parser'})));
pass('prefill cut to 120 characters');

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
