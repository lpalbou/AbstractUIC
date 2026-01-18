import { HistoryBuffer } from "./history_buffer.js";
import { extractUtilizationGpuPct, fetchHostGpuMetrics } from "./gpu_metrics_api.js";

const DEFAULTS = Object.freeze({
  tickMs: 1500,
  historySize: 20,
  endpoint: "/api/gateway/host/metrics/gpu",
  baseUrl: "",
  mode: "full", // "full" | "icon"
});

function _clamp01(n) {
  if (!Number.isFinite(n)) return 0;
  return Math.min(1, Math.max(0, n));
}

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
  o.tickMs = Math.max(250, _toInt(o.tickMs, DEFAULTS.tickMs));
  o.historySize = Math.max(1, Math.min(200, _toInt(o.historySize, DEFAULTS.historySize)));
  o.endpoint = String(o.endpoint || DEFAULTS.endpoint);
  o.baseUrl = String(o.baseUrl || "");
  o.mode = String(o.mode || DEFAULTS.mode).trim().toLowerCase();
  if (o.mode !== "icon") o.mode = "full";
  return o;
}

function _cssText() {
  return `
:host{display:inline-block;font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,"Apple Color Emoji","Segoe UI Emoji";line-height:1}
.wrap{box-sizing:border-box;display:flex;flex-direction:column;gap:6px;padding:var(--monitor-gpu-padding,8px 10px);border:1px solid var(--monitor-gpu-border,#2a2f3a);border-radius:var(--monitor-gpu-radius,10px);background:var(--monitor-gpu-bg,#0b1020);color:var(--monitor-gpu-fg,#e7eaf0);width:var(--monitor-gpu-width,180px)}
.wrap.icon{gap:var(--monitor-gpu-gap,4px);padding:var(--monitor-gpu-padding,4px);border-radius:var(--monitor-gpu-radius,999px);width:var(--monitor-gpu-width,30px);background:linear-gradient(180deg,rgba(255,255,255,0.08),rgba(255,255,255,0.02)),var(--monitor-gpu-bg,#0b1020);box-shadow:0 0 14px var(--monitor-gpu-accent-glow, rgba(76,195,255,0.18))}
.wrap.icon .top{display:none}
.wrap.icon .bars{height:var(--monitor-gpu-bars-height,18px)}
.top{display:flex;align-items:baseline;justify-content:space-between;gap:10px}
.label{font-size:12px;opacity:.9}
.value{font-variant-numeric:tabular-nums;font-size:12px;opacity:.95}
.bars{display:flex;align-items:flex-end;gap:2px;height:var(--monitor-gpu-bars-height,34px);overflow:hidden}
.bar{flex:1;min-width:0;border-radius:2px;background:var(--monitor-gpu-bar,#4cc3ff);height:2px;opacity:.9;transition:height .25s ease, background .25s ease, opacity .25s ease}
.bar.missing{background:var(--monitor-gpu-bar-missing,#62708a);opacity:.35}
.bar.error{background:var(--monitor-gpu-bar-error,#ff6b6b);opacity:.7}
.muted{opacity:.6}
`;
}

export class MonitorGpuWidgetController {
  constructor(target, options = {}) {
    if (!target || typeof target !== "object") {
      throw new TypeError("target element is required");
    }
    this._target = target;
    this._opts = _normalizeOptions(options);
    this._buffer = new HistoryBuffer(this._opts.historySize);

    this._timer = null;
    this._abort = null;

    this._mounted = false;
    this._els = null;

    this._token = options.token;
    this._getToken = options.getToken;
  }

  get options() {
    return { ...this._opts };
  }

  set token(t) {
    this._token = t;
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
      throw new Error("MonitorGpuWidget requires a browser DOM");
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
    label.textContent = "GPU";

    const value = document.createElement("div");
    value.className = "value muted";
    value.textContent = "—";

    top.appendChild(label);
    top.appendChild(value);

    const bars = document.createElement("div");
    bars.className = "bars";

    wrap.appendChild(top);
    wrap.appendChild(bars);

    root.appendChild(style);
    root.appendChild(wrap);

    this._els = { wrap, value, bars };
    this._mounted = true;

    this._rebuildBars();
    this._render();
  }

  start() {
    this.mount();
    if (this._timer) return;
    this._tick();
    this._timer = setInterval(() => this._tick(), this._opts.tickMs);
  }

  stop() {
    if (this._timer) {
      clearInterval(this._timer);
      this._timer = null;
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
    const historyChanged = merged.historySize !== this._opts.historySize;
    const tickChanged = merged.tickMs !== this._opts.tickMs;
    const modeChanged = merged.mode !== this._opts.mode;

    this._opts = merged;
    if (modeChanged && this._mounted && this._els && this._els.wrap) {
      this._els.wrap.className = merged.mode === "icon" ? "wrap icon" : "wrap";
    }
    if (historyChanged) {
      this._buffer.setMaxSize(merged.historySize);
      if (this._mounted) this._rebuildBars();
    }
    if (tickChanged && this._timer) {
      this.stop();
      this.start();
    } else if (this._mounted) {
      this._render();
    }
  }

  push(value) {
    this._buffer.push(value);
    this._render();
  }

  _rebuildBars() {
    if (!this._els) return;
    const { bars } = this._els;
    bars.textContent = "";
    for (let i = 0; i < this._opts.historySize; i += 1) {
      const bar = document.createElement("div");
      bar.className = "bar missing";
      bar.style.height = "2px";
      bars.appendChild(bar);
    }
  }

  _render({ error = false } = {}) {
    if (!this._els) return;
    const { wrap, value, bars } = this._els;

    const vals = this._buffer.values();
    const last = this._buffer.last();
    const pct = Number.isFinite(last) ? Math.max(0, Math.min(100, last)) : null;

    if (pct == null) {
      value.textContent = error ? "N/A" : "—";
      value.classList.add("muted");
    } else {
      value.textContent = `${pct.toFixed(0)}%`;
      value.classList.remove("muted");
    }
    if (wrap) {
      wrap.title = pct == null ? "GPU —" : `GPU ${pct.toFixed(0)}%`;
      if (pct == null) {
        wrap.style.removeProperty("--monitor-gpu-accent");
        wrap.style.removeProperty("--monitor-gpu-accent-glow");
      } else {
        wrap.style.setProperty("--monitor-gpu-accent", _colorForPct(pct, 0.95));
        wrap.style.setProperty("--monitor-gpu-accent-glow", _colorForPct(pct, 0.35));
      }
    }

    const barEls = Array.from(bars.children);
    const missingPrefix = Math.max(0, barEls.length - vals.length);
    const barsMaxPx = Math.max(2, bars && typeof bars.clientHeight === "number" && bars.clientHeight > 0 ? bars.clientHeight : 34);
    for (let i = 0; i < barEls.length; i += 1) {
      const el = barEls[i];
      const idx = i - missingPrefix;
      const v = idx >= 0 ? vals[idx] : null;
      const valNum = Number.isFinite(v) ? v : null;
      const h = valNum == null ? 0 : _clamp01(valNum / 100);

      const px = Math.max(2, Math.min(barsMaxPx, Math.round(h * barsMaxPx)));
      el.style.height = `${px}px`;
      el.style.background = valNum == null ? "" : _colorForPct(valNum);
      el.className = "bar";
      if (valNum == null) el.classList.add("missing");
      if (error) el.classList.add("error");
    }
  }

  async _tick() {
    if (this._abort) this._abort.abort();
    this._abort = new AbortController();

    const res = await fetchHostGpuMetrics({
      baseUrl: this._opts.baseUrl,
      endpoint: this._opts.endpoint,
      token: this._token,
      getToken: this._getToken,
      signal: this._abort.signal,
    });

    const payload = res && res.payload;
    const supported = payload && typeof payload === "object" ? payload.supported !== false : true;
    const pct = extractUtilizationGpuPct(payload);

    if (!res.ok) {
      this._buffer.push(null);
      this._render({ error: true });
      return;
    }

    if (!supported || pct == null) {
      this._buffer.push(null);
      this._render();
      return;
    }

    this._buffer.push(pct);
    this._render();
  }
}

export function createMonitorGpuWidget(target, options = {}) {
  const c = new MonitorGpuWidgetController(target, options);
  c.start();
  return c;
}

export function registerMonitorGpuWidget(tagName = "monitor-gpu") {
  if (typeof globalThis === "undefined") return;
  if (typeof globalThis.customElements === "undefined") return;
  if (globalThis.customElements.get(tagName)) return;

  const HTMLElementBase = globalThis.HTMLElement || class {};

  class MonitorGpuElement extends HTMLElementBase {
    static get observedAttributes() {
      return ["tick-ms", "history-size", "endpoint", "base-url", "mode"];
    }

    constructor() {
      super();
      this._shadow = this.attachShadow ? this.attachShadow({ mode: "open" }) : null;
      const root = this._shadow || this;
      this._controller = new MonitorGpuWidgetController(root, {});
    }

    connectedCallback() {
      this._controller.setOptions(this._readAttrs());
      this._controller.start();
    }

    disconnectedCallback() {
      this._controller.destroy();
    }

    attributeChangedCallback() {
      this._controller.setOptions(this._readAttrs());
    }

    _readAttrs() {
      const tickMs = this.getAttribute("tick-ms");
      const historySize = this.getAttribute("history-size");
      const endpoint = this.getAttribute("endpoint");
      const baseUrl = this.getAttribute("base-url");
      const mode = this.getAttribute("mode");
      return {
        ...(tickMs != null ? { tickMs } : {}),
        ...(historySize != null ? { historySize } : {}),
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

    set historySize(v) {
      this._controller.setOptions({ historySize: v });
    }

    get historySize() {
      return this._controller.options.historySize;
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
  }

  globalThis.customElements.define(tagName, MonitorGpuElement);
}
