import assert from 'node:assert/strict';
import { avatarResolution, avatarFrameInterval } from '../dist/avatar_quality.js';

for (const quality of ['economy', 'balanced', 'high']) {
  for (const size of [.1, 1, 96, 128, 192, 512, 4096]) {
    for (const ratio of [.5, 1, 2, 3, 8, NaN, Infinity]) {
      const pixels = avatarResolution(size, ratio, quality);
      assert(Number.isInteger(pixels) && pixels >= 1 && pixels <= 512);
    }
  }
  assert(avatarFrameInterval(quality, 'ready', false) > avatarFrameInterval(quality, 'speaking', false));
  assert.equal(avatarFrameInterval(quality, 'ready', true), avatarFrameInterval(quality, 'speaking', false));
  assert(avatarFrameInterval(quality, 'speaking', false) >= 1000 / 30);
}
assert(avatarResolution(192, 3, 'high') > avatarResolution(192, 3, 'economy'));
assert(avatarFrameInterval('high', 'speaking', false) < avatarFrameInterval('economy', 'speaking', false));
for (const size of [0, -1, NaN, Infinity, 4097]) assert.throws(() => avatarResolution(size, 2, 'balanced'));
for (const quality of ['unknown', '__proto__', 'constructor']) {
  assert.throws(() => avatarResolution(128, 2, quality));
  assert.throws(() => avatarFrameInterval(quality, 'ready', false));
}
console.log('Avatar presentation budgets: finite bounded dimensions, quality tradeoffs, idle/active cadence, invalid input rejection passed');
