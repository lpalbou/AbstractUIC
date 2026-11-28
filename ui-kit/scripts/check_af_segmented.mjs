/**
 * AfSegmented (ui-kit 0.9.31, spec E): one choice of 2 to 4 exclusive options.
 *  - markup: role=radiogroup, each option role=radio with aria-checked, the chosen one marked;
 *  - roving tabindex: ONE tab stop (the chosen option, else the first enabled one);
 *  - keyboard: arrows choose the previous / next ENABLED option (wrapping) and move focus there,
 *    Home / End the first / last; other keys do nothing;
 *  - a click on another option calls onChange once; on the chosen one, never; disabled never;
 *  - fewer than 2 or more than 4 options throws (a switch / a select instead);
 *  - theme.css carries the inset track, the raised chosen option and a focus ring.
 * renderToStaticMarkup over the compiled dist (no jsdom), like check_about.mjs.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

const here = dirname(fileURLToPath(import.meta.url));
const kit = await import(join(here, "..", "dist", "index.js"));
const { AfSegmented, afSegmentedMove, afSegmentedTabStop } = kit;

let failures = 0;
let checks = 0;
function check(name, cond, detail) {
  checks += 1;
  if (cond) return;
  failures += 1;
  console.error(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`);
}

const opts = [
  { value: "auto", label: "Run without asking" },
  { value: "ask", label: "Ask before each" },
  { value: "per_tool", label: "Choose per tool" },
];
const html = renderToStaticMarkup(React.createElement(AfSegmented, { options: opts, value: "ask", onChange() {}, ariaLabel: "Tools", action: "tool-choice" }));
check("a radiogroup named by its label", /^<div class="af-seg af-seg--fill" role="radiogroup" aria-label="Tools" data-action="tool-choice" data-count="3">/.test(html), html.slice(0, 160));
const radios = [...html.matchAll(/<button type="button" role="radio" class="([^"]+)" aria-checked="(true|false)" tabindex="(-?\d)"[^>]*data-value="([^"]+)"/g)];
check("one radio per option, in order", radios.map((m) => m[4]).join() === "auto,ask,per_tool", radios.map((m) => m[4]).join());
check("the chosen option is aria-checked and marked", radios.map((m) => m[2]).join() === "false,true,false" && radios[1][1].includes("is-checked") && !radios[0][1].includes("is-checked"));
check("roving tabindex: the chosen option is the one tab stop", radios.map((m) => m[3]).join() === "-1,0,-1");
check("the chosen option carries a non-colour cue (a check mark)", /data-value="ask"[^>]*><svg[^>]*class="[^"]*af-seg__check/.test(html));
const none = renderToStaticMarkup(React.createElement(AfSegmented, { options: [{ ...opts[0], disabled: true }, opts[1]], value: null, onChange() {}, ariaLabel: "x" }));
check("nothing chosen: the first ENABLED option is the tab stop", /data-value="ask"/.test(none.match(/<button[^>]*tabindex="0"[^>]*>/)?.[0] || "") && (none.match(/tabindex="0"/g) || []).length === 1);
check("afSegmentedTabStop: chosen, else first enabled, else none", afSegmentedTabStop(opts, "per_tool") === 2 && afSegmentedTabStop([{ ...opts[0], disabled: true }, opts[1]], null) === 1 && afSegmentedTabStop(opts, "ask", true) === -1);

// Keyboard rule (pure).
const all = [true, true, true];
check("ArrowRight / ArrowDown: next", afSegmentedMove(all, 0, "ArrowRight") === 1 && afSegmentedMove(all, 1, "ArrowDown") === 2);
check("ArrowRight wraps to the first", afSegmentedMove(all, 2, "ArrowRight") === 0);
check("ArrowLeft / ArrowUp: previous, wrapping to the last", afSegmentedMove(all, 1, "ArrowLeft") === 0 && afSegmentedMove(all, 0, "ArrowUp") === 2);
check("arrows skip a disabled option", afSegmentedMove([true, false, true], 0, "ArrowRight") === 2 && afSegmentedMove([true, false, true], 2, "ArrowLeft") === 0);
check("Home / End: first / last enabled", afSegmentedMove([false, true, true, false], 2, "Home") === 1 && afSegmentedMove([false, true, true, false], 1, "End") === 2);
check("other keys do nothing", afSegmentedMove(all, 0, "a") === null && afSegmentedMove(all, 0, "Tab") === null);

// Handlers: call the component as a function (hook-free) and drive its buttons.
const tree = (props) => AfSegmented({ options: opts, value: "ask", ariaLabel: "Tools", ...props });
const buttons = (t) => React.Children.toArray(t.props.children);
{
  const got = [];
  const b = buttons(tree({ onChange: (v) => got.push(v) }));
  b[2].props.onClick();
  b[1].props.onClick();
  check("a click on another option calls onChange once with its value; the chosen one does nothing", got.join() === "per_tool", got.join());
  const focused = [];
  const group = { querySelectorAll: () => [0, 1, 2].map((i) => ({ focus: () => focused.push(i) })) };
  let prevented = 0;
  b[1].props.onKeyDown({ key: "ArrowRight", preventDefault: () => (prevented += 1), currentTarget: { parentElement: group } });
  check("ArrowRight on the chosen option chooses the next and moves focus there", got.join() === "per_tool,per_tool" && focused.join() === "2" && prevented === 1, `${got.join()} / ${focused.join()}`);
  b[1].props.onKeyDown({ key: "x", preventDefault: () => (prevented += 1), currentTarget: { parentElement: group } });
  check("an unrelated key is left to the page", prevented === 1 && got.length === 2);
}
{
  const got = [];
  const b = buttons(tree({ onChange: (v) => got.push(v), disabled: true }));
  b[0].props.onClick();
  check("a disabled group never calls onChange (and its options are disabled)", got.length === 0 && b.every((x) => x.props.disabled === true));
}
for (const n of [1, 5]) {
  let threw = false;
  try {
    tree({ options: Array.from({ length: n }, (_, i) => ({ value: `v${i}`, label: `V${i}` })), onChange() {} });
  } catch {
    threw = true;
  }
  check(`${n} options throws (a switch or a select is the control)`, threw);
}

// theme.css: the look that makes it a choice, not a button.
const css = readFileSync(join(here, "..", "src", "theme.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
const rule = (sel) => (css.match(new RegExp(`(?:^|\\})\\s*${sel.replace(/[.]/g, "\\.")}\\s*\\{([^}]*)\\}`)) || [])[1] || "";
check("the track is inset (a field's surface and border)", /background:\s*var\(--ui-surface-3\)/.test(rule(".af-seg")) && /border:\s*1px solid var\(--ui-border-2\)/.test(rule(".af-seg")));
check("the chosen option is tinted with the accent", /background:\s*color-mix\(in srgb, var\(--accent\)/.test(rule(".af-seg__opt.is-checked")));
check("a visible focus ring in --info (never the accent: red in several themes)", /outline:\s*2px solid var\(--info\)/.test(rule(".af-seg__opt:focus-visible")));
{
  // A narrow form (the phone): the check mark stays beside its label on one line (operator report:
  // "Run without asking" wrapped with its mark above the text).
  const narrow = css.match(/@container af-edit \(max-width: 519\.98px\) \{([\s\S]*?)\n\}/)?.[1] ?? "";
  const opt = narrow.match(/\.af-seg__opt \{([^}]*)\}/)?.[1] ?? "";
  check("narrow: an option never wraps its mark above its label", /flex-wrap:\s*nowrap/.test(opt) && !/flex-wrap:\s*wrap/.test(narrow), opt);
  check("narrow: the label is a step smaller (xs)", /\.af-seg__opt > \.af-seg__label \{\s*font-size:\s*var\(--font-size-xs\)/.test(narrow));
}
check("44 px on a coarse pointer", /@media \(pointer: coarse\)\s*\{[^@]*\.af-seg__opt[^{]*\{\s*min-height:\s*var\(--tap-min\)/.test(css));

if (failures) {
  console.error(`check_af_segmented: ${failures}/${checks} FAILED`);
  process.exit(1);
}
console.log(`check_af_segmented: OK (${checks} checks)`);
