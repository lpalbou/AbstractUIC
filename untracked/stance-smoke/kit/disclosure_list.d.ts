import React from "react";
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
export type DisclosureSelection = {
    entityId: string;
    rowKey: string;
};
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
export declare const DisclosureList: <T = unknown>(props: DisclosureListProps<T> & {
    ref?: React.ForwardedRef<DisclosureListHandle>;
}) => React.ReactElement;
export default DisclosureList;
//# sourceMappingURL=disclosure_list.d.ts.map