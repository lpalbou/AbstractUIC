import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {performance} from 'node:perf_hooks';
import {AvatarRenderer,avatarDesigns,avatarGazeTarget,parseAvatarFrame} from '../dist/avatar_renderer.js';
const bytes=await readFile(new URL('../src/avatars/avatar_core.wasm',import.meta.url));
const mod=await WebAssembly.compile(bytes);assert.deepEqual(WebAssembly.Module.imports(mod),[],'renderer must have no host/network imports');
const {instance}=await WebAssembly.instantiate(bytes);const c=instance.exports;
assert.equal(c.avatar_abi_version(),1);assert.equal(c.avatar_create(0,32),0);assert.equal(c.avatar_create(513,32),0);
const designs=await avatarDesigns(bytes);assert.deepEqual(designs.slice(0,6).map(d=>d.id),['halo','hover','vortex','eclipse','eye','rover']);assert.equal(designs[5].watchCode,'Q');
assert.equal(designs.length,44,'complete shared catalog');assert.equal(new Set(designs.map(d=>d.id)).size,44);
for(const id of ['watch-halo','watch-galaxy','watch-shape-kitty','iphone-weave'])assert(designs.some(d=>d.id===id),`missing ${id}`);
// Only a design whose catalog says it has eyes may receive a pointer gaze target; a catalog
// without the field (or any other value) is "none" and nothing follows the pointer.
for(const d of designs)assert(d.gaze==='eyes'||d.gaze==='none',`gaze field of ${d.id}`);
for(const id of ['halo','watch-halo','watch-vortex','watch-galaxy'])assert.equal(designs.find(d=>d.id===id).gaze,'none',`${id} is a sphere: nothing follows`);
for(const id of ['hover','eye','rover','watch-hover','watch-eye'])assert.equal(designs.find(d=>d.id===id).gaze,'eyes',`${id} has eyes`);
const box={x:100,y:200,width:200,height:100},eyes={...designs[0],gaze:'eyes'};
assert.deepEqual(avatarGazeTarget(eyes,{clientX:300,clientY:200,pointerType:'mouse'},box),[1,-1]);
assert.deepEqual(avatarGazeTarget(eyes,{clientX:150,clientY:275,pointerType:'pen'},box),[-.5,.5]);
assert.deepEqual(avatarGazeTarget(eyes,{clientX:-1e9,clientY:1e9},box),[-1,1],'gaze is clamped');
for(const d of designs.filter(d=>d.gaze==='none'))assert.equal(avatarGazeTarget(d,{clientX:300,clientY:200,pointerType:'mouse'},box),undefined,`${d.id} has no eyes`);
assert.equal(avatarGazeTarget(undefined,{clientX:300,clientY:200},box),undefined,'unknown design');
assert.equal(avatarGazeTarget(eyes,{clientX:300,clientY:200,pointerType:'touch'},box),undefined,'touch never steers gaze');
assert.equal(avatarGazeTarget(eyes,{clientX:300,clientY:200},{...box,width:0}),undefined,'empty bounds');
const handles=[];for(let i=0;i<16;i++){const h=c.avatar_create(8,8);assert.notEqual(h,0);handles.push(h);}assert.equal(c.avatar_create(8,8),0);for(const h of handles)assert.equal(c.avatar_destroy(h),0);
const h=c.avatar_create(64,64);assert.equal(c.avatar_render(h,0,0,.6,1.1,1),-5);
for(let m=0;m<3;m++)for(let i=0;i<256;i++)assert.equal(c.avatar_set_shade(h,m,i,((i<<24)|(Math.round(i*.7)<<16)|(Math.round(i*.4)<<8)|255)>>>0),0);
const snapshots=new Set();const start=performance.now();let nativeDiff=0;
for(let s=0;s<designs.length;s++)for(let p=0;p<7;p++){
 assert.equal(c.avatar_render(h,s,p,.6,1.1,1),0);const data=new Uint8Array(c.memory.buffer,c.avatar_pixels(h)>>>0,c.avatar_pixels_len(h));
 assert(data.filter((v,i)=>i%4===3&&v>0).length>20,`empty style/pose ${s}/${p}`);
 if(p===0&&s<6)snapshots.add(Buffer.from(data).toString('base64'));
 if(process.argv[2]){const native=await readFile(`${process.argv[2]}/${s}-${p}.rgba`);assert.equal(native.length,data.length);for(let i=0;i<native.length;i++)nativeDiff=Math.max(nativeDiff,Math.abs(native[i]-data[i]));}
}
assert.equal(snapshots.size,6,'silhouettes must differ');assert(nativeDiff<=2,`native/Wasm pixel error ${nativeDiff}`);
assert.equal(c.avatar_render(h,99,0,0,0,1),-2);assert.equal(c.avatar_render(h,0,99,0,0,1),-3);assert.equal(c.avatar_render(h,0,0,NaN,0,1),-4);
assert.equal(c.avatar_set_gaze(h,NaN,0),-4);
for(let style=0;style<6;style++) {
 const frames=[];
 for(const gaze of [-1,1]) {
  assert.equal(c.avatar_set_gaze(h,gaze,.6),0);assert.equal(c.avatar_render(h,style,0,.6,1.1,1),0);
  const data=Buffer.from(new Uint8Array(c.memory.buffer,c.avatar_pixels(h)>>>0,c.avatar_pixels_len(h)));frames.push(data);
  if(process.argv[2]) {const native=await readFile(`${process.argv[2]}/${style}-gaze-${gaze}.rgba`);assert.equal(native.length,data.length);for(let i=0;i<native.length;i++)nativeDiff=Math.max(nativeDiff,Math.abs(native[i]-data[i]));}
 }
 // Gaze moves the eyes of an eyes design, and not one pixel of any other design.
 if(designs[style].gaze==='eyes')assert.notDeepEqual(frames[0],frames[1],`ready gaze missing for eyes design ${designs[style].id}`);
 else assert.deepEqual(frames[0],frames[1],`${designs[style].id} has no eyes: gaze must not move it`);
 assert.equal(c.avatar_render(h,style,6,.6,1.1,1),0);const error=Buffer.from(new Uint8Array(c.memory.buffer,c.avatar_pixels(h)>>>0,c.avatar_pixels_len(h)));
 c.avatar_set_gaze(h,-1,-1);c.avatar_render(h,style,6,.6,3.5,1);assert.deepEqual(Buffer.from(new Uint8Array(c.memory.buffer,c.avatar_pixels(h)>>>0,c.avatar_pixels_len(h))),error,'Error ignores gaze and animation time');
}
for(let style=0;style<designs.length;style++){
 const frame=g=>{c.avatar_set_gaze(h,g,g);c.avatar_render(h,style,0,.6,1.1,1);return Buffer.from(new Uint8Array(c.memory.buffer,c.avatar_pixels(h)>>>0,c.avatar_pixels_len(h)));};
 const moved=!frame(-1).equals(frame(1));assert.equal(moved,designs[style].gaze==='eyes',`${designs[style].id}: gaze ${moved?'moves':'does not move'} a "${designs[style].gaze}" design`);
}
assert(nativeDiff<=2,`native/Wasm gaze pixel error ${nativeDiff}`);
assert.equal(c.avatar_destroy(h),0);assert.equal(c.avatar_pixels_len(h),0);assert.equal(c.avatar_render(h,0,0,0,0,1),-1);
let painted=0,lastPainted;const canvas={width:0,height:0,getContext(){return{createImageData(w,h){return{data:new Uint8ClampedArray(w*h*4)};},putImageData(image){painted++;lastPainted=Buffer.from(image.data);}};}};
const palette={background:[12,16,24,255],warm:[200,150,50,255],eye:[240,80,100,255],shadow:[40,50,65,255],highlight:[250,245,235,255],muted:[130,140,160,255]};
const cancelled=new AbortController();cancelled.abort();
await assert.rejects(()=>AvatarRenderer.create({getContext(){throw new Error('cancelled creation allocated a canvas');}},
 {source:bytes,width:32,palette,signal:cancelled.signal}),error=>error.name==='AbortError');
const renderer=await AvatarRenderer.create(canvas,{source:bytes,width:32,palette});renderer.draw('rover','listening',.7,1,[1,.5]);assert.equal(painted,1);assert.throws(()=>renderer.draw('unknown','ready',0,0));renderer.dispose();renderer.dispose();assert.throws(()=>renderer.draw('halo','ready',0,0));
await assert.rejects(()=>AvatarRenderer.create(canvas,{source:bytes,width:1024,palette}));
const frame={schema_version:1,style:'watch-halo',state:'speaking',time:1,level:.5,gaze:[0,0],bands:[0,.1,.2,.3,.4,.5,.6,.7]};
assert.deepEqual(parseAvatarFrame(frame),frame);
for(const invalid of [null,[],{...frame,schema_version:2},{...frame,style:'../../file'},{...frame,time:Infinity},{...frame,time:86401},{...frame,level:2},{...frame,gaze:[0]},{...frame,bands:[0]},{...frame,script:'fetch(secret)'}])assert.throws(()=>parseAvatarFrame(invalid));
const reader=await AvatarRenderer.create(canvas,{source:bytes,width:32,palette});reader.renderFrame({...frame,gaze:[1,1]});assert.equal(painted,2);
reader.draw(frame.style,frame.state,frame.level,frame.time);const afterSpectralFrame=lastPainted;
const clean=await AvatarRenderer.create(canvas,{source:bytes,width:32,palette});clean.draw(frame.style,frame.state,frame.level,frame.time);
assert.deepEqual(lastPainted,afterSpectralFrame,'draw must reset absent bands and gaze rather than inherit previous frame state');
clean.dispose();reader.dispose();
if(process.argv[2]){
 const nativePalette={background:[0,0,0,255],warm:[211,158,57,255],eye:[225,70,95,255],shadow:[80,90,105,255],highlight:[255,255,255,255],muted:[255,255,255,255]};
 const adapter=await AvatarRenderer.create(canvas,{source:bytes,width:64,palette:nativePalette});
 for(let i=0;i<designs.length;i++)for(const mode of ['absent','explicit']){
  const descriptor={schema_version:1,style:designs[i].id,state:'speaking',time:1.25,level:.6,gaze:[-.4,.2],...(mode==='explicit'?{bands:[.05,.15,.25,.35,.45,.55,.65,.75]}:{})};
  adapter.renderFrame(descriptor);
  const native=await readFile(`${process.argv[2]}/descriptor-${i}-${mode}.rgba`);
  assert.equal(native.length,lastPainted.length);
  let max=0;for(let j=0;j<native.length;j++)max=Math.max(max,Math.abs(native[j]-lastPainted[j]));
  assert(max<=2,`public Python/Canvas descriptor parity ${designs[i].id}/${mode}: ${max}`);
 }
 adapter.dispose();
}
console.log(`Shared avatars:${designs.length} designs x7poses plus original gaze renders,6 distinct shaded silhouettes,descriptor validation,handle bounds/disposal,Canvas wrapper passed;${Math.round(performance.now()-start)}ms;native max channel error ${nativeDiff}`);
