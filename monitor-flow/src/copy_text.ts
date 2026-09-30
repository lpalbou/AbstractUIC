/*
 * One clipboard helper for the package (0003 dedupe: JsonViewer and
 * AgentCyclesPanel each carried a byte-identical private copy).
 *
 * Same semantics as panel-chat's utils.copyText (the family's canonical
 * implementation) including the off-screen textarea fallback — kept as an
 * in-package module rather than a cross-package import so monitor-flow does
 * not gain a dependency on panel-chat for one function; full unification
 * rides the 0003 one-source viewer merge decision.
 */
export async function copy_text(text: string): Promise<boolean> {
  const value = String(text || "");
  if (!value) return false;
  // navigator.clipboard is https/localhost only; over plain http the textarea + execCommand path
  // copies inside a click handler. Returns true only when a copy actually happened.
  try {
    if (typeof navigator !== "undefined" && typeof navigator.clipboard?.writeText === "function") {
      await navigator.clipboard.writeText(value);
      return true;
    }
  } catch {
    // denied or unfocused: try the textarea path
  }
  try {
    const el = document.createElement("textarea");
    el.value = value;
    el.style.position = "fixed";
    el.style.left = "-9999px";
    document.body.appendChild(el);
    el.select();
    const ok = document.execCommand("copy") === true;
    document.body.removeChild(el);
    return ok;
  } catch {
    return false;
  }
}
