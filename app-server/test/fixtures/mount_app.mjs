#!/usr/bin/env node
/**
 * A mount-capable fixture app: the smallest server that follows the
 * app-server kit's mount contract, used by the kit's own tests and by the
 * gateway's hermetic end-to-end test (it poses as a catalog app with
 * --app-id / --cookie-prefix).
 *
 *   GET  /                 the shell (injectShell: <base href>, base_path)
 *   GET  /assets/app.js    a static asset (loaded RELATIVE to the base)
 *   *    /api/...          the shared gateway session proxy
 *   GET  /local/whoami     requestContext(req) as JSON
 *   GET  /local/events     SSE: three events, then the end
 *   GET  /local/redirect   303 to appPath(basePath, "/landed")
 *   GET  /local/cookie     sets <prefix>_pref (Path=<base>/) AND a hostile
 *                          abstractgateway_session cookie (the gateway drops it)
 *   WS   /local/ws         echo (text frames)
 */

import { createHash } from "node:crypto";
import * as http from "node:http";

import {
  appPath,
  createGatewaySessionProxy,
  createMountedHandler,
  identityHeaderValue,
  injectShell,
  parseAppFlagsOrExit,
  rejectUpgrade,
  requestContext,
  serializeCookie,
  APP_IDENTITY_HEADER,
} from "../../src/index.js";

const flags = parseAppFlagsOrExit(process.argv.slice(2), {
  appName: "Mount fixture app",
  command: "mount_app",
  envPrefix: "ABSTRACTOBSERVER",
  defaultPort: 18961,
  extra: {
    "app-id": { type: "string", help: "The /apps/<id>/ id to announce (default observer).", metavar: "id" },
    "cookie-prefix": { type: "string", help: "The cookie prefix (default abstractobserver).", metavar: "prefix" },
  },
});
const APP_ID = flags.extra["app-id"] || "observer";
const COOKIE_PREFIX = flags.extra["cookie-prefix"] || "abstractobserver";

const sessionProxy = createGatewaySessionProxy({ appId: COOKIE_PREFIX, defaultGatewayUrl: flags.gatewayUrl });

const PAGE = `<!doctype html><html><head><meta charset="utf-8"><title>AbstractObserver mount fixture</title>
<script type="module" src="assets/app.js"></script></head><body><div id="root">fixture</div></body></html>`;
const APP_JS = "document.getElementById('root').textContent = 'fixture app loaded';\n";

function json(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
}

const handler = createMountedHandler({ appId: APP_ID }, (req, res, ctx) => {
  const url = new URL(req.url || "/", "http://fixture.invalid");
  const p = url.pathname;
  if (sessionProxy.handle(req, res, p)) return;
  if (p === "/" || p === "/index.html") {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-cache" });
    res.end(injectShell(PAGE, { basePath: ctx.basePath, config: { gateway_url: sessionProxy.defaultGatewayUrl } }));
    return;
  }
  if (p === "/assets/app.js") {
    res.writeHead(200, { "Content-Type": "application/javascript; charset=utf-8" });
    res.end(APP_JS);
    return;
  }
  if (p === "/local/whoami") return json(res, 200, { ...ctx, app_id: APP_ID });
  if (p === "/local/events") {
    res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" });
    let n = 0;
    const tick = () => {
      n += 1;
      res.write(`event: tick\ndata: ${n}\n\n`);
      if (n >= 3) res.end();
      else setTimeout(tick, 150);
    };
    tick();
    return;
  }
  if (p === "/local/redirect") {
    res.writeHead(303, { Location: appPath(ctx.basePath, "/landed") });
    res.end();
    return;
  }
  if (p === "/local/cookie") {
    res.setHeader("Set-Cookie", [
      serializeCookie(`${COOKIE_PREFIX}_pref`, "1", { basePath: ctx.basePath }),
      "abstractgateway_session=hostile; Path=/",
    ]);
    return json(res, 200, { ok: true });
  }
  if (p === "/local/echo-headers") return json(res, 200, { headers: req.headers });
  json(res, 404, { detail: `no route ${p}` });
});

// ---- WebSocket echo (RFC 6455, text frames; enough for a fixture) ----
const WS_GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";

function wsFrame(opcode, payload) {
  const len = payload.length;
  const head = len < 126 ? Buffer.from([0x80 | opcode, len]) : Buffer.from([0x80 | opcode, 126, len >> 8, len & 0xff]);
  return Buffer.concat([head, payload]);
}

function onUpgrade(req, socket) {
  let ctx;
  try {
    ctx = requestContext(req);
  } catch (err) {
    return rejectUpgrade(socket, 400, err.message);
  }
  const url = new URL(req.url || "/", "http://fixture.invalid");
  if (url.pathname !== "/local/ws") return rejectUpgrade(socket, 404, "no websocket here");
  const key = String(req.headers["sec-websocket-key"] || "");
  if (!key) return rejectUpgrade(socket, 400, "missing Sec-WebSocket-Key");
  const accept = createHash("sha1").update(key + WS_GUID).digest("base64");
  const protocols = String(req.headers["sec-websocket-protocol"] || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  socket.write(
    "HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n" +
      `Sec-WebSocket-Accept: ${accept}\r\n${APP_IDENTITY_HEADER}: ${identityHeaderValue(APP_ID)}\r\n` +
      (protocols.length ? `Sec-WebSocket-Protocol: ${protocols[0]}\r\n` : "") +
      "\r\n"
  );
  socket.write(wsFrame(1, Buffer.from(JSON.stringify({ hello: ctx.clientAddress, base_path: ctx.basePath }))));
  let buf = Buffer.alloc(0);
  socket.on("data", (chunk) => {
    buf = Buffer.concat([buf, chunk]);
    while (buf.length >= 2) {
      const opcode = buf[0] & 0x0f;
      const masked = (buf[1] & 0x80) !== 0;
      let len = buf[1] & 0x7f;
      let off = 2;
      if (len === 126) {
        if (buf.length < 4) return;
        len = buf.readUInt16BE(2);
        off = 4;
      } else if (len === 127) {
        socket.destroy();
        return;
      }
      const maskLen = masked ? 4 : 0;
      if (buf.length < off + maskLen + len) return;
      const mask = masked ? buf.subarray(off, off + 4) : null;
      const payload = Buffer.from(buf.subarray(off + maskLen, off + maskLen + len));
      if (mask) for (let i = 0; i < payload.length; i += 1) payload[i] ^= mask[i % 4];
      buf = buf.subarray(off + maskLen + len);
      if (opcode === 8) {
        socket.end(wsFrame(8, payload.subarray(0, 2)));
        return;
      }
      if (opcode === 9) socket.write(wsFrame(10, payload));
      if (opcode === 1) socket.write(wsFrame(1, Buffer.from(`echo:${payload.toString("utf8")}`)));
    }
  });
  socket.on("error", () => socket.destroy());
}

const server = http.createServer(handler);
server.on("upgrade", onUpgrade);
server.listen(flags.port, flags.host, () => {
  process.stdout.write(`mount fixture ${APP_ID} on http://${flags.host}:${flags.port} (gateway ${flags.gatewayUrl}, ${flags.gatewayUrlSource})\n`);
});
for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => process.exit(0));
