# @abstractframework/app-server

Server-side helpers for AbstractFramework thin-client apps.

This package exports the app-origin Gateway session proxy used by browser
clients that talk to an `AbstractGateway` without storing bearer tokens in the
browser.

## Install

- Workspace: add `@abstractframework/app-server`
- npm: `npm i @abstractframework/app-server`

## What it exports

- `createGatewaySessionProxy(options)`
- `normalizeGatewayUrl(value)`

See `app-server/src/index.d.ts` for the authoritative type surface.

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
  sign-in, sign-out, the status probe) sets `X-Forwarded-For` to the browser
  connection's socket address. A client-supplied `X-Forwarded-For`,
  `Forwarded` or `X-Real-IP` header is replaced, never passed through or
  appended, so the Gateway can tell whether the browser runs on its own
  machine. Behind your own reverse proxy, the value is the reverse proxy's
  address.
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
| `defaultGatewayUrl` | `ABSTRACTGATEWAY_URL`, else `http://127.0.0.1:8080` | The server-pinned Gateway URL. |
| `connectionPath` | `/api/connection/gateway` | Session status, sign-in and sign-out endpoint. |
| `proxyPrefix` | `/api/` | Everything under it, except `connectionPath`, is proxied to the Gateway. |
| `gatewayTimeoutMs` | `4000` | Timeout for the proxy's own calls to the Gateway (status probe, sign-in, sign-out). |
| `allowRemoteConfigEnvVars`, `allowUrlCookieEnvVars`, `trustProxyEnvVars` | none | Extra environment variable names honored beside the built-in ones below. |

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

- Run the package test directly: `npm --workspace app-server test`

## Related docs

- Root overview: [`README.md`](../README.md)
- API reference: [`docs/api.md`](../docs/api.md#abstractframeworkapp-server)
- Architecture: [`docs/architecture.md`](../docs/architecture.md#gateway-connection-flow-app-server--ui-kit)
- Adoption guide: [`docs/adoption-guide.md`](../docs/adoption-guide.md)
- Troubleshooting: [`docs/troubleshooting.md`](../docs/troubleshooting.md)
