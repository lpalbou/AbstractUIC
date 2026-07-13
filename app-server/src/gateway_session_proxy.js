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
 */

import * as http from "node:http";
import * as https from "node:https";

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

function parseCookies(req) {
  const out = {};
  for (const part of String(req?.headers?.cookie || "").split(";")) {
    const idx = part.indexOf("=");
    if (idx < 0) continue;
    const key = part.slice(0, idx).trim();
    const value = part.slice(idx + 1).trim();
    if (!key) continue;
    try {
      out[key] = decodeURIComponent(value);
    } catch {
      out[key] = value;
    }
  }
  return out;
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

function readRequestJson(req) {
  return new Promise((resolve) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => {
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

function mutatingMethod(method) {
  return ["POST", "PUT", "PATCH", "DELETE"].includes(String(method || "GET").toUpperCase());
}

/**
 * Create the proxy. Options (all optional unless noted):
 *  - appId (REQUIRED): short id, e.g. "abstractflow" — prefixes cookies and
 *    the app CSRF header (`x-<appId>-csrf`); the canonical `x-abstract-csrf`
 *    header is always accepted too, so shared UI components work everywhere.
 *  - defaultGatewayUrl: server-pinned gateway (default http://127.0.0.1:8080).
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

  const DEFAULT_GATEWAY_URL =
    normalizeGatewayUrl(opts.defaultGatewayUrl || process.env.ABSTRACTGATEWAY_URL || "") || "http://127.0.0.1:8080";
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

  function isLoopbackHostname(hostname) {
    const h = String(hostname || "").trim().toLowerCase();
    return h === "localhost" || h === "localhost.localdomain" || h === "::1" || h.startsWith("127.");
  }

  function remoteConfigAllowed(req) {
    if (anyEnvBool(REMOTE_CONFIG_ENVS)) return true;
    return isLoopbackHostname(requestHostname(req));
  }

  function remoteConfigDenial(req) {
    const host = requestHostname(req) || "unknown host";
    return (
      `Browser-supplied Gateway URL changes are disabled for this non-local host (${host}). ` +
      "Use the server-configured Gateway URL, or enable remote browser gateway config behind your own access control."
    );
  }

  function cookieSecure(req) {
    return String(req?.headers?.["x-forwarded-proto"] || "").trim().toLowerCase() === "https" ? "; Secure" : "";
  }

  function setSessionCookies(res, req, gatewayUrl, sessionId, csrfToken, persist) {
    const secure = cookieSecure(req);
    const maxAge = persist ? "; Max-Age=2592000" : "";
    const attrs = `; Path=/; HttpOnly; SameSite=Lax${secure}${maxAge}`;
    const csrfAttrs = `; Path=/; SameSite=Lax${secure}${maxAge}`;
    res.setHeader("Set-Cookie", [
      `${URL_COOKIE}=${encodeURIComponent(gatewayUrl)}${attrs}`,
      `${SESSION_COOKIE}=${encodeURIComponent(sessionId)}${attrs}`,
      `${CSRF_COOKIE}=${encodeURIComponent(csrfToken)}${csrfAttrs}`,
    ]);
  }

  function clearSessionCookies(res, req) {
    const secure = cookieSecure(req);
    res.setHeader("Set-Cookie", [
      `${URL_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`,
      `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`,
      `${CSRF_COOKIE}=; Path=/; SameSite=Lax; Max-Age=0${secure}`,
    ]);
  }

  function browserSession(req) {
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
    const backend = new URL(String(gatewayUrl || DEFAULT_GATEWAY_URL).trim());
    if (!backend.port) backend.port = backend.protocol === "https:" ? "443" : "80";
    return {
      url: backend,
      origin: `${backend.protocol}//${backend.host}`,
      client: backend.protocol === "https:" ? https : http,
    };
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
      req.on("error", (err) =>
        resolve({ ok: false, status: 0, payload: { detail: String(err?.message || err) }, origin: backend?.origin })
      );
      if (body) req.write(body);
      req.end();
    });
  }

  async function handleConnectionApi(req, res) {
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
        headers: { Accept: "application/json", "X-AbstractGateway-Session": session.sessionId },
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
          headers: { Accept: "application/json", "Content-Type": "application/json", "Content-Length": String(body.length) },
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
    const session = browserSession(req);
    if (!session.sessionId) {
      sendJson(res, 401, { detail: "Gateway sign-in required" });
      return;
    }
    if (mutatingMethod(req.method)) {
      const presented = String(req.headers[APP_CSRF_HEADER] || req.headers[CANONICAL_CSRF_HEADER] || "").trim();
      if (!session.csrfToken || presented !== session.csrfToken) {
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
    delete headers.cookie;
    // Node lowercases incoming header names, but keep both spellings for any
    // non-node caller of this helper (observer DM 2026-07-12, flow's belt).
    delete headers.authorization;
    delete headers.Authorization;
    delete headers["x-forwarded-for"];
    delete headers["x-forwarded-host"];
    delete headers["x-forwarded-proto"];
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
    defaultGatewayUrl: DEFAULT_GATEWAY_URL,
    connectionPath: CONNECTION_PATH,
    cookieNames: { url: URL_COOKIE, session: SESSION_COOKIE, csrf: CSRF_COOKIE },
    csrfHeaderNames: [APP_CSRF_HEADER, CANONICAL_CSRF_HEADER],
  };
}
