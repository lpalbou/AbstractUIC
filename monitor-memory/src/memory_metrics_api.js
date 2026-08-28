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
    const backend = typeof deviceRaw.backend === "string" ? deviceRaw.backend : "";
    const totalBytes = _num(deviceRaw.total_bytes);
    const freeBytes = _num(deviceRaw.free_bytes);
    let usedBytes = _num(deviceRaw.allocated_bytes);
    if (usedBytes == null && totalBytes != null && freeBytes != null) {
      usedBytes = Math.max(0, totalBytes - freeBytes);
    }
    if (usedBytes != null && totalBytes != null && totalBytes > 0) {
      device = { backend, usedBytes, totalBytes, pct: _clampPct((usedBytes / totalBytes) * 100) };
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
