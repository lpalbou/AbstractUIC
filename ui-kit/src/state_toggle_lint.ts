/*
 * Guard for the state-toggle rule (docs/state-toggles.md): a persistent on/off
 * setting is an AfToggle labelled by the FEATURE, never a button whose label
 * flips between two verb phrases ("Email off" / "Email on", "Enable" /
 * "Disable", "Turn on" / "Turn off", "Pause" / "Resume").
 *
 * A source-text scan, run by the kit's own check and by every app's test gate
 * (`findVerbToggleLabels(source)` over its src). It flags a conditional
 * expression (`cond ? A : B`) whose two string branches are the SAME short
 * label with only the on/off verb swapped — the exact shape of a verb toggle.
 * State sentences ("Email is on for admin.") and single state words ("on" /
 * "off" in a status column) are not labels and pass.
 *
 * A genuine one-shot action that happens to flip (pausing a RUNNING run, a
 * transient panel) opts out on the same line with a reason:
 *   // state-toggle-lint: allow <reason>
 */

export type VerbToggleHit = { line: number; text: string; labels: [string, string] };

const PAIRS: Array<[RegExp, string]> = [
  [/\bturn (on|off)\b/gi, "turn ~"],
  [/\bswitch (on|off)\b/gi, "switch ~"],
  [/\b(enable|disable)\b/gi, "~able"],
  [/\b(enabled|disabled)\b/gi, "~abled"],
  [/\b(activate|deactivate)\b/gi, "~activate"],
  [/\b(pause|resume)\b/gi, "~pause"],
  [/\b(show|hide)\b/gi, "~show"],
  [/\b(on|off)\b/gi, "~on"],
];

const IMPERATIVE_START = /^(turn|switch|enable|disable|activate|deactivate|pause|resume)\b/i;
const ENDS_ON_OFF = /\b(on|off)$/i;
const ALLOW = /state-toggle-lint:\s*allow\b/;
// cond ? "A" : "B"   (quotes, apostrophes or backticks without interpolation)
const TERNARY = /\?\s*(["'`])((?:(?!\1)[^\\$\n]){1,60})\1\s*:\s*(["'`])((?:(?!\3)[^\\$\n]){1,60})\3/g;

function normalise(label: string): string {
  let s = label.trim().toLowerCase();
  for (const [re, token] of PAIRS) s = s.replace(re, token);
  return s;
}

function isVerbLabel(label: string): boolean {
  const s = label.trim().replace(/(\.\.\.|…)$/, "");
  // Labels are Capitalised or multi-word; a lowercase single word is an id ("pause").
  if (!/[A-Z]/.test(s) && !/\s/.test(s)) return false;
  if (!s || /[.!?:]$/.test(s)) return false; // a sentence, not a label
  const words = s.split(/\s+/);
  if (words.length > 4) return false;
  if (/\b(is|are|was|were|now)\b/i.test(s)) return false; // state description
  if (IMPERATIVE_START.test(s)) return true;
  return words.length >= 2 && ENDS_ON_OFF.test(s);
}

/** Every verb-toggle label pair in `source` (line numbers are 1-based). */
export function findVerbToggleLabels(source: string): VerbToggleHit[] {
  const hits: VerbToggleHit[] = [];
  const lines = String(source || "").split(/\r?\n/);
  lines.forEach((text, i) => {
    if (ALLOW.test(text)) return;
    TERNARY.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = TERNARY.exec(text))) {
      const a = m[2];
      const b = m[4];
      if (a.trim().toLowerCase() === b.trim().toLowerCase()) continue;
      if (!isVerbLabel(a) || !isVerbLabel(b)) continue;
      if (normalise(a) !== normalise(b)) continue;
      hits.push({ line: i + 1, text: text.trim(), labels: [a, b] });
    }
  });
  return hits;
}
