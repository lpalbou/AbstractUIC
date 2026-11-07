import {build} from 'esbuild';
import {mkdir,copyFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
const root=new URL('../',import.meta.url),output=new URL('examples/build/',root);
await mkdir(new URL('avatars/',output),{recursive:true});
await build({entryPoints:[fileURLToPath(new URL('examples/entity_cards.tsx',root))],bundle:true,format:'esm',outfile:fileURLToPath(new URL('entity_cards.js',output)),define:{'process.env.NODE_ENV':'"production"'}});
await copyFile(new URL('src/avatars/avatar_core.wasm',root),new URL('avatars/avatar_core.wasm',output));
console.log('Built examples/entity_cards.html (serve ui-kit over HTTP)');
