function _isAbsoluteUrl(s) {
  try {
    new URL(String(s));
    return true;
  } catch {
    return false;
  }
}

export function makeMemoryMetricsUrl({ baseUrl, endpoint } = {}) {
  const ep = String(endpoint || "/api/gateway/host/metrics/memory");
  if (_isAbsoluteUrl(ep)) {
    return ep;
  }
  if (baseUrl && String(baseUrl).trim()) {
    return new URL(ep, String(baseUrl)).toString();
  }
  return ep;
}

export async function resolveBearerToken({ token, getToken } = {}) {
  if (typeof getToken === "function") {
    const t = await getToken();
    return t == null ? "" : String(t);
  }
  return token == null ? "" : String(token);
}

export function buildAuthHeaders({ token } = {}) {
  const t = String(token || "").trim();
  return t ? { Authorization: `Bearer ${t}` } : {};
}

function _num(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function _clampPct(n) {
  return Math.min(100, Math.max(0, n));
}

function _obj(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : null;
}

const _KiB = 1024;
const _MiB = 1024 * _KiB;
const _GiB = 1024 * _MiB;
const _TiB = 1024 * _GiB;

/**
 * Human-readable byte size: BINARY math with BINARY labels (IEC).
 *
 * Byte-identical to the gateway console (`_fmtBytes`), console-tui and
 * abstractcode-tui (`human_bytes`) and abstractflow (`formatBytes`) — the same
 * byte count must read the same string on every surface that shows this
 * payload. Memory is binary wherever it is configured or reported: the host
 * this widget was built against reads 137,438,953,472 B = 128.0 GiB exactly,
 * and `sysctl iogpu.wired_limit_mb=110000` lands on 115,343,360,000 B =
 * 107.4 GiB. Do not switch to 1e9 "because GB": three surfaces already divided
 * by 1024 and only LABELLED it `GB`, which is how one 89,986,353,824 B GGUF
 * came to read `89.99 GB` on the web console and `83.8 GB` in the TUIs.
 *
 * Returns "" for non-finite or negative input, so callers can fall back to
 * their own placeholder rather than print a fake number.
 */
export function formatBytes(value) {
  // Deliberately NOT `Number(value)`: `Number(null)` is 0, and a widget that
  // renders a missing figure as `0 B` is inventing a measurement. Same guard,
  // same rejections as abstractflow's `formatBytes`.
  const n = value;
  if (typeof n !== "number" || !Number.isFinite(n) || n < 0) return "";
  if (n < _KiB) return `${n} B`;
  if (n < _MiB) return `${(n / _KiB).toFixed(1)} KiB`;
  if (n < _GiB) return `${(n / _MiB).toFixed(1)} MiB`;
  if (n < _TiB) return `${(n / _GiB).toFixed(1)} GiB`;
  return `${(n / _TiB).toFixed(1)} TiB`;
}

/**
 * The accelerator figure counts driver-allocated accelerator buffers. It is
 * BLIND to memory-mapped GGUF/llama.cpp weights: llama.cpp mmaps the `.gguf`
 * and wraps the pages with `newBufferWithBytesNoCopy`, so they never become
 * driver-allocated accelerator memory. Every surface must ship this note with
 * the figure.
 */
export const ACCELERATOR_NOTE = "memory-mapped GGUF weights are not counted here";

/**
 * Builds the scoped accelerator label. The scope words are exactly
 * `all processes` and `this process only`. Never reword them into anything
 * that reads as whole-system usage — this figure does not measure that, and
 * RAM (the first meter) is the machine's memory meter.
 */
export function acceleratorLabel(backend, scope) {
  const name = String(backend || "").trim() || "device";
  const suffix = scope === "process" ? "this process only" : "all processes";
  return `Accelerator heap · ${name} (${suffix})`;
}

/**
 * Reads RAM and device (GPU/accelerator) memory usage from a host memory
 * metrics payload. Accepts either the memory object directly or a payload
 * nesting it under `memory` (as `/host/state` does). Returns null when the
 * payload carries no usable memory numbers.
 */
export function extractMemoryUsage(payload) {
  const top = _obj(payload);
  if (!top) return null;
  const root = _obj(top.memory) || top;

  let ram = null;
  const ramRaw = _obj(root.ram);
  if (ramRaw) {
    const totalBytes = _num(ramRaw.total_bytes);
    const availableBytes = _num(ramRaw.available_bytes);
    let usedBytes = _num(ramRaw.used_bytes);
    if (usedBytes == null && totalBytes != null && availableBytes != null) {
      usedBytes = Math.max(0, totalBytes - availableBytes);
    }
    let pct = _num(ramRaw.percent);
    if (pct == null && usedBytes != null && totalBytes != null && totalBytes > 0) {
      pct = (usedBytes / totalBytes) * 100;
    }
    if (pct != null) {
      ram = { usedBytes, totalBytes, pct: _clampPct(pct) };
    }
  }

  let device = null;
  const deviceRaw = _obj(root.device);
  if (deviceRaw) {
    // `allocated_bytes` is PROCESS-LOCAL: on Apple silicon it reads 0 while
    // tens of GB are resident in another process, so a widget trusting it
    // paints an empty bar next to a full accelerator. `host_in_use_bytes`
    // counts driver-allocated accelerator buffers across ALL processes and
    // `wired_limit_bytes` is the real accelerator-heap ceiling (`total_bytes`
    // is the whole unified pool, not what the accelerator may take). Both win
    // whenever present. Neither figure is the machine's memory use: `scope`,
    // `label` and `note` carry the honest scope so no caller has to
    // reconstruct it (and none may present this as whole-system usage).
    const backend = typeof deviceRaw.backend === "string" ? deviceRaw.backend : "";
    const hostInUseBytes = _num(deviceRaw.host_in_use_bytes);
    const wiredLimitBytes = _num(deviceRaw.wired_limit_bytes);
    const deviceTotalBytes = _num(deviceRaw.total_bytes);
    const freeBytes = _num(deviceRaw.free_bytes);
    let processBytes = _num(deviceRaw.allocated_bytes);
    if (processBytes == null && deviceTotalBytes != null && freeBytes != null) {
      processBytes = Math.max(0, deviceTotalBytes - freeBytes);
    }
    const scope = hostInUseBytes == null ? "process" : "all_processes";
    const usedBytes = hostInUseBytes == null ? processBytes : hostInUseBytes;
    const totalBytes = wiredLimitBytes == null ? deviceTotalBytes : wiredLimitBytes;
    if (usedBytes != null && totalBytes != null && totalBytes > 0) {
      device = {
        backend,
        scope,
        label: acceleratorLabel(backend, scope),
        note: ACCELERATOR_NOTE,
        usedBytes,
        totalBytes,
        pct: _clampPct((usedBytes / totalBytes) * 100),
      };
    }
  }

  if (!ram && !device) return null;
  return { ram, device };
}

export async function fetchHostMemoryMetrics({
  baseUrl,
  endpoint,
  token,
  getToken,
  signal,
  fetchImpl,
} = {}) {
  const url = makeMemoryMetricsUrl({ baseUrl, endpoint });
  const resolvedToken = await resolveBearerToken({ token, getToken });

  const f = fetchImpl || globalThis.fetch;
  if (typeof f !== "function") {
    return {
      ok: false,
      status: 0,
      error: "fetch_unavailable",
      payload: null,
    };
  }

  let res;
  try {
    res = await f(url, {
      method: "GET",
      headers: {
        Accept: "application/json",
        ...buildAuthHeaders({ token: resolvedToken }),
      },
      signal,
    });
  } catch (e) {
    return {
      ok: false,
      status: 0,
      error: "network_error",
      detail: e instanceof Error ? e.message : String(e),
      payload: null,
    };
  }

  let payload = null;
  try {
    payload = await res.json();
  } catch {
    payload = null;
  }

  return {
    ok: res.ok,
    status: res.status,
    error: res.ok ? null : "http_error",
    payload,
  };
}
