# @abstractutils/monitor-gpu

Small, dependency-free GPU utilization widget that renders a mini histogram and polls a secured backend endpoint.

In AbstractFramework deployments, the default backend endpoint is AbstractGateway:
- `GET /api/gateway/host/metrics/gpu`
- Auth: `Authorization: Bearer <token>`

## Install

```bash
npm i @abstractutils/monitor-gpu
```

## Usage (Custom Element)

```js
import { registerMonitorGpuWidget } from "@abstractutils/monitor-gpu";

registerMonitorGpuWidget(); // defines <monitor-gpu>

const el = document.createElement("monitor-gpu");
el.baseUrl = "http://localhost:8080"; // optional (defaults to same-origin)
el.token = "your-gateway-token"; // or el.getToken = async () => ...
el.tickMs = 1500;
el.historySize = 20;
document.body.appendChild(el);
```

You can also set the non-secret options via attributes:

```html
<monitor-gpu base-url="http://localhost:8080" tick-ms="1500" history-size="20"></monitor-gpu>
```

## Usage (Imperative helper)

```js
import { createMonitorGpuWidget } from "@abstractutils/monitor-gpu";

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

The widget expects JSON like:

```json
{ "supported": true, "utilization_gpu_pct": 23.0 }
```

If `supported=false`, the widget shows `N/A`.

## Security notes
- Do not pass tokens in URLs.
- For cross-origin usage, ensure `ABSTRACTGATEWAY_ALLOWED_ORIGINS` includes your UI origin (and serve behind HTTPS in production).

