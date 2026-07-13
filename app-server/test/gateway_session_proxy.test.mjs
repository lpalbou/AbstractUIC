import assert from "node:assert/strict";
import * as http from "node:http";
import { createGatewaySessionProxy, normalizeGatewayUrl } from "../src/index.js";

/** Minimal stub gateway implementing login/logout/me + an echo API route. */
function startStubGateway() {
  const server = http.createServer((req, res) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      const send = (status, obj, headers) => {
        res.writeHead(status, { "Content-Type": "application/json", ...(headers || {}) });
        res.end(JSON.stringify(obj));
      };
      if (req.url === "/api/gateway/session/login" && req.method === "POST") {
        const body = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
        if (body.token !== "good-token") return send(401, { detail: "bad token" });
        return send(
          200,
          { session: { session_id: "sess-1", csrf_token: "csrf-1" }, principal: { user_id: body.user_id } },
          { "Set-Cookie": ["abstractgateway_session=sess-1; Path=/; HttpOnly", "abstractgateway_csrf=csrf-1; Path=/"] }
        );
      }
      if (req.url === "/api/gateway/me") {
        if (req.headers["x-abstractgateway-session"] !== "sess-1") return send(401, { detail: "no session" });
        return send(200, { ok: true, principal: { user_id: "admin" } });
      }
      if (req.url === "/api/gateway/session/logout") return send(200, { ok: true });
      if (req.url === "/api/gateway/setcookie") {
        return send(200, { ok: true }, { "Set-Cookie": "gateway_leak=1; Path=/" });
      }
      if (req.url === "/api/gateway/stream") {
        res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" });
        res.write("data: one\n\n");
        setTimeout(() => {
          res.write("data: two\n\n");
          res.end();
        }, 120);
        return;
      }
      if (req.url?.startsWith("/api/gateway/echo")) {
        return send(200, {
          method: req.method,
          session: req.headers["x-abstractgateway-session"] || null,
          csrf: req.headers["x-abstractgateway-csrf"] || null,
          authorization: req.headers.authorization || null,
          cookie: req.headers.cookie || null,
        });
      }
      send(404, { detail: "not found" });
    });
  });
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve(server)));
}

function startAppServer(proxy) {
  const server = http.createServer((req, res) => {
    // Test hook: the server binds to 127.0.0.1, so the real socket peer is
    // always loopback. To exercise the non-loopback SSRF gate deterministically,
    // an `x-test-peer` header spoofs the transport peer address the proxy
    // reads (req.socket.remoteAddress) — simulating a LAN client.
    const spoofPeer = req.headers["x-test-peer"];
    if (spoofPeer) {
      Object.defineProperty(req.socket, "remoteAddress", { value: String(spoofPeer), configurable: true });
    }
    const pathname = new URL(req.url, "http://local").pathname;
    if (proxy.handle(req, res, pathname)) return;
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end("static");
  });
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve(server)));
}

async function call(port, path, opts = {}) {
  const res = await fetch(`http://127.0.0.1:${port}${path}`, { redirect: "manual", ...opts });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  return { status: res.status, json, headers: res.headers };
}

function cookieHeaderFrom(setCookies) {
  return setCookies.map((c) => c.split(";")[0]).join("; ");
}

let failures = 0;
function check(name, cond, detail) {
  if (cond) return;
  failures += 1;
  console.error(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`);
}

const gw = await startStubGateway();
const gwPort = gw.address().port;
const proxy = createGatewaySessionProxy({ appId: "testapp", defaultGatewayUrl: `http://127.0.0.1:${gwPort}` });
const app = await startAppServer(proxy);
const appPort = app.address().port;

// -------------------------------------------------------------- URL cleanup
check("normalizeGatewayUrl strips quotes + slashes", normalizeGatewayUrl('"http://x:1/"') === "http://x:1");

// ----------------------------------------------------------- probe (no session)
{
  const r = await call(appPort, "/api/connection/gateway");
  check("probe without session: 200 + has_session=false", r.status === 200 && r.json.has_session === false);
  check("probe reports the pinned gateway url", r.json.gateway_url === `http://127.0.0.1:${gwPort}`);
}

// ------------------------------------------------------------ proxied call unauthenticated
{
  const r = await call(appPort, "/api/gateway/echo");
  check("proxy without session: 401", r.status === 401);
}

// ----------------------------------------------------------------- sign in
let cookieHeader = "";
{
  const bad = await call(appPort, "/api/connection/gateway", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ gateway_user_id: "admin", gateway_token: "wrong" }),
  });
  check("bad token: non-200 + no cookies", bad.status === 401 && !bad.headers.get("set-cookie"));

  const ok = await call(appPort, "/api/connection/gateway", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ gateway_user_id: "admin", gateway_token: "good-token", persist: true }),
  });
  check("good token: 200 + ok", ok.status === 200 && ok.json.ok === true);
  const setCookies = ok.headers.getSetCookie ? ok.headers.getSetCookie() : [ok.headers.get("set-cookie")];
  check("three first-party cookies set", setCookies.length === 3);
  const sessionCookie = setCookies.find((c) => c.startsWith("testapp_gateway_session="));
  const csrfCookie = setCookies.find((c) => c.startsWith("testapp_gateway_csrf="));
  check("session cookie is HttpOnly", /HttpOnly/i.test(sessionCookie || ""));
  check("csrf cookie is JS-readable (no HttpOnly)", csrfCookie && !/HttpOnly/i.test(csrfCookie));
  check("persist=true sets Max-Age", /Max-Age=2592000/.test(sessionCookie || ""));
  cookieHeader = cookieHeaderFrom(setCookies);
}

// --------------------------------------------------- probe with session (sign-in-once)
{
  const r = await call(appPort, "/api/connection/gateway", { headers: { Cookie: cookieHeader } });
  check("probe with session: ok=true + principal", r.status === 200 && r.json.ok === true && r.json.gateway?.principal?.user_id === "admin");
}

// ------------------------------------------- proxied GET: session attached, secrets stripped
{
  const r = await call(appPort, "/api/gateway/echo", {
    headers: { Cookie: cookieHeader, Authorization: "Bearer client-supplied-must-strip" },
  });
  check("proxied GET reaches gateway with server-held session", r.status === 200 && r.json.session === "sess-1");
  check("client Authorization STRIPPED", r.json.authorization === null);
  check("browser cookies never reach the gateway", r.json.cookie === null);
}

// -------------------------------------------------- mutating call: CSRF enforced
{
  const noCsrf = await call(appPort, "/api/gateway/echo", { method: "POST", headers: { Cookie: cookieHeader } });
  check("mutating without CSRF: 403 csrf_required", noCsrf.status === 403 && noCsrf.json.reason_code === "csrf_required");

  const appHeader = await call(appPort, "/api/gateway/echo", {
    method: "POST",
    headers: { Cookie: cookieHeader, "x-testapp-csrf": "csrf-1" },
  });
  check("mutating with app CSRF header: forwarded + gateway csrf attached", appHeader.status === 200 && appHeader.json.csrf === "csrf-1");

  const canonical = await call(appPort, "/api/gateway/echo", {
    method: "POST",
    headers: { Cookie: cookieHeader, "x-abstract-csrf": "csrf-1" },
  });
  check("canonical x-abstract-csrf accepted too", canonical.status === 200 && canonical.json.csrf === "csrf-1");
}

// ----------------------------------------------- URL pinning (browser cannot redirect)
{
  // Dev posture: a genuine LOOPBACK peer may point the cookie at another
  // loopback gateway (the cookie URL is honored). Points at the stub itself
  // so the proxied call still succeeds.
  const loopbackCookie = cookieHeader.replace(
    /testapp_gateway_url=[^;]+/,
    `testapp_gateway_url=${encodeURIComponent(`http://127.0.0.1:${gwPort}`)}`
  );
  const devOk = await call(appPort, "/api/gateway/echo", { headers: { Cookie: loopbackCookie } });
  check("loopback peer honors cookie gateway URL (dev posture)", devOk.status === 200 && devOk.json?.session === "sess-1");

  // SSRF GATE (entity c1768): a NON-loopback peer that spoofs `Host: localhost`
  // must NOT unlock the cookie-supplied gateway URL — the proxy pins to the
  // server default and never relays to the attacker origin. The peer address
  // is the connection's real source (unforgeable); the Host header is not
  // consulted for this decision.
  const attack = await call(appPort, "/api/gateway/echo", {
    headers: {
      Cookie: cookieHeader.replace(/testapp_gateway_url=[^;]+/, "testapp_gateway_url=http%3A%2F%2Fevil%3A1"),
      Host: "localhost", // spoofed — must be ignored
      "x-test-peer": "192.168.1.50", // real LAN peer
    },
  });
  // Pinned to the (reachable) default stub, so the call succeeds with the
  // server session — proving the attacker URL was dropped, not relayed.
  check("non-loopback peer + spoofed Host: localhost → cookie URL IGNORED (SSRF gate)", attack.status === 200 && attack.json?.session === "sess-1");

  // POST gateway_url change from a non-loopback peer is refused outright.
  const attackPost = await call(appPort, "/api/connection/gateway", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-test-peer": "192.168.1.50", Host: "localhost" },
    body: JSON.stringify({ gateway_user_id: "admin", gateway_token: "good-token", gateway_url: "http://evil:1" }),
  });
  check("non-loopback peer cannot POST a remote gateway_url (403)", attackPost.status === 403);
}

// ------------------------------------------------------------------ sign out
{
  const r = await call(appPort, "/api/connection/gateway", { method: "DELETE", headers: { Cookie: cookieHeader } });
  check("sign out: 200", r.status === 200 && r.json.ok === true);
  const setCookies = r.headers.getSetCookie ? r.headers.getSetCookie() : [r.headers.get("set-cookie")];
  check("cookies cleared (Max-Age=0 ×3)", setCookies.length === 3 && setCookies.every((c) => /Max-Age=0/.test(c)));
}

// ------------------------------------------------------------- non-API passthrough
{
  const r = await call(appPort, "/index.html");
  check("non-API requests fall through to the host app", r.status === 200);
}

// -------------------------------------------- adversary finds (2026-07-12)
{
  check("normalize vectors", ["'http://x'", '"\\"http://x\\""', "http://x//"].every((v) => normalizeGatewayUrl(v).startsWith("http://x")));

  // Re-sign-in for the remaining legs (cookies were cleared above).
  const ok = await call(appPort, "/api/connection/gateway", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ gateway_user_id: "admin", gateway_token: "good-token" }),
  });
  const setCookies = ok.headers.getSetCookie ? ok.headers.getSetCookie() : [ok.headers.get("set-cookie")];
  check("persist absent: no Max-Age on session cookie", !/Max-Age/.test(setCookies.find((c) => c.startsWith("testapp_gateway_session=")) || "Max-Age"));
  cookieHeader = cookieHeaderFrom(setCookies);

  // Secure flag rides x-forwarded-proto=https.
  const sec = await call(appPort, "/api/connection/gateway", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-forwarded-proto": "https" },
    body: JSON.stringify({ gateway_user_id: "admin", gateway_token: "good-token" }),
  });
  const secCookies = sec.headers.getSetCookie ? sec.headers.getSetCookie() : [sec.headers.get("set-cookie")];
  check("x-forwarded-proto https => Secure cookies", secCookies.every((c) => /; Secure/.test(c)));

  // Gateway Set-Cookie on a proxied API response must NOT reach the browser.
  const echoed = await call(appPort, "/api/gateway/setcookie", { headers: { Cookie: cookieHeader } });
  check("proxied Set-Cookie stripped", echoed.status === 200 && !echoed.headers.get("set-cookie"));

  // SSE/chunked passthrough: chunks arrive, no content-length, right type.
  const sse = await fetch(`http://127.0.0.1:${appPort}/api/gateway/stream`, { headers: { Cookie: cookieHeader } });
  check("SSE content-type preserved", (sse.headers.get("content-type") || "").includes("text/event-stream"));
  const reader = sse.body.getReader();
  let received = "";
  for (let i = 0; i < 4 && !received.includes("data: two"); i += 1) {
    const { value, done } = await reader.read();
    if (done) break;
    received += Buffer.from(value).toString("utf8");
  }
  check("SSE chunks stream through the proxy", received.includes("data: one") && received.includes("data: two"));
  reader.cancel().catch(() => {});

  // Per-app trust-proxy env derived from appId (P1-1 parity): with it set,
  // x-forwarded-host drives the hostname gate.
  process.env.TESTAPP_TRUST_PROXY_HEADERS = "1";
  const p2 = createGatewaySessionProxy({ appId: "testapp", defaultGatewayUrl: `http://127.0.0.1:${gwPort}` });
  const fakeReq = { headers: { "x-forwarded-host": "app.example.com", host: "127.0.0.1" } };
  const sess = p2.browserSession(fakeReq);
  check("per-app TRUST_PROXY env honored (gate reads x-forwarded-host)", sess.gatewayUrl === `http://127.0.0.1:${gwPort}`);
  delete process.env.TESTAPP_TRUST_PROXY_HEADERS;

  check("bad appId refused", (() => { try { createGatewaySessionProxy({ appId: "bad app!" }); return false; } catch { return true; } })());
}

gw.close();
app.close();

if (failures > 0) {
  console.error(`\ngateway_session_proxy: ${failures} failure(s)`);
  process.exit(1);
}
console.log("gateway_session_proxy: OK (probe, sign-in/out, cookie flags, CSRF, strip, pinning, passthrough)");
