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

if (failures) { console.error(`check_chat_media: ${failures} failure(s)`); process.exit(1); }
console.log("check_chat_media: OK (media inline + link, unsafe/unknown refused, finished reasoning, per-message stats, pending label)");
