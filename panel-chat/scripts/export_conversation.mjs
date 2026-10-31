// Canonical compatibility artifact for clients awaiting a published panel-chat update.
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
const root = fileURLToPath(new URL("../", import.meta.url)),
  i = process.argv.indexOf("--out");
if (i < 0 || !process.argv[i + 1]) throw Error("Pass --out <directory>");
const out = resolve(process.argv[i + 1]);
mkdirSync(out, { recursive: true });
const hash = (b) => createHash("sha256").update(b).digest("hex");
const manifest = {
  schema_version: 1,
  owner: "@abstractframework/panel-chat",
  sources: {},
  artifacts: {},
};
const result = await build({
  absWorkingDir: root,
  entryPoints: ["dist/conversation.js"],
  bundle: true,
  write: false,
  metafile: true,
  format: "esm",
  target: "es2020",
  external: [
    "react",
    "react/*",
    "react-dom",
    "react-dom/*",
    "@abstractframework/ui-kit",
  ],
});
const write = (name, bytes) => {
  writeFileSync(resolve(out, name), bytes);
  manifest.artifacts[name] = hash(bytes);
};
write("conversation.js", result.outputFiles[0].contents);
for (const file of Object.keys(result.metafile.inputs)) {
  if (!file.startsWith("dist/"))
    throw Error("Conversation peers must remain external: " + file);
  manifest.sources[file] = hash(readFileSync(resolve(root, file)));
}
for (const file of readdirSync(resolve(root, "dist")).filter((f) =>
  f.endsWith(".d.ts"),
))
  write(file, readFileSync(resolve(root, "dist", file), "utf8").replace(/[ \t]+$/gm, ""));
const css = readFileSync(resolve(root, "src/panel_chat.css"));
write("conversation.css", css);
manifest.sources["src/panel_chat.css"] = hash(css);
writeFileSync(
  resolve(out, "provenance.json"),
  JSON.stringify(manifest, null, 2) + "\n",
);
console.log("Exported canonical conversation presenter");
