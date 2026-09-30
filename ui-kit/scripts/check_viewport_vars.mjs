#!/usr/bin/env node
/**
 * installViewportVars rule (kit round 3, reviewer A B1): a pinch-zoomed page
 * must never shrink the shell or report a keyboard; the keyboard at scale 1
 * must still yield its inset. Runs over the built dist (`npm run build` first).
 */
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const { viewportVarsFrom } = await import(join(here, "..", "dist", "responsive.js"));
let failures = 0;
const eq = (name, got, want) => {
  const ok = got.vvHeight === want.vvHeight && got.keyboardInset === want.keyboardInset;
  if (!ok) { failures += 1; console.error(`  FAIL ${name}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`); }
};
// iPhone 15 Pro portrait, layout viewport 852.
eq("no keyboard, scale 1", viewportVarsFrom(852, { height: 852, offsetTop: 0, scale: 1 }), { vvHeight: 852, keyboardInset: 0 });
eq("keyboard open, scale 1", viewportVarsFrom(852, { height: 516, offsetTop: 0, scale: 1 }), { vvHeight: 516, keyboardInset: 336 });
eq("keyboard open, visual viewport scrolled (offsetTop)", viewportVarsFrom(852, { height: 516, offsetTop: 120, scale: 1 }), { vvHeight: 516, keyboardInset: 216 });
eq("2x pinch, no keyboard (reviewer A: was inset 426)", viewportVarsFrom(852, { height: 426, offsetTop: 0, scale: 2 }), { vvHeight: 852, keyboardInset: 0 });
eq("2x pinch panned down (offsetTop)", viewportVarsFrom(852, { height: 426, offsetTop: 300, scale: 2 }), { vvHeight: 852, keyboardInset: 0 });
eq("iPad 1.5x pinch", viewportVarsFrom(1180, { height: 787, offsetTop: 0, scale: 1.5 }), { vvHeight: 1180, keyboardInset: 0 });
eq("sub-pixel scale noise treated as 1", viewportVarsFrom(852, { height: 852, offsetTop: 0, scale: 1.005 }), { vvHeight: 852, keyboardInset: 0 });
if (failures) { console.error(`check_viewport_vars: ${failures} failure(s)`); process.exit(1); }
console.log("check_viewport_vars: OK (7 cases: keyboard at scale 1 keeps its inset, pinch-zoom never shrinks the shell)");
