# @abstractframework/monitor-gpu

Small, dependency-free GPU utilization widget that renders a mini histogram and polls a secured backend endpoint.

In AbstractFramework deployments, the default backend endpoint is AbstractGateway:
- `GET /api/gateway/host/metrics/gpu`
- Auth: `Authorization: Bearer <token>`

## Install

- Workspace: add a dependency on `@abstractframework/monitor-gpu`
- npm (once published): `npm i @abstractframework/monitor-gpu`

## Usage (Custom Element)

```js
import { registerMonitorGpuWidget } from "@abstractframework/monitor-gpu";

registerMonitorGpuWidget(); // defines <monitor-gpu>

const el = document.createElement("monitor-gpu");
el.baseUrl = "http://localhost:8080"; // optional (defaults to same-origin)
el.token = "your-gateway-token"; // or el.getToken = async () => ...
el.tickMs = 1500;
el.historySize = 20;
el.mode = "full"; // "full" | "icon"
document.body.appendChild(el);
```

You can also set the non-secret options via attributes:

```html
<monitor-gpu base-url="http://localhost:8080" tick-ms="1500" history-size="20" mode="icon"></monitor-gpu>
```

## Usage (Imperative helper)

```js
import { createMonitorGpuWidget } from "@abstractframework/monitor-gpu";

const widget = createMonitorGpuWidget(document.querySelector("#gpu"), {
  baseUrl: "http://localhost:8080",
  token: "your-gateway-token",
  tickMs: 1500,
  historySize: 20,
});

// later
widget.destroy();
```

## Backend contract (AbstractGateway)

The widget treats the GPU metrics payload as “supported” unless `supported === false` and extracts utilization via `extractUtilizationGpuPct(payload)`:

- `payload.utilization_gpu_pct` (number) **or**
- `payload.gpus[][].utilization_gpu_pct` (numbers; averaged)

Minimal examples:

```json
{ "supported": true, "utilization_gpu_pct": 23.0 }
```

```json
{ "supported": true, "gpus": [{ "utilization_gpu_pct": 10.0 }, { "utilization_gpu_pct": 36.0 }] }
```

If `supported=false`, the widget shows `N/A`.

## Security notes
- Do not pass tokens in URLs.
- For cross-origin usage, ensure `ABSTRACTGATEWAY_ALLOWED_ORIGINS` includes your UI origin (and serve behind HTTPS in production).

## Tests

```bash
cd monitor-gpu
npm test
```

## Related docs

- Getting started: [`docs/getting-started.md`](../docs/getting-started.md)
- API reference: [`docs/api.md`](../docs/api.md)
- Architecture: [`docs/architecture.md`](../docs/architecture.md)
