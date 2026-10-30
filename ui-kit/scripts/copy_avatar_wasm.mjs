import { mkdir, copyFile, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const source=new URL('../src/avatars/avatar_core.wasm',import.meta.url);
const metadata=JSON.parse(await readFile(new URL('../src/avatars/provenance.json',import.meta.url),'utf8'));
const bytes=await readFile(source);
if(createHash('sha256').update(bytes).digest('hex')!==metadata.wasm_sha256)throw new Error('Avatar Wasm artifact does not match provenance; regenerate from shared core');
await mkdir(new URL('../dist/avatars/',import.meta.url),{recursive:true});
await copyFile(source,new URL('../dist/avatars/avatar_core.wasm',import.meta.url));
await copyFile(new URL('../src/avatars/provenance.json',import.meta.url),new URL('../dist/avatars/provenance.json',import.meta.url));
