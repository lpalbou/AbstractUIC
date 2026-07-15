import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
function cx(...parts) {
    return parts.filter(Boolean).join(" ");
}
export function AfSelect({ value, options, placeholder = "Select…", disabled = false, loading = false, searchable = true, searchPlaceholder = "Search…", allowCustom = false, clearable = false, minPopoverWidth = 240, variant = "panel", className, triggerClassName, ariaLabel, id, includeValueOption = false, onOpen, customOptionLabel, validateCustomValue, onChange, renderOption, renderValue, }) {
    const triggerRef = useRef(null);
    const popoverRef = useRef(null);
    const searchRef = useRef(null);
    const onOpenRef = useRef(onOpen);
    const reactId = useId();
    const idBase = id || `af-select-${reactId.replace(/[^a-zA-Z0-9_-]/g, "")}`;
    const listboxId = `${idBase}-listbox`;
    const [open, setOpen] = useState(false);
    const [search, setSearch] = useState("");
    const [highlightIdx, setHighlightIdx] = useState(0);
    const [placement, setPlacement] = useState("bottom");
    const [pos, setPos] = useState({ left: 0, top: 0, width: 0 });
    useEffect(() => {
        onOpenRef.current = onOpen;
    }, [onOpen]);
    const effectiveOptions = useMemo(() => {
        if (!includeValueOption)
            return options;
        const clean = String(value ?? "").trim();
        if (!clean || options.some((o) => o.value === clean))
            return options;
        return [...options, { value: clean, label: clean }];
    }, [includeValueOption, options, value]);
    const selectedOpt = useMemo(() => {
        const v = String(value ?? "");
        return effectiveOptions.find((o) => o.value === v) || null;
    }, [effectiveOptions, value]);
    const selectedLabel = useMemo(() => {
        return selectedOpt?.label || String(value || "").trim() || "";
    }, [selectedOpt, value]);
    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase();
        if (!q)
            return effectiveOptions;
        return effectiveOptions.filter((o) => o.label.toLowerCase().includes(q) || o.value.toLowerCase().includes(q));
    }, [effectiveOptions, search]);
    const customOption = useMemo(() => {
        if (!allowCustom)
            return null;
        const q = search.trim();
        if (!q)
            return null;
        const exists = effectiveOptions.some((o) => o.value === q);
        if (exists)
            return null;
        const reason = validateCustomValue?.(q, { options: effectiveOptions }) || "";
        return {
            value: q,
            label: customOptionLabel ? customOptionLabel(q) : `Use "${q}"`,
            disabled: Boolean(reason),
            reason,
        };
    }, [allowCustom, customOptionLabel, effectiveOptions, search, validateCustomValue]);
    const visibleOptions = useMemo(() => {
        const base = customOption ? [customOption, ...filtered] : filtered;
        if (base.length > 0)
            return base;
        // While options are still loading, keep the current selection pickable
        // instead of an empty list (absorbed fork behavior).
        const clean = String(value ?? "").trim();
        if (loading && clean)
            return [{ value: clean, label: selectedLabel || clean }];
        return base;
    }, [customOption, filtered, loading, selectedLabel, value]);
    const recalcPosition = useCallback(() => {
        const el = triggerRef.current;
        if (!el)
            return;
        const rect = el.getBoundingClientRect();
        const width = Math.max(rect.width, minPopoverWidth);
        const left = Math.max(8, Math.min(rect.left, window.innerWidth - width - 8));
        const availableBelow = window.innerHeight - rect.bottom;
        const availableAbove = rect.top;
        const nextPlacement = availableBelow >= 220 || availableBelow >= availableAbove ? "bottom" : "top";
        setPlacement(nextPlacement);
        const top = nextPlacement === "bottom" ? rect.bottom + 6 : rect.top - 6;
        setPos({ left, top, width });
    }, [minPopoverWidth]);
    const close = useCallback(() => {
        setOpen(false);
        setSearch("");
    }, []);
    // onOpen fires once per OPEN (never re-fires when recalcPosition identity
    // changes mid-open, e.g. a dynamic minPopoverWidth — it is a lazy-load hook).
    useEffect(() => {
        if (open)
            onOpenRef.current?.();
    }, [open]);
    useEffect(() => {
        if (!open)
            return;
        recalcPosition();
        const onResize = () => recalcPosition();
        window.addEventListener("resize", onResize);
        window.addEventListener("scroll", onResize, true);
        return () => {
            window.removeEventListener("resize", onResize);
            window.removeEventListener("scroll", onResize, true);
        };
    }, [open, recalcPosition]);
    useEffect(() => {
        if (!open)
            return;
        const onDown = (e) => {
            const t = e.target;
            if (!t)
                return;
            if (triggerRef.current?.contains(t))
                return;
            if (popoverRef.current?.contains(t))
                return;
            close();
        };
        document.addEventListener("mousedown", onDown, true);
        return () => document.removeEventListener("mousedown", onDown, true);
    }, [open, close]);
    useEffect(() => {
        if (!open)
            return;
        const idx = Math.max(0, visibleOptions.findIndex((o) => o.value === value));
        setHighlightIdx(idx === -1 ? 0 : idx);
        if (searchable) {
            setTimeout(() => searchRef.current?.focus(), 0);
        }
    }, [open, searchable, value, visibleOptions]);
    const pick = (v) => {
        const option = visibleOptions.find((o) => o.value === v);
        if (option?.disabled)
            return;
        onChange(v);
        close();
        // Keyboard flows continue from the control, not from a removed popover.
        triggerRef.current?.focus();
    };
    // ONE navigation handler for both focus homes (trigger when non-searchable,
    // search input when searchable). The 2026-07-11 adversary find: with
    // searchable=false nothing was focused inside the popover, so its key
    // handler was unreachable and keyboard users could not pick an option.
    const onNavKeyDown = (e) => {
        if (e.key === "Escape") {
            e.preventDefault();
            close();
            triggerRef.current?.focus();
            return true;
        }
        if (e.key === "Tab") {
            // Never leave a headless popover open; refocus the trigger FIRST so the
            // default Tab continues naturally from the control (the portal input is
            // disconnected by the close and would tab from document.body).
            close();
            triggerRef.current?.focus();
            return false;
        }
        if (e.key === "ArrowDown") {
            e.preventDefault();
            setHighlightIdx((i) => Math.min(i + 1, Math.max(0, visibleOptions.length - 1)));
            return true;
        }
        if (e.key === "ArrowUp") {
            e.preventDefault();
            setHighlightIdx((i) => Math.max(i - 1, 0));
            return true;
        }
        if (e.key === "Home") {
            e.preventDefault();
            setHighlightIdx(0);
            return true;
        }
        if (e.key === "End") {
            e.preventDefault();
            setHighlightIdx(Math.max(0, visibleOptions.length - 1));
            return true;
        }
        if (e.key === "Enter") {
            e.preventDefault();
            const opt = visibleOptions[highlightIdx];
            if (opt)
                pick(opt.value);
            return true;
        }
        return false;
    };
    const onTriggerKeyDown = (e) => {
        if (disabled)
            return;
        if (open) {
            if (onNavKeyDown(e))
                return;
            if (e.key === " " && !searchable) {
                e.preventDefault();
                const opt = visibleOptions[highlightIdx];
                if (opt)
                    pick(opt.value);
            }
            return;
        }
        if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setOpen(true);
        }
        else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
            e.preventDefault();
            setOpen(true);
        }
    };
    const showValue = Boolean(String(value || "").trim());
    const triggerText = showValue ? selectedLabel : placeholder;
    const customError = customOption?.disabled ? customOption.reason || "Unavailable" : "";
    const activeDescendant = open && visibleOptions.length > 0 ? `${idBase}-opt-${highlightIdx}` : undefined;
    const defaultValueNode = (_jsx("span", { className: cx("af-select-value", !showValue && "af-select-value--placeholder"), children: loading && !showValue ? "Loading…" : triggerText }));
    const valueNode = renderValue ? renderValue(selectedOpt, String(value || "")) : defaultValueNode;
    return (_jsxs("span", { className: cx("af-select", variant === "pin" ? "af-select--pin" : "af-select--panel", className), children: [_jsxs("button", { ref: triggerRef, id: idBase, type: "button", className: cx("af-select-trigger", clearable && showValue && "af-select-trigger--clearable", triggerClassName), disabled: disabled, onMouseDown: (e) => e.stopPropagation(), onClick: (e) => {
                    e.stopPropagation();
                    if (disabled)
                        return;
                    setOpen((x) => !x);
                }, onKeyDown: onTriggerKeyDown, role: searchable ? undefined : "combobox", "aria-haspopup": "listbox", "aria-expanded": open, "aria-controls": open ? listboxId : undefined, "aria-activedescendant": !searchable ? activeDescendant : undefined, "aria-label": ariaLabel, children: [valueNode, _jsx("span", { className: cx("af-select-caret", open && "af-select-caret--open"), children: "\u25BE" })] }), clearable && showValue ? (_jsx("button", { type: "button", className: "af-select-clear-btn", "aria-label": "Clear selection", disabled: disabled, onMouseDown: (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                }, onClick: (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onChange("");
                    close();
                    triggerRef.current?.focus();
                }, title: "Clear", children: "\u00D7" })) : null, open
                ? createPortal(_jsxs("div", { ref: popoverRef, className: cx("af-select-popover", placement === "top" && "af-select-popover--top"), style: { position: "fixed", left: `${pos.left}px`, top: `${pos.top}px`, width: `${pos.width}px` }, onMouseDown: (e) => e.stopPropagation(), onClick: (e) => e.stopPropagation(), onWheel: (e) => e.stopPropagation(), onKeyDown: onNavKeyDown, tabIndex: -1, children: [searchable ? (_jsxs("div", { className: "af-select-search", children: [_jsx("input", { ref: searchRef, className: "af-select-search-input", value: search, onChange: (e) => setSearch(e.target.value), placeholder: searchPlaceholder, onKeyDown: onNavKeyDown, role: "combobox", "aria-expanded": true, "aria-controls": listboxId, "aria-activedescendant": activeDescendant, "aria-invalid": Boolean(customError), "aria-describedby": customError ? `${idBase}-custom-error` : undefined }), customError ? (_jsx("div", { id: `${idBase}-custom-error`, className: "af-select-custom-error", role: "alert", children: customError })) : null] })) : null, _jsx("div", { className: "af-select-options", role: "listbox", id: listboxId, "aria-label": ariaLabel, children: loading && visibleOptions.length === 0 ? (_jsx("div", { className: "af-select-empty", children: "Loading\u2026" })) : visibleOptions.length === 0 ? (_jsx("div", { className: "af-select-empty", children: "No results" })) : (visibleOptions.map((o, i) => {
                                const isSelected = o.value === value;
                                const isHighlighted = i === highlightIdx;
                                const group = String(o.group || "").trim();
                                const prevGroup = i > 0 ? String(visibleOptions[i - 1]?.group || "").trim() : "";
                                const showGroup = Boolean(group) && group !== prevGroup;
                                return (_jsxs(React.Fragment, { children: [showGroup ? (_jsx("div", { className: "af-select-group", role: "presentation", children: group })) : null, _jsx("div", { id: `${idBase}-opt-${i}`, role: "option", "aria-selected": isSelected, className: cx("af-select-option", isSelected && "af-select-option--selected", isHighlighted && "af-select-option--highlighted", o.disabled && "af-select-option--disabled"), title: o.disabled ? o.reason || "Unavailable" : undefined, onMouseEnter: () => setHighlightIdx(i), onMouseDown: (e) => {
                                                e.preventDefault();
                                                e.stopPropagation();
                                            }, onClick: () => pick(o.value), "aria-disabled": o.disabled ? true : undefined, children: renderOption ? (renderOption(o, { selected: isSelected, highlighted: isHighlighted })) : (_jsxs(_Fragment, { children: [_jsxs("span", { className: "af-select-option-label", children: [_jsx("span", { children: o.label }), o.reason ? _jsx("small", { className: "af-select-option-reason", children: o.reason }) : null] }), isSelected ? _jsx("span", { className: "af-select-check", children: "\u2713" }) : null] })) })] }, o.value));
                            })) })] }), document.body)
                : null] }));
}
export default AfSelect;
