import {build} from 'esbuild';
import {mkdir,copyFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
const root=new URL('../',import.meta.url),output=new URL('examples/build/',root);
await mkdir(new URL('avatars/',output),{recursive:true});
await build({entryPoints:[fileURLToPath(new URL('examples/avatar_gallery.tsx',root))],bundle:true,format:'esm',outfile:fileURLToPath(new URL('avatar_gallery.js',output)),define:{'process.env.NODE_ENV':'"production"'}});
await copyFile(new URL('src/avatars/avatar_core.wasm',root),new URL('avatars/avatar_core.wasm',output));
console.log('Built examples/avatar_gallery.html (serve ui-kit over HTTP)');
