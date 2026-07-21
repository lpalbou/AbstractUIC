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
  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch {
    try {
      const el = document.createElement("textarea");
      el.value = value;
      el.style.position = "fixed";
      el.style.left = "-9999px";
      document.body.appendChild(el);
      el.select();
      document.execCommand("copy");
      document.body.removeChild(el);
      return true;
    } catch {
      return false;
    }
  }
}
