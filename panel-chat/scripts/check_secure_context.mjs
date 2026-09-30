// Plain http from another machine (LAN, Tailscale) is not a secure context: the
// browser withholds crypto.randomUUID and navigator.clipboard. Run after
// `npm run build`: node scripts/check_secure_context.mjs
import assert from "node:assert/strict";
import { WorkflowSessionController } from "../dist/workflow_runtime.js";
import { copyText } from "../dist/utils.js";

const V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const realCrypto = globalThis.crypto;

// 1) command ids are v4 UUIDs without crypto.randomUUID (getRandomValues only).
Object.defineProperty(globalThis, "crypto", { value: { getRandomValues: (a) => realCrypto.getRandomValues(a) }, configurable: true, writable: true });
const newCommandId = WorkflowSessionController.prototype.newCommandId;
assert.equal(typeof newCommandId, "function", "WorkflowSessionController.newCommandId exists");
const ids = Array.from({ length: 10000 }, () => newCommandId.call({}));
assert.ok(ids.every((x) => V4.test(x)), `non-v4 command id without randomUUID: ${ids.find((x) => !V4.test(x))}`);
assert.equal(new Set(ids).size, ids.length, "10000 command ids are distinct");
Object.defineProperty(globalThis, "crypto", { value: realCrypto, configurable: true, writable: true });

// 2) copyText without navigator.clipboard uses execCommand and reports its result.
let execResult = true;
const calls = [];
const saved = { navigator: Object.getOwnPropertyDescriptor(globalThis, "navigator"), document: globalThis.document };
Object.defineProperty(globalThis, "navigator", { value: {}, configurable: true, writable: true });
globalThis.document = {
  body: { appendChild() {}, removeChild() {} },
  createElement: () => ({ value: "", style: {}, select() {} }),
  execCommand: (cmd) => { calls.push(cmd); return execResult; },
};
assert.equal(await copyText("hello"), true, "execCommand copy succeeded -> true");
execResult = false;
assert.equal(await copyText("hello"), false, "execCommand copy refused -> false (the UI says Copy failed)");
assert.deepEqual(calls, ["copy", "copy"]);
if (saved.navigator) Object.defineProperty(globalThis, "navigator", saved.navigator);
else delete globalThis.navigator;
globalThis.document = saved.document;

console.log("check_secure_context: ok (10000 v4 command ids without randomUUID; copyText reports the execCommand result)");
