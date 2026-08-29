import test from "node:test";
import assert from "node:assert/strict";

import {
  ACCELERATOR_NOTE,
  acceleratorLabel,
  buildAuthHeaders,
  extractMemoryUsage,
  fetchHostMemoryMetrics,
  formatBytes,
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

test("extractMemoryUsage prefers the across-processes device figure over the process-local one", () => {
  // THE METAL BUG: allocated_bytes is PROCESS-LOCAL and reads 0 on this Mac
  // while a 93 GB GGUF is resident, so the widget painted an empty device bar
  // beside a busy accelerator. host_in_use_bytes counts driver-allocated
  // accelerator buffers across every process, and wired_limit_bytes is the
  // real accelerator-heap ceiling.
  const usage = extractMemoryUsage({
    memory: {
      ram: { total_bytes: 100, used_bytes: 50, percent: 50 },
      device: {
        backend: "metal",
        allocated_bytes: 0,
        host_in_use_bytes: 105743990784,
        wired_limit_bytes: 115343360000,
        total_bytes: 137438953472,
      },
    },
  });
  assert.ok(usage);
  assert.equal(usage.device.scope, "all_processes");
  assert.equal(usage.device.label, "Accelerator heap · metal (all processes)");
  assert.equal(usage.device.usedBytes, 105743990784);
  assert.equal(usage.device.totalBytes, 115343360000, "the wired limit is the ceiling, not the 137 GB pool");
  assert.ok(usage.device.pct > 90 && usage.device.pct < 93);
  assert.notEqual(usage.device.pct, 0, "a 0% device bar beside a busy accelerator is the bug this fixes");
});

test("extractMemoryUsage labels the process-local fallback as such", () => {
  const usage = extractMemoryUsage({
    device: { backend: "cuda", allocated_bytes: 500, total_bytes: 1000 },
  });
  assert.ok(usage);
  assert.equal(usage.device.scope, "process");
  assert.equal(usage.device.label, "Accelerator heap · cuda (this process only)");
  assert.equal(usage.device.pct, 50);
});

test("extractMemoryUsage keeps the wired limit as ceiling even without an across-processes figure", () => {
  const usage = extractMemoryUsage({
    device: { backend: "metal", allocated_bytes: 250, wired_limit_bytes: 500, total_bytes: 1000 },
  });
  assert.ok(usage);
  assert.equal(usage.device.scope, "process");
  assert.equal(usage.device.totalBytes, 500);
  assert.equal(usage.device.pct, 50);
});

// The live payload from this machine: a fully offloaded 90 GB GGUF, RSS 76 GB,
// allocated_bytes 0, and an accelerator heap of 1.04 GB — 0.76% of the 137 GB
// machine. The figure is real, it is just BLIND to memory-mapped GGUF weights,
// so it must never be labelled as the machine's memory use.
const SPEC_MEMORY = Object.freeze({
  ram: {
    total_bytes: 137438953472,
    available_bytes: 96368312320,
    used_bytes: 33741111296,
    percent: 29.9,
  },
  process: { rss_bytes: 76762775552 },
  device: {
    backend: "metal",
    allocated_bytes: 0,
    total_bytes: 137438953472,
    free_bytes: null,
    host_in_use_bytes: 1042120704,
    wired_limit_bytes: 115343360000,
  },
});

test("extractMemoryUsage pins the SPEC accelerator label and note on the live GGUF payload", () => {
  const usage = extractMemoryUsage({ ok: true, memory: SPEC_MEMORY });
  assert.ok(usage);

  // RAM stays the primary system meter, untouched by the accelerator wording.
  assert.equal(usage.ram.usedBytes, 33741111296);
  assert.equal(usage.ram.totalBytes, 137438953472);

  assert.equal(usage.device.label, "Accelerator heap · metal (all processes)");
  assert.equal(usage.device.note, "memory-mapped GGUF weights are not counted here");
  assert.equal(usage.device.scope, "all_processes");
  assert.equal(usage.device.usedBytes, 1042120704);
  assert.equal(usage.device.totalBytes, 115343360000);

  for (const s of [usage.device.label, usage.device.note]) {
    assert.ok(!s.includes("host-wide"), `"host-wide" must not survive in: ${s}`);
    assert.ok(!/\bhost\b/i.test(s), `"host" is no longer a scope word, found in: ${s}`);
  }
  assert.notEqual(usage.device.scope, "host");
});

test("extractMemoryUsage falls back to allocated_bytes with the (this process only) label", () => {
  const device = { ...SPEC_MEMORY.device, allocated_bytes: 4294967296 };
  delete device.host_in_use_bytes;
  const usage = extractMemoryUsage({ ok: true, memory: { ...SPEC_MEMORY, device } });
  assert.ok(usage);

  assert.equal(usage.device.label, "Accelerator heap · metal (this process only)");
  assert.equal(usage.device.note, "memory-mapped GGUF weights are not counted here");
  assert.equal(usage.device.scope, "process");
  assert.equal(usage.device.usedBytes, 4294967296, "the process-local allocation is the fallback source");
  assert.ok(!usage.device.label.includes("host-wide"));
});

test("acceleratorLabel names an unknown backend `device`", () => {
  assert.equal(acceleratorLabel("", "all_processes"), "Accelerator heap · device (all processes)");
  assert.equal(acceleratorLabel(null, "process"), "Accelerator heap · device (this process only)");
  assert.equal(ACCELERATOR_NOTE, "memory-mapped GGUF weights are not counted here");
});

test("a device part with no backend still carries the SPEC label", () => {
  const usage = extractMemoryUsage({
    device: { allocated_bytes: 500, total_bytes: 1000, host_in_use_bytes: 500 },
  });
  assert.ok(usage);
  assert.equal(usage.device.label, "Accelerator heap · device (all processes)");
});

test("formatBytes is binary math with binary labels, one decimal, every tier", () => {
  assert.equal(formatBytes(0), "0 B");
  assert.equal(formatBytes(512), "512 B");
  assert.equal(formatBytes(1023), "1023 B");
  assert.equal(formatBytes(1024), "1.0 KiB");
  assert.equal(formatBytes(1024 ** 2), "1.0 MiB");
  assert.equal(formatBytes(1024 ** 3), "1.0 GiB");
  assert.equal(formatBytes(1024 ** 4), "1.0 TiB");
  // The LABEL is the load-bearing half: a `/1024` quotient printed as `GB`
  // is off by 7.4% from what `GB` means, and that is precisely how the same
  // model came to read `83.8 GB` in the TUIs and `89.99 GB` on the web.
  for (const v of [1024, 1024 ** 2, 1024 ** 3, 1024 ** 4]) {
    assert.doesNotMatch(formatBytes(v), /\d\s(KB|MB|GB|TB)$/);
  }
  // Nothing invented for input that is not a byte count.
  assert.equal(formatBytes(null), "");
  assert.equal(formatBytes(undefined), "");
  assert.equal(formatBytes(Number.NaN), "");
  assert.equal(formatBytes(-1), "");
  assert.equal(formatBytes(Number.POSITIVE_INFINITY), "");
});

/**
 * THE CROSS-SURFACE PIN. These six byte counts are the shared set; the same
 * assertions exist in the gateway web console (`_fmtBytes`),
 * `abstractgateway/console-tui` and `abstractcode-tui` (`human_bytes`), and
 * abstractflow (`formatBytes`). If this test and its four siblings stop
 * agreeing string-for-string, one model reads as two different sizes
 * depending on which surface the operator happens to open.
 */
test("formatBytes agrees with every other surface on the shared set", () => {
  assert.equal(formatBytes(89_986_353_824), "83.8 GiB"); // the sharded GGUF
  assert.equal(formatBytes(93_096_269_257), "86.7 GiB"); // Σ model weights
  assert.equal(formatBytes(115_343_360_000), "107.4 GiB"); // wired limit
  assert.equal(formatBytes(137_438_953_472), "128.0 GiB"); // RAM total
  assert.equal(formatBytes(3_109_915_433), "2.9 GiB"); // qwen3-vl-4b
  assert.equal(formatBytes(4_352_519_172), "4.1 GiB"); // session caches
});
