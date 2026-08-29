import { acceleratorLabel, extractMemoryUsage, fetchHostMemoryMetrics, formatBytes } from "./memory_metrics_api.js";

const DEFAULTS = Object.freeze({
  tickMs: 5000,
  endpoint: "/api/gateway/host/metrics/memory",
  baseUrl: "",
  mode: "full", // "full" | "icon"
});

function _clamp(n, lo, hi) {
  if (!Number.isFinite(n)) return lo;
  return Math.min(hi, Math.max(lo, n));
}

function _toInt(n, fallback) {
  const v = Number(n);
  if (!Number.isFinite(v)) return fallback;
  return Math.floor(v);
}

function _colorForPct(pct, alpha = 1) {
  const t = _clamp(Number(pct) / 100, 0, 1);
  // Hue ramp: green (140) -> red (0)
  const hue = Math.round(140 - 140 * t);
  const a = _clamp(Number(alpha), 0, 1);
  if (a >= 1) return `hsl(${hue} 85% 55%)`;
  return `hsl(${hue} 85% 55% / ${a})`;
}

function _normalizeOptions(opts) {
  const o = { ...DEFAULTS, ...(opts || {}) };
  o.tickMs = Math.max(1000, _toInt(o.tickMs, DEFAULTS.tickMs));
  o.endpoint = String(o.endpoint || DEFAULTS.endpoint);
  o.baseUrl = String(o.baseUrl || "");
  o.mode = String(o.mode || DEFAULTS.mode).trim().toLowerCase();
  if (o.mode !== "icon") o.mode = "full";
  return o;
}

function _cssText() {
  return `
:host{display:inline-block;font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,"Apple Color Emoji","Segoe UI Emoji";line-height:1}
.wrap{box-sizing:border-box;display:flex;flex-direction:column;gap:6px;padding:var(--monitor-memory-padding,8px 10px);border:1px solid var(--monitor-memory-border,#2a2f3a);border-radius:var(--monitor-memory-radius,10px);background:var(--monitor-memory-bg,#0b1020);color:var(--monitor-memory-fg,#e7eaf0);width:var(--monitor-memory-width,180px)}
.wrap.icon{gap:var(--monitor-memory-gap,3px);padding:var(--monitor-memory-padding,4px);border-radius:var(--monitor-memory-radius,999px);width:var(--monitor-memory-width,30px);background:linear-gradient(180deg,rgba(255,255,255,0.08),rgba(255,255,255,0.02)),var(--monitor-memory-bg,#0b1020);box-shadow:0 0 14px var(--monitor-memory-accent-glow, rgba(76,195,255,0.18))}
.wrap.icon .top{display:none}
.wrap.icon .tag{display:none}
.top{display:flex;align-items:baseline;justify-content:space-between;gap:10px}
.label{font-size:var(--monitor-memory-font-size,var(--font-size-sm,12px));opacity:.9}
.value{font-variant-numeric:tabular-nums;font-size:var(--monitor-memory-font-size,var(--font-size-sm,12px));opacity:.95}
.meters{display:flex;flex-direction:column;gap:var(--monitor-memory-gap,3px)}
.meter{display:flex;align-items:center;gap:6px}
.tag{width:26px;flex:none;font-size:10px;letter-spacing:.04em;opacity:.65;text-transform:uppercase}
.track{position:relative;flex:1;min-width:0;height:var(--monitor-memory-bar-height,5px);border-radius:999px;background:var(--monitor-memory-track,rgba(255,255,255,0.12));overflow:hidden}
.fill{position:absolute;inset:0 auto 0 0;width:0;border-radius:999px;background:var(--monitor-memory-bar,#4cc3ff);transition:width .3s ease, background .3s ease, opacity .3s ease}
.meter.missing .fill{width:100%;background:var(--monitor-memory-bar-missing,#62708a);opacity:.25}
.meter.error .fill{background:var(--monitor-memory-bar-error,#ff6b6b);opacity:.7}
.muted{opacity:.6}
`;
}

export class MonitorMemoryWidgetController {
  constructor(target, options = {}) {
    if (!target || typeof target !== "object") {
      throw new TypeError("target element is required");
    }
    this._target = target;
    this._opts = _normalizeOptions(options);

    this._timer = null;
    this._timer_gen = 0;
    this._running = false;
    this._abort = null;
    this._resumeTimer = null;

    this._mounted = false;
    this._els = null;

    this._token = options.token;
    this._getToken = options.getToken;

    this._stoppedForAuth = false;
    this._unsupported = false;
    this._last = null; // { ram, device } | null
  }

  get options() {
    return { ...this._opts };
  }

  get unsupported() {
    return this._unsupported;
  }

  set token(t) {
    this._token = t;
    const tok = String(this._token || "").trim();
    if (tok && this._stoppedForAuth) {
      this._stoppedForAuth = false;
      // A retained reference can set a token AFTER the element left the DOM
      // (isConnected === false on a detached shadow root/host): do not restart
      // polling into a dead target. Non-DOM targets (no isConnected) still work.
      if (this._target && this._target.isConnected === false) return;
      this.start();
    }
  }

  get token() {
    return this._token;
  }

  set getToken(fn) {
    this._getToken = fn;
  }

  get getToken() {
    return this._getToken;
  }

  mount() {
    if (this._mounted) return;
    if (typeof document === "undefined") {
      throw new Error("MonitorMemoryWidget requires a browser DOM");
    }

    const root = this._target;
    root.textContent = "";

    const style = document.createElement("style");
    style.textContent = _cssText();

    const wrap = document.createElement("div");
    wrap.className = this._opts.mode === "icon" ? "wrap icon" : "wrap";

    const top = document.createElement("div");
    top.className = "top";

    const label = document.createElement("div");
    label.className = "label";
    label.textContent = "MEM";

    const value = document.createElement("div");
    value.className = "value muted";
    value.textContent = "—";

    top.appendChild(label);
    top.appendChild(value);

    const meters = document.createElement("div");
    meters.className = "meters";

    const makeMeter = (tagText) => {
      const meter = document.createElement("div");
      meter.className = "meter missing";
      const tag = document.createElement("div");
      tag.className = "tag";
      tag.textContent = tagText;
      const track = document.createElement("div");
      track.className = "track";
      const fill = document.createElement("div");
      fill.className = "fill";
      track.appendChild(fill);
      meter.appendChild(tag);
      meter.appendChild(track);
      meters.appendChild(meter);
      return { meter, tag, fill };
    };

    const ram = makeMeter("RAM");
    const device = makeMeter("DEV");

    wrap.appendChild(top);
    wrap.appendChild(meters);

    root.appendChild(style);
    root.appendChild(wrap);

    this._els = { wrap, value, ram, device };
    this._mounted = true;

    this._render();
  }

  start() {
    this.mount();
    if (this._unsupported) return;
    if (this._running) return;
    this._running = true;
    this._timer_gen += 1;
    void this._poll_loop(this._timer_gen);
  }

  stop() {
    this._running = false;
    this._timer_gen += 1;
    if (this._timer) {
      clearTimeout(this._timer);
      this._timer = null;
    }
    if (this._resumeTimer) {
      clearTimeout(this._resumeTimer);
      this._resumeTimer = null;
    }
    if (this._abort) {
      this._abort.abort();
      this._abort = null;
    }
  }

  destroy() {
    this.stop();
    if (this._target && this._mounted) {
      this._target.textContent = "";
    }
    this._mounted = false;
    this._els = null;
  }

  setOptions(next) {
    const merged = _normalizeOptions({ ...this._opts, ...(next || {}) });
    const tickChanged = merged.tickMs !== this._opts.tickMs;
    const modeChanged = merged.mode !== this._opts.mode;
    const endpointChanged = merged.endpoint !== this._opts.endpoint || merged.baseUrl !== this._opts.baseUrl;

    this._opts = merged;
    if (modeChanged && this._mounted && this._els && this._els.wrap) {
      this._els.wrap.className = merged.mode === "icon" ? "wrap icon" : "wrap";
    }
    if (endpointChanged && this._unsupported) {
      // A different endpoint may well be supported: forget the verdict AND
      // resume polling — the 404/supported:false stop was for the old route,
      // and without a restart the widget would stay dead forever.
      this._unsupported = false;
      if (this._mounted) this.start();
    }
    if (tickChanged && this._running) {
      this.stop();
      this.start();
    } else if (this._mounted) {
      this._render();
    }
  }

  push(usage) {
    this._last = usage && typeof usage === "object" ? usage : null;
    this._render();
  }

  _renderMeter(els, part, { error = false } = {}) {
    const pct = part && Number.isFinite(part.pct) ? _clamp(part.pct, 0, 100) : null;
    els.meter.className = "meter";
    if (pct == null) {
      els.meter.classList.add("missing");
      els.fill.style.width = "100%";
      els.fill.style.background = "";
    } else {
      els.fill.style.width = `${pct.toFixed(0)}%`;
      els.fill.style.background = _colorForPct(pct);
    }
    if (error) els.meter.classList.add("error");
  }

  _render({ error = false } = {}) {
    if (!this._els) return;
    const { wrap, value, ram, device } = this._els;

    const usage = this._last;
    const ramPart = usage ? usage.ram : null;
    const devicePart = usage ? usage.device : null;
    const ramPct = ramPart && Number.isFinite(ramPart.pct) ? _clamp(ramPart.pct, 0, 100) : null;

    if (this._unsupported) {
      value.textContent = "N/A";
      value.classList.add("muted");
    } else if (ramPct == null) {
      value.textContent = error ? "N/A" : "—";
      value.classList.add("muted");
    } else {
      value.textContent = `${ramPct.toFixed(0)}%`;
      value.classList.remove("muted");
    }

    if (wrap) {
      const devicePct = devicePart && Number.isFinite(devicePart.pct) ? _clamp(devicePart.pct, 0, 100) : null;
      const backend = devicePart && devicePart.backend ? String(devicePart.backend) : "device";
      // The accelerator figure names its SCOPE: `all processes` is every
      // process's driver-allocated accelerator memory, `this process only` is
      // the process-local reading that can sit at 0% while the accelerator is
      // full. Neither is the machine's memory use — RAM (first meter) is. The
      // extractor ships the exact label; fall back to rebuilding it only for a
      // hand-pushed part that predates the field.
      const deviceLabel = devicePart
        ? devicePart.label
          ? String(devicePart.label)
          : acceleratorLabel(backend, devicePart.scope)
        : "";
      // A percentage alone cannot be checked against anything: the operator
      // reads `62%` and cannot tell whether the machine has 16 GiB or 128 GiB
      // left. Ship the bytes beside it, in the SAME binary spelling every other
      // surface uses (`formatBytes`), so a number read here matches the number
      // read in the console, the TUIs and abstractflow for the same payload.
      const sized = (pct, part) => {
        const used = part ? formatBytes(part.usedBytes) : "";
        const total = part ? formatBytes(part.totalBytes) : "";
        if (!used || !total) return `${pct.toFixed(0)}%`;
        return `${pct.toFixed(0)}% (${used} / ${total})`;
      };
      const parts = [];
      if (ramPct != null) parts.push(`RAM ${sized(ramPct, ramPart)}`);
      if (devicePct != null) parts.push(`${deviceLabel} ${sized(devicePct, devicePart)}`);
      wrap.title = this._unsupported
        ? "Host memory metrics unavailable"
        : parts.length
          ? parts.join(" · ")
          : "Memory —";
      if (ramPct == null) {
        wrap.style.removeProperty("--monitor-memory-accent-glow");
      } else {
        wrap.style.setProperty("--monitor-memory-accent-glow", _colorForPct(ramPct, 0.35));
      }
      if (device && device.tag) {
        device.tag.textContent = devicePart && devicePart.backend ? String(devicePart.backend).slice(0, 4) : "DEV";
      }
      if (device && device.meter) {
        // The caveat has to ride ON the accelerator meter: hovering a child
        // overrides the wrap tooltip, and in icon mode the meter IS the hover
        // target. Without it a reader reads the bar as "everything resident",
        // which memory-mapped GGUF weights are not.
        device.meter.title = devicePart && devicePart.note ? String(devicePart.note) : "";
      }
    }

    this._renderMeter(ram, ramPart, { error });
    this._renderMeter(device, devicePart, { error });
  }

  _markUnsupported() {
    this._unsupported = true;
    this._last = null;
    this.stop();
    this._render();
  }

  async _tick() {
    const tokenAtStart = String(this._token || "").trim();
    const getTokenAtStart = this._getToken;
    const requestHadAuth = Boolean(tokenAtStart) || typeof getTokenAtStart === "function";

    if (this._abort) this._abort.abort();
    this._abort = new AbortController();

    const res = await fetchHostMemoryMetrics({
      baseUrl: this._opts.baseUrl,
      endpoint: this._opts.endpoint,
      token: tokenAtStart,
      getToken: getTokenAtStart,
      signal: this._abort.signal,
    });

    const payload = res && res.payload;
    const supported = payload && typeof payload === "object" ? payload.supported !== false : true;

    if (!res.ok) {
      if (res.status === 404) {
        // The gateway does not expose host memory metrics: be honest and stop
        // polling instead of hammering a route that will never exist.
        this._markUnsupported();
        return;
      }
      this._last = null;
      this._render({ error: true });
      if (res.status === 401 || res.status === 403) {
        // If the request was unauthenticated (no token and no getToken) but auth became available
        // before the 401 came back (common race when the host sets `el.token` after mount),
        // do not permanently stop the widget. Let the poll loop continue and succeed on the next tick.
        const tokenNow = String(this._token || "").trim();
        const hasGetTokenNow = typeof this._getToken === "function";
        const authNowAvailable = Boolean(tokenNow) || hasGetTokenNow;
        if (!requestHadAuth && authNowAvailable) {
          return;
        }
        this._stoppedForAuth = true;
        this.stop();
      } else if (res.status === 429) {
        this.stop();
        this._resumeTimer = setTimeout(() => {
          this._resumeTimer = null;
          if (!this._mounted) return;
          this.start();
        }, 30_000);
      }
      return;
    }

    if (!supported) {
      // The host answered but explicitly reports memory metrics unsupported:
      // stop polling rather than re-asking every tick.
      this._markUnsupported();
      return;
    }

    const usage = extractMemoryUsage(payload);
    this._last = usage;
    this._render();
  }

  async _poll_loop(gen) {
    if (!this._running || gen !== this._timer_gen) return;

    await this._tick();

    if (!this._running || gen !== this._timer_gen) return;
    this._timer = setTimeout(() => {
      this._timer = null;
      void this._poll_loop(gen);
    }, this._opts.tickMs);
  }
}

export function createMonitorMemoryWidget(target, options = {}) {
  const c = new MonitorMemoryWidgetController(target, options);
  c.start();
  return c;
}

export function registerMonitorMemoryWidget(tagName = "monitor-memory") {
  if (typeof globalThis === "undefined") return;
  if (typeof globalThis.customElements === "undefined") return;
  if (globalThis.customElements.get(tagName)) return;

  const HTMLElementBase = globalThis.HTMLElement || class {};

  class MonitorMemoryElement extends HTMLElementBase {
    static get observedAttributes() {
      return ["tick-ms", "endpoint", "base-url", "mode"];
    }

    constructor() {
      super();
      this._shadow = this.attachShadow ? this.attachShadow({ mode: "open" }) : null;
      const root = this._shadow || this;
      this._controller = new MonitorMemoryWidgetController(root, {});

      // If a property was set on the element instance before it was upgraded/defined
      // (e.g. React rendered `<monitor-memory>` before `customElements.define()`),
      // it becomes an "own property" and would bypass our setters. Upgrade it.
      this._upgradeProperty("token");
      this._upgradeProperty("getToken");
      this._upgradeProperty("mode");
    }

    _upgradeProperty(prop) {
      if (!Object.prototype.hasOwnProperty.call(this, prop)) return;
      const value = this[prop];
      try {
        delete this[prop];
      } catch {
        // ignore
      }
      this[prop] = value;
    }

    connectedCallback() {
      this._controller.setOptions(this._readAttrs());
      const start = () => {
        if (!this.isConnected) return;
        this._controller.start();
      };
      if (typeof queueMicrotask === "function") queueMicrotask(start);
      else Promise.resolve().then(start);
    }

    disconnectedCallback() {
      this._controller.destroy();
    }

    attributeChangedCallback() {
      this._controller.setOptions(this._readAttrs());
    }

    _readAttrs() {
      const tickMs = this.getAttribute("tick-ms");
      const endpoint = this.getAttribute("endpoint");
      const baseUrl = this.getAttribute("base-url");
      const mode = this.getAttribute("mode");
      return {
        ...(tickMs != null ? { tickMs } : {}),
        ...(endpoint != null ? { endpoint } : {}),
        ...(baseUrl != null ? { baseUrl } : {}),
        ...(mode != null ? { mode } : {}),
      };
    }

    set token(t) {
      this._controller.token = t;
    }

    get token() {
      return this._controller.token;
    }

    set getToken(fn) {
      this._controller.getToken = fn;
    }

    get getToken() {
      return this._controller.getToken;
    }

    set tickMs(v) {
      this._controller.setOptions({ tickMs: v });
    }

    get tickMs() {
      return this._controller.options.tickMs;
    }

    set endpoint(v) {
      this._controller.setOptions({ endpoint: v });
    }

    get endpoint() {
      return this._controller.options.endpoint;
    }

    set baseUrl(v) {
      this._controller.setOptions({ baseUrl: v });
    }

    get baseUrl() {
      return this._controller.options.baseUrl;
    }

    set mode(v) {
      this._controller.setOptions({ mode: v });
    }

    get mode() {
      return this._controller.options.mode;
    }
  }

  globalThis.customElements.define(tagName, MonitorMemoryElement);
}
