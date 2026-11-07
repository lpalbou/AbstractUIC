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
  assert.equal(m.cards,18,'every gallery card renders');
  assert.ok(m.docW<=m.winW,`no horizontal scroll at ${label} (${m.docW} > ${m.winW})`);
  assert.equal(m.overflow,0,`no card overflows its width at ${label}`);
  // A loading card holds the loaded card's size, whatever the loaded card says (a full life or a newborn).
  assert.equal(new Set(m.pair).size,1,`the loading card holds the loaded card size at ${label} (${m.pair})`);
  assert.equal(new Set(m.plain).size,1,`compact cards without a trouble share one height at ${label} (${m.plain})`);
  // Plain words only: no event names, no unit abbreviations, nothing undefined.
  for(const bad of [/\b[a-z]+_[a-z_]+\b/,/\bundefined\b/,/\bNaN\b/,/\btk\b/,/\bnull\b/,/identity changed/i,/session closed/i]) assert.doesNotMatch(m.text,bad,`${bad} at ${label}`);
  for(const want of ['Asleep','for 3 months','Its own time stopped after repeated failures','In a visit','busy now','On its own time','Stopped','Born today','Details unavailable right now','As of 12 min ago','Moved to its own time','A visit ended','33 lessons learned','78 open questions','mind']) assert.ok(m.text.includes(want),`"${want}" at ${label}`);
  if(shots){
   await page.screenshot({path:path.join(shots,`entity-cards-${label}.png`),fullPage:true});
   const grid=await page.$('[data-testid="grid"]');await grid.screenshot({path:path.join(shots,`entity-cards-grid-${label}.png`)});
   const strip=await page.$('[data-testid="strip"]');await strip.screenshot({path:path.join(shots,`entity-cards-strip-${label}.png`)});
   await page.evaluate(()=>{document.documentElement.classList.add('theme-light');});
   await grid.screenshot({path:path.join(shots,`entity-cards-grid-${label}-light.png`)});
  }
  await page.close();
 }
 console.log('Entity card (browser): 1440 and 400 px, drawn looks, no overflow, loading at final size, plain words passed');
}finally{await browser?.close();server.close();}
