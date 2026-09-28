# @abstractframework/app-server

Server-side helpers for AbstractFramework thin-client apps.

This package gives every AbstractFramework browser app the same server side:

- **serving under the gateway's `/apps/<id>/`** (`mount.js`): the base path,
  the browser's real address, cookie paths and the identity header;
- **the launch flags** (`flags.js`): `--gateway-url`, `--port`, `--host`,
  `--help`;
- **"where is my gateway"** (`gateway_pointer.js`): the local gateway pointer
  `~/.abstractframework/gateway.json` and the one URL precedence;
- **the app-origin Gateway session proxy** used by browser clients that talk
  to an `AbstractGateway` without storing bearer tokens in the browser.

## Install

- Workspace: add `@abstractframework/app-server`
- npm: `npm i @abstractframework/app-server`

## What it exports

- Mount (serving under `/apps/<id>/`): `createMountedHandler`, `requestContext`,
  `injectShell`, `appPath`, `cookiePath`, `serializeCookie`, `parseCookies`,
  `setIdentityHeader`, `identityHeaderValue`, `rejectUpgrade`,
  `validateBasePath`, `isLoopbackAddress`, `socketPeerAddress`,
  `MountRequestError`, `APP_IDENTITY_HEADER`, `FORWARDED_PREFIX_HEADER`
- Flags: `parseAppFlags`, `parseAppFlagsOrExit`, `appUsage`, `FlagError`
- Gateway pointer: `resolveGatewayUrl`, `createGatewayUrlResolver`,
  `readGatewayPointer`, `gatewayPointerPath`, `POINTER_SCHEMA`,
  `BUILTIN_GATEWAY_URL`
- Session proxy: `createGatewaySessionProxy(options)`, `normalizeGatewayUrl(value)`

See `app-server/src/index.d.ts` for the authoritative type surface.

## Serving under the gateway (`/apps/<id>/`)

The gateway serves every browser app THROUGH itself at `/apps/<id>/`: one
port and one tunnel for the console, the API and every app. The app binds
`127.0.0.1` and the gateway relays to it, stripping the prefix and sending:

| Header | Value |
|---|---|
| `X-Forwarded-Prefix` | `/apps/<id>` |
| `X-Forwarded-For` | the browser's address (written by the gateway, never passed through) |
| `X-Forwarded-Proto`, `X-Forwarded-Host` | what the browser used |
| `Cookie` | the app's own cookies only (`<appId>_*`) |

The rules an app follows:

1. **Announce it.** Every response carries
   `X-AbstractFramework-App: <id>; mount=1` (`<id>` is the gateway's catalog id:
   `observer`, `continuum`, `code`, `entity`, `flow`). The gateway serves ONLY
   an app that announces it: without the rules below, an app behind the
   gateway would read every visitor as local. `createMountedHandler` sets it.
2. **Decide "who is asking" with `requestContext(req).clientAddress`**, never
   `req.socket.remoteAddress` (behind the gateway the socket peer is always
   loopback). Forwarded headers are believed ONLY from a loopback socket peer;
   from any other peer they are ignored. Every app-local privileged check (a
   folder reveal, opening something on the host, a browser-chosen gateway URL)
   uses `clientIsLoopback`, and only that field. It is true only when the
   client address is loopback AND the request names a loopback host
   (`hostIsLoopback`: the `Host` header, and the `X-Forwarded-Host` the gateway
   sends, are `localhost`, `*.localhost`, `::1` or a `127.x` IP literal). A
   DNS-rebinding page, a hostile name resolving to 127.0.0.1 that can add
   `X-Forwarded-*` headers itself, is therefore never local. The session proxy
   below uses the same field.
3. **Generate URLs under the base path.** Assets and fetches use RELATIVE URLs
   (`assets/app.js`, `api/...`; build with a relative base, e.g. Vite
   `base: "./"`); `injectShell` puts `<base href="<basePath>/">` first in
   `<head>` and `base_path` in `window.__ABSTRACT_UI_CONFIG__`. Server-side
   redirects use `appPath(ctx.basePath, "/x")`. A service worker registers
   relative to the base.
4. **Cookies at `Path=<basePath>/`** (`serializeCookie(name, value, {basePath})`),
   read with `parseCookies`. With two cookies of the same name, the first value
   wins: browsers send a longer-Path cookie first, so a `Path=/apps/<id>/`
   cookie is read before a `Path=/` one left by the same app at its own port
   on the same host. This chooses which value the app reads. It is not
   isolation (next point).
5. **One origin, one trust domain.** Every app mounted under the gateway's
   `/apps/*` and the gateway console share ONE origin
   (`https://gateway.example.com`). A script running in one app can request
   another app's paths (`/apps/flow/...`), read the responses, and call the
   gateway's API with whatever session the browser holds. Cookie `Path` scoping
   decides which cookie a request carries by default; it does not stop such a
   script. So every app served there must be trusted as much as the console
   itself: never render untrusted HTML or scripts, keep model output out of the
   DOM as markup, and do not add third-party script origins. The gateway's
   per-app session gate, cookie filtering and cross-origin refusal protect
   against OTHER origins, not against a compromised app on the same one.
6. **Refuse, do not guess.** A malformed `X-Forwarded-*` from a loopback peer
   or an unknown socket peer is a 400 (`MountRequestError`); the base path is
   `""` or `/seg/seg` with unreserved characters only, never `.` or `..`.

```js
import http from "node:http";
import {
  createGatewaySessionProxy, createMountedHandler, injectShell, parseAppFlagsOrExit,
  requestContext, rejectUpgrade,
} from "@abstractframework/app-server";

const flags = parseAppFlagsOrExit(process.argv.slice(2), {
  appName: "AbstractObserver", command: "abstractobserver",
  envPrefix: "ABSTRACTOBSERVER", defaultPort: 3001,
  extra: { "monitor-gpu": { type: "boolean", help: "Show the GPU monitor." } },
});
const proxy = createGatewaySessionProxy({ appId: "abstractobserver", defaultGatewayUrl: flags.gatewayUrl });

const server = http.createServer(createMountedHandler({ appId: "observer" }, (req, res, ctx) => {
  const p = new URL(req.url, "http://app.invalid").pathname;
  if (p === "/api/local/reveal" && !ctx.clientIsLoopback) { res.writeHead(403); res.end(); return; }
  if (proxy.handle(req, res, p)) return;
  if (p === "/" || p === "/index.html") {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(injectShell(indexHtml, { basePath: ctx.basePath, config: { gateway_url: proxy.defaultGatewayUrl } }));
    return;
  }
  // ... static files, SPA fallback
}));
server.on("upgrade", (req, socket, head) => {
  let ctx;
  try { ctx = requestContext(req); } catch (err) { return rejectUpgrade(socket, 400, err.message); }
  // ... ctx.clientAddress is the browser; the identity header goes on the 101 too
});
server.listen(flags.port, flags.host);
```

`test/fixtures/mount_app.mjs` is a complete, runnable mount-capable app (page,
asset, session proxy, SSE, WebSocket echo) used by this package's tests and by
the gateway's end-to-end test.

## Launch flags

`parseAppFlags(argv, options)` / `parseAppFlagsOrExit(argv, options)` (prints
`--help` and exits 0; prints a bad flag and exits 2):

- `--gateway-url <url>` (aliases `--gateway`, `--url`), `--port <n>`,
  `--host <addr>` (default `127.0.0.1`), `--help`/`-h`, plus the app's own
  `extra` flags (`{name: {type: "boolean" | "string", help, metavar}}`).
  `--name value` and `--name=value` both work; an unknown flag, a missing value
  or a bad port/URL throws `FlagError`.
- Environment variables are LEGACY aliases only, below every flag: `PORT`,
  `HOST`, `<envPrefix>_GATEWAY_URL`, `ABSTRACTGATEWAY_URL`.
- Returns `{help, usage, port, host, gatewayUrl, gatewayUrlSource, extra}`;
  `gatewayUrlSource` is `flag`, `env:<NAME>`, `saved`, `pointer` or `default`.
  Pass the app's saved login URL as `savedUrl`.

## Where is my gateway (`~/.abstractframework/gateway.json`)

The gateway's `serve` and the installer write
`{"schema": 1, "url", "port", "data_dir", "updated_at", "written_by"}` where
this computer's installed gateway listens (no token, no liveness).
`readGatewayPointer()` believes it only when `schema` is 1, the url is
http(s) on `127.0.0.1`, `[::1]` or `localhost` with nothing after the port, and
(POSIX) the file is a regular file owned by the current user; otherwise it is
ignored with ONE warning (a missing file is silent).

`resolveGatewayUrl({flag, env, savedUrl})` applies the one precedence:

1. the launch flag;
2. the legacy environment, in the order given;
3. the saved login, except a saved `http://127.0.0.1:8080` (the old built-in
   default), which the pointer replaces;
4. the pointer's `url`;
5. `http://127.0.0.1:8080`.

`createGatewayUrlResolver(options)` keeps that answer for a long-running
server: `current()`, and `refresh()` (re-reads the pointer; the session proxy
calls it when a connection to the gateway is refused, so a running app
follows the gateway onto a new port). A flag or environment choice never
moves. The shared reader case table for every language is
`ui-kit/scripts/fixtures/gateway_pointer/cases.json`.

## When to use it

Use this package when your app serves a browser UI on its own origin and wants
to front an `AbstractGateway` through first-party cookies instead of direct
browser-held tokens.

The proxy's contract is:

- `GET /api/connection/gateway` returns the current browser-session status.
- `POST /api/connection/gateway` exchanges a Gateway user/token for an
  HttpOnly session cookie plus a JS-readable CSRF twin.
- `DELETE /api/connection/gateway` signs the browser session out.
- Proxied `/api/*` traffic strips browser-supplied `Authorization` and cookie
  headers, reattaches the server-held session, and pins the upstream Gateway
  URL server-side.
- Every call the proxy makes to the Gateway for a browser (proxied `/api/*`,
  sign-in, sign-out, the status probe) sets `X-Forwarded-For` to the
  browser's address: `requestContext(req).clientAddress` (the socket peer,
  or, from a loopback peer such as the gateway's `/apps/<id>/` proxy, the
  address it forwarded). The header is written once, never appended, so the
  Gateway can tell whether the browser runs on its own machine. From a
  non-loopback peer a client-supplied `X-Forwarded-For`, `Forwarded` or
  `X-Real-IP` is ignored.
- Mounted under a base path, the session cookies carry `Path=<basePath>/`;
  sign-out clears both that path and `/`.
- Every call to the Gateway also carries `X-AbstractFramework-App-Proxy: <appId>`
  (the `appId` you pass to `createGatewaySessionProxy`, which is required). A
  client-supplied value of that header is dropped. The Gateway uses it to tell
  requests that come through an app server from direct clients.
- A connection whose socket address cannot be determined is refused with `400`
  ("Cannot determine the client address of this connection").

The browser never needs to persist the Gateway token.

## Minimal usage

```js
import http from "node:http";

import { createGatewaySessionProxy } from "@abstractframework/app-server";

const gatewayProxy = createGatewaySessionProxy({
  appId: "my-app",
  defaultGatewayUrl: process.env.ABSTRACTGATEWAY_URL || "http://127.0.0.1:8080",
});

const server = http.createServer(async (req, res) => {
  const pathname = new URL(req.url || "/", "http://127.0.0.1").pathname;
  if (gatewayProxy.handle(req, res, pathname)) return;

  if (pathname === "/healthz") {
    res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("ok");
    return;
  }

  res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
  res.end("not found");
});

server.listen(3000);
```

## Options

`createGatewaySessionProxy(options)` accepts (types: `GatewaySessionProxyOptions` in
`src/index.d.ts`):

| Option | Default | Meaning |
| --- | --- | --- |
| `appId` | required | Short id matching `[a-z0-9-]+`. Names the cookies (`<appId>_gateway_session`, `<appId>_gateway_csrf`, `<appId>_gateway_url`), the app CSRF header `x-<appId>-csrf` (the shared `x-abstract-csrf` is always accepted too) and the `X-AbstractFramework-App-Proxy` value. |
| `defaultGatewayUrl` | `ABSTRACTGATEWAY_URL` (legacy), else the local gateway pointer, else `http://127.0.0.1:8080` | The server-pinned Gateway URL: a string (e.g. `flags.gatewayUrl`) or a resolver from `createGatewayUrlResolver()`. |
| `connectionPath` | `/api/connection/gateway` | Session status, sign-in and sign-out endpoint. |
| `proxyPrefix` | `/api/` | Everything under it, except `connectionPath`, is proxied to the Gateway. |
| `gatewayTimeoutMs` | `4000` | Timeout for the proxy's own calls to the Gateway (status probe, sign-in, sign-out). |
| `allowRemoteConfigEnvVars`, `allowUrlCookieEnvVars`, `trustProxyEnvVars` | none | Extra environment variable names honored beside the built-in ones below. |

Without a switch, a browser may choose a Gateway URL other than `defaultGatewayUrl` (or have
its URL cookie honoured) only when it is on this machine: its address
(`requestContext(req).clientAddress`) is loopback AND the `Host` header names loopback
(`localhost`, `*.localhost`, `::1` or a `127.x` IP literal, never a DNS name), and so does
`X-Forwarded-Host` when the gateway's loopback proxy sends one. A DNS-rebinding page (a hostile
name resolving to 127.0.0.1, which can add `X-Forwarded-*` headers itself) is refused. The
`Secure` cookie flag follows `X-Forwarded-Proto: https` from a loopback peer only. The app's own
CSRF headers (`x-<appId>-csrf`, `x-abstract-csrf`) are checked here and never sent to the
Gateway, which gets its own `X-AbstractGateway-CSRF`.

Environment switches (each accepts a truthy value such as `1`), with `<APPID>` the upper-cased
`appId` (`-` becomes `_`):

- `ABSTRACTGATEWAY_ALLOW_REMOTE_BROWSER_GATEWAY_CONFIG` / `<APPID>_ALLOW_REMOTE_BROWSER_GATEWAY_CONFIG`:
  let non-loopback browsers choose a Gateway URL other than `defaultGatewayUrl`.
- `<APPID>_ALLOW_BROWSER_GATEWAY_URL_COOKIE`: honor the browser's Gateway URL cookie (also
  enabled by the remote-config switch).
- `ABSTRACTGATEWAY_TRUST_PROXY_HEADERS` / `<APPID>_TRUST_PROXY_HEADERS`: declare that your app
  runs behind a reverse proxy you control. The socket peer is then the reverse proxy, so a
  loopback peer no longer unlocks browser-supplied Gateway URLs (set the remote-config switch
  explicitly if you need them), and the request host is read from `X-Forwarded-Host`.

## Browser pairing

This package is the server-side half of the shared connection surface described
in:

- `@abstractframework/ui-kit` `GatewayConnectModal`
- `@abstractframework/ui-kit` `useGatewayConnection(...)`

That pairing gives apps a shared browser UX and one server-side session model.

## Scope boundary

`@abstractframework/app-server` is specific to `AbstractGateway`. Use it when
your browser app talks to a Gateway-backed session surface. A product that
needs a generic same-origin browser shell with different upstream auth or
transport semantics should define its own contract rather than reuse this
package.

## Development

- Run the package tests directly: `npm --workspace app-server test`
  (`gateway_session_proxy`, `mount` with the fixture app, `flags_and_pointer`
  against the shared pointer cases; every test uses a scratch home).

## Related docs

- Root overview: [`README.md`](../README.md)
- API reference: [`docs/api.md`](../docs/api.md#abstractframeworkapp-server)
- Architecture: [`docs/architecture.md`](../docs/architecture.md#gateway-connection-flow-app-server--ui-kit)
- Adoption guide: [`docs/adoption-guide.md`](../docs/adoption-guide.md)
- Troubleshooting: [`docs/troubleshooting.md`](../docs/troubleshooting.md)
