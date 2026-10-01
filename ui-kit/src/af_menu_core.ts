/*
 * af_menu_core — the framework-free behaviour behind AfMenu, shared with
 * plain-HTML hosts (the gateway console binds it through the console islands:
 * `AfConsoleIslands.bindMenu(button, menu)`).
 *
 * bindAfMenu(button, menu, options) turns a button + an `.af-menu__list`
 * element into a menu button until the returned release() is called:
 * - the button gets aria-haspopup="menu", aria-expanded and aria-controls;
 *   the list gets role="menu" and starts hidden; every `.af-menu__item`
 *   (queried at use time, so a host may re-render the items) gets
 *   role="menuitem" and tabindex=-1;
 * - a click on the button (or Enter / Space / ArrowDown on it) opens the menu
 *   and focuses the first item; ArrowUp opens on the last item;
 * - inside: ArrowDown / ArrowUp move (wrapping), Home / End jump, Tab closes
 *   and lets focus move on; Escape closes and returns focus to the button
 *   (taken at the window in the capture phase and marked defaultPrevented, so
 *   an enclosing modal stays open);
 * - a press outside closes (focus stays where the press put it);
 * - choosing an item closes the menu; focus returns to the button unless the
 *   item's own handler moved focus elsewhere (e.g. it opened a modal);
 * - the list is `position: fixed` (theme.css `af-menu` block), placed by
 *   afMenuPlacement under the button and flipped upward / leftward when it
 *   would overflow the viewport, so no ancestor overflow ever clips it and it
 *   never widens the page. Scroll repositions it; a resize closes it.
 * Nothing here renders: the markup contract is in docs/modal.md ("Menu").
 */

export type AfMenuRect = { top: number; left: number; right: number; bottom: number };
export type AfMenuPlacement = { top: number; left: number; up: boolean; leftward: boolean };

/** Where a menu of `size` goes for a button at `button` in a `viewport` (gap 4 px, margin 8 px). */
export function afMenuPlacement(
  button: AfMenuRect,
  size: { width: number; height: number },
  viewport: { width: number; height: number },
  gap = 4,
  margin = 8,
): AfMenuPlacement {
  let top = button.bottom + gap;
  let up = false;
  if (top + size.height > viewport.height - margin) {
    const above = button.top - gap - size.height;
    // Flip only when it fits above (or fits better there than below).
    if (above >= margin || button.top > viewport.height - button.bottom) {
      top = above;
      up = true;
    }
  }
  let left = button.left;
  let leftward = false;
  if (left + size.width > viewport.width - margin) {
    left = button.right - size.width;
    leftward = true;
  }
  left = Math.max(margin, Math.min(left, viewport.width - margin - size.width));
  top = Math.max(margin, top);
  return { top: Math.round(top), left: Math.round(left), up, leftward };
}

export type BindAfMenuOptions = {
  /** Called after the menu opened. */
  onOpen?: () => void;
  /** Called after the menu closed (any reason). */
  onClose?: () => void;
  /** Document to bind (default: the button's ownerDocument). */
  document?: Document;
};

let menuSeq = 0;

/** Make `button` open `menu` (an `.af-menu__list` holding `.af-menu__item` elements). Returns release(). */
export function bindAfMenu(button: HTMLElement, menu: HTMLElement, options: BindAfMenuOptions = {}): () => void {
  if (!button || !menu) throw new Error("bindAfMenu: button and menu are required");
  const doc: Document = options.document || button.ownerDocument;
  const win = (doc.defaultView || (globalThis as unknown as Window)) as Window;
  if (!menu.getAttribute("id")) {
    menuSeq += 1;
    menu.setAttribute("id", `af-menu-${menuSeq}`);
  }
  button.setAttribute("aria-haspopup", "menu");
  button.setAttribute("aria-expanded", "false");
  button.setAttribute("aria-controls", String(menu.getAttribute("id")));
  menu.setAttribute("role", "menu");
  menu.hidden = true;

  const items = (): HTMLElement[] => {
    const all = Array.from(menu.querySelectorAll<HTMLElement>(".af-menu__item"));
    const visible = all.filter((el) => !el.hidden && !el.hasAttribute("disabled"));
    for (const el of all) {
      el.setAttribute("role", "menuitem");
      el.setAttribute("tabindex", "-1");
    }
    return visible;
  };
  items();

  let open = false;
  const place = () => {
    if (!open) return;
    const r = button.getBoundingClientRect();
    const m = menu.getBoundingClientRect();
    const p = afMenuPlacement(r, { width: m.width, height: m.height }, { width: win.innerWidth, height: win.innerHeight });
    menu.style.top = `${p.top}px`;
    menu.style.left = `${p.left}px`;
    menu.setAttribute("data-placement", `${p.up ? "top" : "bottom"}-${p.leftward ? "end" : "start"}`);
  };
  const focusAt = (index: number) => {
    const list = items();
    if (!list.length) return;
    const i = ((index % list.length) + list.length) % list.length;
    list[i].focus({ preventScroll: true });
  };
  const show = (focusIndex: number) => {
    if (open) return;
    open = true;
    menu.hidden = false;
    button.setAttribute("aria-expanded", "true");
    place();
    focusAt(focusIndex);
    doc.addEventListener("pointerdown", onOutside, true);
    doc.addEventListener("mousedown", onOutside, true);
    win.addEventListener("scroll", place, true);
    win.addEventListener("resize", onResize);
    win.addEventListener("keydown", onWinKey as EventListener, true);
    if (options.onOpen) options.onOpen();
  };
  const hide = (returnFocus: boolean) => {
    if (!open) return;
    open = false;
    menu.hidden = true;
    button.setAttribute("aria-expanded", "false");
    doc.removeEventListener("pointerdown", onOutside, true);
    doc.removeEventListener("mousedown", onOutside, true);
    win.removeEventListener("scroll", place, true);
    win.removeEventListener("resize", onResize);
    win.removeEventListener("keydown", onWinKey as EventListener, true);
    if (returnFocus) button.focus({ preventScroll: true });
    if (options.onClose) options.onClose();
  };
  function onOutside(e: Event) {
    const t = e.target as Node | null;
    if (t && (menu.contains(t) || button.contains(t))) return;
    hide(false);
  }
  function onResize() {
    hide(false);
  }
  const onButtonClick = (e: Event) => {
    e.preventDefault();
    if (open) hide(true);
    else show(0);
  };
  const onButtonKey = (e: KeyboardEvent) => {
    if (e.key === "ArrowDown" || ((e.key === "Enter" || e.key === " ") && !open)) {
      e.preventDefault();
      show(0);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      show(-1);
    }
  };
  // Escape is taken at the WINDOW in the capture phase (it runs before any
  // document-level listener, e.g. an enclosing bindAfModal) and marked
  // defaultPrevented, so Escape closes the menu and only the menu.
  const onWinKey = (e: KeyboardEvent) => {
    if (!open || (e.key !== "Escape" && e.key !== "Esc")) return;
    const t = e.target as Node | null;
    if (t && t !== button && !menu.contains(t) && t !== doc.body) return;
    e.preventDefault();
    hide(true);
  };
  const onMenuKey = (e: KeyboardEvent) => {
    if (!open) return;
    const list = items();
    const i = list.indexOf(doc.activeElement as HTMLElement);
    if (e.key === "ArrowDown") {
      e.preventDefault();
      focusAt(i + 1);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      focusAt(i < 0 ? -1 : i - 1);
    } else if (e.key === "Home") {
      e.preventDefault();
      focusAt(0);
    } else if (e.key === "End") {
      e.preventDefault();
      focusAt(-1);
    } else if (e.key === "Tab") {
      hide(false);
    }
  };
  // Bubble phase: the item's own click handler has already run.
  const onMenuClick = (e: Event) => {
    const t = e.target as Element | null;
    const item = t && typeof t.closest === "function" ? t.closest(".af-menu__item") : null;
    if (!item || !menu.contains(item)) return;
    const active = doc.activeElement as Node | null;
    const focusStayed = !active || active === doc.body || menu.contains(active);
    hide(focusStayed);
  };
  button.addEventListener("click", onButtonClick);
  button.addEventListener("keydown", onButtonKey as EventListener);
  menu.addEventListener("keydown", onMenuKey as EventListener);
  menu.addEventListener("click", onMenuClick);

  let released = false;
  return () => {
    if (released) return;
    released = true;
    hide(false);
    button.removeEventListener("click", onButtonClick);
    button.removeEventListener("keydown", onButtonKey as EventListener);
    menu.removeEventListener("keydown", onMenuKey as EventListener);
    menu.removeEventListener("click", onMenuClick);
  };
}
