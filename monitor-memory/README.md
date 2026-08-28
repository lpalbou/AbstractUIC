# @abstractframework/monitor-memory

Small, dependency-free host memory widget that renders compact RAM + device (GPU/accelerator) meters and polls a secured backend endpoint.

In AbstractFramework deployments, the default backend endpoint is AbstractGateway:
- `GET /api/gateway/host/metrics/memory`
- Auth: `Authorization: Bearer <token>`

## Install

- Workspace: add a dependency on `@abstractframework/monitor-memory`
- npm: `npm i @abstractframework/monitor-memory`

## Usage (Custom Element)

```js
import { registerMonitorMemoryWidget } from "@abstractframework/monitor-memory";

registerMonitorMemoryWidget(); // defines <monitor-memory>

const el = document.createElement("monitor-memory");
el.baseUrl = "http://localhost:8080"; // optional (defaults to same-origin)
el.token = "your-gateway-token"; // or el.getToken = async () => ...
el.tickMs = 5000; // minimum 1000
el.mode = "full"; // "full" | "icon"
document.body.appendChild(el);
```

You can also set the non-secret options via attributes:

```html
<monitor-memory base-url="http://localhost:8080" tick-ms="5000" mode="icon" endpoint="/api/gateway/host/metrics/memory"></monitor-memory>
```

## Usage (Imperative helper)

```js
import { createMonitorMemoryWidget } from "@abstractframework/monitor-memory";

const widget = createMonitorMemoryWidget(document.querySelector("#mem"), {
  baseUrl: "http://localhost:8080",
  token: "your-gateway-token",
  tickMs: 5000,
});

// later
widget.destroy();
```

## Backend contract (AbstractGateway)

The widget extracts usage via `extractMemoryUsage(payload)`. It accepts the memory object directly or nested under a `memory` key (as Gateway's `/host/state` payload does):

- RAM: `ram.percent`, or derived from `ram.used_bytes` / `ram.total_bytes`
  (with `used_bytes` itself derivable from `total_bytes - available_bytes`)
- Device: `device.backend` plus `device.allocated_bytes` / `device.total_bytes`
  (with `allocated_bytes` derivable from `total_bytes - free_bytes`)

Minimal example:

```json
{ "supported": true, "ram": { "percent": 62.0 }, "device": { "backend": "mps", "allocated_bytes": 8589934592, "total_bytes": 34359738368 } }
```

A payload with no usable memory numbers renders as missing meters rather than fake values.

## Unsupported and degraded endpoints

- A `404` response or a payload with `supported: false` marks the endpoint
  unsupported: the widget shows `N/A` and stops polling instead of re-asking a
  route that does not serve memory metrics. Changing `endpoint`/`base-url`
  clears that verdict and resumes polling.
- `401`/`403` stops polling until a token is provided; setting `token` resumes.
- `429` backs off for 30 seconds before resuming.

## Theming

Layout and colors can be tuned with CSS custom properties on the host element, all prefixed `--monitor-memory-*` (for example `--monitor-memory-width`, `--monitor-memory-bar-height`, `--monitor-memory-bg`, `--monitor-memory-border`, `--monitor-memory-radius`, `--monitor-memory-padding`). Meter fills use a green-to-red ramp by usage.

## Security notes
- Do not pass tokens in URLs.
- Prefer HTTPS in production.
- For cross-origin usage, configure your backend CORS policy to allow your UI origin and keep the endpoint protected (Bearer token or equivalent).

## Tests

```bash
cd monitor-memory
npm test
```

## Related docs

- Getting started: [`docs/getting-started.md`](../docs/getting-started.md)
- API reference: [`docs/api.md`](../docs/api.md)
- Architecture: [`docs/architecture.md`](../docs/architecture.md)
