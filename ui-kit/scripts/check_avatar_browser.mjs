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
 await page.addInitScript(()=>{window.avatarFrameCount=0;window.canvasFrames=new Map();const put=CanvasRenderingContext2D.prototype.putImageData;CanvasRenderingContext2D.prototype.putImageData=function(...args){window.avatarFrameCount++;window.canvasFrames.set(this.canvas,(window.canvasFrames.get(this.canvas)??0)+1);return put.apply(this,args);};
  // Record every gaze value the renderer draws with.
  window.gazeRenders=[];const instantiate=WebAssembly.instantiate;
  WebAssembly.instantiate=async(...args)=>{const made=await instantiate.apply(WebAssembly,args),instance=made.instance??made,e=instance.exports,last=new Map();
   const exports={...e,
    avatar_set_gaze:(h,x,y)=>{last.set(h,[x,y]);return e.avatar_set_gaze(h,x,y);},
    avatar_render:(h,style,...rest)=>{const [x,y]=last.get(h)??[0,0];if(x||y)window.gazeRenders.push({style,x,y});return e.avatar_render(h,style,...rest);}};
   return made.instance?{...made,instance:{exports}}:{exports};};
 });
 const ready=(expected=6)=>page.waitForFunction(n=>document.querySelectorAll('canvas').length===n&&[...document.querySelectorAll('canvas')].every(c=>c.getContext('2d').getImageData(0,0,c.width,c.height).data.some((v,i)=>i%4===3&&v>0)),expected);
 await page.goto(`http://127.0.0.1:${server.address().port}/examples/avatar_gallery.html`);await ready();
 assert.equal(await page.getByRole('alert').count(),0);
 for(const phase of ['ready','listening','thinking','working','speaking','waiting','error']){
  await page.getByLabel('Phase', {exact:true}).selectOption(phase);await page.waitForTimeout(180);
  if(process.env.AVATAR_CAPTURE_DIR){await mkdir(process.env.AVATAR_CAPTURE_DIR,{recursive:true});await page.screenshot({path:path.join(process.env.AVATAR_CAPTURE_DIR,`web-${phase}.png`),fullPage:true});}
 }
 const count=()=>page.evaluate(()=>window.avatarFrameCount);
 const frames=async(ms)=>{const before=await count();await page.waitForTimeout(ms);return(await count())-before;};
 // Static error neither animates nor looks toward the cursor.
 const errorImage=await page.locator('canvas').nth(1).evaluate(c=>c.toDataURL());await page.mouse.move(500,80);await page.waitForTimeout(120);
 assert.equal(await page.locator('canvas').nth(1).evaluate(c=>c.toDataURL()),errorImage);
 await page.getByLabel('Phase', {exact:true}).selectOption('ready');await page.waitForTimeout(100);
 const readyFrames=await frames(1100);assert(readyFrames>0&&readyFrames<=18,`ready cadence ${readyFrames}`);
 // The pointer never moves an avatar element, and reaches the renderer only as a gaze
 // target for designs whose catalog gives them eyes; spheres get nothing.
 const catalog=await page.evaluate(async()=>(await (await import('/dist/avatar_renderer.js')).avatarDesigns()).map(d=>({id:d.id,gaze:d.gaze})));
 const eyeIds=catalog.filter(d=>d.gaze==='eyes').map(d=>d.id);assert(eyeIds.includes('hover')&&!eyeIds.includes('halo')&&!eyeIds.includes('watch-halo'),`eyes designs ${eyeIds}`);
 const boxes=()=>page.locator('canvas').evaluateAll(nodes=>nodes.map(c=>{const r=c.getBoundingClientRect();return [r.x,r.y,r.width,r.height,getComputedStyle(c).transform,getComputedStyle(c.parentElement).transform].join();}));
 const shownIds=await page.locator('article[data-design]').evaluateAll(nodes=>nodes.map(n=>n.dataset.design)),pageEyes=shownIds.filter(id=>eyeIds.includes(id));
 assert(pageEyes.length>0&&pageEyes.length<shownIds.length,'the first page shows designs with and without eyes');
 const framesOf=ids=>page.locator('article[data-design]').evaluateAll((nodes,ids)=>nodes.filter(n=>ids.includes(n.dataset.design)).map(n=>window.canvasFrames.get(n.querySelector('canvas'))??0),ids);
 const placed=await boxes();await page.evaluate(()=>{window.gazeRenders=[];});
 const eyesBefore=await framesOf(pageEyes),othersBefore=await framesOf(shownIds.filter(id=>!pageEyes.includes(id)));
 // Active pointer gives the eyes design a bounded faster sampling clock, then it returns to its idle rate.
 await page.mouse.move(20,350);await page.waitForTimeout(100);
 const gazeFrames=await frames(500),eyesGaze=(await framesOf(pageEyes)).map((n,i)=>n-eyesBefore[i]),othersIdle=(await framesOf(shownIds.filter(id=>!pageEyes.includes(id)))).map((n,i)=>n-othersBefore[i]);
 assert(eyesGaze.every(n=>n>=4&&n<=10),`eyes gaze cadence ${eyesGaze}`);assert(othersIdle.every(n=>n<=3),`designs without eyes kept their idle cadence ${othersIdle}`);
 // The eyes ease toward the pointer (~150 ms), never jump to it.
 const hoverIndex=catalog.findIndex(d=>d.id==='hover');
 const toward=await page.evaluate(i=>window.gazeRenders.filter(r=>r.style===i).map(r=>Math.abs(r.x)),hoverIndex);
 assert(toward.length>=3&&toward[0]<.9&&toward.at(-1)>.95&&toward.every((v,i)=>i===0||v>=toward[i-1]-1e-6),`gaze eases toward the pointer ${toward.map(v=>v.toFixed(2))}`);
 for(let i=0;i<8;i++){await page.mouse.move(40+i*150,60+i*110);await page.waitForTimeout(40);}
 assert.deepEqual(await boxes(),placed,'no avatar is translated, rotated or tilted by the pointer');
 const gazed=await page.evaluate(()=>window.gazeRenders.map(r=>r.style));
 assert(gazed.length>0,'the eyes design received the gaze target');
 assert.deepEqual([...new Set(gazed.map(i=>catalog[i].id))].sort(),[...pageEyes].sort(),'only eyes designs receive a gaze target');
 // Two idle seconds later the eyes ease back to the centre, then the idle cadence resumes.
 await page.evaluate(()=>{window.gazeRenders=[];});await page.waitForTimeout(2900);
 const back=await page.evaluate(i=>window.gazeRenders.filter(r=>r.style===i).map(r=>Math.hypot(r.x,r.y)),hoverIndex);
 assert(back.some(v=>v>.1&&v<.9)&&back.at(-1)<.05,`gaze eases back to centre ${back.map(v=>v.toFixed(2))}`);
 const idleFrames=await frames(1100);assert(idleFrames>0&&idleFrames<=18,`gaze did not expire ${idleFrames}`);
 await page.emulateMedia({reducedMotion:'reduce'});await page.waitForTimeout(100);const reduced=await count();await page.mouse.move(700,600);await page.waitForTimeout(1100);assert.equal(await count(),reduced,'reduced motion must stop animation and tracking');
 await page.getByRole('button',{name:'Light / dark'}).click();
 if(process.env.AVATAR_CAPTURE_DIR)await page.screenshot({path:path.join(process.env.AVATAR_CAPTURE_DIR,'web-light.png'),fullPage:true});
 await page.emulateMedia({reducedMotion:'no-preference'});await page.waitForTimeout(100);
 await page.locator('canvas').evaluateAll(nodes=>nodes.forEach(c=>c.dispatchEvent(new Event('contextlost',{cancelable:true}))));const lost=await count();await page.waitForTimeout(300);assert.equal(await count(),lost,'lost contexts retain no clock');
 // A restored context is redrawn AT ONCE (inside the event), every canvas; then the clock resumes.
 // Counted inside the same evaluate: a count read after the event would miss the redraw and depend on the cadence's phase.
 const redrawn=await page.locator('canvas').evaluateAll(nodes=>nodes.map(c=>{const before=window.canvasFrames.get(c)??0;c.dispatchEvent(new Event('contextrestored'));return (window.canvasFrames.get(c)??0)-before;}));
 assert(redrawn.every(n=>n===1),`restored contexts render again at once ${redrawn}`);
 const resumed=await count();await page.waitForFunction(n=>window.avatarFrameCount>n,resumed,{timeout:3000});
 for(let i=0;i<5;i++){await page.getByRole('button',{name:'Hide avatars'}).click();assert.equal(await page.locator('canvas').count(),0);await page.getByRole('button',{name:'Show avatars'}).click();await ready();}
 await page.getByRole('button',{name:'Hide avatars'}).click();assert.equal(await frames(300),0,'unmounted avatars retain no clock');
 await page.getByRole('button',{name:'Show avatars'}).click();await ready();
 // Every canonical design is visible through a bounded page, not44 live handles.
 const seen=new Set();let pageIndex=0;
 while(true){
  const ids=await page.locator('article[data-design]').evaluateAll(nodes=>nodes.map(n=>n.dataset.design));
  for(const id of ids)seen.add(id);
  assert(ids.length<=6,'gallery must bound live renderers');
  for(const phase of ['ready','listening','thinking','working','speaking','waiting','error']){
   await page.getByLabel('Phase', {exact:true}).selectOption(phase);await page.waitForTimeout(100);await ready(ids.length);
  }
  if(process.env.AVATAR_CAPTURE_DIR)await page.screenshot({path:path.join(process.env.AVATAR_CAPTURE_DIR,`catalog-page-${pageIndex}.png`),fullPage:true});
  const next=page.getByRole('button',{name:'Next avatars',exact:true});
  if(await next.isDisabled())break;
  await next.click();pageIndex++;
  await ready(Math.min(6,44-pageIndex*6));
 }
 assert.equal(seen.size,44,'gallery must expose every canonical design');
 // Quality changes and display-DPR changes must rebuild bounded backing frames,
 // release old handles, and retain the selected design/activity.
 const focusIds=['watch-halo','watch-wave','watch-hover','watch-rings','watch-eye'];
 await page.getByRole('button',{name:'Focus designs',exact:true}).click();await ready(5);
 assert.deepEqual(await page.locator('article[data-design]').evaluateAll(nodes=>nodes.map(n=>n.dataset.design)),focusIds);
 await page.emulateMedia({reducedMotion:'reduce'});
 await page.getByLabel('Quality',{exact:true}).selectOption('high');
 await page.evaluate(()=>{Object.defineProperty(window,'devicePixelRatio',{configurable:true,value:3});window.dispatchEvent(new Event('resize'));});
 await page.waitForFunction(()=>[...document.querySelectorAll('canvas')].every(c=>c.width===512));await ready(5);
 assert.equal(await frames(400),0,'high quality must respect reduced motion');
 if(process.env.AVATAR_CAPTURE_DIR)await page.screenshot({path:path.join(process.env.AVATAR_CAPTURE_DIR,'focus-high-dpr3.png'),fullPage:true});
 await page.getByLabel('Quality',{exact:true}).selectOption('economy');
 await page.waitForFunction(()=>[...document.querySelectorAll('canvas')].every(c=>c.width===256));await ready(5);
 await page.evaluate(()=>{Object.defineProperty(window,'devicePixelRatio',{configurable:true,value:1});window.dispatchEvent(new Event('resize'));});
 await page.waitForFunction(()=>[...document.querySelectorAll('canvas')].every(c=>c.width===192));await ready(5);
 // Observe pointerdown without swallowing the original host action.
 await page.emulateMedia({reducedMotion:'no-preference'});
 await page.getByLabel('Phase',{exact:true}).selectOption('ready');await page.waitForTimeout(2100);
 await page.evaluate(()=>{window.gazeRenders=[];window.dispatchEvent(new PointerEvent('pointerdown',{clientX:5,clientY:5,pointerType:'mouse',bubbles:true,cancelable:true}));});
 const clickFrames=await frames(500),focusEyes=focusIds.filter(id=>eyeIds.includes(id));
 assert.deepEqual([...new Set(await page.evaluate(()=>window.gazeRenders.map(r=>r.style)))].map(i=>catalog[i].id).sort(),focusEyes.sort(),'a click gazes only with eyes designs');
 assert(clickFrames<=focusEyes.length*8+5*3,`click gaze cadence ${clickFrames}`);
 // The default (balanced) portrait rests as smoothly as it speaks: Ready and Waiting draw at
 // its 24 fps active rate, not the 6/10 fps stutter. Counted per canvas, after the rebuild settles.
 await page.getByLabel('Quality',{exact:true}).selectOption('balanced');await ready(5);
 for(const phase of ['ready','waiting']){
  await page.getByLabel('Phase',{exact:true}).selectOption(phase);await page.waitForTimeout(400);
  const all=()=>page.locator('canvas').evaluateAll(nodes=>nodes.map(c=>window.canvasFrames.get(c)??0));
  const before=await all();await page.waitForTimeout(1000);const rate=(await all()).map((n,i)=>n-before[i]);
  assert(rate.every(n=>n>=18&&n<=27),`balanced ${phase} cadence per canvas ${rate}`);
 }
 // A host stylesheet that shows the canvas smaller (the compact avatar beside a question) gets a
 // raster for the side actually shown, not the full-size one; it grows back with the canvas.
 await page.evaluate(()=>{const s=document.createElement('style');s.id='compact-avatars';s.textContent='article canvas{width:48px!important;height:48px!important}';document.head.append(s);});
 await page.waitForFunction(()=>[...document.querySelectorAll('canvas')].every(c=>c.width===48),null,{timeout:3000}).catch(async()=>{throw new Error(`compact raster ${await page.locator('canvas').evaluateAll(n=>n.map(c=>c.width))}`);});await ready(5);
 await page.evaluate(()=>document.getElementById('compact-avatars').remove());
 await page.waitForFunction(()=>[...document.querySelectorAll('canvas')].every(c=>c.width===192),null,{timeout:3000});await ready(5);
 await page.getByLabel('Phase',{exact:true}).selectOption('ready');
 await page.getByRole('button',{name:'Pause motion',exact:true}).click();await page.waitForTimeout(100);
 assert.equal(await frames(400),0,'pause motion must cancel both timeout and animation frame');
 const presentationTiming=await page.evaluate(async()=>{
  const {AvatarRenderer,avatarPaletteFromCss}=await import('/dist/avatar_renderer.js');
  const canvas=document.createElement('canvas');document.body.append(canvas);
  const measurements=[];
  try {
   for(const size of [128,256,512]){
    const renderer=await AvatarRenderer.create(canvas,{width:size,palette:avatarPaletteFromCss(canvas)});
    try {
     for(const design of ['watch-halo','watch-wave','watch-hover','watch-rings','watch-eye']){
      const times=[];
      for(let i=0;i<9;i++){
       const start=performance.now();renderer.draw(design,'speaking',.6,1.25+i/30);
       if(i>=2)times.push(performance.now()-start);
      }
      times.sort((a,b)=>a-b);measurements.push({design,size,medianMs:times[3],maxMs:times.at(-1)});
     }
    } finally {renderer.dispose();}
   }
  }finally{canvas.remove();}
  return measurements;
 });
 assert.deepEqual(errors,[]);
 console.log({styles:seen.size,phases:7,maxLiveRenderers:6,readyFramesIn1_1s:readyFrames,gazeFramesIn500ms:gazeFrames,eyesGazeFramesIn500ms:eyesGaze,eyesDesigns:eyeIds,clickFramesIn500ms:clickFrames,postIdleFramesIn1_1s:idleFrames,reducedMotionFrames:0,unmountCycles:5,contextRecovery:true,qualityAndDprResizing:true,presentationTiming,consoleErrors:errors});
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
