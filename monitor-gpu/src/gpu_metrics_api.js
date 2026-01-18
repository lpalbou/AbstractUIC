function _isAbsoluteUrl(s) {
  try {
    new URL(String(s));
    return true;
  } catch {
    return false;
  }
}

export function makeGpuMetricsUrl({ baseUrl, endpoint }) {
  const ep = String(endpoint || "/api/gateway/host/metrics/gpu");
  if (_isAbsoluteUrl(ep)) {
    return ep;
  }
  if (baseUrl && String(baseUrl).trim()) {
    return new URL(ep, String(baseUrl)).toString();
  }
  return ep;
}

export async function resolveBearerToken({ token, getToken }) {
  if (typeof getToken === "function") {
    const t = await getToken();
    return t == null ? "" : String(t);
  }
  return token == null ? "" : String(token);
}

export function buildAuthHeaders({ token }) {
  const t = String(token || "").trim();
  return t ? { Authorization: `Bearer ${t}` } : {};
}

export function extractUtilizationGpuPct(payload) {
  if (!payload || typeof payload !== "object") return null;

  const direct = Number(payload.utilization_gpu_pct);
  if (Number.isFinite(direct)) return direct;

  const gpus = payload.gpus;
  if (Array.isArray(gpus) && gpus.length) {
    const vals = gpus
      .map((g) => Number(g && g.utilization_gpu_pct))
      .filter((n) => Number.isFinite(n));
    if (!vals.length) return null;
    const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
    return avg;
  }

  return null;
}

export async function fetchHostGpuMetrics({
  baseUrl,
  endpoint,
  token,
  getToken,
  signal,
  fetchImpl,
} = {}) {
  const url = makeGpuMetricsUrl({ baseUrl, endpoint });
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
