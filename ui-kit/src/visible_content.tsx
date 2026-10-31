import React, { useEffect, useRef } from "react";

/** A loaded content footer consumed for 250 ms in the focused, unobscured viewport. */
export function VisibleContentMarker(p: { contentKey: string; enabled: boolean; ownerKey?: string; onConsume: () => void }): React.ReactElement {
  const ref = useRef<HTMLSpanElement>(null), callback = useRef(p.onConsume); callback.current = p.onConsume;
  useEffect(() => {
    const el = ref.current;
    if (!el || !p.enabled) return;
    const notify = callback.current; // Capture this owner; a late timer cannot call a new account's callback.
    let timer: ReturnType<typeof setTimeout> | undefined, done = false;
    const visible = () => {
      if (document.hidden || !document.hasFocus() || !el.isConnected) return false;
      const b = el.getBoundingClientRect();
      if (b.width <= 0 || b.height <= 0 || b.top < 0 || b.bottom > window.innerHeight) return false;
      const hit = document.elementFromPoint(b.left + b.width/2, b.top + b.height/2);
      return hit === el || Boolean(hit && el.contains(hit));
    };
    const check = () => {
      if (done) return;
      clearTimeout(timer);
      if (visible()) timer = setTimeout(() => { if (visible()) { done = true; notify(); } }, 250);
    };
    const observer = new IntersectionObserver(check, { threshold: 1 }); observer.observe(el);
    for (const event of ["focus", "blur", "resize", "pointerup", "keyup", "scroll"]) window.addEventListener(event, check, true);
    document.addEventListener("visibilitychange", check);
    check();
    return () => {
      clearTimeout(timer); observer.disconnect();
      for (const event of ["focus", "blur", "resize", "pointerup", "keyup", "scroll"]) window.removeEventListener(event, check, true);
      document.removeEventListener("visibilitychange", check);
    };
  }, [p.enabled, p.ownerKey, p.contentKey]);
  return <span ref={ref} aria-hidden="true" className="af-session-read-marker" style={{ display: "block", width: "100%", height: 1 }} />;
}
