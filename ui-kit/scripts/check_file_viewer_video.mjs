#!/usr/bin/env node
/**
 * AfFileViewer `video` kind (ui-primitives chat, backlog 0031): a run's video
 * output previews in the shared viewer instead of being download-only
 * (AbstractCode's Files rail) or a local <video> (Observer, Flow).
 * Mutation-checked: dropping the kind, or rendering it without a host URL, turns this red.
 */
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

const here = dirname(fileURLToPath(import.meta.url));
const { AfFileViewer, fileViewerKind, fileViewerNeedsText } = await import(join(here, "..", "dist", "index.js"));
let failures = 0;
const check = (name, cond, detail) => {
  if (!cond) {
    failures += 1;
    console.error(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`);
  }
};

for (const name of ["clip.mp4", "clip.webm", "clip.mov", "clip.m4v", "clip.ogv", "clip.mkv"]) check(`kind of ${name}`, fileViewerKind(name) === "video", fileViewerKind(name));
check("video by Content-Type", fileViewerKind("output", "video/mp4") === "video");
check("audio stays audio (weba, ogg)", fileViewerKind("a.weba") === "audio" && fileViewerKind("a.ogg") === "audio" && fileViewerKind("x", "audio/webm") === "audio");
check("video needs a URL, not text", fileViewerNeedsText("video") === false);
const html = renderToStaticMarkup(React.createElement(AfFileViewer, { name: "clip.mp4", nowMs: 0, status: "ready", url: "blob:http://x/v" }));
check("video renders with controls from the host URL", /<video class="af-file-viewer__image af-file-viewer__video" src="blob:http:\/\/x\/v" controls="" playsinline="" preload="metadata" aria-label="clip.mp4">/.test(html), html);
check("data-kind=video", html.includes('data-kind="video"'));
const none = renderToStaticMarkup(React.createElement(AfFileViewer, { name: "clip.mp4", nowMs: 0, status: "ready" }));
check("no URL: no player, the no-preview note", !none.includes("<video") && none.includes("No preview"), none);

if (failures) {
  console.error(`check_file_viewer_video: ${failures} failure(s)`);
  process.exit(1);
}
console.log("check_file_viewer_video: OK (video kind by extension and Content-Type, player from the host URL, no URL = no player)");
