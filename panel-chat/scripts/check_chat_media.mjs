#!/usr/bin/env node
/**
 * ChatMessage media / finished reasoning / per-message stats / pending label
 * (round 3, sandbox lane: the gateway console's Sandbox renders generated
 * images, audio and video in the kit thread). Static markup over dist.
 */
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

const here = dirname(fileURLToPath(import.meta.url));
const { ChatMessageCard } = await import(join(here, "..", "dist", "chat_message_card.js"));
let failures = 0;
const check = (name, cond, detail) => { if (!cond) { failures += 1; console.error(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`); } };
const card = (message, props = {}) => renderToStaticMarkup(React.createElement(ChatMessageCard, { message, ...props }));

const media = card({
  id: "m1", role: "assistant", content: "", title: "Image",
  media: [
    { kind: "image", src: "blob:http://x/1", label: "Generated image", href: "/api/gateway/runs/r/artifacts/a/content" },
    { kind: "audio", src: "blob:http://x/2" },
    { kind: "video", src: "blob:http://x/3", label: "Clip" },
    { kind: "image", src: "javascript:alert(1)" },
    { kind: "pdf", src: "blob:http://x/4" },
  ],
  stats: [{ label: "3.2s" }],
});
check("image renders inline from the host src", media.includes('<img class="pc-chat-media__image" src="blob:http://x/1" alt="Generated image"'), media);
check("raw-file link beside the image", media.includes('href="/api/gateway/runs/r/artifacts/a/content"') && media.includes('target="_blank"'));
check("audio renders in the kit waveform player (ui-kit 0.7.0)", /<div class="af-audio pc-chat-media__audio"[^>]*><audio src="blob:http:\/\/x\/2"/.test(media) && media.includes('data-action="play-audio"') && media.includes('role="slider"'), media.slice(0, 400));
check("video renders with controls", /<video class="pc-chat-media__video" src="blob:http:\/\/x\/3" controls=""/.test(media), media);
check("javascript: sources are never rendered", !media.includes("javascript:"));
check("unknown media kinds are not rendered", !media.includes("x/4"));
check("a media-only message has no empty text body", !media.includes("pc-chat-body"));
check("message.stats render as chips", media.includes("3.2s") && media.includes("pc-chat-stat"));

const reasoning = card({ id: "m2", role: "assistant", content: "Answer.", reasoning: "Because." });
check("finished reasoning shows collapsed under Thinking", reasoning.includes("pc-chat-thinking") && reasoning.includes("Because.") && !reasoning.includes("<details open"));
check("no reasoning, no Thinking block", !card({ role: "assistant", content: "x" }).includes("pc-chat-thinking"));

const pending = card({ id: "m3", role: "assistant", content: "", live: { callId: "c", reasoning: "", label: "generating image" } });
check("pending label replaces 'streaming'", pending.includes("generating image") && !pending.includes(">streaming<"), pending);
const streaming = card({ id: "m4", role: "assistant", content: "", live: { callId: "c", reasoning: "" } });
check("default pending label stays 'streaming'", streaming.includes("streaming"));
const propStats = card({ id: "m5", role: "assistant", content: "x", stats: [{ label: "own" }] }, { stats: [{ label: "prop" }] });
check("the card's stats prop wins over message.stats", propStats.includes("prop") && !propStats.includes(">own<"));


// --- ui-primitives (chat), backlog 0031: documents, STT transcripts, artifacts, video previews ---
{
  const { mount, find, byData } = await import(join(here, "hook_harness.mjs"));
  const pcAll = await import(join(here, "..", "dist", "index.js"));
  const { chatMediaFromArtifact, chatMediaForArtifacts, FileViewer, useWorkspaceFilePreview } = pcAll;

  // Audio transcript: the speech-to-text display every app lacked.
  const spoken = card({ id: "t1", role: "user", content: "", media: [{ kind: "audio", src: "blob:http://x/a", label: "Voice message", transcript: "  Book a table for two.  " }] });
  check("audio transcript renders as a collapsible caption", spoken.includes('<details class="pc-chat-media__transcript"><summary>Transcript</summary><p class="pc-chat-media__transcript-text">Book a table for two.</p></details>'), spoken);
  check("no transcript, no caption", !card({ role: "assistant", content: "", media: [{ kind: "audio", src: "blob:http://x/a" }] }).includes("pc-chat-media__transcript"));
  check("a transcript on an image is ignored", !card({ role: "assistant", content: "", media: [{ kind: "image", src: "blob:http://x/i", transcript: "x" }] }).includes("Transcript"));

  // Files: a compact row; nothing loads until opened.
  const pdf = { kind: "file", src: "blob:http://x/p", name: "report.pdf", contentType: "application/pdf", size: 2048, href: "/api/gateway/runs/r/artifacts/p/content" };
  const closed = card({ id: "f1", role: "assistant", content: "", media: [pdf] });
  check("file row with name, size and Open", closed.includes('data-file-kind="pdf"') && closed.includes(">report.pdf<") && closed.includes(">2.0 KiB<") && closed.includes('data-action="toggle-file" aria-expanded="false">Open<'), closed);
  check("a closed file loads nothing", !closed.includes("af-file-viewer") && !closed.includes("<object"));
  check("file raw link", closed.includes('href="/api/gateway/runs/r/artifacts/p/content"'));
  check("an unsafe file source with nothing else renders nothing", !card({ role: "assistant", content: "", media: [{ kind: "file", src: "javascript:alert(1)", name: "x.pdf" }] }).includes("pc-chat-media__item--file"));
  const opener = [];
  const withOpener = card({ id: "f2", role: "assistant", content: "", media: [pdf] }, { onOpenMedia: (item) => opener.push(item) });
  check("a host opener replaces the inline toggle", withOpener.includes('data-action="open-file"') && !withOpener.includes('data-action="toggle-file"'));
  // Drive the item through the harness: card → ChatMediaItem → ChatMediaFile.
  const openFile = (item, props = {}) => {
    const c = mount(ChatMessageCard, { message: { id: "h", role: "assistant", content: "", media: [item] }, ...props });
    const itemEl = find(c.tree, (n) => typeof n.type === "function" && n.props.item === item);
    const fileEl = mount(itemEl.type, itemEl.props).tree;
    return mount(fileEl.type, fileEl.props);
  };
  const f = openFile(pdf);
  byData(f.tree, "data-action", "toggle-file").props.onClick();
  f.render();
  const viewer = find(f.tree, (n) => n.type === FileViewer);
  check("Open shows the shared file viewer inline", Boolean(viewer) && viewer.props.kind === "pdf" && viewer.props.url === "blob:http://x/p" && viewer.props.status === "ready", viewer?.props);
  viewer.props.onClose();
  f.render();
  check("Close folds it again", !find(f.tree, (n) => n.type === FileViewer));
  const md = openFile({ kind: "file", src: "", name: "notes.md", text: "# Title" });
  byData(md.tree, "data-action", "toggle-file").props.onClick();
  md.render();
  const mdViewer = find(md.tree, (n) => n.type === FileViewer);
  check("a text file shows the host's text", mdViewer?.props.kind === "markdown" && mdViewer.props.text === "# Title" && mdViewer.props.url === undefined, mdViewer?.props);
  const noText = openFile({ kind: "file", src: "blob:http://x/c", name: "main.py" });
  byData(noText.tree, "data-action", "toggle-file").props.onClick();
  noText.render();
  const noTextViewer = find(noText.tree, (n) => n.type === FileViewer);
  check("a text file without text says so (never an empty viewer)", noTextViewer?.props.status === "error" && /No preview text/.test(noTextViewer.props.error), noTextViewer?.props);
  const viaHost = openFile(pdf, { onOpenMedia: (item) => opener.push(item) });
  byData(viaHost.tree, "data-action", "open-file").props.onClick();
  check("the host opener receives the item", opener.at(-1)?.name === "report.pdf" && opener.at(-1)?.src === "blob:http://x/p");
  // Review L2: the opener gets sanitized sources only.
  const evil = { kind: "file", src: "javascript:alert(1)", href: "/api/gateway/runs/r/artifacts/e/content", name: "e.pdf" };
  const viaEvil = openFile(evil, { onOpenMedia: (item) => opener.push(item) });
  byData(viaEvil.tree, "data-action", "open-file").props.onClick();
  check("the opener never receives an unsafe src", opener.at(-1)?.src === "" && opener.at(-1)?.href === "/api/gateway/runs/r/artifacts/e/content", opener.at(-1));

  // Review M1: a Markdown file follows the chat's image policy (default "link").
  const tracker = { kind: "file", src: "", name: "r.md", text: "![x](https://tracker.example/p.png)" };
  const mdOpen = (props) => {
    const o = openFile(tracker, props);
    byData(o.tree, "data-action", "toggle-file").props.onClick();
    o.render();
    return renderToStaticMarkup(find(o.tree, (n) => n.type === FileViewer));
  };
  const linked = mdOpen({});
  check("an opened Markdown file does not load remote images by default", !/<img[^>]*src="https:\/\/tracker\.example/.test(linked) && linked.includes('href="https://tracker.example/p.png"'), linked);
  check("the chat's own image policy reaches the file", /<img[^>]*src="https:\/\/tracker\.example\/p\.png"/.test(mdOpen({ images: "inline" })));
  check("the host Markdown renderer reaches the file", mdOpen({ renderMarkdown: () => React.createElement("i", { id: "host-md" }) }).includes('id="host-md"'));

  // Review M2: a document is never a dead end.
  const mdArtifact = chatMediaFromArtifact({ src: "blob:http://x/md", contentType: "text/markdown", name: "report.md" });
  check("a resolved document links its raw file", mdArtifact.kind === "file" && mdArtifact.href === "blob:http://x/md", mdArtifact);
  check("a resolved document carries the host's text", chatMediaFromArtifact({ src: "blob:x", contentType: "text/markdown", name: "a.md", text: "# A" }).text === "# A");
  const noHref = card({ id: "nh", role: "assistant", content: "", media: [{ kind: "file", src: "blob:http://x/c", name: "main.py" }] });
  check("a file without href still shows its raw link (the host's src)", noHref.includes('href="blob:http://x/c"') && noHref.includes(">Raw file<"), noHref);
  // Review H1: TypeScript is code even when served as video/mp2t.
  check("a .ts artifact served as video/mp2t is a document, not a video", chatMediaFromArtifact({ src: "blob:t", contentType: "video/mp2t", name: "app.ts" }).kind === "file");

  // Resolved artifacts → media kinds from the gateway's content_type.
  const kinds = [["image/png", "a.png"], ["audio/mpeg", "a.mp3"], ["video/mp4", "a.mp4"], ["application/pdf", "a.pdf"], ["image/svg+xml", "a.svg"], ["text/markdown", "a.md"]].map(([contentType, name]) => chatMediaFromArtifact({ src: "blob:x", contentType, name, size: 3 }).kind);
  check("artifact kinds: image/audio/video inline, the rest as files, SVG never rendered", JSON.stringify(kinds) === JSON.stringify(["image", "audio", "video", "file", "file", "file"]), kinds);
  const music = chatMediaFromArtifact({ src: "blob:m", contentType: "audio/wav", name: "song.wav" }, { transcript: "la la", label: "Generated music" });
  check("music rides on audio, with its transcript", music.kind === "audio" && music.transcript === "la la" && music.label === "Generated music");
  check("no transcript on a non-audio artifact", chatMediaFromArtifact({ src: "b", contentType: "image/png" }, { transcript: "x" }).transcript === undefined);
  const resolved = await chatMediaForArtifacts("run-1", ["a1", "a2"], async (runId, id) => ({ src: `blob:${runId}/${id}`, contentType: id === "a1" ? "image/png" : "application/json", name: `${id}.bin` }));
  check("artifact ids resolve in order with their ids", JSON.stringify(resolved.map((m) => [m.id, m.kind, m.src])) === JSON.stringify([["a1", "image", "blob:run-1/a1"], ["a2", "file", "blob:run-1/a2"]]), resolved);
  let rejected = false;
  await chatMediaForArtifacts("r", ["ok", "gone"], async (_r, id) => { if (id === "gone") throw new Error("404"); return { src: "b", contentType: "image/png" }; }).catch(() => (rejected = true));
  check("an unresolvable artifact is an error, not a silent gap", rejected);

  // Workspace previews: a video file loads as an object URL (was download-only).
  const fetchGateway = async () => new Response(new Blob([new Uint8Array(8)], { type: "video/mp4" }), { status: 200, headers: { "content-type": "video/mp4" } });
  // Hooks take positional args: wrap.
  const w = mount((p) => useWorkspaceFilePreview(p.fetchGateway, p.runId, p.entry), { fetchGateway, runId: "run-1", entry: { name: "clip.mp4", path: "out/clip.mp4", size_bytes: 8 } });
  await w.settle();
  check("a workspace video previews from an object URL", w.tree.status === "ready" && w.tree.kind === "video" && String(w.tree.url || "").startsWith("blob:"), w.tree);
  w.unmount();
}

if (failures) { console.error(`check_chat_media: ${failures} failure(s)`); process.exit(1); }
console.log("check_chat_media: OK (media inline + link, unsafe/unknown refused, finished reasoning, per-message stats, pending label; files in the shared viewer, STT transcript caption, artifact kinds, video previews)");
