// Shared harness for the voice checks (ui-primitives 0035): no DOM.
//
// - `mount(Component, props)` calls a component (or a hook wrapped in one) under a
//   stand-in React dispatcher with real state, refs, memo and effects; the returned
//   element tree's handlers are invoked directly (the house pattern of
//   check_voice_library.mjs, plus useId / useLayoutEffect).
// - `installFakeBrowser()` stands in for the browser's media APIs the voice code
//   touches (getUserMedia, enumerateDevices, MediaRecorder, AudioContext with an
//   analyser, setSinkId, window events, localStorage) and records what was asked.
import React from "react";

const internals = React.__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED;

export function mount(Component, initialProps) {
  const hooks = [];
  let index = 0;
  let dirty = false;
  let alive = true;
  let queue = [];
  let props = initialProps;
  let ids = 0;
  const stats = { lateSets: 0, renders: 0 };
  const changed = (prev, deps) => !prev || !deps || deps.length !== prev.deps.length || deps.some((d, j) => !Object.is(d, prev.deps[j]));
  const effect = (fn, deps) => {
    const k = index++;
    const prev = hooks[k];
    if (changed(prev, deps))
      queue.push(() => {
        prev?.cleanup?.();
        const cleanup = fn();
        hooks[k] = { deps: deps || [], cleanup: typeof cleanup === "function" ? cleanup : undefined };
      });
  };
  const dispatcher = {
    useState(init) {
      const k = index++;
      if (!(k in hooks)) hooks[k] = { value: typeof init === "function" ? init() : init };
      const h = hooks[k];
      if (!h.set)
        h.set = (next) => {
          if (!alive) {
            stats.lateSets += 1;
            return;
          }
          const v = typeof next === "function" ? next(h.value) : next;
          if (!Object.is(v, h.value)) dirty = true;
          h.value = v;
        };
      return [h.value, h.set];
    },
    useRef(init) {
      const k = index++;
      if (!(k in hooks)) hooks[k] = { current: init };
      return hooks[k];
    },
    useEffect: effect,
    useLayoutEffect: effect,
    useMemo(fn, deps) {
      const k = index++;
      if (changed(hooks[k], deps)) hooks[k] = { deps: deps || [], value: fn() };
      return hooks[k].value;
    },
    useCallback(fn, deps) {
      return dispatcher.useMemo(() => fn, deps);
    },
    useId() {
      const k = index++;
      if (!(k in hooks)) hooks[k] = { id: `:h${(ids += 1)}:` };
      return hooks[k].id;
    },
  };
  let tree = null;
  const render = () => {
    for (let pass = 0; pass < 25; pass += 1) {
      dirty = false;
      index = 0;
      stats.renders += 1;
      const before = internals.ReactCurrentDispatcher.current;
      internals.ReactCurrentDispatcher.current = dispatcher;
      try {
        tree = Component(props);
      } finally {
        internals.ReactCurrentDispatcher.current = before;
      }
      const effects = queue;
      queue = [];
      for (const run of effects) run();
      if (!dirty) return tree;
    }
    throw new Error("render loop");
  };
  render();
  return {
    get tree() {
      return tree;
    },
    get props() {
      return props;
    },
    stats,
    render,
    rerender(next) {
      props = { ...props, ...next };
      return render();
    },
    async settle(rounds = 5) {
      for (let n = 0; n < rounds; n += 1) await new Promise((r) => setImmediate(r));
      return alive ? render() : tree;
    },
    unmount() {
      alive = false;
      for (const h of hooks) h?.cleanup?.();
    },
  };
}

export function* walk(node) {
  if (node == null || typeof node !== "object") return;
  if (Array.isArray(node)) {
    for (const n of node) yield* walk(n);
    return;
  }
  if (node.props) {
    yield node;
    yield* walk(node.props.children);
    for (const key of ["trailing", "label", "help"]) if (node.props[key] && typeof node.props[key] === "object") yield* walk(node.props[key]);
  }
}
export const find = (tree, pred) => [...walk(tree)].find(pred);
export const findAll = (tree, pred) => [...walk(tree)].filter(pred);
export const byAria = (tree, label) => find(tree, (n) => n.props.ariaLabel === label || n.props["aria-label"] === label);
export const byData = (tree, key, value) => find(tree, (n) => n.props[key] === value);
export const text = (node) => {
  if (node == null || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(text).join("");
  return node.props ? text(node.props.children) : "";
};
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function installFakeBrowser() {
  const env = {
    amplitude: 0.1,
    devices: [
      { kind: "audioinput", deviceId: "mic-1", label: "Desk microphone" },
      { kind: "audiooutput", deviceId: "spk-1", label: "Desk speakers" },
    ],
    /** getUserMedia resolves after this many ms (a permission prompt); 0 = at once. */
    gumDelay: 0,
    log: { getUserMedia: [], streams: [], sinks: [], recorders: [], windowAdd: [], windowRemove: [], gains: [], contexts: [], enumerate: 0, analyserReads: 0 },
    store: new Map(),
  };
  class FakeTrack {
    stop() {
      this.stopped = true;
    }
  }
  class FakeStream {
    constructor() {
      this.tracks = [new FakeTrack()];
    }
    getTracks() {
      return this.tracks;
    }
  }
  const param = () => ({ value: 1, setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} });
  class FakeAudioContext {
    constructor() {
      this.state = "running";
      this.currentTime = 0;
      this.destination = {};
      env.log.contexts.push(this);
    }
    setSinkId(id) {
      env.log.sinks.push(id);
      return Promise.resolve();
    }
    resume() {
      return Promise.resolve();
    }
    createGain() {
      const g = { gain: param(), connect() {}, disconnect() {} };
      env.log.gains.push(g);
      return g;
    }
    createOscillator() {
      return { frequency: {}, connect() {}, start() {}, stop() {} };
    }
    createAnalyser() {
      return {
        fftSize: 1024,
        getFloatTimeDomainData: (d) => {
          env.log.analyserReads += 1;
          d.fill(env.amplitude);
        },
      };
    }
    createMediaStreamSource() {
      return { connect() {}, disconnect() {} };
    }
    createMediaStreamDestination() {
      return { stream: new FakeStream() };
    }
    createBufferSource() {
      const s = { connect() {}, disconnect() {}, start() { setTimeout(() => s.onended?.(), 5); }, stop() {}, onended: null };
      return s;
    }
    decodeAudioData() {
      return Promise.resolve({ duration: 0.01 });
    }
    close() {
      return Promise.resolve();
    }
  }
  class FakeMediaRecorder {
    static isTypeSupported() {
      return true;
    }
    constructor(stream, opts) {
      this.stream = stream;
      this.mimeType = opts?.mimeType || "audio/webm";
      env.log.recorders.push(this);
    }
    start() {
      this.state = "recording";
    }
    stop() {
      this.state = "inactive";
      setTimeout(() => {
        this.ondataavailable?.({ data: new Blob([new Uint8Array([1, 2, 3])]) });
        this.onstop?.();
      }, 0);
    }
  }
  const target = new EventTarget();
  const add = (type, fn) => {
    env.log.windowAdd.push(type);
    target.addEventListener(type, fn);
  };
  const remove = (type, fn) => {
    env.log.windowRemove.push(type);
    target.removeEventListener(type, fn);
  };
  const storage = {
    getItem: (k) => (env.store.has(k) ? env.store.get(k) : null),
    setItem: (k, v) => env.store.set(k, String(v)),
    removeItem: (k) => env.store.delete(k),
  };
  const mediaDevices = {
    getUserMedia: (constraints) => {
      env.log.getUserMedia.push(constraints);
      const stream = new FakeStream();
      env.log.streams.push(stream);
      return env.gumDelay ? new Promise((r) => setTimeout(() => r(stream), env.gumDelay)) : Promise.resolve(stream);
    },
    enumerateDevices: () => {
      env.log.enumerate += 1;
      return Promise.resolve(env.devices);
    },
  };
  const saved = {};
  const define = (name, value) => {
    saved[name] = Object.getOwnPropertyDescriptor(globalThis, name);
    Object.defineProperty(globalThis, name, { value, configurable: true, writable: true });
  };
  const fakeWindow = { AudioContext: FakeAudioContext, MediaRecorder: FakeMediaRecorder, addEventListener: add, removeEventListener: remove, dispatchEvent: (e) => target.dispatchEvent(e) };
  define("window", fakeWindow);
  define("AudioContext", FakeAudioContext);
  define("MediaRecorder", FakeMediaRecorder);
  define("navigator", { mediaDevices });
  define("localStorage", storage);
  define("addEventListener", add);
  define("removeEventListener", remove);
  env.dispatch = (type, extra = {}) => target.dispatchEvent(Object.assign(new Event(type), extra));
  env.restore = () => {
    for (const [name, d] of Object.entries(saved)) {
      if (d) Object.defineProperty(globalThis, name, d);
      else delete globalThis[name];
    }
  };
  return env;
}
