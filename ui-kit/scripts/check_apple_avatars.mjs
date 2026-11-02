import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { AppleAvatarEngine, APPLE_AVATARS } from "../dist/apple_avatar_engine.js";
const source = await readFile(new URL("../src/avatars/avatar_core.wasm", import.meta.url));
const poses = ["ready", "listening", "thinking", "working", "speaking", "waiting", "error"];
const palette = { background: [12,16,24,255], warm: [200,150,50,255], eye: [240,80,100,255], shadow: [40,50,65,255], highlight: [250,245,235,255], muted: [130,140,160,255] };
async function frame(design, pose, level = .6, time = 1) {
  let pixels;
  const canvas = { width: 0, height: 0, getContext() { return ctx; } };
  const ctx = { canvas, createImageData(w,h) { return { data: new Uint8ClampedArray(w*h*4) }; }, putImageData(image) { pixels = Buffer.from(image.data); } };
  const engine = new AppleAvatarEngine({ source, palette });
  try {
    await engine.draw(ctx, 96, design, pose, level, time, true);
    assert(pixels && pixels.some((v,i) => i%4===3 && v>0), `Visible shared frame ${design}/${pose}`);
    return pixels.toString("base64");
  } finally { engine.dispose(); }
}
for (const { id } of APPLE_AVATARS) {
  const states = await Promise.all(poses.map(pose => frame(id, pose)));
  assert.ok(new Set(states).size >= 4, `${id} distinguishes activity states`);
  assert.equal(await frame(id, "speaking"), await frame(id, "speaking"), "Deterministic preview");
  assert.notEqual(await frame(id, "working", 0, 1), await frame(id, "working", 0, 2), "Activity moves without invented audio");
  assert.equal(await frame(id, "speaking", 2), await frame(id, "speaking", 1), "Real levels clamp");
  assert.equal(await frame(id, "ready", 0), await frame(id, "ready", 1), "Ready ignores audio");
}
await assert.rejects(() => frame("unknown", "ready"));
await assert.rejects(() => frame("watch-halo", "ready", NaN));
console.log(`Apple compatibility adapters: ${APPLE_AVATARS.length} designs x ${poses.length} states use the shared AbstractAvatar generator; determinism, activity and bounds passed`);
