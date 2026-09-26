# Troubleshooting

Symptom-first fixes for common AbstractUIC integration problems. Each entry names what you see,
how to confirm the cause, and the fix. For conceptual questions see the [FAQ](./faq.md); for
setup see [Getting started](./getting-started.md).

## Components render unstyled or with the wrong colors

**Symptom:** buttons, selects or chat cards appear as plain browser controls, or colors do not
follow the selected theme.

**Cause:** the CSS exports were not imported. Packages ship CSS separately from JavaScript.

**Fix:** import the theme tokens once and the stylesheet of each package you use, from your app
entrypoint:

```ts
import "@abstractframework/ui-kit/theme.css";
import "@abstractframework/panel-chat/panel_chat.css";
import "@abstractframework/monitor-flow/agent_cycles.css";
import "@abstractframework/monitor-active-memory/styles.css";
import "reactflow/dist/style.css"; // only with monitor-active-memory
```

**Verify:** the `<html>` element carries a `theme-*` class after `applyTheme(...)`, and
`getComputedStyle(document.documentElement).getPropertyValue("--bg-primary")` is not empty.

See: [Getting started](./getting-started.md#css-you-must-import), [Theming](./theming.md).

## `window is not defined` / `document is not defined` during server rendering

**Cause:** some components and helpers touch browser APIs (`window`, `document`, `navigator`,
`localStorage`).

**Fix:** render those components on the client only (a `"use client"` boundary or a dynamic
import with SSR disabled in Next.js).

See: [FAQ: Are these components SSR-safe?](./faq.md#are-these-components-ssr-safe),
[Getting started: Next.js notes](./getting-started.md#nextjs-notes).

## `Module not found: reactflow` or a blank Active Memory explorer

**Cause:** `@abstractframework/monitor-active-memory` declares `reactflow@^11` as a peer
dependency; it is not installed automatically, and its base styles are separate.

**Fix:** `npm i reactflow@^11` and import `reactflow/dist/style.css` in your app entrypoint.

See: [`monitor-active-memory/README.md`](../monitor-active-memory/README.md).

## A kit fix does not show up in your app

**Symptom:** you upgraded `@abstractframework/ui-kit` (or another package) but the browser still
shows the old behavior.

**Checks:** `npm ls @abstractframework/ui-kit` shows the version you expect; your built bundle
was produced after the upgrade.

**Fix:** rebuild your app bundle after every kit upgrade, then hard-reload open tabs. A
previously built bundle keeps serving the old kit code.

See: [Adoption guide: Versioning discipline](./adoption-guide.md#versioning-discipline).

## `<monitor-gpu>` or `<monitor-memory>` shows `N/A` or stops updating

**Causes and checks:**

- `401`/`403` from the metrics endpoint: the widget stops polling until a token is provided. Set
  `el.token` (or `el.getToken`); polling resumes.
- `404`, or a payload with `supported: false` (`<monitor-memory>`): the endpoint is marked
  unsupported and polling stops. Point `baseUrl`/`endpoint` at a host that serves the metrics;
  changing it resumes polling.
- `429` (`<monitor-memory>`): the widget backs off for 30 seconds.
- Cross-origin requests blocked in the browser console: allow your UI origin in the backend CORS
  policy.

**Verify:** call the endpoint yourself with the same token, for example
`curl -H "Authorization: Bearer $TOKEN" http://localhost:8080/api/gateway/host/metrics/memory`.

See: [`monitor-gpu/README.md`](../monitor-gpu/README.md),
[`monitor-memory/README.md`](../monitor-memory/README.md).

## The app-server proxy answers `400`, `403` or `401`

- `400` "Cannot determine the client address of this connection": the proxy could not read the
  browser connection's socket address, which it must forward to the Gateway. This happens when
  the request object passed to `handle(req, res)` is not a real Node.js `http` request (for
  example a framework adapter that drops `req.socket`). Pass the original `IncomingMessage`.

- `403` with `reason_code: "csrf_required"` on a mutating request: send the CSRF token from the
  `<appId>_gateway_csrf` cookie in the `x-<appId>-csrf` or `x-abstract-csrf` header. The ui-kit
  helpers (`submitSteer`, `readGatewayCsrfTokens`) do this for you.
- `403` "Browser-supplied Gateway URL changes are disabled for this non-local host": a
  non-loopback client tried to sign in to a Gateway URL other than the server's
  `defaultGatewayUrl`. Use the server-configured URL, or, behind your own access control, set
  `ABSTRACTGATEWAY_ALLOW_REMOTE_BROWSER_GATEWAY_CONFIG=1` (or the app-prefixed variant).
- `401` "Gateway sign-in required": the browser has no session cookie yet; sign in through
  `GatewayConnectModal` (`POST /api/connection/gateway`).

See: [`app-server/README.md`](../app-server/README.md#options),
[Architecture: Gateway connection flow](./architecture.md#gateway-connection-flow-app-server--ui-kit).

## Live replies do not appear (replies show only when complete)

- Your transport's `streamLedger` does not pass the sixth argument `onDelta`, or routes the
  `llm.delta` / `llm.delta_end` frames to `onStep`. Pass them to `onDelta` (use
  `llmDeltaFromSse(eventName, data)`) and never move the ledger cursor with them.
- The run did not ask for streaming: `_runtime.stream` is `false`, or unset while the Gateway
  default is off. Build the start-run input with `streamRepliesRuntime(mode)`.
- The chat shows "This reply is not streamed: …": the Gateway reported that this call could not
  stream (for example structured output). The reply appears when complete; no fix is needed.

**Verify:** watch the run's ledger stream in the browser's network panel; `llm.delta` events
should arrive while the model writes.

See: [panel-chat live replies](../panel-chat/README.md#live-replies-streaming),
[Architecture: Live replies](./architecture.md#live-replies-panel-chat).

## Images in assistant messages show as "image: …" links

This is the default: `ChatMessageCard` loads images in assistant and system messages only from
the page's own origin (`sameOriginImage`). Serve the image through your app's origin (for
example behind the app-server proxy), or pass `images: "inline"` or your own `inlineImage(src)`
through `messageProps`. See the [FAQ entry](./faq.md#panel-chat-why-do-images-in-assistant-messages-show-as-links).

## Console islands: `islands bundle is stale` or `AfConsoleIslands` is undefined

- `node ui-kit/scripts/build_islands.mjs --check` prints `islands bundle is stale`: the bundle on
  disk no longer matches the kit sources. Rebuild with
  `npm run build:islands -w @abstractframework/ui-kit`, then re-vendor it in the consumer.
- `window.AfConsoleIslands` is undefined in the page: the script was not loaded, or loaded after
  the code that uses it. Load `af-console-islands.js` with a plain `<script>` tag before your
  page script.
- `AfConsoleIslands: mount target missing`: the element passed to `mountTopBar`,
  `mountAppearance` or `mountAbout` does not exist yet; mount after the DOM is ready.
- Islands render but look unstyled: the bundle ships no CSS; load the kit's `theme.css` too.
- The bundle is missing after `npm install @abstractframework/ui-kit`: the islands are built
  from a repository checkout and are not part of the npm package.

**Verify:** `node ui-kit/scripts/check_islands.mjs` prints `check_islands: OK (...)`.

See: [Console islands](./console-islands.md).

## `npm test` fails in `ui-kit`

The `ui-kit` test chain runs guard scripts before and after the build. The first failing
script names the problem, for example:

- `generate_palette_seeds.mjs --check`: `palette_seeds.json` is out of date with `theme.css`;
  run `node ui-kit/scripts/generate_palette_seeds.mjs` and commit the result.
- `check_theme_tokens.mjs`: a theme block is missing a token the components use; add it to
  every theme in `theme.css`.
- `check_about.mjs`: the identity helpers, the About dialog or the shared fixture
  `scripts/fixtures/gateway_version_rows.json` disagree. When the AbstractFramework identity
  descriptor changes, copy it byte for byte into `ui-kit/src/abstractframework_identity.json`;
  when the gateway rows change, update the helper and the fixture together with the Python twin
  in AbstractCore.
- `check_islands.mjs`: see the console islands entry above.

See: [Theming: Guard scripts](./theming.md#guard-scripts), [Development](./development.md).

## Still stuck?

Open an issue on [GitHub](https://github.com/lpalbou/AbstractUIC/issues) with the package names
and versions (`npm ls @abstractframework/<package>`), the browser or Node version, and the exact
error. Report security problems privately as described in [`SECURITY.md`](../SECURITY.md).

## Related docs

- [Getting started](./getting-started.md)
- [FAQ](./faq.md)
- [API reference](./api.md)
- [Architecture](./architecture.md)
- [Docs index](./README.md)
