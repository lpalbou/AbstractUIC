import assert from 'node:assert/strict';
import { avatarResolution, avatarFrameInterval } from '../dist/avatar_quality.js';

for (const quality of ['economy', 'balanced', 'high']) {
  for (const size of [.1, 1, 96, 128, 192, 512, 4096]) {
    for (const ratio of [.5, 1, 2, 3, 8, NaN, Infinity]) {
      const pixels = avatarResolution(size, ratio, quality);
      assert(Number.isInteger(pixels) && pixels >= 1 && pixels <= 512);
    }
  }
  // Economy (grids of previews) idles slower; a portrait (balanced, high) never does: a resting
  // Ready or Waiting avatar moves as smoothly as a speaking one (no 6 fps stutter in avatar views).
  for (const idle of ['ready', 'waiting']) {
    if (quality === 'economy') assert(avatarFrameInterval(quality, idle, false) > avatarFrameInterval(quality, 'speaking', false));
    else assert.equal(avatarFrameInterval(quality, idle, false), avatarFrameInterval(quality, 'speaking', false), `${quality} ${idle} cadence`);
  }
  assert.equal(avatarFrameInterval(quality, 'ready', true), avatarFrameInterval(quality, 'speaking', false));
  assert(avatarFrameInterval(quality, 'speaking', false) >= 1000 / 30);
}
assert(avatarResolution(192, 3, 'high') > avatarResolution(192, 3, 'economy'));
assert(avatarFrameInterval('high', 'speaking', false) < avatarFrameInterval('economy', 'speaking', false));
assert(avatarFrameInterval('balanced', 'ready', false) <= 1000 / 24, 'the default quality rests at 24 fps or more');
assert(avatarFrameInterval('high', 'waiting', false) <= 1000 / 30, 'high quality waits at 30 fps');
for (const size of [0, -1, NaN, Infinity, 4097]) assert.throws(() => avatarResolution(size, 2, 'balanced'));
for (const quality of ['unknown', '__proto__', 'constructor']) {
  assert.throws(() => avatarResolution(128, 2, quality));
  assert.throws(() => avatarFrameInterval(quality, 'ready', false));
}
console.log('Avatar presentation budgets: finite bounded dimensions, quality tradeoffs, smooth portrait idle and economy idle cadence, invalid input rejection passed');
