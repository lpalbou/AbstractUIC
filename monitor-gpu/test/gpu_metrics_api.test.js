import test from "node:test";
import assert from "node:assert/strict";

import { buildAuthHeaders, extractUtilizationGpuPct, fetchHostGpuMetrics, makeGpuMetricsUrl } from "../src/gpu_metrics_api.js";

test("makeGpuMetricsUrl uses baseUrl + relative endpoint", () => {
  const url = makeGpuMetricsUrl({
    baseUrl: "http://localhost:8080",
    endpoint: "/api/gateway/host/metrics/gpu",
  });
  assert.equal(url, "http://localhost:8080/api/gateway/host/metrics/gpu");
});

test("buildAuthHeaders builds Bearer header", () => {
  assert.deepEqual(buildAuthHeaders({ token: "t" }), { Authorization: "Bearer t" });
  assert.deepEqual(buildAuthHeaders({ token: "" }), {});
});

test("extractUtilizationGpuPct reads direct and averages gpus[]", () => {
  assert.equal(extractUtilizationGpuPct({ utilization_gpu_pct: 12.5 }), 12.5);
  assert.equal(
    extractUtilizationGpuPct({ gpus: [{ utilization_gpu_pct: 10 }, { utilization_gpu_pct: 30 }] }),
    20,
  );
  assert.equal(extractUtilizationGpuPct({ supported: false }), null);
});

test("fetchHostGpuMetrics attaches Authorization header", async () => {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    return {
      ok: true,
      status: 200,
      async json() {
        return { supported: true, utilization_gpu_pct: 42 };
      },
    };
  };

  const r = await fetchHostGpuMetrics({
    baseUrl: "http://localhost:8080",
    token: "t",
    fetchImpl,
  });

  assert.equal(r.ok, true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "http://localhost:8080/api/gateway/host/metrics/gpu");
  assert.equal(calls[0].init.headers.Authorization, "Bearer t");
});

