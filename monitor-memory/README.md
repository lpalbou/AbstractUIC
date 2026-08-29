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
- Device: `device.backend` plus, in preference order,
  - used: `device.host_in_use_bytes` (accelerator heap across all processes) →
    `device.allocated_bytes` (PROCESS-LOCAL; derivable from `total_bytes - free_bytes`)
  - ceiling: `device.wired_limit_bytes` (the real accelerator limit) → `device.total_bytes`

  `allocated_bytes` is process-local and reads `0` on Apple silicon while tens of
  GB are resident in another process, so the across-processes figure always wins
  when present. The returned device part carries `scope`, plus a ready-to-render
  `label` and `note`:

  | `scope` | `label` | source |
  |---|---|---|
  | `"all_processes"` | `Accelerator heap · <backend> (all processes)` | `host_in_use_bytes` |
  | `"process"` | `Accelerator heap · <backend> (this process only)` | `allocated_bytes` |

  `<backend>` is `device.backend` (`metal`, `cuda`, `mps`); an unknown/empty
  backend renders as the literal `device`. The `note` is always
  `memory-mapped GGUF weights are not counted here`, and the widget attaches it
  as the accelerator meter's `title` tooltip.

### Byte formatting: binary math, binary labels

`formatBytes(bytes)` is exported and is what the widget's tooltip uses. It is
**binary** (IEC): `B` / `KiB` / `MiB` / `GiB` / `TiB`, one decimal place,
dividing by 1024. Memory is binary wherever it is configured or reported — a
128 GiB Mac reads 137,438,953,472 bytes exactly, and
`sysctl iogpu.wired_limit_mb=110000` lands on 115,343,360,000 = 107.4 GiB.

It is byte-identical to the formatters in the AbstractGateway web console, the
gateway console-TUI, abstractcode-tui and abstractflow, so the same payload
renders the same string on every surface. It used to not be: three surfaces
divided by 1024 and LABELLED the result `GB`, while the web console divided by
1e9 — one 89,986,353,824-byte GGUF read `83.8 GB` in the TUIs and `89.99 GB` on
the web. Non-finite or negative input returns `""`, never a fabricated `0 B`.

### What the accelerator meter is (and is not)

The second meter is **accelerator-heap memory**: driver-allocated accelerator
buffers, counted across processes (MLX, and MLX-engine servers such as LM
Studio). Its ceiling is the accelerator-heap ceiling (`wired_limit_bytes`, else
`device.total_bytes`).

It is **not** the machine's total memory use. **RAM is the primary system
meter** — it stays first, and it is the meter to read as "how full is this
machine".

**Memory-mapped GGUF/llama.cpp weights do NOT appear in the accelerator
figure.** llama.cpp maps the `.gguf` from disk and wraps those pages with
`newBufferWithBytesNoCopy`: they are file-backed, no-copy buffers that never
become driver-allocated accelerator memory. They show up instead as the serving
process's RSS and as the model's own reported weight size. A fully offloaded
90 GB GGUF can therefore sit beside an accelerator figure of well under 1 GB,
and an itemized model total routinely exceeds this figure — that is the normal
GGUF case, not an inconsistency.

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
