import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {performance} from 'node:perf_hooks';
import {AvatarRenderer,avatarDesigns} from '../dist/avatar_renderer.js';
const bytes=await readFile(new URL('../src/avatars/avatar_core.wasm',import.meta.url));
const mod=await WebAssembly.compile(bytes);assert.deepEqual(WebAssembly.Module.imports(mod),[],'renderer must have no host/network imports');
const {instance}=await WebAssembly.instantiate(bytes);const c=instance.exports;
assert.equal(c.avatar_abi_version(),1);assert.equal(c.avatar_create(0,32),0);assert.equal(c.avatar_create(513,32),0);
const designs=await avatarDesigns(bytes);assert.deepEqual(designs.map(d=>d.id),['halo','hover','vortex','eclipse','eye','rover']);assert.equal(designs[5].watchCode,'Q');
const handles=[];for(let i=0;i<16;i++){const h=c.avatar_create(8,8);assert.notEqual(h,0);handles.push(h);}assert.equal(c.avatar_create(8,8),0);for(const h of handles)assert.equal(c.avatar_destroy(h),0);
const h=c.avatar_create(64,64);assert.equal(c.avatar_render(h,0,0,.6,1.1,1),-5);
for(let m=0;m<3;m++)for(let i=0;i<256;i++)assert.equal(c.avatar_set_shade(h,m,i,((i<<24)|(Math.round(i*.7)<<16)|(Math.round(i*.4)<<8)|255)>>>0),0);
const snapshots=new Set();const start=performance.now();let nativeDiff=0;
for(let s=0;s<6;s++)for(let p=0;p<7;p++){
 assert.equal(c.avatar_render(h,s,p,.6,1.1,1),0);const data=new Uint8Array(c.memory.buffer,c.avatar_pixels(h)>>>0,c.avatar_pixels_len(h));
 assert(data.filter((v,i)=>i%4===3&&v>0).length>200,`empty style/pose ${s}/${p}`);
 if(p===0)snapshots.add(Buffer.from(data).toString('base64'));
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
 assert.notDeepEqual(frames[0],frames[1],`ready gaze missing for style ${style}`);
 assert.equal(c.avatar_render(h,style,6,.6,1.1,1),0);const error=Buffer.from(new Uint8Array(c.memory.buffer,c.avatar_pixels(h)>>>0,c.avatar_pixels_len(h)));
 c.avatar_set_gaze(h,-1,-1);c.avatar_render(h,style,6,.6,3.5,1);assert.deepEqual(Buffer.from(new Uint8Array(c.memory.buffer,c.avatar_pixels(h)>>>0,c.avatar_pixels_len(h))),error,'Error ignores gaze and animation time');
}
assert(nativeDiff<=2,`native/Wasm gaze pixel error ${nativeDiff}`);
assert.equal(c.avatar_destroy(h),0);assert.equal(c.avatar_pixels_len(h),0);assert.equal(c.avatar_render(h,0,0,0,0,1),-1);
let painted=0;const canvas={width:0,height:0,getContext(){return{createImageData(w,h){return{data:new Uint8ClampedArray(w*h*4)};},putImageData(){painted++;}};}};
const palette={background:[12,16,24,255],warm:[200,150,50,255],eye:[240,80,100,255],shadow:[40,50,65,255],highlight:[250,245,235,255],muted:[130,140,160,255]};
const renderer=await AvatarRenderer.create(canvas,{source:bytes,width:32,palette});renderer.draw('rover','listening',.7,1,[1,.5]);assert.equal(painted,1);assert.throws(()=>renderer.draw('unknown','ready',0,0));renderer.dispose();renderer.dispose();assert.throws(()=>renderer.draw('halo','ready',0,0));
await assert.rejects(()=>AvatarRenderer.create(canvas,{source:bytes,width:1024,palette}));
console.log(`Shared avatars:54 style/pose/gaze renders,6 distinct silhouettes,handle bounds/disposal,Canvas wrapper passed;${Math.round(performance.now()-start)}ms;native max channel error ${nativeDiff}`);
