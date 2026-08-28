import test from "node:test";
import assert from "node:assert/strict";

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
