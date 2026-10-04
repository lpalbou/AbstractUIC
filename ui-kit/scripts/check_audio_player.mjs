#!/usr/bin/env node
/**
 * ui-kit 0.7.0: AfAudioPlayer (the shared waveform player) and the audio kind
 * of AfFileViewer. Pure helpers are called directly; components render with
 * react-dom/server over the compiled dist. Mutation-checked: removing the
 * audio kind, the waveform or the seek slider turns this red.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const kit = await import(join(root, "dist", "index.js"));
const h = React.createElement;

let failures = 0;
let checks = 0;
function check(name, cond, detail) {
  checks += 1;
  if (cond) return;
  failures += 1;
  console.error(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`);
}
const eq = (name, got, want) => check(name, JSON.stringify(got) === JSON.stringify(want), `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);

const { AfAudioPlayer, AUDIO_WAVEFORM_BARS, audioPeaks, audioSeekTime, formatAudioTime, AfFileViewer, fileViewerKind, fileViewerNeedsText } = kit;
for (const [name, fn] of Object.entries({ AfAudioPlayer, audioPeaks, audioSeekTime, formatAudioTime })) check(`export ${name}`, typeof fn === "function", typeof fn);
check("bars constant", AUDIO_WAVEFORM_BARS === 72, String(AUDIO_WAVEFORM_BARS));

// --- peaks
eq("peaks: empty input -> zeros", audioPeaks([], 4), [0, 0, 0, 0]);
eq("peaks: silence -> zeros", audioPeaks(new Float32Array(100), 4), [0, 0, 0, 0]);
eq("peaks: normalised abs max per bar", audioPeaks([0.1, -0.2, 0.5, -1, 0.25, 0.25, 0, 0], 4), [0.2, 1, 0.25, 0]);
eq("peaks: fewer samples than bars", audioPeaks([0.5, -1], 4).length, 4);
check("peaks: deterministic", JSON.stringify(audioPeaks([0.3, 0.9, -0.4], 3)) === JSON.stringify(audioPeaks([0.3, 0.9, -0.4], 3)));
eq("peaks: default bar count", audioPeaks(new Float32Array(1000)).length, 72);

// --- time + seek
eq("time 7s", formatAudioTime(7.9), "0:07");
eq("time 63s", formatAudioTime(63), "1:03");
eq("time hours", formatAudioTime(3729), "1:02:09");
eq("time unknown", formatAudioTime(NaN), "--:--");
eq("time null", formatAudioTime(null), "--:--");
eq("seek middle", audioSeekTime(50, 200, 60), 15);
eq("seek clamps left", audioSeekTime(-5, 200, 60), 0);
eq("seek clamps right", audioSeekTime(500, 200, 60), 60);
eq("seek no duration", audioSeekTime(50, 200, 0), 0);

// --- player markup
{
  const html = renderToStaticMarkup(h(AfAudioPlayer, { src: "blob:x", name: "voice.wav", peaks: [0, 0.5, 1, 0.25] }));
  check("player: hidden audio element with src", /<audio[^>]*src="blob:x"/.test(html), html);
  check("player: play button", html.includes('data-action="play-audio"') && html.includes('aria-label="Play Audio voice.wav"'));
  check("player: seek slider", html.includes('role="slider"') && html.includes('aria-label="Seek in Audio voice.wav"') && html.includes('tabindex="0"'));
  check("player: one bar per peak", (html.match(/class="af-audio__bar/g) || []).length === 4, html);
  check("player: decoded waveform flag", html.includes('data-waveform="decoded"'));
  check("player: time label", html.includes("0:00 / --:--"));
  const flat = renderToStaticMarkup(h(AfAudioPlayer, { src: "blob:y" }));
  check("player: flat bars before decode", (flat.match(/class="af-audio__bar/g) || []).length === 72 && flat.includes('data-waveform="flat"'));
}

// --- file viewer audio kind
for (const [name, type] of [["a.mp3", ""], ["b.wav", ""], ["c.ogg", ""], ["d.m4a", ""], ["e.flac", ""], ["f.opus", ""], ["clip", "audio/mpeg"], ["x.bin", "audio/wav; codecs=1"]]) {
  eq(`kind ${name} ${type}`, fileViewerKind(name, type), "audio");
}
check("audio is not a text kind", fileViewerNeedsText("audio") === false);
eq("json stays json", fileViewerKind("data.json"), "json");
eq("ts stays code", fileViewerKind("main.ts"), "code");
{
  const html = renderToStaticMarkup(h(AfFileViewer, { name: "speech.wav", nowMs: 0, status: "ready", url: "blob:z" }));
  check("viewer: audio body is the kit player", html.includes('data-kind="audio"') && html.includes('class="af-audio"') && html.includes('src="blob:z"'), html);
  const none = renderToStaticMarkup(h(AfFileViewer, { name: "speech.wav", nowMs: 0, status: "ready" }));
  check("viewer: audio without url says no preview", none.includes("No preview for this file type"));
  const js = renderToStaticMarkup(h(AfFileViewer, { name: "d.json", nowMs: 0, status: "ready", text: '{"a":1}' }));
  check("viewer: JSON preview is the kit code viewer", js.includes('class="af-code') && js.includes("&quot;a&quot;"), js);
}

// --- css ships
const css = readFileSync(join(root, "src", "theme.css"), "utf8");
check("css: the player never overflows its box (border-box)", /\.af-audio \{[^}]*box-sizing: border-box/.test(css));
for (const cls of [".af-audio", ".af-audio__play", ".af-audio__wave", ".af-audio__bar--played", ".af-audio__time"]) check(`css ${cls}`, css.includes(`${cls} {`) || css.includes(`${cls},`));

if (failures) {
  console.error(`check_audio_player: ${failures}/${checks} FAILED`);
  process.exit(1);
}
console.log(`check_audio_player: ${checks} checks passed`);
