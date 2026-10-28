#!/usr/bin/env node
/**
 * Read-aloud button of a chat message (operator QA (h), 2026-10-28; AbstractUIC 0.8.3), each
 * pinned so removing the fix is red:
 *  A. the spinner shows ONLY while the first audio is generated ("loading"); once audio plays the
 *     button is Pause (no spinner), paused it is Play, idle the speaker;
 *  B. the speaker and copy buttons are always visible: no rule of panel_chat.css or the generated
 *     transcript.css hides `.pc-chat-header-actions` (opacity 0, visibility hidden, display none),
 *     on hover-capable devices included.
 * Run after `npm run build`.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

const here = dirname(fileURLToPath(import.meta.url));
const pc = await import(join(here, "..", "dist", "index.js"));
const { ChatMessageCard, speakButtonView } = pc;
let failures = 0;
let checks = 0;
const check = (name, cond, detail) => {
  checks += 1;
  if (!cond) {
    failures += 1;
    console.error(`  FAIL ${name}${detail !== undefined ? ` — ${typeof detail === "string" ? detail : JSON.stringify(detail)}` : ""}`);
  }
};

// A. The rendered button for each state a host reports.
const message = { id: "m1", role: "assistant", content: "The sea is wide." };
const render = (state) =>
  renderToStaticMarkup(
    React.createElement(ChatMessageCard, { message, onSpeakToggle: () => {}, getSpeakState: () => state }),
  );
const button = (html) => (html.match(/<button[^>]*data-speak-state="[^"]*"[^>]*>[\s\S]*?<\/button>/) || [""])[0];
const expected = {
  loading: { label: "Generating audio…", spinner: true, mark: 'd="M21 12a9 9 0 1 1-3.3-6.9"' },
  playing: { label: "Pause", spinner: false, mark: '<rect x="6" y="4"' },
  paused: { label: "Resume", spinner: false, mark: 'd="M7 4.5v15' },
  idle: { label: "Speak (TTS)", spinner: false, mark: 'd="M11 5L6 9H2v6h4l5 4V5z"' },
};
for (const [state, want] of Object.entries(expected)) {
  const html = button(render(state));
  check(`A ${state}: the button renders`, Boolean(html), render(state).slice(0, 200));
  check(`A ${state}: labeled "${want.label}"`, html.includes(`aria-label="${want.label}"`), html.slice(0, 160));
  check(`A ${state}: spinner ${want.spinner ? "shown" : "absent"}`, html.includes("pc-chat-speak-spinner") === want.spinner, html);
  check(`A ${state}: its icon`, html.includes(want.mark), html);
}
const view = speakButtonView;
check("A playing never spins", view("playing").spinning === false && view("playing").icon === "pause");
check("A paused shows Play", view("paused").icon === "play");
check("A only loading spins", ["idle", "playing", "paused"].every((s) => !view(s).spinning) && view("loading").spinning);
// The spinner is not the play/pause icon re-used: a different icon key per state.
check("A loading and playing are different icons", view("loading").icon !== view("playing").icon);

// B. Always visible.
const hides = (css) => {
  const out = [];
  const re = /([^{}]*\.pc-chat-(?:header-actions|icon-btn)[^{}]*)\{([^}]*)\}/g;
  let m;
  while ((m = re.exec(css))) {
    if (/opacity\s*:\s*(?:0*\.0+|0+(?:\.0*)?)(?![.\d])\s*(?:!important)?\s*(?:;|$)|visibility\s*:\s*hidden|display\s*:\s*none/.test(m[2])) out.push(`${m[1].trim()} { ${m[2].trim()} }`);
  }
  return out;
};
for (const file of ["src/panel_chat.css", "transcript.css"]) {
  const css = readFileSync(join(here, "..", file), "utf8");
  check(`B ${file}: no rule hides the speaker/copy buttons`, hides(css).length === 0, hides(css));
  check(`B ${file}: the actions rule exists`, /\.pc-chat-header-actions\s*\{/.test(css));
}
// The copy button renders next to the speaker in every state.
check("B copy button rendered", render("playing").includes('aria-label="Copy message"'));

if (failures) {
  console.error(`check_voice_playback: ${failures}/${checks} FAILED`);
  process.exit(1);
}
console.log(`check_voice_playback: ${checks} checks green`);
