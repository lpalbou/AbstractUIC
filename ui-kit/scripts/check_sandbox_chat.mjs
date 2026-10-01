#!/usr/bin/env node
// The console Sandbox chat island (round 3, DESIGN-v3 §8): panel-chat's
// thread + composer with the standard Attach control, attachment chips, a
// blocked notice for an unconfigured mode, inline generated media and Clear.
// Builds the islands entry as ESM (react external) and renders the island
// with react-dom/server; mountSandboxChat itself is pinned by check_islands.
import { build } from "esbuild";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

const kitDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const out = await build({
  entryPoints: [join(kitDir, "islands", "console_islands.tsx")],
  bundle: true, format: "esm", platform: "node", write: false, jsx: "automatic",
  external: ["react", "react-dom", "react/jsx-runtime", "react-dom/client"],
  define: { "process.env.NODE_ENV": '"production"', __KIT_VERSION__: '"check"' },
  alias: { "@abstractframework/ui-kit": join(kitDir, "src", "index.ts") },
});
const file = join(kitDir, "islands", "dist", "check-sandbox-chat.mjs");
mkdirSync(dirname(file), { recursive: true });
writeFileSync(file, out.outputFiles[0].text);
const mod = await import(pathToFileURL(file).href);
let failures = 0;
const check = (name, cond, detail) => { if (!cond) { failures += 1; console.error(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`); } };
const render = (props) => renderToStaticMarkup(React.createElement(mod.SandboxChatIsland, props));
check("SandboxChatIsland is exported", typeof mod.SandboxChatIsland === "function");
check("mountSandboxChat is exported", typeof mod.mountSandboxChat === "function");

const base = { messages: [], draft: "", onDraftChange() {}, onSend() {}, placeholder: "Ask a question." };
const empty = render({ ...base, onAttach() {}, onClear() {}, emptyText: "No messages yet — pick an output mode." });
check("panel-chat composer textarea", empty.includes('class="pc-composer__textarea"') && empty.includes('placeholder="Ask a question."'));
check("standard Attach control", empty.includes('aria-label="Attach file"') && empty.includes("pc-workflow-chat__icon-button"));
check("empty state text", empty.includes("No messages yet — pick an output mode."));
check("no Clear on an empty thread", !empty.includes('aria-label="Clear chat"'));
check("panel-chat thread surface", empty.includes("pc-chat-thread") && empty.includes("af-sandbox-chat"));
check("no mic without a transcribe callback", !empty.includes("Hold to dictate"));

const full = render({
  ...base, draft: "draw a cat", onAttach() {}, onClear() {}, onRemoveAttachment() {},
  attachments: [{ id: "a1", name: "cat.png" }, { id: "a2", name: "big.mov", status: "failed", message: "File exceeds the gateway's upload limit." }],
  messages: [
    { id: "u1", role: "user", content: "draw a cat" },
    { id: "r1", role: "assistant", title: "Image", content: "", media: [{ kind: "image", src: "blob:x/1", href: "/api/gateway/runs/r/artifacts/a/content", label: "Open image" }] },
  ],
});
check("attachment chips with remove", full.includes("cat.png") && full.includes('aria-label="Remove cat.png"'));
check("a failed upload says why", full.includes("File exceeds the gateway&#x27;s upload limit."));
check("generated image inline in the thread", full.includes('src="blob:x/1"') && full.includes("pc-chat-media__image"));
check("Clear once the thread has messages", full.includes('aria-label="Clear chat"'));

const blocked = render({ ...base, draft: "x", blockedNotice: "Image is not configured yet — configure it in Multimodal." });
check("blocked notice shown", blocked.includes("Image is not configured yet — configure it in Multimodal."));
check("blocked composer is disabled", /<textarea[^>]*disabled=""/.test(blocked));

if (failures) { console.error(`check_sandbox_chat: ${failures} failure(s)`); process.exit(1); }
console.log("check_sandbox_chat: OK (composer, Attach, chips + failure reason, inline media, blocked notice, Clear)");
