import test from "node:test";
import assert from "node:assert/strict";

import {
  buildAuthHeaders,
  extractMemoryUsage,
  fetchHostMemoryMetrics,
  makeMemoryMetricsUrl,
} from "../src/memory_metrics_api.js";

test("makeMemoryMetricsUrl defaults to the gateway host memory endpoint", () => {
  assert.equal(makeMemoryMetricsUrl(), "/api/gateway/host/metrics/memory");
  assert.equal(
    makeMemoryMetricsUrl({ baseUrl: "http://localhost:8080" }),
    "http://localhost:8080/api/gateway/host/metrics/memory",
  );
  assert.equal(
    makeMemoryMetricsUrl({ endpoint: "https://example.test/mem" }),
    "https://example.test/mem",
  );
});

test("buildAuthHeaders builds Bearer header", () => {
  assert.deepEqual(buildAuthHeaders({ token: "t" }), { Authorization: "Bearer t" });
  assert.deepEqual(buildAuthHeaders({ token: "" }), {});
});

test("extractMemoryUsage reads ram percent and device allocation", () => {
  const usage = extractMemoryUsage({
    ram: { total_bytes: 1000, available_bytes: 400, used_bytes: 600, percent: 60 },
    device: { backend: "mps", allocated_bytes: 250, total_bytes: 1000, free_bytes: 750 },
  });
  assert.ok(usage);
  assert.equal(usage.ram.pct, 60);
  assert.equal(usage.ram.usedBytes, 600);
  assert.equal(usage.ram.totalBytes, 1000);
  assert.equal(usage.device.pct, 25);
  assert.equal(usage.device.backend, "mps");
});

test("extractMemoryUsage derives missing used/percent values", () => {
  const usage = extractMemoryUsage({
    ram: { total_bytes: 1000, available_bytes: 250 },
    device: { backend: "cuda", total_bytes: 2000, free_bytes: 500 },
  });
  assert.ok(usage);
  assert.equal(usage.ram.usedBytes, 750);
  assert.equal(usage.ram.pct, 75);
  assert.equal(usage.device.usedBytes, 1500);
  assert.equal(usage.device.pct, 75);
});

test("extractMemoryUsage accepts payloads nesting memory (host/state shape)", () => {
  const usage = extractMemoryUsage({
    ok: true,
    memory: { ram: { total_bytes: 100, used_bytes: 50, percent: 50 } },
  });
  assert.ok(usage);
  assert.equal(usage.ram.pct, 50);
  assert.equal(usage.device, null);
});

test("extractMemoryUsage returns null for junk payloads", () => {
  assert.equal(extractMemoryUsage(null), null);
  assert.equal(extractMemoryUsage("nope"), null);
  assert.equal(extractMemoryUsage({}), null);
  assert.equal(extractMemoryUsage({ ram: { total_bytes: "x" } }), null);
});

test("fetchHostMemoryMetrics attaches Authorization header", async () => {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    return {
      ok: true,
      status: 200,
      async json() {
        return { supported: true, ram: { percent: 42 } };
      },
    };
  };

  const r = await fetchHostMemoryMetrics({
    baseUrl: "http://localhost:8080",
    token: "t",
    fetchImpl,
  });

  assert.equal(r.ok, true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "http://localhost:8080/api/gateway/host/metrics/memory");
  assert.equal(calls[0].init.headers.Authorization, "Bearer t");
});

test("fetchHostMemoryMetrics reports http errors with status", async () => {
  const fetchImpl = async () => ({
    ok: false,
    status: 404,
    async json() {
      return { detail: "not found" };
    },
  });

  const r = await fetchHostMemoryMetrics({ fetchImpl });
  assert.equal(r.ok, false);
  assert.equal(r.status, 404);
  assert.equal(r.error, "http_error");
});
