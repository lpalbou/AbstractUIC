// Snapshot this canonical component for clients whose published ui-kit pin predates it.
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
const root = fileURLToPath(new URL("../", import.meta.url));
const index = process.argv.indexOf("--out");
if (index < 0 || !process.argv[index+1]) throw new Error("Pass --out <client snapshot directory>");
const out = resolve(process.argv[index+1]); mkdirSync(out, { recursive: true });
const hash = bytes => createHash("sha256").update(bytes).digest("hex");
const manifest = { schema_version: 1, owner: "@abstractframework/ui-kit", sources: {}, artifacts: {} };
const result = await build({ absWorkingDir: root, entryPoints: ["dist/session_cards.js"], bundle: true, write: false, metafile: true, format: "esm", target: "es2020", external: ["react", "react/*"] });
function write(name, bytes) { writeFileSync(resolve(out,name),bytes); manifest.artifacts[name]=hash(bytes); }
write("session_cards.js", result.outputFiles[0].contents);
// Clients with an older UI-kit pin also need the consumption-aware automation
// panel. Keep the public prop contract on their installed peer; implementation
// and its internal dependencies are compiled only from this canonical dist/.
const panel = await build({ absWorkingDir: root, entryPoints: ["dist/automations/AutomationPanel.js"], bundle: true, write: false, metafile: true, format: "esm", target: "es2020", external: ["react", "react/*", "react-dom", "react-dom/*"] });
write("automation_panel.js", panel.outputFiles[0].contents);
write("automation_panel.d.ts", 'export declare const AutomationPanel: typeof import("@abstractframework/ui-kit").AutomationPanel;\n');
for (const file of Object.keys(panel.metafile.inputs)) {
  if (!file.startsWith("dist/")) throw new Error("Unexpected automation panel dependency: " + file);
  manifest.sources[file]=hash(readFileSync(resolve(root,file)));
}
for (const name of ["session_cards", "session_card", "session_activity", "session_reads", "session_read_client", "automation_card"]) {
  const file=`dist/${name}.d.ts`, bytes=readFileSync(resolve(root,file));
  // Hosts already import the canonical wire types from their pinned UI kit.
  write(`${name}.d.ts`, bytes.toString().replace('"./automations/types.js"', '"@abstractframework/ui-kit"')); manifest.sources[file]=hash(bytes);
}
for (const file of Object.keys(result.metafile.inputs)) {
  if (dirname(resolve(root,file)) !== resolve(root,"dist")) throw new Error("Unexpected session component dependency");
  manifest.sources[file]=hash(readFileSync(resolve(root,file)));
}
const theme=readFileSync(resolve(root,"src/theme.css"),"utf8");
const start=theme.indexOf("/* Session facts are controlled by the host;");
const end=theme.indexOf("/* End shared session cards. */",start);
if(start<0 || end<0) throw new Error("Shared session card CSS boundary missing");
write("session_cards.css",theme.slice(start,end)); manifest.sources["src/theme.css"]=hash(theme);
writeFileSync(resolve(out,"provenance.json"),JSON.stringify(manifest,null,2)+"\n");
console.log("Exported canonical session cards and read-state helpers");
