# @abstractframework/app-server

Server-side helpers for AbstractFramework thin-client apps.

Today this package exports the app-origin Gateway session proxy used by browser
clients that must talk to an `AbstractGateway` without storing bearer tokens in
the browser.

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

## Browser pairing

This package is the server-side half of the shared connection surface described
in:

- `@abstractframework/ui-kit` `GatewayConnectModal`
- `@abstractframework/ui-kit` `useGatewayConnection(...)`

That pairing gives apps a shared browser UX and one server-side session model.

## Scope boundary

`@abstractframework/app-server` is intentionally `AbstractGateway`-specific
today. It is the honest package to use when the browser app is talking to a
Gateway-backed session surface. If a different product needs a generic
same-origin browser shell with different upstream auth or transport semantics,
that contract should be named by that product rather than silently inherited
through this package.

## Development

- Run the package test directly: `npm --workspace app-server test`

## Related docs

- Root overview: `../README.md`
- Architecture: `../docs/architecture.md`
- Adoption guide: `../docs/adoption-guide.md`
