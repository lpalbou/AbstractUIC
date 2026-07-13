/*
 * DisclosureList — the shared expandable-rows list (Flow Library families,
 * observer runs list, entity record lists).
 *
 * Built to the AMENDED contract (commons c1116, folding flow's paid-for
 * adversarial data + two amendments c1119):
 *
 *  1. SELECTION IS DUAL-KEY {entityId, rowKey}: the ROW is the keyboard/aria
 *     anchor; the ENTITY drives the consumer's preview. The same entity may
 *     appear in several rows (DAG); same-entity siblings get a
 *     `data-entity-selected` visual echo, NEVER a second selection ring or
 *     N× aria-selected (flow's reverted id-anchored-nav bug is the pinned
 *     rationale).
 *
 *  2. EXPANSION IS PER-ROW-PATH AND CONTROLLED: the consumer owns
 *     expandedKeys and passes VISIBLE rows only; the kit emits
 *     onToggleExpand/onSelect/onActivate intents and never mutates structure
 *     (reveal-path-after-search-clear and badge-toggles-expansion are
 *     inexpressible under uncontrolled state).
 *
 *  3. ROW MODEL IS FLAT-WITH-DEPTH — nested children cannot serve the DAG
 *     honestly and would drag cycle rules into the kit.
 *
 *  4. role=tree with roving tabindex; inner controls tabIndex=-1; Enter AND
 *     double-click activate; Home/End + typeahead over textValue;
 *     scrollOnSelect prop + a scrollToRow imperative handle (expand-near-
 *     bottom uses scrollToRow(key, "start")); unhandled keys are never
 *     swallowed.
 *
 *  Amendment (b): optional `hint` slot per row, rendered muted after the main
 *  content (name-collision disambiguation, e.g. a short id).
 *  Amendment (c): `.af-disclosure__rail` badge-rail helper with an overflow
 *  fade and reserved padding, for consumers rendering chip rails in rows.
 *
 * Honest scope: semantics validated by ONE real consumer (flow's build) plus
 * observer's planned runs list — not claimed three-way.
 */
import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";

export type DisclosureRow<T = unknown> = {
  /** Unique per visible row (path-keyed for DAG entities). */
  key: string;
  /** The domain entity this row shows; repeats across rows when shared. */
  entityId: string;
  parentKey?: string | null;
  /** 0-based indent depth. */
  depth: number;
  expandable: boolean;
  /** Mirror of the consumer's expandedKeys for this row (render + aria). */
  expanded?: boolean;
  /** Default true; false rows are focus-skipped and unselectable. */
  selectable?: boolean;
  /** Plain-text label for typeahead + accessible name. */
  textValue: string;
  /** Amendment (b): muted disambiguation hint (e.g. short id on name collisions). */
  hint?: string;
  data?: T;
};

export type DisclosureSelection = { entityId: string; rowKey: string };

export type DisclosureListHandle = {
  scrollToRow: (rowKey: string, block?: ScrollLogicalPosition) => void;
  focusRow: (rowKey: string) => void;
};

export type DisclosureListProps<T = unknown> = {
  /** VISIBLE rows only, flat, in render order — the consumer owns expansion state. */
  rows: DisclosureRow<T>[];
  selection: DisclosureSelection | null;
  onSelect: (selection: DisclosureSelection, row: DisclosureRow<T>) => void;
  onToggleExpand: (rowKey: string, row: DisclosureRow<T>) => void;
  /** Enter / double-click. Falls back to onSelect when omitted. */
  onActivate?: (selection: DisclosureSelection, row: DisclosureRow<T>) => void;
  /** Row main content (labels, chips). Inner interactive elements must set tabIndex={-1}. */
  renderRow: (row: DisclosureRow<T>) => React.ReactNode;
  ariaLabel?: string;
  className?: string;
  /** Scroll behavior when selection changes from outside (default "nearest"; false disables). */
  scrollOnSelect?: ScrollLogicalPosition | false;
  emptyLabel?: string;
};

function rowDomId(listId: string, rowKey: string): string {
  // Row keys are consumer data — encode for a safe, collision-free DOM id.
  // encodeURIComponent throws URIError on lone surrogates (truncated emoji
  // in entity names — adversary find 2026-07-13); fall back to a code-point
  // encoding that cannot throw on any consumer string.
  try {
    return `${listId}-row-${encodeURIComponent(rowKey)}`;
  } catch {
    const points = Array.from(rowKey, (c) => (c.codePointAt(0) || 0).toString(16));
    return `${listId}-row-cp-${points.join("-")}`;
  }
}

function DisclosureListInner<T>(
  props: DisclosureListProps<T>,
  ref: React.ForwardedRef<DisclosureListHandle>
): React.ReactElement {
  const listId = React.useId().replace(/:/g, "_");
  const containerRef = useRef<HTMLUListElement | null>(null);
  // Roving tabindex anchor: the focused row key (falls back to the selected
  // row, then the first focusable row).
  const [focusKey, setFocusKey] = useState<string | null>(null);
  const typeaheadRef = useRef<{ buffer: string; at: number }>({ buffer: "", at: 0 });

  const rows = props.rows;
  const focusableRows = useMemo(() => rows.filter((r) => r.selectable !== false), [rows]);

  const effectiveFocusKey = useMemo(() => {
    if (focusKey && rows.some((r) => r.key === focusKey && r.selectable !== false)) return focusKey;
    if (props.selection && rows.some((r) => r.key === props.selection?.rowKey)) return props.selection.rowKey;
    return focusableRows.length > 0 ? focusableRows[0].key : null;
  }, [focusKey, rows, props.selection, focusableRows]);

  const scrollToRow = useCallback(
    (rowKey: string, block: ScrollLogicalPosition = "nearest") => {
      const el = containerRef.current?.querySelector<HTMLElement>(`[id="${rowDomId(listId, rowKey)}"]`);
      el?.scrollIntoView({ block, behavior: "auto" });
    },
    [listId]
  );

  const focusRow = useCallback(
    (rowKey: string) => {
      setFocusKey(rowKey);
      const el = containerRef.current?.querySelector<HTMLElement>(`[id="${rowDomId(listId, rowKey)}"]`);
      el?.focus();
    },
    [listId]
  );

  useImperativeHandle(ref, () => ({ scrollToRow, focusRow }), [scrollToRow, focusRow]);

  // Outside selection changes (search jump, deep link) scroll into view.
  // Keyed on visibility too: a selection set while its row is NOT in the
  // visible rows (collapsed ancestor) must scroll when the consumer later
  // reveals the path (adversary find 2026-07-13 — deps without rows never
  // re-ran on reveal).
  const selectedRowVisible = Boolean(props.selection && rows.some((r) => r.key === props.selection?.rowKey));
  const lastScrolledSelection = useRef<string | null>(null);
  useEffect(() => {
    const key = props.selection?.rowKey || null;
    if (!key || !selectedRowVisible || props.scrollOnSelect === false) return;
    if (lastScrolledSelection.current === key) return;
    lastScrolledSelection.current = key;
    scrollToRow(key, props.scrollOnSelect || "nearest");
  }, [props.selection?.rowKey, selectedRowVisible, props.scrollOnSelect, scrollToRow]);

  const select = (row: DisclosureRow<T>) => {
    if (row.selectable === false) return;
    setFocusKey(row.key);
    props.onSelect({ entityId: row.entityId, rowKey: row.key }, row);
  };

  const activate = (row: DisclosureRow<T>) => {
    if (row.selectable === false) return;
    const sel = { entityId: row.entityId, rowKey: row.key };
    (props.onActivate || props.onSelect)(sel, row);
  };

  const moveFocus = (from: string | null, delta: number) => {
    if (focusableRows.length === 0) return;
    const idx = from ? focusableRows.findIndex((r) => r.key === from) : -1;
    const next = idx < 0 ? (delta > 0 ? 0 : focusableRows.length - 1) : Math.min(Math.max(idx + delta, 0), focusableRows.length - 1);
    const row = focusableRows[next];
    if (!row || row.key === from) return;
    focusRow(row.key);
    select(row);
  };

  const onRowKeyDown = (e: React.KeyboardEvent<HTMLLIElement>, row: DisclosureRow<T>) => {
    // Only handle keys we own; everything else bubbles untouched (contract:
    // unhandled keys are never swallowed).
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        moveFocus(row.key, 1);
        return;
      case "ArrowUp":
        e.preventDefault();
        moveFocus(row.key, -1);
        return;
      case "ArrowRight":
        if (row.expandable && !row.expanded) {
          e.preventDefault();
          props.onToggleExpand(row.key, row);
        } else if (row.expandable && row.expanded) {
          e.preventDefault();
          moveFocus(row.key, 1); // tree pattern: right on open node moves to first child
        }
        return;
      case "ArrowLeft":
        if (row.expandable && row.expanded) {
          e.preventDefault();
          props.onToggleExpand(row.key, row);
        } else if (row.parentKey) {
          const parent = rows.find((r) => r.key === row.parentKey);
          if (parent && parent.selectable !== false) {
            e.preventDefault();
            focusRow(parent.key);
            select(parent);
          }
        }
        return;
      case "Home":
        e.preventDefault();
        moveFocus(null, 1);
        return;
      case "End":
        e.preventDefault();
        moveFocus(null, -1);
        return;
      case "Enter":
        e.preventDefault();
        activate(row);
        return;
      case " ":
        e.preventDefault();
        select(row);
        return;
      default:
        break;
    }
    // Typeahead over textValue (printable single chars only).
    if (e.key.length === 1 && !e.metaKey && !e.ctrlKey && !e.altKey) {
      const now = Date.now();
      const state = typeaheadRef.current;
      state.buffer = now - state.at > 600 ? e.key : state.buffer + e.key;
      state.at = now;
      const needle = state.buffer.toLowerCase();
      const startIdx = focusableRows.findIndex((r) => r.key === row.key);
      const ordered = [...focusableRows.slice(startIdx + 1), ...focusableRows.slice(0, startIdx + 1)];
      const hit = ordered.find((r) => r.textValue.toLowerCase().startsWith(needle));
      if (hit) {
        e.preventDefault();
        focusRow(hit.key);
        select(hit);
      }
    }
  };

  if (rows.length === 0) {
    return (
      <div className={`af-disclosure af-disclosure--empty${props.className ? ` ${props.className}` : ""}`}>
        <span className="af-disclosure__empty">{props.emptyLabel || "Nothing to show"}</span>
      </div>
    );
  }

  return (
    <ul
      ref={containerRef}
      role="tree"
      aria-label={props.ariaLabel || "Items"}
      className={`af-disclosure${props.className ? ` ${props.className}` : ""}`}
    >
      {rows.map((row) => {
        const isAnchor = props.selection?.rowKey === row.key;
        // Same-entity echo: a visual hook only — never aria-selected, never
        // the ring (the dual-key contract's load-bearing rule).
        const isEntityEcho = !isAnchor && Boolean(props.selection && props.selection.entityId === row.entityId);
        const isFocusAnchor = effectiveFocusKey === row.key;
        return (
          <li
            key={row.key}
            id={rowDomId(listId, row.key)}
            role="treeitem"
            aria-level={row.depth + 1}
            aria-expanded={row.expandable ? Boolean(row.expanded) : undefined}
            aria-selected={row.selectable === false ? undefined : isAnchor}
            aria-disabled={row.selectable === false || undefined}
            tabIndex={row.selectable === false ? -1 : isFocusAnchor ? 0 : -1}
            className={[
              "af-disclosure__row",
              isAnchor ? "af-disclosure__row--selected" : "",
              row.selectable === false ? "af-disclosure__row--static" : "",
            ]
              .filter(Boolean)
              .join(" ")}
            data-entity-selected={isEntityEcho || undefined}
            data-depth={row.depth}
            style={{ ["--af-disclosure-depth" as string]: row.depth }}
            onKeyDown={(e) => onRowKeyDown(e, row)}
            onClick={() => select(row)}
            onDoubleClick={() => activate(row)}
            onFocus={(e) => {
              if (e.target === e.currentTarget) setFocusKey(row.key);
            }}
          >
            {row.expandable ? (
              <button
                type="button"
                className="af-disclosure__chevron"
                tabIndex={-1}
                aria-hidden="true"
                onClick={(e) => {
                  e.stopPropagation();
                  props.onToggleExpand(row.key, row);
                }}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                  {row.expanded ? <path d="M6 9l6 6 6-6" /> : <path d="M9 18l6-6-6-6" />}
                </svg>
              </button>
            ) : (
              <span className="af-disclosure__chevron af-disclosure__chevron--spacer" aria-hidden="true" />
            )}
            <span className="af-disclosure__content">{props.renderRow(row)}</span>
            {row.hint ? <span className="af-disclosure__hint">{row.hint}</span> : null}
          </li>
        );
      })}
    </ul>
  );
}

export const DisclosureList = forwardRef(DisclosureListInner) as <T = unknown>(
  props: DisclosureListProps<T> & { ref?: React.ForwardedRef<DisclosureListHandle> }
) => React.ReactElement;

export default DisclosureList;
