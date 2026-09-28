/**
 * App-origin gateway session proxy — ONE implementation of the split-brain
 * auth machinery previously duplicated (byte-independently) in the
 * abstractobserver / abstractflow / abstractcode cli.js servers.
 *
 * Extracted 2026-07-12 from the OBSERVER copy (the most recently hardened),
 * parameterized per app. Contract (rulings, not preferences):
 *  - GET  /api/connection/gateway  -> {ok, gateway_url, has_session, gateway:{...}}
 *    (the ONE silent still-signed-in probe; sign-in modal opens only on a
 *    definitive no).
 *  - POST {gateway_url?, gateway_user_id, gateway_token, persist}
 *    -> server-side gateway sign-in; sets FIRST-PARTY cookies
 *    (HttpOnly session id + JS-readable CSRF twin). Tokens never rest
 *    client-side and never appear in URLs.
 *  - DELETE -> sign out (best-effort gateway logout + cookie clear).
 *  - Every proxied /api/* call: attach the server-held gateway session +
 *    CSRF, STRIP client Authorization/cookie headers, pin the gateway URL
 *    server-side (a browser must not be able to redirect the proxy).
 *  - SSE/EventSource rides the same origin cookies (EventSource cannot carry
 *    Bearer headers — this proxy IS how authenticated live tails work).
 *  - Every request this proxy sends to the gateway on behalf of a browser
 *    carries `X-Forwarded-For: <the browser's address>` — the connection's
 *    socket peer, or, behind the gateway's `/apps/<id>/` proxy (a loopback
 *    peer), the address it forwarded (mount.js `requestContext`),
 *    OVERWRITING any client-supplied value (never appended, never passed
 *    through). The gateway trusts that header only from its loopback proxy
 *    and uses it to decide whether the browser runs on the gateway's machine
 *    (contract A-2, 2026-09-25). A request whose socket peer is unknown is
 *    refused rather than forwarded without the header (the gateway would
 *    otherwise see only the loopback proxy and call it "this machine").
 *  - Every gateway-bound request also carries
 *    `X-AbstractFramework-App-Proxy: <appId>` (any client-supplied value is
 *    dropped): the gateway's same-machine fail-safe keys on this marker to
 *    know the request came through an app proxy (REVIEW/09).
 *  - Mounted under a base path (`X-Forwarded-Prefix` from a loopback peer),
 *    the session cookies carry `Path=<basePath>/`; with two cookies of the
 *    same name the first (most specific path) wins.
 */

import * as http from "node:http";
import * as https from "node:https";
import { timingSafeEqual as cryptoTimingSafeEqual } from "node:crypto";

import { createGatewayUrlResolver } from "./gateway_pointer.js";
import { MountRequestError, parseCookies, requestContext, serializeCookie } from "./mount.js";

const TRUE_VALUES = new Set(["1", "true", "yes", "y", "on"]);
const HOP_BY_HOP_HEADERS = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "trailers",
  "transfer-encoding",
  "upgrade",
]);

function envBool(name) {
  const raw = process.env[name];
  if (typeof raw !== "string" || !raw.trim()) return false;
  return TRUE_VALUES.has(raw.trim().toLowerCase());
}

function anyEnvBool(names) {
  return (names || []).some((n) => envBool(n));
}

/** Strip wrapping quotes/JSON-encoding pasted around a URL, drop trailing slashes. */
export function normalizeGatewayUrl(value) {
  let raw = String(value || "").trim();
  for (let i = 0; i < 2 && raw; i += 1) {
    try {
      const parsed = JSON.parse(raw);
      if (typeof parsed === "string" && parsed !== raw) {
        raw = parsed.trim();
        continue;
      }
    } catch {
      // Not JSON — try quote-pair cleanup below.
    }
    const first = raw[0];
    const last = raw[raw.length - 1];
    if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
      raw = raw.slice(1, -1).trim();
      continue;
    }
    break;
  }
  return raw.replace(/\/+$/, "");
}

function cookieValueFromSetCookie(rawHeaders, name) {
  const headers = Array.isArray(rawHeaders) ? rawHeaders : rawHeaders ? [rawHeaders] : [];
  for (const header of headers) {
    for (const candidate of String(header || "").split(/,(?=\s*[^;,=]+=)/)) {
      const first = candidate.split(";", 1)[0];
      const idx = first.indexOf("=");
      if (idx < 0) continue;
      if (first.slice(0, idx).trim() !== name) continue;
      const raw = first.slice(idx + 1).trim();
      try {
        return decodeURIComponent(raw);
      } catch {
        return raw;
      }
    }
  }
  return "";
}

function sendJson(res, status, payload) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload));
}

// Connection-endpoint bodies are tiny (a token + url); an unbounded buffer
// would let one client balloon memory (adversary find 2026-07-13).
const MAX_CONNECTION_BODY_BYTES = 64 * 1024;

function readRequestJson(req) {
  return new Promise((resolve) => {
    const chunks = [];
    let size = 0;
    let overflow = false;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > MAX_CONNECTION_BODY_BYTES) {
        overflow = true;
        chunks.length = 0;
        return;
      }
      if (!overflow) chunks.push(chunk);
    });
    req.on("end", () => {
      if (overflow) {
        resolve({});
        return;
      }
      try {
        const raw = Buffer.concat(chunks).toString("utf8");
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        resolve({});
      }
    });
    req.on("error", () => resolve({}));
  });
}

/** Constant-time string equality for credential comparison. */
function timingSafeEqualStr(a, b) {
  const ab = Buffer.from(String(a || ""), "utf8");
  const bb = Buffer.from(String(b || ""), "utf8");
  if (ab.length !== bb.length) return false;
  return cryptoTimingSafeEqual(ab, bb);
}

function mutatingMethod(method) {
  return ["POST", "PUT", "PATCH", "DELETE"].includes(String(method || "GET").toUpperCase());
}

/**
 * Create the proxy. Options (all optional unless noted):
 *  - appId (REQUIRED): short id, e.g. "abstractflow" — prefixes cookies and
 *    the app CSRF header (`x-<appId>-csrf`); the canonical `x-abstract-csrf`
 *    header is always accepted too, so shared UI components work everywhere.
 *  - defaultGatewayUrl: server-pinned gateway: a URL string, or a resolver
 *    from createGatewayUrlResolver() (re-read when a connection fails).
 *    Default: ABSTRACTGATEWAY_URL (legacy), else the local gateway pointer,
 *    else http://127.0.0.1:8080.
 *  - connectionPath: default "/api/connection/gateway".
 *  - proxyPrefix: default "/api/" (everything under it except connectionPath
 *    proxies to the gateway).
 *  - allowRemoteConfigEnvVars / allowUrlCookieEnvVars / trustProxyEnvVars:
 *    extra env names honored beside the ABSTRACTGATEWAY_* shared ones.
 *  - gatewayTimeoutMs: default 4000.
 */
export function createGatewaySessionProxy(options) {
  const opts = options || {};
  const appId = String(opts.appId || "").trim().toLowerCase();
  if (!appId) throw new Error("createGatewaySessionProxy: appId is required (e.g. \"abstractflow\")");
  if (!/^[a-z0-9-]+$/.test(appId)) {
    throw new Error(`createGatewaySessionProxy: appId "${appId}" must match [a-z0-9-]+ (it names cookies and headers)`);
  }
  // Per-app env knobs the pre-extraction copies honored (e.g.
  // ABSTRACTOBSERVER_TRUST_PROXY_HEADERS) — derived from appId so a bare
  // migration keeps its deployment's security gate (adversary find
  // 2026-07-12: silently dropping them flips the loopback/remote-config
  // gate behind reverse proxies).
  const APP_ENV = appId.toUpperCase().replace(/-/g, "_");
  // Marker the gateway keys its same-machine fail-safe on (REVIEW/09).
  const APP_PROXY_HEADER = "X-AbstractFramework-App-Proxy";

  const gatewayUrlResolver =
    opts.defaultGatewayUrl && typeof opts.defaultGatewayUrl === "object"
      ? opts.defaultGatewayUrl
      : opts.defaultGatewayUrl
        ? { current: () => normalizeGatewayUrl(opts.defaultGatewayUrl), refresh: () => false }
        : createGatewayUrlResolver({ env: [["ABSTRACTGATEWAY_URL", process.env.ABSTRACTGATEWAY_URL]] });
  if (typeof gatewayUrlResolver.current !== "function" || typeof gatewayUrlResolver.refresh !== "function") {
    throw new Error("createGatewaySessionProxy: defaultGatewayUrl must be a URL string or a resolver {current(), refresh()}");
  }
  const defaultGatewayUrl = () => normalizeGatewayUrl(gatewayUrlResolver.current()) || "http://127.0.0.1:8080";
  const CONNECTION_PATH = String(opts.connectionPath || "/api/connection/gateway");
  const PROXY_PREFIX = String(opts.proxyPrefix || "/api/");
  const TIMEOUT_MS = Number.isFinite(opts.gatewayTimeoutMs) ? opts.gatewayTimeoutMs : 4000;

  const URL_COOKIE = `${appId}_gateway_url`;
  const SESSION_COOKIE = `${appId}_gateway_session`;
  const CSRF_COOKIE = `${appId}_gateway_csrf`;
  const APP_CSRF_HEADER = `x-${appId}-csrf`;
  const CANONICAL_CSRF_HEADER = "x-abstract-csrf";

  const REMOTE_CONFIG_ENVS = [
    ...(opts.allowRemoteConfigEnvVars || []),
    `${APP_ENV}_ALLOW_REMOTE_BROWSER_GATEWAY_CONFIG`,
    "ABSTRACTGATEWAY_ALLOW_REMOTE_BROWSER_GATEWAY_CONFIG",
  ];
  const URL_COOKIE_ENVS = [
    ...(opts.allowUrlCookieEnvVars || []),
    `${APP_ENV}_ALLOW_BROWSER_GATEWAY_URL_COOKIE`,
    ...REMOTE_CONFIG_ENVS,
  ];
  const TRUST_PROXY_ENVS = [
    ...(opts.trustProxyEnvVars || []),
    `${APP_ENV}_TRUST_PROXY_HEADERS`,
    "ABSTRACTGATEWAY_TRUST_PROXY_HEADERS",
  ];

  function requestHostname(req) {
    const headerValue = anyEnvBool(TRUST_PROXY_ENVS)
      ? req?.headers?.["x-forwarded-host"] || req?.headers?.host
      : req?.headers?.host;
    const raw = String(headerValue || "").split(",", 1)[0].trim();
    if (!raw) return "";
    if (raw.startsWith("[")) return raw.slice(1).split("]", 1)[0].trim().toLowerCase();
    if ((raw.match(/:/g) || []).length === 1) return raw.split(":")[0].trim().toLowerCase();
    return raw.toLowerCase();
  }

  /**
   * The browser's address: the connection's socket peer, or, from a
   * loopback peer (the gateway's `/apps/<id>/` proxy), the address it
   * forwarded in X-Forwarded-For (mount.js `requestContext`). Never the Host
   * header. Throws MountRequestError for an unknown peer or a malformed
   * forwarded header.
   */
  function clientAddress(req) {
    return requestContext(req).clientAddress;
  }

  function remoteConfigAllowed(req) {
    // Explicit operator opt-in wins (deployments behind their own access
    // control).
    if (anyEnvBool(REMOTE_CONFIG_ENVS)) return true;
    // When proxy headers are trusted, the socket peer is the reverse proxy,
    // not the client — a loopback-by-socket check would unlock remote-config
    // for EVERY forwarded client (code's mirror point, c1772). Such
    // deployments must set the explicit opt-in above; there is no
    // socket-derived unlock behind a trusted proxy.
    if (anyEnvBool(TRUST_PROXY_ENVS)) return false;
    // Otherwise only a browser on this machine: requestContext's
    // clientIsLoopback (a loopback client address AND a loopback Host, so a
    // DNS-rebinding page is refused). One rule, the same field every
    // app-local privileged check reads.
    try {
      return requestContext(req).clientIsLoopback;
    } catch {
      return false;
    }
  }

  function remoteConfigDenial(req) {
    const host = requestHostname(req) || "unknown host";
    return (
      `Browser-supplied Gateway URL changes are disabled for this non-local host (${host}). ` +
      "Use the server-configured Gateway URL, or enable remote browser gateway config behind your own access control."
    );
  }

  /** Secure cookies when the browser used https: X-Forwarded-Proto is
   * believed from a loopback peer only (mount.js requestContext), like every
   * other forwarded header. */
  function cookieSecure(req) {
    return requestContext(req).proto === "https";
  }

  function setSessionCookies(res, req, gatewayUrl, sessionId, csrfToken, persist) {
    const common = { basePath: requestContext(req).basePath, secure: cookieSecure(req), maxAge: persist ? 2592000 : undefined };
    res.setHeader("Set-Cookie", [
      serializeCookie(URL_COOKIE, gatewayUrl, { ...common, httpOnly: true }),
      serializeCookie(SESSION_COOKIE, sessionId, { ...common, httpOnly: true }),
      serializeCookie(CSRF_COOKIE, csrfToken, common),
    ]);
  }

  function clearSessionCookies(res, req) {
    const { basePath } = requestContext(req);
    const secure = cookieSecure(req);
    // Mounted: clear the Path=/ twins too (left by the app at its own port
    // on the same host), or they would win again once these are gone.
    const paths = basePath ? [`${basePath}/`, "/"] : ["/"];
    const out = [];
    for (const path of paths) {
      out.push(serializeCookie(URL_COOKIE, "", { path, httpOnly: true, secure, maxAge: 0 }));
      out.push(serializeCookie(SESSION_COOKIE, "", { path, httpOnly: true, secure, maxAge: 0 }));
      out.push(serializeCookie(CSRF_COOKIE, "", { path, secure, maxAge: 0 }));
    }
    res.setHeader("Set-Cookie", out);
  }

  function browserSession(req) {
    const DEFAULT_GATEWAY_URL = defaultGatewayUrl();
    const cookies = parseCookies(req);
    const cookieUrl = normalizeGatewayUrl(cookies[URL_COOKIE] || "");
    // The URL cookie is honored only where browser-supplied gateway URLs are
    // allowed; otherwise the server-pinned default stands (never redirectable
    // from the client side).
    const allowCookieUrl = anyEnvBool(URL_COOKIE_ENVS) || remoteConfigAllowed(req);
    return {
      gatewayUrl: cookieUrl && (allowCookieUrl || cookieUrl === DEFAULT_GATEWAY_URL) ? cookieUrl : DEFAULT_GATEWAY_URL,
      sessionId: String(cookies[SESSION_COOKIE] || "").trim(),
      csrfToken: String(cookies[CSRF_COOKIE] || "").trim(),
    };
  }

  function resolveBackend(gatewayUrl) {
    const backend = new URL(String(gatewayUrl || defaultGatewayUrl()).trim());
    if (!backend.port) backend.port = backend.protocol === "https:" ? "443" : "80";
    return {
      url: backend,
      origin: `${backend.protocol}//${backend.host}`,
      client: backend.protocol === "https:" ? https : http,
    };
  }

  /** A refused connection re-reads the local gateway pointer, so a
   * long-running app follows the gateway onto a new port (backlog 0943). */
  function noteConnectionError(err) {
    if (err && (err.code === "ECONNREFUSED" || err.code === "ECONNRESET" || err.code === "EHOSTUNREACH")) {
      try {
        gatewayUrlResolver.refresh();
      } catch {
        // a resolver failure is not the request's failure
      }
    }
  }

  function gatewayRequest(gatewayUrl, requestOptions, body) {
    return new Promise((resolve) => {
      let backend;
      try {
        backend = resolveBackend(gatewayUrl);
      } catch (err) {
        resolve({ ok: false, status: 0, payload: { detail: `Invalid gateway URL: ${String(err?.message || err)}` } });
        return;
      }
      const req = backend.client.request(
        {
          protocol: backend.url.protocol,
          hostname: backend.url.hostname,
          port: backend.url.port,
          timeout: requestOptions.timeout || TIMEOUT_MS,
          ...requestOptions,
        },
        (resp) => {
          const chunks = [];
          resp.on("data", (chunk) => chunks.push(chunk));
          resp.on("end", () => {
            const text = Buffer.concat(chunks).toString("utf8");
            let payload = {};
            try {
              payload = text ? JSON.parse(text) : {};
            } catch {
              payload = { detail: text };
            }
            const status = resp.statusCode || 0;
            resolve({ ok: status >= 200 && status < 300, status, payload, headers: resp.headers, origin: backend.origin });
          });
        }
      );
      req.on("timeout", () => {
        req.destroy();
        resolve({ ok: false, status: 0, payload: { detail: "Gateway request timed out" }, origin: backend?.origin });
      });
      req.on("error", (err) => {
        noteConnectionError(err);
        resolve({ ok: false, status: 0, payload: { detail: String(err?.message || err) }, origin: backend?.origin });
      });
      if (body) req.write(body);
      req.end();
    });
  }

  /** The browser's address, or null after answering 400. */
  function clientAddressOr400(req, res) {
    try {
      return clientAddress(req);
    } catch (err) {
      if (!(err instanceof MountRequestError)) throw err;
      sendJson(res, err.status || 400, { detail: err.message });
      return null;
    }
  }

  async function handleConnectionApi(req, res) {
    const peer = clientAddressOr400(req, res);
    if (!peer) return;
    const DEFAULT_GATEWAY_URL = defaultGatewayUrl();
    if (req.method === "GET") {
      const session = browserSession(req);
      if (!session.sessionId) {
        sendJson(res, 200, {
          ok: false,
          gateway_url: session.gatewayUrl,
          has_session: false,
          gateway: { ok: false, error: "Gateway sign-in required" },
        });
        return;
      }
      const checked = await gatewayRequest(session.gatewayUrl, {
        method: "GET",
        path: "/api/gateway/me",
        headers: { Accept: "application/json", "X-AbstractGateway-Session": session.sessionId, "X-Forwarded-For": peer, [APP_PROXY_HEADER]: appId },
      });
      sendJson(res, 200, {
        ok: checked.ok,
        gateway_url: session.gatewayUrl,
        has_session: Boolean(session.sessionId),
        gateway: checked.payload,
      });
      return;
    }
    if (req.method === "POST") {
      const payload = await readRequestJson(req);
      const gatewayUrl = normalizeGatewayUrl(payload.gateway_url || "") || DEFAULT_GATEWAY_URL;
      if (!remoteConfigAllowed(req) && gatewayUrl !== DEFAULT_GATEWAY_URL) {
        sendJson(res, 403, { detail: remoteConfigDenial(req) });
        return;
      }
      const body = Buffer.from(
        JSON.stringify({
          user_id: String(payload.gateway_user_id || "").trim(),
          token: String(payload.gateway_token || "").trim(),
          remember: payload.persist === true,
        })
      );
      const login = await gatewayRequest(
        gatewayUrl,
        {
          method: "POST",
          path: "/api/gateway/session/login",
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
            "Content-Length": String(body.length),
            "X-Forwarded-For": peer,
            [APP_PROXY_HEADER]: appId,
          },
        },
        body
      );
      const session = login.payload && typeof login.payload.session === "object" ? login.payload.session : {};
      const setCookie = login.headers?.["set-cookie"];
      const sessionId = cookieValueFromSetCookie(setCookie, "abstractgateway_session") || String(session.session_id || "").trim();
      const csrfToken = cookieValueFromSetCookie(setCookie, "abstractgateway_csrf") || String(session.csrf_token || "").trim();
      if (!login.ok || !sessionId || !csrfToken) {
        sendJson(res, login.status || 401, {
          ok: false,
          detail: login.payload?.detail || "Gateway browser session failed",
          gateway: login.payload,
        });
        return;
      }
      setSessionCookies(res, req, gatewayUrl, sessionId, csrfToken, payload.persist === true);
      sendJson(res, 200, { ok: true, gateway_url: gatewayUrl, has_session: true, gateway: login.payload });
      return;
    }
    if (req.method === "DELETE") {
      const session = browserSession(req);
      if (session.sessionId) {
        const body = Buffer.from("{}");
        await gatewayRequest(
          session.gatewayUrl,
          {
            method: "POST",
            path: "/api/gateway/session/logout",
            headers: {
              Accept: "application/json",
              "Content-Type": "application/json",
              "Content-Length": String(body.length),
              "X-AbstractGateway-Session": session.sessionId,
              "X-AbstractGateway-CSRF": session.csrfToken,
              "X-Forwarded-For": peer,
              [APP_PROXY_HEADER]: appId,
            },
            timeout: 2000,
          },
          body
        );
      }
      clearSessionCookies(res, req);
      sendJson(res, 200, { ok: true });
      return;
    }
    sendJson(res, 405, { detail: "Method not allowed" });
  }

  function proxyHeaders(headers) {
    const out = {};
    for (const [key, value] of Object.entries(headers || {})) {
      const k = String(key).toLowerCase();
      if (HOP_BY_HOP_HEADERS.has(k) || k === "content-length") continue;
      // Gateway cookies must never land on the app origin — the server-held
      // session is the only credential (adversary find 2026-07-12).
      if (k === "set-cookie") continue;
      out[key] = value;
    }
    return out;
  }

  function proxyApiRequest(req, res) {
    const peer = clientAddressOr400(req, res);
    if (!peer) return;
    const session = browserSession(req);
    if (!session.sessionId) {
      sendJson(res, 401, { detail: "Gateway sign-in required" });
      return;
    }
    if (mutatingMethod(req.method)) {
      const presented = String(req.headers[APP_CSRF_HEADER] || req.headers[CANONICAL_CSRF_HEADER] || "").trim();
      // Constant-time compare: token equality must not leak match length
      // through timing (adversary find 2026-07-13; local origin, cheap belt).
      if (!session.csrfToken || !timingSafeEqualStr(presented, session.csrfToken)) {
        sendJson(res, 403, { detail: "Gateway browser session CSRF token missing or invalid", reason_code: "csrf_required" });
        return;
      }
    }
    let backend;
    try {
      backend = resolveBackend(session.gatewayUrl);
    } catch (err) {
      sendJson(res, 500, { detail: `Invalid gateway URL: ${String(err?.message || err)}` });
      return;
    }
    // The gateway must never see the browser's cookies or any client-supplied
    // Authorization header — the server-held session is the only credential.
    const headers = { ...req.headers, host: backend.url.host };
    // Hop-by-hop headers are connection-scoped and must not be forwarded on
    // the upstream leg either (response side already strips them —
    // adversary find 2026-07-13 closed the request side).
    for (const h of HOP_BY_HOP_HEADERS) delete headers[h];
    delete headers.cookie;
    // Node lowercases incoming header names, but keep both spellings for any
    // non-node caller of this helper (observer DM 2026-07-12, flow's belt).
    delete headers.authorization;
    delete headers.Authorization;
    // Forwarding headers: drop every client-supplied spelling (any case,
    // plus the RFC 7239 `Forwarded` header and the app-proxy marker), then
    // set X-Forwarded-For to the socket peer — overwrite, never append
    // (contract A-2) — and the marker to this proxy's appId (REVIEW/09).
    for (const k of Object.keys(headers)) {
      const lk = k.toLowerCase();
      if (lk === "x-forwarded-for" || lk === "x-forwarded-host" || lk === "x-forwarded-proto" || lk === "x-forwarded-prefix" || lk === "x-real-ip" || lk === "forwarded" || lk === "x-abstractframework-app-proxy") {
        delete headers[k];
      }
    }
    // App-local CSRF headers stay here: the gateway gets its own
    // (x-abstractgateway-csrf, below), never the app's.
    for (const k of Object.keys(headers)) {
      const lk = k.toLowerCase();
      if (lk === APP_CSRF_HEADER || lk === CANONICAL_CSRF_HEADER) delete headers[k];
    }
    headers["x-forwarded-for"] = peer;
    headers["x-abstractframework-app-proxy"] = appId;
    headers["x-abstractgateway-session"] = session.sessionId;
    if (mutatingMethod(req.method)) headers["x-abstractgateway-csrf"] = session.csrfToken;
    const proxyReq = backend.client.request(
      { protocol: backend.url.protocol, hostname: backend.url.hostname, port: backend.url.port, method: req.method, path: req.url, headers },
      (proxyRes) => {
        res.writeHead(proxyRes.statusCode || 502, proxyHeaders(proxyRes.headers));
        proxyRes.pipe(res);
        // A backend stream error mid-pipe (long SSE tails especially) must
        // end the client response, never crash the process (adversary find
        // 2026-07-12: unhandled 'error' on proxyRes was an uncaught throw).
        proxyRes.on("error", () => res.destroy());
      }
    );
    proxyReq.on("error", (err) => {
      noteConnectionError(err);
      if (res.headersSent) {
        res.destroy();
        return;
      }
      sendJson(res, 502, { detail: `Backend not reachable at ${backend.origin} (${String(err?.message || err)})` });
    });
    // Client abort (closed SSE tab) tears down the upstream leg instead of
    // leaking a gateway connection per abandoned tail.
    res.on("close", () => {
      if (!res.writableEnded) proxyReq.destroy();
    });
    req.pipe(proxyReq);
  }

  /**
   * Route one request. Returns true when the request was handled (the
   * connection endpoint or a proxied API call); false = not ours, the host
   * app continues with its own routing (static files etc.).
   */
  function handle(req, res, pathname) {
    const p = String(pathname ?? new URL(req.url, "http://local").pathname);
    if (p === CONNECTION_PATH) {
      void handleConnectionApi(req, res);
      return true;
    }
    if (p.startsWith(PROXY_PREFIX)) {
      proxyApiRequest(req, res);
      return true;
    }
    return false;
  }

  return {
    handle,
    handleConnectionApi,
    proxyApiRequest,
    browserSession,
    get defaultGatewayUrl() {
      return defaultGatewayUrl();
    },
    connectionPath: CONNECTION_PATH,
    cookieNames: { url: URL_COOKIE, session: SESSION_COOKIE, csrf: CSRF_COOKIE },
    csrfHeaderNames: [APP_CSRF_HEADER, CANONICAL_CSRF_HEADER],
  };
}
