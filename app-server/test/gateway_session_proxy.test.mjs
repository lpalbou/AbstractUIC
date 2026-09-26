import assert from "node:assert/strict";
import * as http from "node:http";
import { createGatewaySessionProxy, normalizeGatewayUrl } from "../src/index.js";

/** X-Forwarded-For the stub gateway saw on its last login / me / logout call. */
const gatewaySawXff = { login: undefined, me: undefined, logout: undefined };
/** X-AbstractFramework-App-Proxy the stub gateway saw, per route. */
const gatewaySawMarker = {};

/** Minimal stub gateway implementing login/logout/me + an echo API route. */
function startStubGateway() {
  const server = http.createServer((req, res) => {
    gatewaySawMarker[req.url.split("?")[0]] = req.headers["x-abstractframework-app-proxy"] ?? null;
    if (req.url === "/api/gateway/session/login") gatewaySawXff.login = req.headers["x-forwarded-for"] ?? null;
    if (req.url === "/api/gateway/me") gatewaySawXff.me = req.headers["x-forwarded-for"] ?? null;
    if (req.url === "/api/gateway/session/logout") gatewaySawXff.logout = req.headers["x-forwarded-for"] ?? null;
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
          xff: req.headers["x-forwarded-for"] ?? null,
          xffCount: req.rawHeaders.filter((h, i) => i % 2 === 0 && h.toLowerCase() === "x-forwarded-for").length,
          forwarded: req.headers.forwarded ?? null,
          xRealIp: req.headers["x-real-ip"] ?? null,
          marker: req.headers["x-abstractframework-app-proxy"] ?? null,
          markerCount: req.rawHeaders.filter((h, i) => i % 2 === 0 && h.toLowerCase() === "x-abstractframework-app-proxy").length,
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

// ------------------------- X-Forwarded-For = socket peer, OVERWRITTEN (contract A-2)
// Runs before any x-test-peer spoof so the first request's peer is the real
// loopback socket.
{
  gatewaySawXff.login = gatewaySawXff.me = undefined;
  const probe = await call(appPort, "/api/connection/gateway", {
    headers: { Cookie: cookieHeader, "X-Forwarded-For": "203.0.113.9" },
  });
  check("probe (/me) carries the socket peer as X-Forwarded-For", probe.status === 200 && gatewaySawXff.me === "127.0.0.1", String(gatewaySawXff.me));

  const local = await call(appPort, "/api/gateway/echo", {
    headers: { Cookie: cookieHeader, "X-Forwarded-For": "203.0.113.9, 198.51.100.4", Forwarded: "for=203.0.113.9", "X-Real-IP": "203.0.113.9" },
  });
  check("real loopback peer: spoofed XFF replaced by 127.0.0.1", local.status === 200 && local.json.xff === "127.0.0.1", JSON.stringify(local.json));
  check("exactly one X-Forwarded-For reaches the gateway", local.json.xffCount === 1, String(local.json.xffCount));
  check("client Forwarded / X-Real-IP stripped", local.json.forwarded === null && local.json.xRealIp === null);

  const lan = await call(appPort, "/api/gateway/echo", {
    headers: { Cookie: cookieHeader, "X-Forwarded-For": "127.0.0.1", "x-test-peer": "192.168.1.50" },
  });
  check("LAN peer spoofing XFF=127.0.0.1: gateway sees 192.168.1.50", lan.status === 200 && lan.json.xff === "192.168.1.50", JSON.stringify(lan.json));

  const mapped = await call(appPort, "/api/gateway/echo", {
    headers: { Cookie: cookieHeader, "x-test-peer": "::ffff:10.0.0.7" },
  });
  check("IPv4-mapped IPv6 peer unwrapped", mapped.json?.xff === "10.0.0.7", JSON.stringify(mapped.json));

  const v6 = await call(appPort, "/api/gateway/echo", {
    headers: { Cookie: cookieHeader, "x-test-peer": "fe80::1", "X-Forwarded-For": "::1" },
  });
  check("IPv6 peer forwarded as-is, spoofed ::1 dropped", v6.json?.xff === "fe80::1", JSON.stringify(v6.json));

  const login = await call(appPort, "/api/connection/gateway", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Forwarded-For": "127.0.0.1", "x-test-peer": "192.168.1.51" },
    body: JSON.stringify({ gateway_user_id: "admin", gateway_token: "good-token" }),
  });
  check("sign-in call carries the socket peer as X-Forwarded-For", login.status === 200 && gatewaySawXff.login === "192.168.1.51", String(gatewaySawXff.login));

  // App-proxy marker (REVIEW/09): always this proxy's appId, client value dropped.
  const spoofMarker = await call(appPort, "/api/gateway/echo", {
    headers: { Cookie: cookieHeader, "X-AbstractFramework-App-Proxy": "assistant" },
  });
  check("proxied call: marker = appId, spoofed value dropped", spoofMarker.json?.marker === "testapp" && spoofMarker.json?.markerCount === 1, JSON.stringify(spoofMarker.json));
  const noMarker = await call(appPort, "/api/gateway/echo", { headers: { Cookie: cookieHeader } });
  check("proxied call without client marker still carries it", noMarker.json?.marker === "testapp");
  check("status probe (/me) carries the marker", gatewaySawMarker["/api/gateway/me"] === "testapp", String(gatewaySawMarker["/api/gateway/me"]));
  check("sign-in carries the marker", gatewaySawMarker["/api/gateway/session/login"] === "testapp", String(gatewaySawMarker["/api/gateway/session/login"]));

  // Unknown socket peer: refused, never forwarded without the header.
  const fakeReq = { method: "GET", url: "/api/gateway/echo", headers: { cookie: cookieHeader, "x-forwarded-for": "127.0.0.1" }, socket: {} };
  let status = 0;
  const fakeRes = { headersSent: false, writeHead(code) { status = code; }, setHeader() {}, end() {}, on() {} };
  proxy.proxyApiRequest(fakeReq, fakeRes);
  check("unknown socket peer: 400, not proxied", status === 400, String(status));
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
  const r = await call(appPort, "/api/connection/gateway", {
    method: "DELETE",
    headers: { Cookie: cookieHeader, "X-Forwarded-For": "127.0.0.1", "x-test-peer": "192.168.1.52" },
  });
  check("sign out: 200", r.status === 200 && r.json.ok === true);
  check("sign-out call carries the socket peer as X-Forwarded-For", gatewaySawXff.logout === "192.168.1.52", String(gatewaySawXff.logout));
  check("sign-out carries the marker", gatewaySawMarker["/api/gateway/session/logout"] === "testapp", String(gatewaySawMarker["/api/gateway/session/logout"]));
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
  const sse = await fetch(`http://127.0.0.1:${appPort}/api/gateway/stream`, { headers: { Cookie: cookieHeader, "X-AbstractFramework-App-Proxy": "spoofed" } });
  check("SSE content-type preserved", (sse.headers.get("content-type") || "").includes("text/event-stream"));
  const reader = sse.body.getReader();
  let received = "";
  for (let i = 0; i < 4 && !received.includes("data: two"); i += 1) {
    const { value, done } = await reader.read();
    if (done) break;
    received += Buffer.from(value).toString("utf8");
  }
  check("SSE chunks stream through the proxy", received.includes("data: one") && received.includes("data: two"));
  check("SSE request carries the marker (spoofed value dropped)", gatewaySawMarker["/api/gateway/stream"] === "testapp", String(gatewaySawMarker["/api/gateway/stream"]));
  reader.cancel().catch(() => {});

  // Per-app trust-proxy env derived from appId (P1-1 parity): with it set,
  // x-forwarded-host drives the hostname gate.
  process.env.TESTAPP_TRUST_PROXY_HEADERS = "1";
  const p2 = createGatewaySessionProxy({ appId: "testapp", defaultGatewayUrl: `http://127.0.0.1:${gwPort}` });
  const fakeReq = { headers: { "x-forwarded-host": "app.example.com", host: "127.0.0.1" } };
  const sess = p2.browserSession(fakeReq);
  check("per-app TRUST_PROXY env honored (gate reads x-forwarded-host)", sess.gatewayUrl === `http://127.0.0.1:${gwPort}`);
  delete process.env.TESTAPP_TRUST_PROXY_HEADERS;

  check("missing appId refused", (() => { try { createGatewaySessionProxy({}); return false; } catch (e) { return /appId is required/.test(String(e.message)); } })());
  check("bad appId refused", (() => { try { createGatewaySessionProxy({ appId: "bad app!" }); return false; } catch { return true; } })());
}

gw.close();
app.close();

if (failures > 0) {
  console.error(`\ngateway_session_proxy: ${failures} failure(s)`);
  process.exit(1);
}
console.log("gateway_session_proxy: OK (probe, sign-in/out, cookie flags, CSRF, strip, pinning, X-Forwarded-For overwrite, app-proxy marker, passthrough)");
