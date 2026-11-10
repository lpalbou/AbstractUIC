// Real-browser check of the EntityCard (gateway backlog 1012): the gallery of real-looking entities at
// 1440 px and 400 px. Build first (`node scripts/build_entity_card_gallery.mjs`); provide Playwright
// via AVATAR_PLAYWRIGHT_MODULE when it is not installed here. ENTITY_CARD_SHOTS=<dir> also saves the
// screenshots. No browser downloads, no gateway.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,mkdir} from 'node:fs/promises';
import {fileURLToPath,pathToFileURL} from 'node:url';
import path from 'node:path';
const root=fileURLToPath(new URL('../',import.meta.url));
const {chromium}=await import(process.env.AVATAR_PLAYWRIGHT_MODULE ? pathToFileURL(path.resolve(process.env.AVATAR_PLAYWRIGHT_MODULE)).href : 'playwright');
const server=createServer(async(req,res)=>{
 try{
  const file=path.resolve(root,`.${decodeURIComponent(new URL(req.url,'http://localhost').pathname)}`);
  if(!file.startsWith(root)){res.writeHead(403).end();return;}
  const bytes=await readFile(file);const ext=path.extname(file);
  res.setHeader('Content-Type',ext==='.wasm'?'application/wasm':ext==='.js'?'text/javascript':ext==='.css'?'text/css':ext==='.html'?'text/html':'application/octet-stream');res.end(bytes);
 }catch{res.writeHead(404).end();}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const shots=process.env.ENTITY_CARD_SHOTS;if(shots)await mkdir(shots,{recursive:true});
let browser;
try{
 browser=await chromium.launch({headless:true,...(process.env.AVATAR_BROWSER_CHANNEL?{channel:process.env.AVATAR_BROWSER_CHANNEL}:{})});
 for(const [width,label] of [[1440,'1440'],[400,'400']]){
  const page=await browser.newPage({viewport:{width,height:900},deviceScaleFactor:2}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.goto(`http://127.0.0.1:${server.address().port}/examples/entity_cards.html`);
  await page.waitForSelector('.af-entity-card');
  // Every identity design is drawn (a canvas with painted pixels) before measuring.
  // (An avatar draws only while it is on screen: each one is scrolled into view and waited for.)
  const orbs=page.locator('.af-entity-card__orb canvas');
  for(let i=0;i<await orbs.count();i++){
   await orbs.nth(i).scrollIntoViewIfNeeded();
   await page.waitForFunction(n=>{const c=document.querySelectorAll('.af-entity-card__orb canvas')[n];return c.width>0&&c.getContext('2d',{willReadFrequently:true}).getImageData(0,0,c.width,c.height).data.some((v,i)=>i%4===3&&v>0);},i,{timeout:15000});
  }
  await page.evaluate(()=>scrollTo(0,0));
  assert.deepEqual(errors,[],`page errors at ${label}`);
  const m=await page.evaluate(()=>{
   const h=el=>Math.round(el.getBoundingClientRect().height);
   const pair=[...document.querySelectorAll('[data-testid="pair-full"] .af-entity-card')].map(h);
   const strip=[...document.querySelectorAll('[data-testid="strip"] .af-entity-card')];
   const plain=strip.filter(c=>!c.hasAttribute('data-trouble')).map(h);
   const text=document.body.innerText;
   const overflow=[...document.querySelectorAll('.af-entity-card')].filter(c=>c.scrollWidth>c.clientWidth+1).length;
   return {pair,plain,text,docW:document.documentElement.scrollWidth,winW:innerWidth,overflow,cards:document.querySelectorAll('.af-entity-card').length};
  });
  assert.equal(m.cards,20,'every gallery card renders');
  assert.ok(m.docW<=m.winW,`no horizontal scroll at ${label} (${m.docW} > ${m.winW})`);
  assert.equal(m.overflow,0,`no card overflows its width at ${label}`);
  // A loading card holds the loaded card's size, whatever the loaded card says (a full life or a newborn).
  assert.equal(new Set(m.pair).size,1,`the loading card holds the loaded card size at ${label} (${m.pair})`);
  assert.equal(new Set(m.plain).size,1,`compact cards without a trouble share one height at ${label} (${m.plain})`);
  // Plain words only: no event names, no unit abbreviations, nothing undefined.
  for(const bad of [/\b[a-z]+_[a-z_]+\b/,/\bundefined\b/,/\bNaN\b/,/\btk\b/,/\bnull\b/,/identity changed/i,/session closed/i]) assert.doesNotMatch(m.text,bad,`${bad} at ${label}`);
  for(const want of ['Asleep','for 3 months','Its own time stopped after repeated failures','In a visit','busy now','On its own time','Stopped','Resting','Born today','Details unavailable right now','Details from 12 minutes ago','Moved to its own time','A visit ended','33 lessons learned','78 open questions','Thinks with']) assert.ok(m.text.includes(want),`"${want}" at ${label}`);
  // Abbreviated units are not plain words.
  assert.doesNotMatch(m.text,/\b\d+ (min|h|d|tk)\b/,`abbreviated units at ${label}`);
  // Actions line up across a grid row (the card stretches; actions sit at its bottom).
  const rows=await page.evaluate(()=>{const by=new Map();for(const c of document.querySelectorAll('[data-testid="grid"] .af-entity-card')){const a=c.querySelector('.af-entity-card__actions');if(!a)continue;const top=Math.round(c.getBoundingClientRect().top);(by.get(top)||by.set(top,[]).get(top)).push(Math.round(a.getBoundingClientRect().bottom));}return [...by.values()];});
  for(const r of rows) assert.equal(new Set(r).size,1,`actions line up in a grid row at ${label} (${r})`);
  if(shots){
   await page.screenshot({path:path.join(shots,`entity-cards-${label}.png`),fullPage:true});
   const grid=await page.$('[data-testid="grid"]');await grid.screenshot({path:path.join(shots,`entity-cards-grid-${label}.png`)});
   const strip=await page.$('[data-testid="strip"]');await strip.screenshot({path:path.join(shots,`entity-cards-strip-${label}.png`)});
   await page.evaluate(()=>{document.documentElement.classList.add('theme-light');});
   await grid.screenshot({path:path.join(shots,`entity-cards-grid-${label}-light.png`)});
   await page.evaluate(()=>{document.documentElement.classList.remove('theme-light');});
  }
  // The acts (operator 2026-11-10), on their own page: Watch is a visible button in the head band, Retry sits beside the
  // served reason, Resume on a stopped card; each one calls its own callback; in flight, then answered.
  {
   await page.goto(`http://127.0.0.1:${server.address().port}/examples/entity_cards.html?acts`);
   await page.waitForSelector('[data-testid="acts"] .af-entity-card');
   for(let i=0;i<await orbs.count();i++){
    await orbs.nth(i).scrollIntoViewIfNeeded();
    await page.waitForFunction(n=>{const c=document.querySelectorAll('.af-entity-card__orb canvas')[n];return c.width>0&&c.getContext('2d',{willReadFrequently:true}).getImageData(0,0,c.width,c.height).data.some((v,i)=>i%4===3&&v>0);},i,{timeout:15000});
   }
   await page.evaluate(()=>scrollTo(0,0));
   const pw=await page.evaluate(()=>({docW:document.documentElement.scrollWidth,winW:innerWidth}));
   assert.ok(pw.docW<=pw.winW,`acts: no horizontal scroll at ${label}`);
   if(shots){
    const a=await page.$('[data-testid="acts"]');await a.screenshot({path:path.join(shots,`entity-cards-acts-${label}.png`)});
    const c=await page.$('[data-testid="acts-compact"]');await c.screenshot({path:path.join(shots,`entity-cards-acts-compact-${label}.png`)});
   }
   const acts=page.locator('[data-testid="acts"] .af-entity-card');
   const box=async(sel)=>page.evaluate(s=>{const r=document.querySelector(s).getBoundingClientRect();return {w:Math.round(r.width),h:Math.round(r.height)};},sel);
   const watch=acts.nth(0).locator('.af-entity-card__watch');
   assert.equal(await watch.innerText(),'Watch');
   const wb=await box('[data-testid="acts"] .af-entity-card__watch');
   assert.ok(wb.w>=60&&wb.h>=28,`Watch is a real button at ${label} (${wb.w}x${wb.h})`);
   const top=await acts.nth(0).locator('.af-entity-card__top').boundingBox(),wr=await watch.boundingBox();
   assert.ok(wr.x+wr.width<=top.x+top.width+0.5&&wr.y>=top.y-0.5&&wr.y+wr.height<=top.y+top.height+0.5,`Watch sits inside the head band at ${label}`);
   await watch.click();assert.equal(await page.getAttribute('body','data-last-act'),'watch:Mira');
   const crashed=acts.nth(1);
   assert.ok((await crashed.innerText()).includes('His own time stopped unexpectedly. Retry to start it again.'));
   assert.ok((await crashed.innerText()).includes('Stopped after repeated failures (Aug 1); memory intact.'));
   assert.equal(await crashed.locator('.af-entity-card__watch').count(),1,'a failed entity can still be watched');
   await crashed.locator('.af-entity-card__retry').click();assert.equal(await page.getAttribute('body','data-last-act'),'retry:Ephemeral');
   assert.equal(await crashed.locator('.af-entity-card__retry').innerText(),'Retrying…');
   assert.equal(await crashed.locator('.af-entity-card__watch').getAttribute('aria-disabled'),'true','every act waits while one is in flight');
   assert.ok(await crashed.locator('.af-entity-card__retry').evaluate(b=>document.activeElement===b),`focus stays on Retry while in flight at ${label}`);
   await crashed.locator('.af-entity-card__watch').evaluate(b=>b.click());assert.equal(await page.getAttribute('body','data-last-act'),'retry:Ephemeral','a waiting act ignores a click');
   await page.waitForFunction(()=>document.querySelectorAll('[data-testid="acts"] .af-entity-card')[1].querySelector('.af-entity-card__retry').innerText==='Retry');
   assert.ok(await crashed.locator('.af-entity-card__retry').evaluate(b=>document.activeElement===b),`focus stays on Retry once answered at ${label}`);
   const stopped=acts.nth(2);
   assert.equal(await stopped.locator('.af-entity-card__watch').count(),0,'a stopped entity offers Resume, not Watch');
   assert.ok((await stopped.innerText()).includes('Stopped. Nothing runs until you resume him.'));
   await stopped.locator('.af-entity-card__resume').click();assert.equal(await page.getAttribute('body','data-last-act'),'resume:Ossia');
   await page.waitForSelector('[data-testid="acts"] .af-entity-card__notice[data-refused]');
   assert.ok((await stopped.innerText()).includes('Only an admin can grant his own time, stop or resume him.'));
   // Compact: the same acts fit the strip width.
   const cw=await page.evaluate(()=>[...document.querySelectorAll('[data-testid="acts-compact"] .af-entity-card')].filter(c=>c.scrollWidth>c.clientWidth+1).length);
   assert.equal(cw,0,`compact acts never overflow at ${label}`);
  }
  await page.close();
 }
 console.log('Entity card (browser): 1440 and 400 px, drawn looks, no overflow, loading at final size, plain words, acts (Watch in the head band, Retry beside the reason, Resume, in flight, refused) passed');
}finally{await browser?.close();server.close();}
