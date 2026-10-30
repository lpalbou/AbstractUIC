// Optional real-browser lifecycle QA. Build demo first; provide Playwright via
// AVATAR_PLAYWRIGHT_MODULE if not installed here. No browser downloads or app sessions.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,mkdir} from 'node:fs/promises';
import {fileURLToPath,pathToFileURL} from 'node:url';
import path from 'node:path';
const root=fileURLToPath(new URL('../',import.meta.url));
const {chromium}=await import(process.env.AVATAR_PLAYWRIGHT_MODULE ? pathToFileURL(path.resolve(process.env.AVATAR_PLAYWRIGHT_MODULE)).href : 'playwright');
const server=createServer(async(req,res)=>{
 try {
  const file=path.resolve(root,`.${decodeURIComponent(new URL(req.url,'http://localhost').pathname)}`);
  if(!file.startsWith(root)){res.writeHead(403).end();return;}
  const bytes=await readFile(file);const ext=path.extname(file);
  res.setHeader('Content-Type',ext==='.wasm'?'application/wasm':ext==='.js'?'text/javascript':ext==='.css'?'text/css':ext==='.html'?'text/html':'application/octet-stream');res.end(bytes);
 }catch{res.writeHead(404).end();}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
let browser;
try{
 browser=await chromium.launch({headless:true,...(process.env.AVATAR_BROWSER_CHANNEL?{channel:process.env.AVATAR_BROWSER_CHANNEL}:{})});
 const page=await browser.newPage({viewport:{width:1280,height:1050}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{window.avatarFrameCount=0;const put=CanvasRenderingContext2D.prototype.putImageData;CanvasRenderingContext2D.prototype.putImageData=function(...args){window.avatarFrameCount++;return put.apply(this,args);};});
 const ready=()=>page.waitForFunction(()=>document.querySelectorAll('canvas').length===6&&[...document.querySelectorAll('canvas')].every(c=>c.getContext('2d').getImageData(0,0,c.width,c.height).data.some((v,i)=>i%4===3&&v>0)));
 await page.goto(`http://127.0.0.1:${server.address().port}/examples/avatar_gallery.html`);await ready();
 assert.equal(await page.getByRole('alert').count(),0);
 for(const phase of ['ready','listening','thinking','working','speaking','waiting','error']){
  await page.getByRole('combobox').selectOption(phase);await page.waitForTimeout(180);
  if(process.env.AVATAR_CAPTURE_DIR){await mkdir(process.env.AVATAR_CAPTURE_DIR,{recursive:true});await page.screenshot({path:path.join(process.env.AVATAR_CAPTURE_DIR,`web-${phase}.png`),fullPage:true});}
 }
 const count=()=>page.evaluate(()=>window.avatarFrameCount);
 const frames=async(ms)=>{const before=await count();await page.waitForTimeout(ms);return(await count())-before;};
 // Static error neither animates nor looks toward the cursor.
 const errorImage=await page.locator('canvas').nth(1).evaluate(c=>c.toDataURL());await page.mouse.move(500,80);await page.waitForTimeout(120);
 assert.equal(await page.locator('canvas').nth(1).evaluate(c=>c.toDataURL()),errorImage);
 await page.getByRole('combobox').selectOption('ready');await page.waitForTimeout(100);
 const readyFrames=await frames(1100);assert(readyFrames>0&&readyFrames<=18,`ready cadence ${readyFrames}`);
 // Active pointer gives a bounded faster sampling clock, then returns to2fps.
 await page.mouse.move(20,350);await page.waitForTimeout(100);
 const gazeFrames=await frames(500);assert(gazeFrames>=24&&gazeFrames<=42,`gaze cadence ${gazeFrames}`);
 await page.waitForTimeout(1700);const idleFrames=await frames(1100);assert(idleFrames>0&&idleFrames<=18,`gaze did not expire ${idleFrames}`);
 await page.emulateMedia({reducedMotion:'reduce'});await page.waitForTimeout(100);const reduced=await count();await page.mouse.move(700,600);await page.waitForTimeout(1100);assert.equal(await count(),reduced,'reduced motion must stop animation and tracking');
 await page.getByRole('button',{name:'Light / dark'}).click();
 if(process.env.AVATAR_CAPTURE_DIR)await page.screenshot({path:path.join(process.env.AVATAR_CAPTURE_DIR,'web-light.png'),fullPage:true});
 await page.emulateMedia({reducedMotion:'no-preference'});await page.waitForTimeout(100);
 await page.locator('canvas').evaluateAll(nodes=>nodes.forEach(c=>c.dispatchEvent(new Event('contextlost',{cancelable:true}))));const lost=await count();await page.waitForTimeout(300);assert.equal(await count(),lost,'lost contexts retain no clock');
 await page.locator('canvas').evaluateAll(nodes=>nodes.forEach(c=>c.dispatchEvent(new Event('contextrestored'))));assert((await frames(600))>0,'restored contexts render again');
 for(let i=0;i<5;i++){await page.getByRole('button',{name:'Hide avatars'}).click();assert.equal(await page.locator('canvas').count(),0);await page.getByRole('button',{name:'Show avatars'}).click();await ready();}
 await page.getByRole('button',{name:'Hide avatars'}).click();assert.equal(await frames(300),0,'unmounted avatars retain no clock');
 assert.deepEqual(errors,[]);
 console.log({styles:6,phases:7,readyFramesIn1_1s:readyFrames,gazeFramesIn500ms:gazeFrames,postIdleFramesIn1_1s:idleFrames,reducedMotionFrames:0,unmountCycles:5,contextRecovery:true,consoleErrors:errors});
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
