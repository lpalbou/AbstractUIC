// Release-audit probe: where does @abstractframework/app-server actually
// resolve from when observer's package.json is installed in isolation?
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";

const here = path.dirname(new URL(import.meta.url).pathname);
const link = path.join(here, "node_modules", "@abstractframework", "app-server");
console.log("local link         :", fs.readlinkSync(link));
console.log("local link target  :", path.resolve(path.dirname(link), fs.readlinkSync(link)));
console.log("local link resolves:", fs.existsSync(link) ? "YES" : "NO — DANGLING");

const require = createRequire(import.meta.url);
try {
  console.log("node resolves to   :", require.resolve("@abstractframework/app-server"));
} catch (e) {
  console.log("node resolve FAILED:", e.code);
}
