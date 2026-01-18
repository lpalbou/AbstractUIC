import test from "node:test";
import assert from "node:assert/strict";

import { HistoryBuffer } from "../src/history_buffer.js";

test("HistoryBuffer keeps last N values", () => {
  const b = new HistoryBuffer(3);
  b.push(1);
  b.push(2);
  b.push(3);
  b.push(4);

  assert.deepEqual(b.values(), [2, 3, 4]);
  assert.equal(b.last(), 4);
});

test("HistoryBuffer normalizes maxSize and truncates on resize", () => {
  const b = new HistoryBuffer(5);
  b.push(10);
  b.push(11);
  b.push(12);
  b.push(13);
  b.push(14);
  b.setMaxSize(2);

  assert.equal(b.maxSize, 2);
  assert.deepEqual(b.values(), [13, 14]);
});

test("HistoryBuffer stores null for non-finite values", () => {
  const b = new HistoryBuffer(3);
  b.push("nope");
  b.push(NaN);
  b.push(Infinity);
  assert.deepEqual(b.values(), [null, null, null]);
});

