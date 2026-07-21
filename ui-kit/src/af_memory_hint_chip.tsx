/*
 * AfMemoryHintChip — the G1 render half (plans/improving-entity-capabilities.md,
 * uic section; operator directive c2596: "the hint of writing must carry the
 * direct link / tool command").
 *
 * A memory hint (a diary-writing act, a question on the card, a projection
 * in a ledger line) renders as ONE compact affordance that reopens the
 * entity's own words — through the consumer's transport, on a deliberate
 * click.
 *
 * PROP-SHAPED BY RULING (entity c2623, adopted c2626): the chip takes the
 * entry id as a PROP and never greps a payload shape — each surface's
 * composer reads its OWN layer (handles → provenance.entry_id after memory's
 * M-A; assertions → attributes.entry_id; /card items → top-level entry_id).
 * One renderer, N readers: a wrong-layer grep is impossible at this boundary.
 *
 * SECURITY RULE ZERO (agora c2607 — the 0.12.4 zero-click lesson): the chip
 * acts ONLY on a deliberate click. No fetch exists in this file at all —
 * no resolve-on-display, no prefetch, no preview-on-render. Rendering a
 * hint must never touch the entity's memory state.
 *
 * HONESTY RULES (the kit's house set):
 *  - a hint WITHOUT an entry id renders as plain text — never a dead button;
 *  - the command string is rendered VERBATIM from the prop (composed by
 *    runtime's MEMORIES-line authority — the one-command rule; the chip
 *    never templates a command itself);
 *  - refusals/errors from the consumer's open handler render as text beside
 *    the chip, never silently hidden.
 */
import React, { useCallback, useRef, useState } from "react";

export interface AfMemoryHintChipProps {
  /** Human label for the hint (e.g. the entry gist or "your diary act"). */
  label: string;
  /** The book entry key (diary_ + hex namespace, verbatim). Absent = the
   * hint renders as plain text (honesty rule: never a dead button). */
  entryId?: string | null;
  /** Record kind for the leading glyph/tint (diary | question | dream |
   * interest | ...). Unknown kinds render neutral. */
  kind?: string;
  /** Pre-composed re-entry command (runtime's spelling authority), rendered
   * verbatim as secondary text — e.g. "diary_read diary_ab12…". Optional. */
  command?: string;
  /** Consumer transport: called with the entryId on DELIBERATE click.
   * Resolution, modal, caching are the app's — the kit only renders. */
  onOpen?: (entryId: string) => void | Promise<void>;
  /** Render the id tail beside the label (default true when entryId set). */
  showId?: boolean;
  className?: string;
  title?: string;
}

const KIND_TINTS: Record<string, string> = {
  diary: "var(--accent)",
  question: "#e7b45a",
  dream: "#c084dd",
  interest: "#7bd88a",
  lesson: "#6ea8d8",
  world_model: "#5eead4",
};

function idTail(id: string): string {
  const s = String(id || "");
  return s.length > 14 ? `${s.slice(0, 10)}…${s.slice(-4)}` : s;
}

export function AfMemoryHintChip(props: AfMemoryHintChipProps): React.ReactElement {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const busyRef = useRef(false);

  const entryId = typeof props.entryId === "string" && props.entryId.trim() ? props.entryId.trim() : null;
  const tint = (props.kind && KIND_TINTS[props.kind]) || "var(--text-muted)";

  const onClick = useCallback(async () => {
    if (!entryId || !props.onOpen || busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError(null);
    try {
      await props.onOpen(entryId);
    } catch (e: any) {
      // Refusals render, never hide (private entries, 403s, dead doors).
      setError(String(e?.message || e || "could not open"));
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }, [entryId, props.onOpen]);

  // No key or no transport: plain text, never a dead button.
  if (!entryId || !props.onOpen) {
    return (
      <span className={["af-memory-hint", "af-memory-hint--text", props.className || ""].filter(Boolean).join(" ")} title={props.title}>
        <span className="af-memory-hint__dot" style={{ background: tint }} aria-hidden="true" />
        <span className="af-memory-hint__label">{props.label}</span>
        {entryId && props.showId !== false ? <code className="af-memory-hint__id">{idTail(entryId)}</code> : null}
      </span>
    );
  }

  return (
    <span className={["af-memory-hint", props.className || ""].filter(Boolean).join(" ")}>
      <button
        type="button"
        className="af-memory-hint__btn"
        onClick={() => void onClick()}
        disabled={busy}
        title={props.title || (props.command ? props.command : `open ${entryId}`)}
        aria-label={`Open ${props.kind || "memory"} entry: ${props.label}`}
      >
        <span className="af-memory-hint__dot" style={{ background: tint }} aria-hidden="true" />
        <span className="af-memory-hint__label">{props.label}</span>
        {props.showId !== false ? <code className="af-memory-hint__id">{idTail(entryId)}</code> : null}
        <span className="af-memory-hint__act" aria-hidden="true">{busy ? "…" : "↗"}</span>
      </button>
      {props.command ? <code className="af-memory-hint__cmd">{props.command}</code> : null}
      {error ? <span className="af-memory-hint__err" role="alert">{error}</span> : null}
    </span>
  );
}

export default AfMemoryHintChip;
