import test from "node:test";
import assert from "node:assert/strict";

import { extractMemoryUsage } from "../src/memory_metrics_api.js";
import { MonitorMemoryWidgetController } from "../src/monitor_memory_widget.js";

function withFetchStub(responder, fn) {
  const original = globalThis.fetch;
  globalThis.fetch = responder;
  return Promise.resolve()
    .then(fn)
    .finally(() => {
      if (original === undefined) delete globalThis.fetch;
      else globalThis.fetch = original;
    });
}

function settle(ms = 10) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Builds a controller that can start() without a browser DOM: presetting
 * _mounted makes mount() a no-op, so the poll loop runs for real against the
 * stubbed fetch.
 */
function startableController() {
  const c = new MonitorMemoryWidgetController({}, {});
  c._mounted = true;
  return c;
}

const notFound = async () => ({
  ok: false,
  status: 404,
  async json() {
    return { detail: "not found" };
  },
});

test("controller normalizes options with honest defaults", () => {
  const c = new MonitorMemoryWidgetController({}, {});
  assert.equal(c.options.tickMs, 5000);
  assert.equal(c.options.endpoint, "/api/gateway/host/metrics/memory");
  assert.equal(c.options.mode, "full");

  c.setOptions({ tickMs: 10, mode: "icon" });
  assert.equal(c.options.tickMs, 1000, "tickMs clamps to a sane minimum");
  assert.equal(c.options.mode, "icon");
});

test("a RUNNING controller stops polling permanently on 404 (unsupported route)", async () => {
  await withFetchStub(notFound, async () => {
    const c = startableController();
    c.start();
    assert.equal(c._running, true, "controller actually started");
    await settle();
    assert.equal(c.unsupported, true);
    assert.equal(c._running, false, "404 stopped a controller that WAS running");
    // start() must refuse to resume a route the host said does not exist.
    c.start();
    assert.equal(c._running, false);
  });
});

test("a RUNNING controller stops polling when the host reports supported:false", async () => {
  await withFetchStub(
    async () => ({
      ok: true,
      status: 200,
      async json() {
        return { supported: false };
      },
    }),
    async () => {
      const c = startableController();
      c.start();
      assert.equal(c._running, true);
      await settle();
      assert.equal(c.unsupported, true);
      assert.equal(c._running, false);
    },
  );
});

test("changing the endpoint clears an unsupported verdict AND resumes polling", async () => {
  const urls = [];
  await withFetchStub(
    async (url) => {
      urls.push(String(url));
      if (String(url).includes("memory2")) {
        return {
          ok: true,
          status: 200,
          async json() {
            return { supported: true, ram: { percent: 10 } };
          },
        };
      }
      return notFound();
    },
    async () => {
      const c = startableController();
      c.start();
      await settle();
      assert.equal(c.unsupported, true);
      assert.equal(c._running, false, "dead after 404 on the first endpoint");

      c.setOptions({ endpoint: "/api/gateway/host/metrics/memory2" });
      assert.equal(c.unsupported, false, "verdict cleared for the new endpoint");
      assert.equal(c._running, true, "polling actually resumed, not just cleared");

      await settle();
      assert.ok(urls.some((u) => u.includes("memory2")), "new endpoint was polled");
      assert.equal(c.unsupported, false);
      c.stop();
    },
  );
});

test("token setter does not restart polling into a detached target", async () => {
  await withFetchStub(notFound, async () => {
    const detached = { isConnected: false };
    const c = new MonitorMemoryWidgetController(detached, {});
    c._mounted = true;
    c._stoppedForAuth = true;
    c.token = "fresh-token";
    assert.equal(c._running, false, "detached target must not resume polling");
    assert.equal(c._stoppedForAuth, false);

    const attached = { isConnected: true };
    const c2 = new MonitorMemoryWidgetController(attached, {});
    c2._mounted = true;
    c2._stoppedForAuth = true;
    c2.token = "fresh-token";
    assert.equal(c2._running, true, "attached target resumes polling on token");
    c2.stop();
    await settle();
  });
});

/**
 * Renders through the controller with a hand-built element graph (no DOM):
 * `push()` + `_render()` is the whole paint path, so the honest-labeling rule
 * can be checked without a browser.
 */
function renderableController() {
  const el = () => ({ className: "", textContent: "", title: "", style: { setProperty() {}, removeProperty() {} }, classList: { add() {}, remove() {} } });
  const meter = () => ({ meter: { className: "", title: "", classList: { add() {} } }, tag: el(), fill: el() });
  const c = new MonitorMemoryWidgetController({}, {});
  c._mounted = true;
  c._els = { wrap: el(), value: el(), ram: meter(), device: meter() };
  return c;
}

test("the device tooltip names the SCOPE of the figure it shows", () => {
  const all = renderableController();
  all.push(
    extractMemoryUsage({
      ram: { total_bytes: 10, used_bytes: 5, percent: 50 },
      device: { backend: "metal", allocated_bytes: 0, host_in_use_bytes: 9, wired_limit_bytes: 10 },
    }),
  );
  assert.match(all._els.wrap.title, /Accelerator heap · metal \(all processes\) 90%/);
  assert.ok(!/\(host\)/.test(all._els.wrap.title), "the scope word `host` is gone");
  assert.ok(!/host-wide/.test(all._els.wrap.title));

  const proc = renderableController();
  proc.push(
    extractMemoryUsage({
      ram: { total_bytes: 10, used_bytes: 5, percent: 50 },
      device: { backend: "metal", allocated_bytes: 0, wired_limit_bytes: 10 },
    }),
  );
  assert.match(proc._els.wrap.title, /Accelerator heap · metal \(this process only\) 0%/,
    "a process-local reading must never be presented as whole-machine truth");
});

test("the accelerator meter carries the GGUF caveat as its title tooltip", () => {
  const c = renderableController();
  c.push(
    extractMemoryUsage({
      ram: { total_bytes: 137438953472, used_bytes: 33741111296, percent: 29.9 },
      device: {
        backend: "metal",
        allocated_bytes: 0,
        host_in_use_bytes: 1042120704,
        wired_limit_bytes: 115343360000,
      },
    }),
  );
  assert.equal(c._els.device.meter.title, "memory-mapped GGUF weights are not counted here");
  assert.equal(c._els.ram.meter.title, "", "RAM is the primary meter and keeps no accelerator caveat");

  // With no device figure the caveat must not linger on an empty bar.
  c.push({ ram: { usedBytes: 5, totalBytes: 10, pct: 50 }, device: null });
  assert.equal(c._els.device.meter.title, "");
});

/**
 * A percentage alone cannot be checked against anything — `29%` is the same
 * glyph on a 16 GiB laptop and a 128 GiB workstation. The tooltip ships the
 * BYTES beside it, spelled the way every other surface spells them, so a
 * number read here matches the number read in the gateway console, both TUIs
 * and abstractflow for the same payload. The values below are this machine's
 * live reading.
 */
test("the tooltip states the bytes, in the same binary spelling as every other surface", () => {
  const c = renderableController();
  c.push(
    extractMemoryUsage({
      ram: { total_bytes: 137438953472, used_bytes: 33741111296, percent: 24.6 },
      device: {
        backend: "metal",
        allocated_bytes: 0,
        host_in_use_bytes: 1042120704,
        wired_limit_bytes: 115343360000,
      },
    }),
  );
  assert.equal(
    c._els.wrap.title,
    "RAM 25% (31.4 GiB / 128.0 GiB) · " +
      "Accelerator heap · metal (all processes) 1% (993.8 MiB / 107.4 GiB)",
  );
  // `GB` here would be a 7.4% lie about a figure the operator sets with
  // `sysctl iogpu.wired_limit_mb` — a binary knob.
  assert.doesNotMatch(c._els.wrap.title, /\d\s(KB|MB|GB|TB)\b/);

  // A part with no byte counts falls back to the percentage rather than
  // inventing a size.
  c.push({ ram: { usedBytes: null, totalBytes: null, pct: 50 }, device: null });
  assert.equal(c._els.wrap.title, "RAM 50%");
});

test("a hand-pushed device part without a label still renders a scoped label", () => {
  const c = renderableController();
  c.push({ ram: null, device: { backend: "cuda", scope: "process", usedBytes: 1, totalBytes: 4, pct: 25 } });
  assert.match(c._els.wrap.title, /Accelerator heap · cuda \(this process only\) 25%/);
});
