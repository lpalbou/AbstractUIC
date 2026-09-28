// Same-origin paths are RELATIVE and come from ONE helper (src/gateway_paths.ts);
// every requesting default uses it. Run after `npm run build`.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as kit from "../dist/index.js";

const { GATEWAY_API_PATH, GATEWAY_CONNECTION_PATH, gatewayApiPath, joinBaseUrl } = kit;
assert.equal(GATEWAY_API_PATH, "api/gateway");
assert.equal(GATEWAY_CONNECTION_PATH, "api/connection/gateway");
assert.equal(gatewayApiPath("runs/r1"), "api/gateway/runs/r1");
assert.equal(gatewayApiPath(""), "api/gateway");
assert.throws(() => gatewayApiPath("/runs"), /relative to the gateway API/, "a rooted route is refused, never silently re-rooted");
assert.equal(joinBaseUrl("", "api/gateway/x"), "api/gateway/x", "no base: relative to the page");
assert.equal(joinBaseUrl(undefined, "api/x"), "api/x");
assert.equal(joinBaseUrl("http://127.0.0.1:18896", "api/x"), "http://127.0.0.1:18896/api/x");
assert.equal(joinBaseUrl("https://host/gw//", "api/x"), "https://host/gw/api/x", "prefix kept, trailing slashes folded");
assert.throws(() => joinBaseUrl("http://h", "/api/x"), /relative path/);
const { gatewayResourcePath } = kit;
assert.equal(gatewayResourcePath("/api/gateway/runs/r1/ledger"), "api/gateway/runs/r1/ledger", "server's gateway-rooted URL → the app-relative path");
assert.equal(gatewayResourcePath("/api/gateway/runs/r1/artifacts/a/content?x=1"), "api/gateway/runs/r1/artifacts/a/content?x=1");
for (const bad of ["https://evil.example/api/gateway/x", "//evil.example/api/gateway/x", "api/gateway/x", "/api/gatewayx/y", "/api/gateway/", "/assets/x.js", ""])
  assert.throws(() => gatewayResourcePath(bad), /Not a gateway API path/, `refused: ${bad || "(empty)"}`);
const at = (p) => new URL(p, "https://host/apps/observer/").href;
assert.equal(at(GATEWAY_CONNECTION_PATH), "https://host/apps/observer/api/connection/gateway", "resolves under the app's base path");

// Every requesting default goes through the helper: record what fetch is asked for.
const seen = [];
globalThis.fetch = async (url, init) => {
  seen.push([String(url), init?.method || "GET"]);
  return new Response(JSON.stringify({ ok: true, gateway_url: "", has_session: false, accepted: true, duplicate: false, seq: 1 }), { status: 200, headers: { "content-type": "application/json" } });
};
await kit.fetchGatewayConnection();
await kit.signInGateway({ gateway_user_id: "u", gateway_token: "t" });
await kit.signOutGateway();
await kit.submitSteer({ runId: "r1", guidance: "g", csrfToken: "c" });
assert.deepEqual(seen, [
  ["api/connection/gateway", "GET"],
  ["api/connection/gateway", "POST"],
  ["api/connection/gateway", "DELETE"],
  ["api/gateway/commands", "POST"],
], "connection + steer defaults are relative");
seen.length = 0;
await kit.fetchGatewayConnection("/custom/connection");
await kit.submitSteer({ runId: "r1", guidance: "g", csrfToken: "c", commandsPath: "https://gw.example/api/gateway/commands" });
assert.deepEqual(seen.map((s) => s[0]), ["/custom/connection", "https://gw.example/api/gateway/commands"], "explicit host overrides are used as given");

// The modal and the hook default to the same constant (source pins: their defaults are read inside effects).
for (const f of ["gateway_connect_modal.js", "use_gateway_connection.js"]) {
  const src = readFileSync(new URL(`../dist/${f}`, import.meta.url), "utf8");
  assert.ok(/connectionPath \|\| GATEWAY_CONNECTION_PATH/.test(src), `${f}: connectionPath defaults to GATEWAY_CONNECTION_PATH`);
}
console.log("check_gateway_paths: OK");
