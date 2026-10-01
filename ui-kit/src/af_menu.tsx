/*
 * AfMenu — the kit's compact "more actions" menu: one icon button ("⋯" by
 * default) that opens a short list of actions. Only the actions that APPLY
 * are passed in: the kit renders no disabled items (an unavailable action is
 * left out; a `title` on the button may say why when its absence surprises).
 *
 * Behaviour (af_menu_core.bindAfMenu, shared with plain-HTML hosts through
 * `AfConsoleIslands.bindMenu`): aria-haspopup/aria-expanded, items are
 * role="menuitem", arrow keys / Home / End move, Escape closes and returns
 * focus to the button, an outside press closes, the list flips upward /
 * leftward when it would overflow the viewport (position: fixed, so no
 * ancestor overflow clips it).
 *
 * Markup (plain-HTML hosts render exactly this; docs/modal.md ("Menu")):
 *
 *   <div class="af-menu">
 *     <button type="button" class="af-menu__button" aria-label="More actions for alice">⋯</button>
 *     <div class="af-menu__list" hidden>
 *       <button type="button" class="af-menu__item">Workspace</button>
 *       <button type="button" class="af-menu__item af-menu__item--danger">Archive</button>
 *     </div>
 *   </div>
 */
import React, { useEffect, useRef } from "react";
import { bindAfMenu } from "./af_menu_core.js";

export type AfMenuItem = {
  id: string;
  label: React.ReactNode;
  onSelect: () => void;
  /** A destructive-looking action (Archive): danger text colour. */
  danger?: boolean;
  /** Left out of the list (never rendered disabled). */
  hidden?: boolean;
};

export type AfMenuProps = {
  /** Accessible name of the button, e.g. "More actions for alice". */
  label: string;
  items: AfMenuItem[];
  /** Button content (default "⋯"). */
  buttonContent?: React.ReactNode;
  /** Tooltip on the button (e.g. why an expected action is absent). */
  title?: string;
  className?: string;
  buttonClassName?: string;
};

export function AfMenu(props: AfMenuProps): React.ReactElement | null {
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const visible = props.items.filter((x) => x && !x.hidden);
  const hasItems = visible.length > 0;

  useEffect(() => {
    if (!hasItems || !buttonRef.current || !listRef.current) return;
    return bindAfMenu(buttonRef.current, listRef.current);
  }, [hasItems]);

  if (!hasItems) return null;
  return (
    <div className={`af-menu${props.className ? ` ${props.className}` : ""}`}>
      <button
        type="button"
        ref={buttonRef}
        className={`af-menu__button${props.buttonClassName ? ` ${props.buttonClassName}` : ""}`}
        aria-label={props.label}
        title={props.title}
        aria-haspopup="menu"
        aria-expanded="false"
      >
        {props.buttonContent !== undefined ? props.buttonContent : <span aria-hidden="true">⋯</span>}
      </button>
      <div className="af-menu__list" role="menu" ref={listRef} hidden>
        {visible.map((item) => (
          <button
            key={item.id}
            type="button"
            role="menuitem"
            tabIndex={-1}
            data-menu-id={item.id}
            className={`af-menu__item${item.danger ? " af-menu__item--danger" : ""}`}
            onClick={() => item.onSelect()}
          >
            {item.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export default AfMenu;
