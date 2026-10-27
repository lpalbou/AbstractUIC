// A minimal hook harness for the kit's DOM-free checks (the pattern of
// check_voice_library.mjs, shared by check_gateway_connection.mjs and
// check_app_shell.mjs): `fn(props)` runs under a stand-in React dispatcher
// (useState, useRef, useEffect, useLayoutEffect, useMemo, useCallback,
// useContext, useId); effects run after each render pass; the returned value (a hook
// result or an element tree, children NOT rendered) is `h.current`.
import React from "react";

const internals = React.__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED;

export function mountHook(fn, initialProps) {
  const hooks = [];
  let index = 0;
  let dirty = false;
  let queue = [];
  let props = initialProps;
  let ids = 0;
  const changed = (prev, deps) => !prev || !deps || deps.length !== prev.deps.length || deps.some((d, j) => !Object.is(d, prev.deps[j]));
  const effect = (cb, deps) => {
    const k = index++;
    const prev = hooks[k];
    if (changed(prev, deps))
      queue.push(() => {
        prev?.cleanup?.();
        const cleanup = cb();
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
    useMemo(cb, deps) {
      const k = index++;
      if (changed(hooks[k], deps)) hooks[k] = { deps: deps || [], value: cb() };
      return hooks[k].value;
    },
    useCallback(cb, deps) {
      return dispatcher.useMemo(() => cb, deps);
    },
    useContext(ctx) {
      return ctx._currentValue;
    },
    useId() {
      const k = index++;
      if (!(k in hooks)) hooks[k] = { value: `:h${(ids += 1)}:` };
      return hooks[k].value;
    },
  };
  let result = null;
  const render = () => {
    for (let pass = 0; pass < 25; pass += 1) {
      dirty = false;
      index = 0;
      const before = internals.ReactCurrentDispatcher.current;
      internals.ReactCurrentDispatcher.current = dispatcher;
      try {
        result = fn(props);
      } finally {
        internals.ReactCurrentDispatcher.current = before;
      }
      const effects = queue;
      queue = [];
      for (const run of effects) run();
      if (!dirty) return result;
    }
    throw new Error("render loop");
  };
  render();
  return {
    get current() {
      return result;
    },
    render,
    rerender(next) {
      props = { ...props, ...next };
      return render();
    },
    async settle() {
      for (let n = 0; n < 6; n += 1) await new Promise((r) => setImmediate(r));
      return render();
    },
    unmount() {
      for (const h of hooks) h?.cleanup?.();
    },
  };
}

/** Every element of a (shallow) element tree, depth first. */
export function* walk(node) {
  if (node == null || typeof node !== "object") return;
  if (Array.isArray(node)) {
    for (const n of node) yield* walk(n);
    return;
  }
  if (node.props) {
    yield node;
    yield* walk(node.props.children);
  }
}

export const findAll = (tree, pred) => [...walk(tree)].filter(pred);
export const find = (tree, pred) => [...walk(tree)].find(pred);
