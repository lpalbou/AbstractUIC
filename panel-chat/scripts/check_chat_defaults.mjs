#!/usr/bin/env node
/**
 * The shared chat default (panel-chat 0.9.1, operator 2026-11-07: "we should have a default
 * styling with our abstractuic/ so normally things should appear in the same way, unless
 * overridden"), each pinned so reverting it is red:
 *  A. the compact message is the DEFAULT: the web Assistant's recipe (no avatar tile, small
 *     name, the time in the UI font — never monospace —, 16/18 padding, 20 px corners with the
 *     7 px corner cut, the user's message a frameless tinted bubble, no outer paragraph
 *     margins in the body);
 *  B. WorkingDots: three rising dots (the desktop Assistant's thinking dots), static under
 *     reduced motion;
 *  C. WorkflowChat `working` puts the dots at the transcript's tail, never while an interaction
 *     waits on the person, never when the host says nothing.
 * Run after `npm run build`.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

const here = dirname(fileURLToPath(import.meta.url));
const pc = await import(join(here, "..", "dist", "index.js"));
const { WorkflowChat, WorkingDots } = pc;
const css = readFileSync(join(here, "..", "src", "panel_chat.css"), "utf8");
let failures = 0;
let checks = 0;
const check = (name, cond, detail) => {
  checks += 1;
  if (!cond) {
    failures += 1;
    console.error(`  FAIL ${name}${detail !== undefined ? ` — ${typeof detail === "string" ? detail : JSON.stringify(detail)}` : ""}`);
  }
};
/** The declarations of the FIRST rule whose selector is exactly `selector`. */
const rule = (selector) => {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const m = css.match(new RegExp(`(?:^|\\n)${escaped}\\s*\\{([^}]*)\\}`));
  return m ? m[1] : "";
};
const decl = (selector, prop) => {
  const m = rule(selector).match(new RegExp(`(?:^|;|\\s)${prop}\\s*:\\s*([^;]+);`));
  return m ? m[1].trim() : null;
};

// A. the compact message is the default
check("A the time is in the UI font, never monospace", decl(".pc-chat-time", "font-family") === "inherit", rule(".pc-chat-time"));
check("A the time is the small size", decl(".pc-chat-time", "font-size") === "var(--font-size-xxs, 10px)");
check("A no avatar tile by default", decl(".pc-chat-avatar", "display") === "none", rule(".pc-chat-avatar"));
check("A the avatar rule does not turn itself back on", !/display:\s*flex/.test(rule(".pc-chat-avatar")));
check("A a small name", decl(".pc-chat-role", "font-size") === "var(--font-size-sm, 12px)" && decl(".pc-chat-role", "font-weight") === "600");
check("A a tight header", decl(".pc-chat-header", "gap") === "7px" && decl(".pc-chat-header", "margin-bottom") === "9px");
check("A the card's padding and corners", decl(".pc-chat-item", "padding") === "16px 18px" && decl(".pc-chat-item", "border-radius") === "20px");
check("A the card sits on the card surface", decl(".pc-chat-item", "background") === "var(--bg-card, var(--ui-surface-1, rgba(0, 0, 0, 0.18)))");
check("A the user's message: a frameless tinted bubble, 85% wide, corner cut bottom-right",
  decl(".pc-chat-item--user", "border-color") === "transparent" && decl(".pc-chat-item--user", "max-width") === "min(85%, var(--reading-max, 86ch))" && decl(".pc-chat-item--user", "border-bottom-right-radius") === "7px");
check("A the assistant's message keeps the neutral card (no accent tint), corner cut bottom-left",
  decl(".pc-chat-item--assistant", "background") === null && decl(".pc-chat-item--assistant", "border-bottom-left-radius") === "7px");
check("A the body's first and last blocks add no margin inside the card",
  /\.pc-chat-item \.pc-chat-body \.pc-md > :first-child \{ margin-top: 0; \}/.test(css) && /\.pc-chat-item \.pc-chat-body \.pc-md > :last-child \{ margin-bottom: 0; \}/.test(css));
const slice = readFileSync(join(here, "..", "transcript.css"), "utf8");
check("A the generated transcript slice carries the same default", /\.pc-chat-time \{[^}]*font-family: inherit;/.test(slice) && /\.pc-chat-avatar \{[^}]*display: none;/.test(slice));

// B. WorkingDots
const dots = renderToStaticMarkup(React.createElement(WorkingDots, {}));
check("B three dots, one accessible image named Working",
  dots === '<span class="pc-working-dots" role="img" aria-label="Working"><span class="pc-working-dots__dot"></span><span class="pc-working-dots__dot"></span><span class="pc-working-dots__dot"></span></span>', dots);
check("B a host label", renderToStaticMarkup(React.createElement(WorkingDots, { label: "Starting…" })).includes('aria-label="Starting…"'));
check("B the dots rise in turn", /animation:\s*pc-working-dot\s/.test(rule(".pc-working-dots__dot")) && /@keyframes pc-working-dot\s*\{[\s\S]*?translateY\(-4\.5px\)/.test(css)
  && decl(".pc-working-dots__dot:nth-child(2)", "animation-delay") && decl(".pc-working-dots__dot:nth-child(3)", "animation-delay"));
check("B static under reduced motion", /@media \(prefers-reduced-motion: reduce\) \{\s*\.pc-working-dots__dot \{ animation: none; \}/.test(css));

// C. WorkflowChat working
const base = { messages: [{ id: "u1", role: "user", content: "Hello" }], draft: "", onDraftChange() {}, onSend() {} };
const html = (props) => renderToStaticMarkup(React.createElement(WorkflowChat, { ...base, ...props }));
const working = html({ busy: true, working: true });
check("C working: the dots at the transcript's tail, after the last message",
  /Hello[\s\S]*<div class="pc-chat-working"><span class="pc-working-dots" role="img" aria-label="Working">/.test(working), working.slice(0, 1200));
check("C the dots are inside the thread's scroll surface", /<div class="pc-chat-thread"[^>]*>[\s\S]*pc-chat-working[\s\S]*<\/div><\/div><\/div>/.test(working));
check("C the host's label reaches the dots", html({ busy: true, working: true, workingLabel: "Starting…" }).includes('aria-label="Starting…"'));
check("C not working: no dots", !html({ busy: true }).includes("pc-working-dots"));
const interaction = { kind: "question", id: "q1", prompt: "Which one?", choices: ["a", "b"], onAnswer() {} };
check("C an interaction waiting on the person: no dots", !html({ busy: true, working: true, interaction }).includes("pc-working-dots"));

console.log(failures ? `check_chat_defaults: ${failures}/${checks} FAILED` : `check_chat_defaults: ${checks} checks passed`);
process.exit(failures ? 1 : 0);
