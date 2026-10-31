import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { AvatarRenderer, avatarDesigns } from "../dist/avatar_renderer.js";
const source = await readFile(new URL("../src/avatars/avatar_core.wasm", import.meta.url));
const palette = { background: [9,11,22,0], warm: [107,227,204,255], eye: [173,166,255,255], shadow: [33,27,63,255], highlight: [237,242,255,255], muted: [90,109,146,255] };
let image;
const canvas = { getContext: () => ({ createImageData: (w,h) => ({ data: new Uint8ClampedArray(w*h*4) }), putImageData: (value) => { image = Buffer.from(value.data); } }) };
const renderer = await AvatarRenderer.create(canvas, { width: 96, source, palette });
const failures = [];
try {
  for (const design of await avatarDesigns(source)) for (const pose of ["listening", "speaking"]) {
    renderer.draw(design.id, pose, .05, 1.25); const quiet = image;
    renderer.draw(design.id, pose, .9, 1.25);
    if (quiet.equals(image)) failures.push(`${design.id}/${pose}`);
  }
  assert.deepEqual(failures, [], "Every voice pose must respond to measured amplitude, even without supplied frequency bands");
  console.log("All shared avatar Listening/Speaking frames respond to scalar audio amplitude");
} finally { renderer.dispose(); }
