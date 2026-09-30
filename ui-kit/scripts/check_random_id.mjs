#!/usr/bin/env node
/**
 * randomId() checks (DESIGN §11: non-secure contexts withhold crypto.randomUUID).
 *
 * 1. With crypto.randomUUID present, randomId() returns what it returns.
 * 2. With randomUUID stubbed AWAY (or throwing, as over plain http), randomId()
 *    still returns an RFC 4122 v4 UUID built from getRandomValues: format,
 *    version nibble 4, variant 10xx, and 2000 calls all distinct.
 * 3. uuidV4FromBytes forces the version/variant bits on all-0x00 and all-0xff input.
 * 4. With no Web Crypto at all it throws (never a Math.random fallback).
 * 5. The kit's own id sources (automations client default, mintUuid) work
 *    without randomUUID, and no kit source calls crypto.randomUUID directly
 *    outside random_id.ts.
 */
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const kit = await import(join(root, "dist", "index.js"));
const { randomId, uuidV4FromBytes, createAutomationsClient } = kit;
const { mintUuid } = await import(join(root, "dist", "automations", "panel_core.js"));

let failures = 0;
let checks = 0;
function check(name, cond, detail) {
  checks += 1;
  if (cond) return;
  failures += 1;
  console.error(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`);
}

const V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const realCrypto = globalThis.crypto;
function withCrypto(value, fn) {
  const desc = Object.getOwnPropertyDescriptor(globalThis, "crypto");
  Object.defineProperty(globalThis, "crypto", { value, configurable: true, writable: true });
  try {
    return fn();
  } finally {
    if (desc) Object.defineProperty(globalThis, "crypto", desc);
    else delete globalThis.crypto;
  }
}
const getRandomValues = (a) => realCrypto.getRandomValues(a);

// 1) native path
withCrypto({ randomUUID: () => "11111111-2222-4333-8444-555555555555", getRandomValues }, () => {
  check("uses crypto.randomUUID when present", randomId() === "11111111-2222-4333-8444-555555555555");
});
check("real crypto -> v4 format", V4.test(randomId()), randomId());

// 2) fallback: randomUUID absent
withCrypto({ getRandomValues }, () => {
  const ids = Array.from({ length: 2000 }, () => randomId());
  const bad = ids.filter((x) => !V4.test(x));
  check("randomUUID absent -> every id is an RFC 4122 v4 UUID", bad.length === 0, bad.slice(0, 3).join(", "));
  check("randomUUID absent -> 2000 ids all distinct", new Set(ids).size === ids.length);
});
// fallback: randomUUID throws (insecure context)
withCrypto({ randomUUID: () => { throw new Error("insecure"); }, getRandomValues }, () => {
  check("randomUUID throwing -> getRandomValues fallback", V4.test(randomId()));
});

// 3) the bits
check("all-zero bytes -> version 4 / variant 8", uuidV4FromBytes(new Uint8Array(16)) === "00000000-0000-4000-8000-000000000000", uuidV4FromBytes(new Uint8Array(16)));
check("all-ff bytes -> version 4 / variant b", uuidV4FromBytes(new Uint8Array(16).fill(255)) === "ffffffff-ffff-4fff-bfff-ffffffffffff", uuidV4FromBytes(new Uint8Array(16).fill(255)));

// 4) no Web Crypto at all
withCrypto(undefined, () => {
  let msg = "";
  try {
    randomId();
  } catch (e) {
    msg = String(e && e.message);
  }
  check("no Web Crypto -> throws with the cause", /getRandomValues/.test(msg), msg);
});

// 5) the kit's own id sources
{
  const desc = Object.getOwnPropertyDescriptor(globalThis, "crypto");
  Object.defineProperty(globalThis, "crypto", { value: { getRandomValues }, configurable: true, writable: true });
  check("mintUuid works without randomUUID", V4.test(mintUuid()));
  let body = null;
  const fetch = async (_url, init) => {
    body = JSON.parse(init.body);
    return new Response(JSON.stringify({ command_id: body.command_id, accepted: true, duplicate: false, seq: 1 }), { status: 200, headers: { "content-type": "application/json" } });
  };
  await createAutomationsClient({ fetch }).sendAutomationCommand("a1", { type: "automation.pause" });
  check("automations client default command_id works without randomUUID", V4.test(body?.command_id || ""), JSON.stringify(body));
  Object.defineProperty(globalThis, "crypto", desc);
}
const offenders = [];
const walk = (d) => {
  for (const e of readdirSync(d, { withFileTypes: true })) {
    const p = join(d, e.name);
    if (e.isDirectory()) walk(p);
    else if (/\.tsx?$/.test(e.name) && e.name !== "random_id.ts" && /\brandomUUID\s*\(/.test(readFileSync(p, "utf8"))) offenders.push(p.slice(root.length + 1));
  }
};
walk(join(root, "src"));
walk(join(root, "islands"));
check("no kit source calls crypto.randomUUID() directly (use randomId)", offenders.length === 0, offenders.join(", "));

if (failures) {
  console.error(`check_random_id: ${failures}/${checks} FAILED`);
  process.exit(1);
}
console.log(`check_random_id: ${checks} checks green`);
