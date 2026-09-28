/**
 * Serving an app under a base path, behind the gateway (`/apps/<id>/`).
 *
 * The gateway serves every browser app THROUGH itself at `/apps/<id>/`
 * (one port, one tunnel): it strips the prefix, and sends the app
 *   X-Forwarded-Prefix: /apps/<id>
 *   X-Forwarded-For:    <the browser's address, as the gateway saw it>
 *   X-Forwarded-Proto / X-Forwarded-Host: what the browser used.
 * The app itself binds 127.0.0.1, so those headers can only come from a
 * process on this machine. They are believed ONLY when the socket peer is
 * loopback; from any other peer they are ignored and the socket peer is the
 * client. Everything an app decides about "who is asking" (a folder reveal,
 * a browser-supplied gateway URL, the X-Forwarded-For it sends the gateway)
 * reads `requestContext(req).clientAddress`, never `req.socket.remoteAddress`:
 * behind the gateway the socket peer is ALWAYS loopback.
 *
 * An app announces that it can be mounted with one response header on
 * every response:
 *   X-AbstractFramework-App: <id>; mount=1
 * The gateway proxies only apps that announce it (an older app, which would
 * read every visitor as local, is never exposed through `/apps/<id>/`).
 */

import { isIP } from "node:net";

export const APP_IDENTITY_HEADER = "X-AbstractFramework-App";
export const FORWARDED_PREFIX_HEADER = "X-Forwarded-Prefix";

const APP_ID_RE = /^[a-z0-9][a-z0-9-]{0,62}$/;
// One path segment of a base path: unreserved characters only (RFC 3986),
// never "." or "..".
const SEGMENT_RE = /^[A-Za-z0-9._~-]+$/;
const MAX_BASE_PATH = 256;
const HOST_RE = /^(\[[0-9A-Fa-f:.]+\]|[A-Za-z0-9.-]+)(:\d{1,5})?$/;

/** A request the app must refuse (400): a malformed forwarded header, or a
 * connection whose client address cannot be known. */
export class MountRequestError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.name = "MountRequestError";
    this.status = status;
  }
}

function unwrapMapped(addr) {
  let a = String(addr || "").trim().toLowerCase();
  if (a.startsWith("[") && a.endsWith("]")) a = a.slice(1, -1);
  if (a.startsWith("::ffff:") && a.includes(".")) a = a.slice(7);
  return a;
}

/** True for 127.0.0.0/8, ::1 and their IPv4-mapped spellings. */
export function isLoopbackAddress(addr) {
  const a = unwrapMapped(addr);
  if (!a) return false;
  if (a === "::1") return true;
  return isIP(a) === 4 && a.startsWith("127.");
}

/**
 * A Host header value (or bare host name) that names THIS machine's loopback:
 * `localhost`, `*.localhost`, `::1` or a 127.x IP LITERAL — never a DNS name
 * that merely starts with "127." (DNS rebinding points any name at 127.0.0.1).
 */
export function isLoopbackHostname(host) {
  let h = String(host || "").trim().toLowerCase();
  if (h.startsWith("[")) h = h.slice(1).split("]", 1)[0];
  else if ((h.match(/:/g) || []).length === 1) h = h.split(":")[0];
  if (h === "localhost" || h.endsWith(".localhost") || h === "::1") return true;
  return isIP(h) === 4 && h.startsWith("127.");
}

/** The connection's real transport peer (never a header), IPv4-mapped IPv6
 * unwrapped; "" when unknown. */
export function socketPeerAddress(req) {
  return unwrapMapped(req?.socket?.remoteAddress || "");
}

/**
 * A base path as the app uses it: "" (served at the root) or "/a/b" — no
 * trailing slash, every segment unreserved characters, never "." or "..",
 * at most 256 characters. Throws MountRequestError otherwise.
 */
export function validateBasePath(raw) {
  const value = String(raw ?? "").trim();
  if (value === "" || value === "/") return "";
  const bad = () => new MountRequestError(`Invalid ${FORWARDED_PREFIX_HEADER}: ${JSON.stringify(value.slice(0, 80))}`);
  if (value.length > MAX_BASE_PATH || !value.startsWith("/")) throw bad();
  const trimmed = value.endsWith("/") ? value.slice(0, -1) : value;
  const segments = trimmed.slice(1).split("/");
  for (const seg of segments) {
    if (!SEGMENT_RE.test(seg) || seg === "." || seg === "..") throw bad();
  }
  return trimmed;
}

function headerValue(req, name) {
  const v = req?.headers?.[name];
  if (Array.isArray(v)) return v.length ? String(v[0]) : undefined;
  return v === undefined ? undefined : String(v);
}

function forwardedClient(xff) {
  const hosts = String(xff)
    .split(",")
    .map((h) => h.trim())
    .filter(Boolean);
  if (!hosts.length) throw new MountRequestError("Invalid X-Forwarded-For: empty");
  const addrs = hosts.map((h) => {
    const a = unwrapMapped(h);
    if (!isIP(a)) throw new MountRequestError(`Invalid X-Forwarded-For entry: ${JSON.stringify(h.slice(0, 64))}`);
    return a;
  });
  // The gateway's own derivation (security/same_machine.effective_peer):
  // the right-most entry that is not loopback; all loopback: the left-most.
  for (let i = addrs.length - 1; i >= 0; i -= 1) {
    if (!isLoopbackAddress(addrs[i])) return addrs[i];
  }
  return addrs[0];
}

const CONTEXTS = new WeakMap();

/**
 * Who is asking and where the app is mounted, for ONE request.
 *
 * Returns {clientAddress, clientIsLoopback, hostIsLoopback, basePath, proto, host, forwarded}:
 *  - clientAddress: the browser's address. From a loopback socket peer, the
 *    X-Forwarded-For client (right-most non-loopback entry) when the header
 *    is present, else the peer; from any other peer, the peer itself.
 *  - basePath: "" or the validated X-Forwarded-Prefix ("/apps/flow"), read
 *    from a loopback peer only.
 *  - proto: "https" when a loopback peer says X-Forwarded-Proto: https.
 *  - host: X-Forwarded-Host from a loopback peer, else the Host header.
 *  - forwarded: a loopback peer sent any X-Forwarded-* header.
 *  - hostIsLoopback: the raw Host header names loopback (localhost,
 *    *.localhost, ::1 or a 127.x IP literal, never a DNS name), and so does
 *    X-Forwarded-Host when a loopback peer sent one.
 *  - clientIsLoopback: the browser is on this machine — a loopback
 *    clientAddress AND hostIsLoopback (a DNS-rebinding page, which names its
 *    own host, is never local). THE field for every app-local privileged
 *    check.
 * Throws MountRequestError (status 400) for an unknown socket peer or a
 * malformed forwarded header from a loopback peer. Memoized per request.
 */
export function requestContext(req) {
  const cached = CONTEXTS.get(req);
  if (cached) return cached;
  const peer = socketPeerAddress(req);
  if (!peer) throw new MountRequestError("Cannot determine the client address of this connection");
  let clientAddress = peer;
  let basePath = "";
  let proto = "http";
  const rawHost = String(headerValue(req, "host") || "");
  let host = rawHost;
  let forwarded = false;
  let forwardedHost;
  if (isLoopbackAddress(peer)) {
    const xff = headerValue(req, "x-forwarded-for");
    const prefix = headerValue(req, "x-forwarded-prefix");
    const xfProto = headerValue(req, "x-forwarded-proto");
    const xfHost = headerValue(req, "x-forwarded-host");
    forwarded = [xff, prefix, xfProto, xfHost].some((v) => v !== undefined);
    if (xff !== undefined) clientAddress = forwardedClient(xff);
    if (prefix !== undefined) basePath = validateBasePath(prefix);
    if (xfProto !== undefined) {
      const p = xfProto.split(",", 1)[0].trim().toLowerCase();
      if (p !== "http" && p !== "https") throw new MountRequestError(`Invalid X-Forwarded-Proto: ${JSON.stringify(p.slice(0, 16))}`);
      proto = p;
    }
    if (xfHost !== undefined) {
      const h = xfHost.split(",", 1)[0].trim();
      if (!HOST_RE.test(h)) throw new MountRequestError(`Invalid X-Forwarded-Host: ${JSON.stringify(h.slice(0, 64))}`);
      host = h;
      forwardedHost = h;
    }
  }
  // DNS rebinding: a page at a hostile name that resolves to 127.0.0.1
  // reaches this server over a loopback socket with ITS Host header, and as
  // a same-origin script it can add X-Forwarded-* headers too. A request is
  // "from this machine" only when the host it names is loopback as well: the
  // raw Host, and the X-Forwarded-Host a loopback peer (the gateway) sent.
  const hostIsLoopback = isLoopbackHostname(rawHost) && (forwardedHost === undefined || isLoopbackHostname(forwardedHost));
  const ctx = Object.freeze({
    clientAddress,
    clientIsLoopback: isLoopbackAddress(clientAddress) && hostIsLoopback,
    hostIsLoopback,
    basePath,
    proto,
    host,
    forwarded,
  });
  CONTEXTS.set(req, ctx);
  return ctx;
}

/** The identity header value: "<id>; mount=1". */
export function identityHeaderValue(appId) {
  const id = String(appId || "").trim();
  if (!APP_ID_RE.test(id)) throw new Error(`app id ${JSON.stringify(id)} must match [a-z0-9][a-z0-9-]* (the gateway's /apps/<id>/)`);
  return `${id}; mount=1`;
}

/** Set the identity header on a response (before writeHead). */
export function setIdentityHeader(res, appId) {
  res.setHeader(APP_IDENTITY_HEADER, identityHeaderValue(appId));
}

/** An app-absolute path under the base path: appPath("/apps/flow", "/x?y") -> "/apps/flow/x?y". */
export function appPath(basePath, path = "/") {
  const p = String(path || "/");
  if (!p.startsWith("/") || p.startsWith("//")) throw new Error(`appPath: ${JSON.stringify(p)} must be a path starting with one "/"`);
  return `${validateBasePath(basePath)}${p}`;
}

/** The Path attribute for the app's cookies: "<basePath>/", or "/" at the root. */
export function cookiePath(basePath) {
  const b = validateBasePath(basePath);
  return b ? `${b}/` : "/";
}

/**
 * One Set-Cookie value. options: {basePath, httpOnly, secure, maxAge,
 * sameSite ("Lax" default), path (overrides basePath)}.
 */
export function serializeCookie(name, value, options = {}) {
  const n = String(name || "");
  if (!/^[A-Za-z0-9!#$%&'*+.^_`|~-]+$/.test(n)) throw new Error(`serializeCookie: invalid cookie name ${JSON.stringify(n)}`);
  const parts = [`${n}=${encodeURIComponent(String(value ?? ""))}`];
  parts.push(`Path=${options.path !== undefined ? String(options.path) : cookiePath(options.basePath || "")}`);
  if (options.httpOnly) parts.push("HttpOnly");
  parts.push(`SameSite=${options.sameSite || "Lax"}`);
  if (options.secure) parts.push("Secure");
  if (options.maxAge !== undefined && options.maxAge !== null) parts.push(`Max-Age=${Math.trunc(Number(options.maxAge))}`);
  return parts.join("; ");
}

/**
 * Cookies of a request (or a raw Cookie header), FIRST value wins. Browsers
 * send cookies with a longer Path before those with a shorter one (RFC 6265
 * 5.4, a SHOULD that every current browser follows), so the app's own
 * `Path=/apps/<id>/` cookie comes before a `Path=/` cookie of the same name.
 * This picks WHICH value an app reads; it is not isolation: every app under
 * the gateway shares one origin (see the README). Values are URL-decoded.
 */
export function parseCookies(reqOrHeader) {
  const header = typeof reqOrHeader === "string" ? reqOrHeader : headerValue(reqOrHeader, "cookie") || "";
  const out = {};
  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx < 0) continue;
    const key = part.slice(0, idx).trim();
    if (!key || Object.prototype.hasOwnProperty.call(out, key)) continue;
    const value = part.slice(idx + 1).trim();
    try {
      out[key] = decodeURIComponent(value);
    } catch {
      out[key] = value;
    }
  }
  return out;
}

function escapeAttr(s) {
  return String(s).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function scriptJson(value) {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

/**
 * The app's HTML page, ready for its base path: a `<base href="<basePath>/">`
 * as the first element of <head> (every RELATIVE asset and fetch URL then
 * resolves under the base path), then
 * `window.__ABSTRACT_UI_CONFIG__ = Object.assign(..., {...config, base_path})`.
 * An existing <base> element is an error (one base per page).
 */
export function injectShell(html, { basePath = "", config = {} } = {}) {
  const page = String(html ?? "");
  const base = validateBasePath(basePath);
  if (/<base[\s>]/i.test(page)) throw new Error("injectShell: the page already has a <base> element");
  const marker = "window.__ABSTRACT_UI_CONFIG__";
  const cfg = { ...(config || {}), base_path: base };
  const snippet =
    `<base href="${escapeAttr(base ? `${base}/` : "/")}">` +
    `<script>${marker}=Object.assign(${marker}||{},${scriptJson(cfg)});</script>`;
  const head = /<head(\s[^>]*)?>/i.exec(page);
  if (head) return page.slice(0, head.index + head[0].length) + snippet + page.slice(head.index + head[0].length);
  const htmlTag = /<html(\s[^>]*)?>/i.exec(page);
  if (htmlTag) return page.slice(0, htmlTag.index + htmlTag[0].length) + `<head>${snippet}</head>` + page.slice(htmlTag.index + htmlTag[0].length);
  return `<head>${snippet}</head>${page}`;
}

function refuse(res, err) {
  const body = JSON.stringify({ ok: false, detail: String(err?.message || err) });
  res.writeHead(err?.status || 400, { "Content-Type": "application/json; charset=utf-8", "Content-Length": Buffer.byteLength(body) });
  res.end(body);
}

/**
 * Wrap an app's request handler: every response carries the identity
 * header, the request context is computed once (a malformed forwarded
 * header or an unknown peer is answered 400 before the handler runs), and
 * the handler receives it: handler(req, res, ctx).
 */
export function createMountedHandler({ appId } = {}, handler) {
  const identity = identityHeaderValue(appId);
  if (typeof handler !== "function") throw new Error("createMountedHandler: handler must be a function");
  return function mountedHandler(req, res) {
    res.setHeader(APP_IDENTITY_HEADER, identity);
    let ctx;
    try {
      ctx = requestContext(req);
    } catch (err) {
      if (err instanceof MountRequestError) return refuse(res, err);
      throw err;
    }
    return handler(req, res, ctx);
  };
}

/**
 * Refuse a WebSocket upgrade on its raw socket (the `upgrade` event has no
 * response object): writes a plain HTTP response and closes.
 */
export function rejectUpgrade(socket, status, message) {
  const text = String(message || "Bad Request");
  const reason = { 400: "Bad Request", 401: "Unauthorized", 403: "Forbidden", 404: "Not Found" }[status] || "Error";
  try {
    socket.write(
      `HTTP/1.1 ${status} ${reason}\r\nContent-Type: text/plain; charset=utf-8\r\nContent-Length: ${Buffer.byteLength(text)}\r\nConnection: close\r\n\r\n${text}`
    );
  } finally {
    socket.destroy();
  }
}
