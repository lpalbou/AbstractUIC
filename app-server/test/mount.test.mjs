/**
 * mount.js: the request context (forwarded headers believed from a loopback
 * peer only), base-path validation, the shell injection, cookies (Path,
 * first-wins), the identity header, and the fixture mount app end to end
 * (the gateway's `/apps/<id>/` proxy simulated by forwarded headers).
 */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import * as http from "node:http";
import * as net from "node:net";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  MountRequestError,
  appPath,
  cookiePath,
  identityHeaderValue,
  injectShell,
  isLoopbackAddress,
  parseCookies,
  requestContext,
  serializeCookie,
  validateBasePath,
} from "../src/index.js";

const HERE = dirname(fileURLToPath(import.meta.url));
let failures = 0;
function check(name, fn) {
  try {
    fn();
  } catch (err) {
    failures += 1;
    console.error(`  FAIL ${name} — ${err?.message || err}`);
  }
}
async function checkAsync(name, fn) {
  try {
    await fn();
  } catch (err) {
    failures += 1;
    console.error(`  FAIL ${name} — ${err?.message || err}`);
  }
}

const fakeReq = (peer, headers = {}) => ({ socket: { remoteAddress: peer }, headers });

// ---------------------------------------------------------------- unit
check("loopback addresses", () => {
  for (const a of ["127.0.0.1", "127.9.9.9", "::1", "::ffff:127.0.0.1", "[::1]"]) assert.equal(isLoopbackAddress(a), true, a);
  for (const a of ["10.0.0.1", "::ffff:10.0.0.1", "fe80::1", "localhost", "", "127.0.0.1.evil"]) assert.equal(isLoopbackAddress(a), false, a);
});

check("base path validation", () => {
  assert.equal(validateBasePath(""), "");
  assert.equal(validateBasePath("/"), "");
  assert.equal(validateBasePath("/apps/flow"), "/apps/flow");
  assert.equal(validateBasePath("/apps/flow/"), "/apps/flow");
  for (const bad of ["apps/flow", "/apps/../x", "/apps/./x", "//evil", "/a b", "/a%2f", "/a?b", "/a#b", "/a\\b", "/<x>", `/${"a".repeat(300)}`, "/apps//flow"]) {
    assert.throws(() => validateBasePath(bad), MountRequestError, bad);
  }
});

check("forwarded headers are believed from a loopback peer only", () => {
  const fwd = { "x-forwarded-for": "203.0.113.5", "x-forwarded-prefix": "/apps/flow", "x-forwarded-proto": "https", "x-forwarded-host": "gw.example:443", host: "127.0.0.1:3005" };
  const viaGateway = requestContext(fakeReq("127.0.0.1", fwd));
  assert.deepEqual({ ...viaGateway }, { clientAddress: "203.0.113.5", clientIsLoopback: false, hostIsLoopback: false, basePath: "/apps/flow", proto: "https", host: "gw.example:443", forwarded: true });
  const lan = requestContext(fakeReq("192.168.1.9", fwd));
  assert.deepEqual({ ...lan }, { clientAddress: "192.168.1.9", clientIsLoopback: false, hostIsLoopback: true, basePath: "", proto: "http", host: "127.0.0.1:3005", forwarded: false });
  const direct = requestContext(fakeReq("::ffff:127.0.0.1", { host: "127.0.0.1:3005" }));
  assert.equal(direct.clientAddress, "127.0.0.1");
  assert.equal(direct.clientIsLoopback, true);
  assert.equal(direct.basePath, "");
});

check("DNS rebinding: a loopback socket naming a foreign host is NOT local", () => {
  const rebound = requestContext(fakeReq("127.0.0.1", { host: "evil.example:3001" }));
  assert.equal(rebound.clientIsLoopback, false);
  assert.equal(rebound.hostIsLoopback, false);
  assert.equal(requestContext(fakeReq("127.0.0.1", { host: "127.0.0.1.evil.example:3001" })).clientIsLoopback, false, "a DNS name starting 127. is not loopback");
  const spoof = requestContext(fakeReq("127.0.0.1", { host: "evil.example:3001", "x-forwarded-host": "127.0.0.1", "x-forwarded-for": "127.0.0.1" }));
  assert.equal(spoof.clientIsLoopback, false, "self-added forwarded headers do not help");
  const viaGatewayFromForeignName = requestContext(fakeReq("127.0.0.1", { host: "127.0.0.1:3001", "x-forwarded-host": "evil.example:8080", "x-forwarded-for": "127.0.0.1" }));
  assert.equal(viaGatewayFromForeignName.clientIsLoopback, false, "the gateway reached under a foreign name");
  for (const host of ["127.0.0.1:3001", "localhost:3001", "[::1]:3001", "app.localhost"]) {
    assert.equal(requestContext(fakeReq("127.0.0.1", { host })).clientIsLoopback, true, host);
  }
  assert.equal(requestContext(fakeReq("127.0.0.1", { host: "127.0.0.1:3001", "x-forwarded-host": "localhost:8080", "x-forwarded-for": "::1" })).clientIsLoopback, true, "a local browser through the gateway");
  assert.equal(requestContext(fakeReq("127.0.0.1", {})).clientIsLoopback, false, "no Host at all is not local");
});

check("X-Forwarded-For: right-most non-loopback entry; all loopback = left-most", () => {
  assert.equal(requestContext(fakeReq("127.0.0.1", { "x-forwarded-for": "198.51.100.1, 203.0.113.7, 127.0.0.1" })).clientAddress, "203.0.113.7");
  assert.equal(requestContext(fakeReq("127.0.0.1", { "x-forwarded-for": "127.0.0.1, ::1" })).clientAddress, "127.0.0.1");
});

check("malformed forwarded headers from a loopback peer are refused", () => {
  for (const headers of [
    { "x-forwarded-for": "evil" },
    { "x-forwarded-for": "" },
    { "x-forwarded-prefix": "/apps/../console" },
    { "x-forwarded-prefix": "https://evil.example/" },
    { "x-forwarded-proto": "gopher" },
    { "x-forwarded-host": "evil.example/path" },
  ]) {
    assert.throws(() => requestContext(fakeReq("127.0.0.1", headers)), MountRequestError, JSON.stringify(headers));
  }
  assert.throws(() => requestContext(fakeReq("", {})), /client address/);
  // From a non-loopback peer the same headers are simply not read.
  assert.equal(requestContext(fakeReq("10.1.1.1", { "x-forwarded-prefix": "/apps/../console" })).basePath, "");
});

check("identity header", () => {
  assert.equal(identityHeaderValue("flow"), "flow; mount=1");
  assert.throws(() => identityHeaderValue("Flow"));
  assert.throws(() => identityHeaderValue("a;b"));
});

check("cookies: Path follows the base path; first value wins", () => {
  assert.equal(cookiePath(""), "/");
  assert.equal(cookiePath("/apps/flow"), "/apps/flow/");
  assert.equal(
    serializeCookie("abstractflow_gateway_session", "a b", { basePath: "/apps/flow", httpOnly: true, secure: true, maxAge: 60 }),
    "abstractflow_gateway_session=a%20b; Path=/apps/flow/; HttpOnly; SameSite=Lax; Secure; Max-Age=60"
  );
  assert.equal(serializeCookie("x", "1", {}), "x=1; Path=/; SameSite=Lax");
  assert.deepEqual(parseCookies("a=mounted; b=2; a=root"), { a: "mounted", b: "2" });
  assert.deepEqual(parseCookies(fakeReq("127.0.0.1", { cookie: "u=http%3A%2F%2F127.0.0.1%3A8080" })), { u: "http://127.0.0.1:8080" });
});

check("appPath", () => {
  assert.equal(appPath("/apps/flow", "/x?y=1"), "/apps/flow/x?y=1");
  assert.equal(appPath("", "/x"), "/x");
  assert.throws(() => appPath("/apps/flow", "//evil"));
  assert.throws(() => appPath("/apps/flow", "x"));
});

check("injectShell: <base> first in <head>, base_path in the page config", () => {
  const out = injectShell('<!doctype html><html><head><meta charset="utf-8"><script src="assets/a.js"></script></head><body></body></html>', {
    basePath: "/apps/flow",
    config: { gateway_url: "http://127.0.0.1:8080", evil: "</script><script>alert(1)</script>" },
  });
  const head = out.indexOf("<head>");
  assert.ok(out.slice(head + 6).startsWith('<base href="/apps/flow/">'), out);
  assert.ok(out.indexOf("<base") < out.indexOf("assets/a.js"));
  assert.ok(out.includes('"base_path":"/apps/flow"'));
  assert.ok(!out.includes("</script><script>alert"), "config must not break out of the script");
  assert.ok(injectShell("<html><body></body></html>", {}).includes('<head><base href="/">'));
  assert.throws(() => injectShell('<head><base href="/x/"></head>', {}), /already has a <base>/);
  assert.throws(() => injectShell("<head></head>", { basePath: "/../x" }), MountRequestError);
});

// ---------------------------------------------------------------- the fixture app, end to end
function freePort() {
  return new Promise((resolve) => {
    const s = net.createServer();
    s.listen(0, "127.0.0.1", () => {
      const { port } = s.address();
      s.close(() => resolve(port));
    });
  });
}

function request(port, path, { method = "GET", headers = {}, body } = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: "127.0.0.1", port, path, method, headers }, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => resolve({ status: res.statusCode, headers: res.headers, text: Buffer.concat(chunks).toString("utf8") }));
    });
    req.on("error", reject);
    if (body) req.write(body);
    req.end();
  });
}

function startStubGateway() {
  const seen = [];
  const server = http.createServer((req, res) => {
    seen.push({ url: req.url, xff: req.headers["x-forwarded-for"], session: req.headers["x-abstractgateway-session"] || null });
    if (req.url === "/api/gateway/session/login") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ session: { session_id: "sess-m", csrf_token: "csrf-m" } }));
      return;
    }
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true, url: req.url, xff: req.headers["x-forwarded-for"] }));
  });
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve({ server, seen, port: server.address().port })));
}

function wsHandshake(port, path, headers) {
  return new Promise((resolve, reject) => {
    const socket = net.connect(port, "127.0.0.1");
    let buf = Buffer.alloc(0);
    socket.on("connect", () => {
      const lines = [`GET ${path} HTTP/1.1`, `Host: 127.0.0.1:${port}`, "Upgrade: websocket", "Connection: Upgrade", "Sec-WebSocket-Version: 13", "Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ=="];
      for (const [k, v] of Object.entries(headers || {})) lines.push(`${k}: ${v}`);
      socket.write(lines.join("\r\n") + "\r\n\r\n");
    });
    socket.on("data", (c) => {
      buf = Buffer.concat([buf, c]);
      const end = buf.indexOf("\r\n\r\n");
      if (end < 0) return;
      socket.removeAllListeners("data");
      resolve({ socket, head: buf.subarray(0, end).toString("utf8"), rest: buf.subarray(end + 4) });
    });
    socket.on("error", reject);
  });
}

function readFrame(socket, initial) {
  return new Promise((resolve) => {
    let buf = initial || Buffer.alloc(0);
    const tryParse = () => {
      if (buf.length < 2) return false;
      const len = buf[1] & 0x7f;
      if (buf.length < 2 + len) return false;
      socket.removeListener("data", onData);
      resolve({ text: buf.subarray(2, 2 + len).toString("utf8"), rest: buf.subarray(2 + len) });
      return true;
    };
    const onData = (c) => {
      buf = Buffer.concat([buf, c]);
      tryParse();
    };
    if (!tryParse()) socket.on("data", onData);
  });
}

function maskedText(text) {
  const payload = Buffer.from(text);
  const mask = Buffer.from([1, 2, 3, 4]);
  const out = Buffer.alloc(payload.length);
  for (let i = 0; i < payload.length; i += 1) out[i] = payload[i] ^ mask[i % 4];
  return Buffer.concat([Buffer.from([0x81, 0x80 | payload.length]), mask, out]);
}

const home = mkdtempSync(join(tmpdir(), "app-server-mount-home-"));
const stub = await startStubGateway();
const appPort = await freePort();
const child = spawn(process.execPath, [join(HERE, "fixtures", "mount_app.mjs"), "--port", String(appPort), "--gateway-url", `http://127.0.0.1:${stub.port}`], {
  // A dead port as the legacy env: the flag must win, and nothing this test
  // does can ever reach a real gateway (8080) if it did not.
  env: { PATH: process.env.PATH, HOME: home, ABSTRACTGATEWAY_URL: "http://127.0.0.1:9", ABSTRACTOBSERVER_GATEWAY_URL: "http://127.0.0.1:9" },
  stdio: ["ignore", "pipe", "pipe"],
});
let childOut = "";
child.stdout.on("data", (c) => (childOut += c));
child.stderr.on("data", (c) => (childOut += c));
for (let i = 0; i < 100; i += 1) {
  try {
    await request(appPort, "/local/whoami");
    break;
  } catch {
    await new Promise((r) => setTimeout(r, 50));
  }
}

const GW = { "x-forwarded-for": "203.0.113.5", "x-forwarded-prefix": "/apps/observer", "x-forwarded-proto": "http", "x-forwarded-host": "gw.example" };

await checkAsync("fixture: identity header on every response (page, asset, 404, API)", async () => {
  for (const p of ["/", "/assets/app.js", "/nope", "/api/gateway/echo"]) {
    const r = await request(appPort, p, { headers: { cookie: "abstractobserver_gateway_session=s1" } });
    assert.equal(r.headers["x-abstractframework-app"], "observer; mount=1", `${p}: ${JSON.stringify(r.headers)}`);
  }
});

await checkAsync("fixture: shell under the gateway prefix carries <base href> and base_path", async () => {
  const r = await request(appPort, "/", { headers: GW });
  assert.equal(r.status, 200);
  assert.ok(r.text.includes('<base href="/apps/observer/">'), r.text);
  assert.ok(r.text.includes('"base_path":"/apps/observer"'));
  const direct = await request(appPort, "/");
  assert.ok(direct.text.includes('<base href="/">'));
});

await checkAsync("fixture: whoami behind the gateway = the forwarded browser, not loopback", async () => {
  const r = JSON.parse((await request(appPort, "/local/whoami", { headers: GW })).text);
  assert.equal(r.clientAddress, "203.0.113.5");
  assert.equal(r.clientIsLoopback, false);
  assert.equal(r.basePath, "/apps/observer");
  const direct = JSON.parse((await request(appPort, "/local/whoami")).text);
  assert.equal(direct.clientIsLoopback, true);
});

await checkAsync("fixture: a bad prefix from the loopback proxy is refused 400 (identity header still set)", async () => {
  const r = await request(appPort, "/local/whoami", { headers: { "x-forwarded-prefix": "/apps/../console" } });
  assert.equal(r.status, 400);
  assert.equal(r.headers["x-abstractframework-app"], "observer; mount=1");
});

await checkAsync("fixture: redirects stay under the base path", async () => {
  const r = await request(appPort, "/local/redirect", { headers: GW });
  assert.equal(r.status, 303);
  assert.equal(r.headers.location, "/apps/observer/landed");
});

await checkAsync("fixture: the session proxy forwards the BROWSER's address to the gateway", async () => {
  const r = JSON.parse((await request(appPort, "/api/gateway/echo", { headers: { ...GW, cookie: "abstractobserver_gateway_session=mounted; abstractobserver_gateway_session=root" } })).text);
  assert.equal(r.xff, "203.0.113.5");
  const last = stub.seen[stub.seen.length - 1];
  assert.equal(last.session, "mounted", "first cookie (the most specific Path) wins");
});

await checkAsync("fixture: sign-in cookies carry Path=<base>/ ; sign-out clears both paths", async () => {
  const signIn = await request(appPort, "/api/connection/gateway", {
    method: "POST",
    headers: { ...GW, "content-type": "application/json" },
    body: JSON.stringify({ gateway_user_id: "admin", gateway_token: "t" }),
  });
  const set = [].concat(signIn.headers["set-cookie"] || []);
  assert.equal(signIn.status, 200, signIn.text);
  assert.equal(set.length, 3, set.join(" | "));
  assert.ok(set.every((c) => c.includes("; Path=/apps/observer/;")), set.join(" | "));
  const r = await request(appPort, "/api/connection/gateway", { method: "DELETE", headers: GW });
  const cookies = [].concat(r.headers["set-cookie"] || []);
  assert.ok(cookies.some((c) => c.startsWith("abstractobserver_gateway_session=;") && c.includes("Path=/apps/observer/")), cookies.join(" | "));
  assert.ok(cookies.some((c) => c.startsWith("abstractobserver_gateway_session=;") && c.includes("Path=/;")), cookies.join(" | "));
  const pref = await request(appPort, "/local/cookie", { headers: GW });
  assert.ok([].concat(pref.headers["set-cookie"]).some((c) => c.startsWith("abstractobserver_pref=1; Path=/apps/observer/")));
});

await checkAsync("fixture: SSE streams its events", async () => {
  const r = await request(appPort, "/local/events", { headers: GW });
  assert.equal(r.headers["content-type"], "text/event-stream");
  assert.equal((r.text.match(/event: tick/g) || []).length, 3);
});

await checkAsync("fixture: WebSocket echo, hello names the forwarded client", async () => {
  const { socket, head, rest } = await wsHandshake(appPort, "/local/ws", { "X-Forwarded-For": "203.0.113.5", "X-Forwarded-Prefix": "/apps/observer" });
  assert.ok(head.startsWith("HTTP/1.1 101"), head);
  assert.ok(/x-abstractframework-app: observer; mount=1/i.test(head), head);
  const hello = await readFrame(socket, rest);
  assert.deepEqual(JSON.parse(hello.text), { hello: "203.0.113.5", base_path: "/apps/observer" });
  socket.write(maskedText("ping"));
  const echo = await readFrame(socket, hello.rest);
  assert.equal(echo.text, "echo:ping");
  socket.destroy();
});

child.kill("SIGTERM");
stub.server.close();
rmSync(home, { recursive: true, force: true });
if (failures) {
  console.error(childOut);
  console.error(`\nmount: ${failures} failure(s)`);
  process.exit(1);
}
console.log("mount: OK (context, base path, shell, cookies, identity, fixture app: page, redirect, proxy XFF, SSE, WebSocket)");
