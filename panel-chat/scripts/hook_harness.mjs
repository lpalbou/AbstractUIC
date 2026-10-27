// A minimal hook harness for the panel-chat checks (no DOM): the component
// function is called under a stand-in React dispatcher, and its element
// tree's handlers are invoked directly. Same approach as ui-kit's
// check_voice_library.mjs. Only the top-level component's hooks run; child
// component elements stay unrendered (inspect their props instead).
import React from "react";

const internals = React.__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED;

export function mount(Component, initialProps) {
  const hooks = [];
  let index = 0;
  let dirty = false;
  let alive = true;
  let queue = [];
  let props = initialProps;
  const changed = (prev, deps) => !prev || !deps || deps.length !== prev.deps.length || deps.some((d, j) => !Object.is(d, prev.deps[j]));
  const dispatcher = {
    useState(init) {
      const k = index++;
      if (!(k in hooks)) hooks[k] = { value: typeof init === "function" ? init() : init };
      const h = hooks[k];
      if (!h.set)
        h.set = (next) => {
          if (!alive) return;
          const v = typeof next === "function" ? next(h.value) : next;
          if (!Object.is(v, h.value)) dirty = true;
          h.value = v;
        };
      return [h.value, h.set];
    },
    useReducer(reducer, init) {
      const [value, set] = dispatcher.useState(init);
      return [value, (action) => set((v) => reducer(v, action))];
    },
    useRef(init) {
      const k = index++;
      if (!(k in hooks)) hooks[k] = { current: init };
      return hooks[k];
    },
    useEffect(fn, deps) {
      const k = index++;
      const prev = hooks[k];
      if (changed(prev, deps))
        queue.push(() => {
          prev?.cleanup?.();
          const cleanup = fn();
          hooks[k] = { deps: deps || [], cleanup: typeof cleanup === "function" ? cleanup : undefined };
        });
    },
    useLayoutEffect(fn, deps) {
      return dispatcher.useEffect(fn, deps);
    },
    useMemo(fn, deps) {
      const k = index++;
      if (changed(hooks[k], deps)) hooks[k] = { deps: deps || [], value: fn() };
      return hooks[k].value;
    },
    useCallback(fn, deps) {
      return dispatcher.useMemo(() => fn, deps);
    },
    useContext(context) {
      return context._currentValue;
    },
    useId() {
      const k = index++;
      if (!(k in hooks)) hooks[k] = { value: `:h${k}:` };
      return hooks[k].value;
    },
  };
  let tree = null;
  const render = () => {
    for (let pass = 0; pass < 25; pass += 1) {
      dirty = false;
      index = 0;
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
    render,
    rerender(next) {
      props = { ...props, ...next };
      return render();
    },
    async settle() {
      for (let n = 0; n < 5; n += 1) await new Promise((r) => setImmediate(r));
      return alive ? render() : tree;
    },
    unmount() {
      alive = false;
      for (const h of hooks) h?.cleanup?.();
    },
  };
}

/** Every element in a tree, descending into children AND element-valued props (slots). */
export function* walk(node) {
  if (node == null || typeof node !== "object") return;
  if (Array.isArray(node)) {
    for (const n of node) yield* walk(n);
    return;
  }
  if (node.props) {
    yield node;
    for (const [key, value] of Object.entries(node.props)) {
      if (key === "children" || (value && typeof value === "object" && (React.isValidElement(value) || Array.isArray(value)))) yield* walk(value);
    }
  }
}
export const findAll = (tree, pred) => [...walk(tree)].filter(pred);
export const find = (tree, pred) => [...walk(tree)].find(pred);
/** The text directly inside an element (strings/numbers of its children, recursively). */
export function textOf(node) {
  if (node == null || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textOf).join("");
  if (node.props) return textOf(node.props.children);
  return "";
}
export const byData = (tree, key, value) => find(tree, (n) => n.props && n.props[key] === value);
