#!/usr/bin/env node
// Source-level pins for useGatewayVoice's STABILITY CONTRACT (entity c2584
// P0, 2026-07-16): fresh-per-render function identities + an unconditional
// idle setState turned the textbook consumer dep-array shape into a
// synchronous commit loop (measured 105,449 commits/10s — the operator's
// page-wide "blinking"). These pins fail if either half regresses.
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const src = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "../src/use_gateway_voice.ts"), "utf8");

let n = 0;
const ok = (name) => console.log(`  ok ${++n} — ${name}`);
const fail = (msg) => {
  console.error(`check_voice_hook: FAIL — ${msg}`);
  process.exit(1);
};

// 1) Every returned function must have a stable identity (useCallback).
for (const fn of ["stop_tts", "toggle_tts", "start_voice_ptt_recording", "stop_voice_ptt_recording", "stop_tts_source", "apply_tts_playback", "apply_recording"]) {
  const re = new RegExp(`const ${fn} = useCallback`);
  if (!re.test(src)) fail(`${fn} is not wrapped in useCallback — fresh identity per render makes every dep-array consumer a loop risk`);
}
ok("all returned + helper functions are useCallback-stable");

// 2) Playback state writes must go through the shallow-equal guard: the ONLY
// raw set_tts_playback( call is the guard's own functional write.
const rawPlaybackWrites = [...src.matchAll(/set_tts_playback\(/g)].length;
if (rawPlaybackWrites !== 1) fail(`expected exactly 1 set_tts_playback( call (the guard's functional write), found ${rawPlaybackWrites} — unguarded writes schedule renders for unchanged state`);
if (!src.includes("prev.key === next.key && prev.status === next.status ? prev : next")) fail("the playback write guard (idle→idle no-op) is missing");
ok("playback writes route through the shallow-equal guard (idle stop is a no-op)");

// 3) Recording writes: same single-write-path rule.
const rawRecWrites = [...src.matchAll(/set_voice_ptt_recording\(/g)].length;
if (rawRecWrites !== 1) fail(`expected exactly 1 set_voice_ptt_recording( call (apply_recording's), found ${rawRecWrites}`);
ok("recording writes route through apply_recording");

// 4) Stable callbacks must read live state through ref twins, never render
// closures (a frozen closure over tts_playback would read stale state).
for (const marker of ["tts_playback_ref.current", "voice_ptt_recording_ref.current", "voice_ptt_supported_ref.current", "opts_ref.current.tts"]) {
  if (!src.includes(marker)) fail(`missing ref-twin read: ${marker}`);
}
ok("stable callbacks read state through ref twins");

console.log("check_voice_hook: 4 pins green");
