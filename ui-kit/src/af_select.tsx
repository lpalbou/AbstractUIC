import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

export type AfSelectOption = {
  value: string;
  label: string;
  group?: string;
};

export type AfSelectProps = {
  value: string;
  options: AfSelectOption[];
  placeholder?: string;
  disabled?: boolean;
  loading?: boolean;
  searchable?: boolean;
  searchPlaceholder?: string;
  allowCustom?: boolean;
  clearable?: boolean;
  minPopoverWidth?: number;
  variant?: "pin" | "panel";
  className?: string;
  triggerClassName?: string;
  onChange: (value: string) => void;

  renderOption?: (opt: AfSelectOption, state: { selected: boolean; highlighted: boolean }) => React.ReactNode;
  renderValue?: (opt: AfSelectOption | null, value: string) => React.ReactNode;
};

export function AfSelect({
  value,
  options,
  placeholder = "Select…",
  disabled = false,
  loading = false,
  searchable = true,
  searchPlaceholder = "Search…",
  allowCustom = false,
  clearable = false,
  minPopoverWidth = 240,
  variant = "panel",
  className,
  triggerClassName,
  onChange,
  renderOption,
  renderValue,
}: AfSelectProps): React.ReactElement {
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);

  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [highlightIdx, setHighlightIdx] = useState(0);
  const [placement, setPlacement] = useState<"bottom" | "top">("bottom");
  const [pos, setPos] = useState<{ left: number; top: number; width: number }>({ left: 0, top: 0, width: 0 });

  const selectedOpt = useMemo(() => {
    const v = String(value ?? "");
    return options.find((o) => o.value === v) || null;
  }, [options, value]);

  const selectedLabel = useMemo(() => {
    return selectedOpt?.label || String(value || "").trim() || "";
  }, [selectedOpt, value]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => o.label.toLowerCase().includes(q) || o.value.toLowerCase().includes(q));
  }, [options, search]);

  const customOption = useMemo((): AfSelectOption | null => {
    if (!allowCustom) return null;
    const q = search.trim();
    if (!q) return null;
    const exists = options.some((o) => o.value === q);
    if (exists) return null;
    return { value: q, label: `Use "${q}"` };
  }, [allowCustom, options, search]);

  const visibleOptions = useMemo(() => {
    if (!customOption) return filtered;
    return [customOption, ...filtered];
  }, [customOption, filtered]);

  const recalcPosition = useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const width = Math.max(rect.width, minPopoverWidth);

    const left = Math.max(8, Math.min(rect.left, window.innerWidth - width - 8));
    const availableBelow = window.innerHeight - rect.bottom;
    const availableAbove = rect.top;
    const nextPlacement: "bottom" | "top" = availableBelow >= 220 || availableBelow >= availableAbove ? "bottom" : "top";
    setPlacement(nextPlacement);

    const top = nextPlacement === "bottom" ? rect.bottom + 6 : rect.top - 6;
    setPos({ left, top, width });
  }, [minPopoverWidth]);

  const close = useCallback(() => {
    setOpen(false);
    setSearch("");
  }, []);

  useEffect(() => {
    if (!open) return;
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
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node | null;
      if (!t) return;
      if (triggerRef.current?.contains(t)) return;
      if (popoverRef.current?.contains(t)) return;
      close();
    };
    document.addEventListener("mousedown", onDown, true);
    return () => document.removeEventListener("mousedown", onDown, true);
  }, [open, close]);

  useEffect(() => {
    if (!open) return;
    const idx = Math.max(
      0,
      visibleOptions.findIndex((o) => o.value === value)
    );
    setHighlightIdx(idx === -1 ? 0 : idx);
    if (searchable) {
      setTimeout(() => searchRef.current?.focus(), 0);
    }
  }, [open, searchable, value, visibleOptions]);

  const pick = (v: string) => {
    onChange(v);
    close();
  };

  const onTriggerKeyDown = (e: React.KeyboardEvent) => {
    if (disabled) return;
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      setOpen((x) => !x);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
    }
  };

  const onPopoverKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      close();
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightIdx((i) => Math.min(i + 1, Math.max(0, visibleOptions.length - 1)));
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightIdx((i) => Math.max(i - 1, 0));
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      const opt = visibleOptions[highlightIdx];
      if (opt) pick(opt.value);
    }
  };

  const showValue = Boolean(String(value || "").trim());
  const triggerText = showValue ? selectedLabel : placeholder;

  const defaultValueNode = (
    <span className={cx("af-select-value", !showValue && "af-select-value--placeholder")}>{loading ? "Loading…" : triggerText}</span>
  );
  const valueNode = renderValue ? renderValue(selectedOpt, String(value || "")) : defaultValueNode;

  return (
    <span className={cx("af-select", variant === "pin" ? "af-select--pin" : "af-select--panel", className)}>
      <button
        ref={triggerRef}
        type="button"
        className={cx("af-select-trigger", triggerClassName)}
        disabled={disabled}
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation();
          if (disabled) return;
          setOpen((x) => !x);
        }}
        onKeyDown={onTriggerKeyDown}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        {valueNode}

        {clearable && showValue ? (
          <span
            className="af-select-clear"
            role="button"
            tabIndex={-1}
            onMouseDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onChange("");
              close();
            }}
            title="Clear"
          >
            ×
          </span>
        ) : null}

        <span className={cx("af-select-caret", open && "af-select-caret--open")}>▾</span>
      </button>

      {open
        ? createPortal(
            <div
              ref={popoverRef}
              className={cx("af-select-popover", placement === "top" && "af-select-popover--top")}
              style={{ position: "fixed", left: `${pos.left}px`, top: `${pos.top}px`, width: `${pos.width}px` }}
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => e.stopPropagation()}
              onKeyDown={onPopoverKeyDown}
              role="listbox"
              tabIndex={-1}
            >
              {searchable ? (
                <div className="af-select-search">
                  <input
                    ref={searchRef}
                    className="af-select-search-input"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder={searchPlaceholder}
                    onKeyDown={onPopoverKeyDown}
                  />
                </div>
              ) : null}

              <div className="af-select-options">
                {visibleOptions.length === 0 ? (
                  <div className="af-select-empty">No results</div>
                ) : (
                  visibleOptions.map((o, i) => {
                    const isSelected = o.value === value;
                    const isHighlighted = i === highlightIdx;
                    const group = String(o.group || "").trim();
                    const prevGroup = i > 0 ? String(visibleOptions[i - 1]?.group || "").trim() : "";
                    const showGroup = Boolean(group) && group !== prevGroup;
                    return (
                      <React.Fragment key={o.value}>
                        {showGroup ? <div className="af-select-group">{group}</div> : null}
                        <div
                          className={cx(
                            "af-select-option",
                            isSelected && "af-select-option--selected",
                            isHighlighted && "af-select-option--highlighted"
                          )}
                          onMouseEnter={() => setHighlightIdx(i)}
                          onMouseDown={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                          }}
                          onClick={() => pick(o.value)}
                        >
                          {renderOption ? (
                            renderOption(o, { selected: isSelected, highlighted: isHighlighted })
                          ) : (
                            <>
                              <span className="af-select-option-label">{o.label}</span>
                              {isSelected ? <span className="af-select-check">✓</span> : null}
                            </>
                          )}
                        </div>
                      </React.Fragment>
                    );
                  })
                )}
              </div>
            </div>,
            document.body
          )
        : null}
    </span>
  );
}

export default AfSelect;
