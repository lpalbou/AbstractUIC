/*
 * AfTabs: role=tablist / tab / tabpanel with the WAI-ARIA keyboard model
 * (Left/Right move and select, Home/End jump; unavailable tabs are skipped),
 * roving tabindex, and the `af-tabs` CSS block of theme.css (underline style,
 * 44px on touch). Used by the Mailbox card (Google / Microsoft / Other).
 * Consoles that render the same markup in plain JS reuse `afTabsNextIndex`'s
 * rule. docs/state-toggles.md "Forms, cards and tabs".
 */
import React from "react";

export type AfTab = {
  id: string;
  label: string;
  /** Rendered, focusable, not selectable; the reason is the tab's title + description. */
  unavailableReason?: string;
};

export type AfTabsProps = {
  tabs: AfTab[];
  value: string;
  onChange: (id: string) => void;
  /** Accessible name of the tablist ("Mailbox provider"). */
  ariaLabel: string;
  /** Prefix for the tab/panel ids (default "af-tabs"). Must be unique on the page. */
  idBase?: string;
  className?: string;
  /** Content of the selected tab's panel. */
  children?: React.ReactNode;
};

function isSelectable(tab: AfTab | undefined): boolean {
  return Boolean(tab) && !String(tab?.unavailableReason || "").trim();
}

/**
 * Index the key moves to from `current`, or null when the key is not a tab
 * key. ArrowRight/ArrowDown = next, ArrowLeft/ArrowUp = previous (both wrap),
 * Home = first, End = last; unavailable tabs are skipped.
 */
export function afTabsNextIndex(tabs: AfTab[], current: number, key: string): number | null {
  const n = tabs.length;
  if (!n) return null;
  const step = (from: number, dir: 1 | -1): number => {
    for (let k = 1; k <= n; k += 1) {
      const i = (((from + dir * k) % n) + n) % n;
      if (isSelectable(tabs[i])) return i;
    }
    return current;
  };
  switch (key) {
    case "ArrowRight":
    case "ArrowDown":
      return step(current, 1);
    case "ArrowLeft":
    case "ArrowUp":
      return step(current, -1);
    case "Home":
      return step(-1, 1);
    case "End":
      return step(n, -1);
    default:
      return null;
  }
}

export function AfTabs({ tabs, value, onChange, ariaLabel, idBase = "af-tabs", className, children }: AfTabsProps) {
  const selected = Math.max(0, tabs.findIndex((t) => t.id === value));
  const tabId = (i: number) => `${idBase}-tab-${tabs[i]?.id ?? i}`;
  const panelId = `${idBase}-panel`;

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const targetId = (event.target as { id?: string } | null)?.id;
    const from = tabs.findIndex((_t, i) => tabId(i) === targetId);
    const next = afTabsNextIndex(tabs, from < 0 ? selected : from, event.key);
    if (next === null) return;
    event.preventDefault();
    // Roving focus by id: no refs, so the component stays hook-free.
    const doc = (globalThis as { document?: Document }).document;
    (doc?.getElementById(tabId(next)) as HTMLElement | null)?.focus();
    if (tabs[next].id !== value) onChange(tabs[next].id);
  };

  return (
    <div className={className ? `af-tabs ${className}` : "af-tabs"}>
      <div className="af-tabs__list" role="tablist" aria-label={ariaLabel} onKeyDown={onKeyDown}>
        {tabs.map((tab, i) => {
          const isOn = i === selected;
          const reason = String(tab.unavailableReason || "").trim();
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              id={tabId(i)}
              className="af-tabs__tab"
              aria-selected={isOn ? "true" : "false"}
              aria-controls={panelId}
              aria-disabled={reason ? "true" : undefined}
              aria-description={reason || undefined}
              title={reason || undefined}
              tabIndex={isOn ? 0 : -1}
              onClick={() => {
                if (!reason && tab.id !== value) onChange(tab.id);
              }}
            >
              {tab.label}
            </button>
          );
        })}
      </div>
      <div className="af-tabs__panel" role="tabpanel" id={panelId} aria-labelledby={tabId(selected)} tabIndex={0}>
        {children}
      </div>
    </div>
  );
}
