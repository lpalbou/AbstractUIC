# Modal, Account Rows and Grouped Navigation

This page covers four `ui-kit` pieces used by account and settings screens: the large modal
dialog (`AfModal`), the account-kind row tints and chips, the grouped sidebar captions with a
bottom slot, and the helper-text size floor. Each piece is a set of CSS classes in
`ui-kit/src/theme.css`, so pages that are not React apps (the AbstractGateway console) use the
same markup; React apps can also use the component.

## Modal dialog

A modal opens a large panel over the page: an Email panel, an activity log, a form that needs room.

- Size: `min(960px, 100vw - 32px)` wide, at most 90 % of the viewport height. `af-modal--narrow`
  is `min(560px, 100vw - 32px)`.
- Backdrop: the page is dimmed and blurred (`backdrop-filter: blur(8px)`). With
  `prefers-reduced-transparency: reduce` the blur is dropped and the dim is solid.
- Scrolling: on a desktop the header and footer stay put and the body scrolls. Below 768 px the
  modal is a full-screen sheet with one scroll (the sheet itself); the header and footer stay
  pinned inside it and clear the notch and the home indicator.
- Behaviour: focus moves into the dialog and returns to the button that opened it; Tab and
  Shift+Tab stay inside; Escape and a click on the backdrop close it (only the topmost modal
  reacts when several are open); the page behind does not scroll (`html.af-modal-open`).
- Layering: `z-index: var(--z-modal)` (950): above drawers, below the Gateway connect modal.

### React: `AfModal`

```tsx
import { AfModal } from "@abstractframework/ui-kit";

<AfModal
  open={open}
  onClose={() => setOpen(false)}
  title={`Email — ${userId}`}
  footerNote="From the gateway's audit log."
  footer={<button type="button" onClick={() => setOpen(false)}>Done</button>}
>
  …
</AfModal>
```

Props: `open`, `onClose` (called by Escape, the close button and a backdrop click; the host sets
`open` to false), `title`, `children` (the body), `footer`, `footerNote`, `size`
(`"default"` | `"narrow"`), `closeLabel` (default "Close"), `closeOnEscape`, `closeOnBackdrop`
(both default true), `initialFocusRef`, `describedBy`, `portal` (default true: rendered into
`document.body`), `id` (the title gets `${id}-title`), `className`.

The first focus goes to an element marked `data-af-autofocus` (or `autofocus`), else the first
focusable element in the body, else the first focusable element, else the dialog itself.

### Plain HTML

```html
<div class="af-modal-backdrop" id="email-modal" hidden>
  <div class="af-modal" role="dialog" aria-modal="true" aria-labelledby="email-modal-title">
    <div class="af-modal__header">
      <h2 class="af-modal__title" id="email-modal-title">Email — alice</h2>
      <button type="button" class="af-modal__close" aria-label="Close">×</button>
    </div>
    <div class="af-modal__body">
      …
    </div>
    <div class="af-modal__footer">
      <p class="af-modal__footer-note">From the gateway's audit log.</p>
      <button type="button">Done</button>
    </div>
  </div>
</div>
```

The footer is optional. The CSS hides a backdrop that carries `hidden`. For the behaviour, pages
that load the console islands bundle bind it with one call:

```js
const el = document.getElementById("email-modal");
function openModal() {
  el.hidden = false;
  release = window.AfConsoleIslands.bindModal(el, { onClose: closeModal });
}
function closeModal() {
  release();          // unbinds, returns focus to the opener, unlocks the page scroll
  el.hidden = true;
}
el.querySelector(".af-modal__close").addEventListener("click", closeModal);
```

`bindModal(backdrop, { onClose, closeOnEscape?, closeOnBackdrop?, initialFocus? })` is the same
function `AfModal` uses (`bindAfModal` in `src/af_modal_core.ts`, also exported from the package).
Show the backdrop before binding (focus needs a rendered element), and call `release()` before
hiding it.

## Account rows

A table (or a list of row blocks) that mixes administrators, users and entities tints each row by
kind: users stay neutral, the administrator takes a faint accent wash, entities a faint violet
wash. A 3 px bar on the row's leading edge and a text chip carry the kind as well, so colour is
never the only cue.

| Class | Use |
| --- | --- |
| `af-row--admin`, `af-row--user`, `af-row--entity` | on a `<tr>` (the cells get the wash, the first cell the bar) or on a stacked row `<div>` (phones) |
| `af-row__muted` | secondary text inside a tinted row (keeps 4.5:1 over the wash) |
| `af-kind-chip` + `af-kind-chip--admin` / `--user` / `--entity` | the small "Admin" / "User" / "Entity" chip beside a name |
| `af-row-legend`, `af-row-legend__item`, `af-row-legend__swatch--admin` / `--user` / `--entity` | the one-line legend under the table |

```html
<table>
  <tbody>
    <tr class="af-row--admin">
      <td><strong>admin</strong> <span class="af-kind-chip af-kind-chip--admin">Admin</span></td>
      <td class="af-row__muted">admin@example.com</td>
    </tr>
    <tr class="af-row--entity">
      <td><strong>castor</strong> <span class="af-kind-chip af-kind-chip--entity">Entity</span></td>
      <td class="af-row__muted">—</td>
    </tr>
  </tbody>
</table>
<p class="af-row-legend">Tint:
  <span class="af-row-legend__item"><span class="af-row-legend__swatch af-row-legend__swatch--admin"></span>admin</span>
  <span class="af-row-legend__item"><span class="af-row-legend__swatch af-row-legend__swatch--user"></span>user</span>
  <span class="af-row-legend__item"><span class="af-row-legend__swatch af-row-legend__swatch--entity"></span>entity</span>
</p>
```

Tokens: `--af-row-tint-admin`, `--af-row-tint-user`, `--af-row-tint-entity` (the washes; the
light themes use lighter strengths), `--af-row-mark-admin|user|entity` (the bar colours) and
`--af-row-text` / `--af-row-text-muted` (text on a tinted row). A tinted row sets its text colour
to `--af-row-text`; use `af-row__muted` rather than the page's own muted colour for secondary text
in the row. `scripts/check_modal_rows.mjs` computes the contrast of that text and of the chip text
over the wash on `--bg-primary`, `--bg-secondary` and `--bg-card` for all 21 themes and fails
under 4.5:1.

## Grouped navigation

A sidebar with many entries shows them in groups under small uppercase captions, and can pin one
button (for example **Setup**) to the bottom.

```html
<nav class="sidebar" style="display: flex; flex-direction: column">
  <div class="af-nav-group" role="group" aria-labelledby="nav-accounts">
    <p class="af-nav-group__caption" id="nav-accounts">Accounts</p>
    <a class="nav-item active" href="#accounts">Accounts</a>
  </div>
  <div class="af-nav-group" role="group" aria-labelledby="nav-work">
    <p class="af-nav-group__caption" id="nav-work">Work</p>
    <a class="nav-item" href="#workflows">Workflows</a>
    <a class="nav-item" href="#runtimes">Runtimes</a>
  </div>
  <div class="af-nav-footer">
    <button type="button" class="af-nav-footer__button">Setup</button>
  </div>
</nav>
```

The items keep the host's own styles. `af-nav-footer` uses `margin-top: auto`, so the sidebar must
be a flex column. `af-nav-footer__button` is 44 px tall on touch screens.

## Helper text size

Helper text (switch descriptions, "why unavailable" reasons, form help, the modal footer note, the
row legend, and anything with `class="af-field-help"`) reads the token `--af-helper-size`:

- at least 13 px on a desktop pointer;
- at least 14 px under `(pointer: coarse), (max-width: 1023.98px)` (phones and tablets).

`checkLabelScale(root)` reports helper text under those floors (it picks the touch floor from
`matchMedia(HELPER_TOUCH_MEDIA)`, or pass `touch: true|false`), next to labels above 15 px or
heavier than 600. The constants are exported: `HELPER_MIN_PX` (13), `HELPER_MIN_TOUCH_PX` (14),
`HELPER_TOUCH_MEDIA`. See [On/off settings](./state-toggles.md) for the label side of the scale.

## Checks

- `ui-kit/scripts/check_modal.mjs`: `bindAfModal` behaviour (focus in and back, Tab trap, Escape,
  backdrop, nested modals, scroll lock, release) and the `AfModal` markup.
- `ui-kit/scripts/check_modal_rows.mjs`: the modal CSS contract, the row tint contrast in every
  theme, the row / chip / navigation classes and the helper floors.
- `ui-kit/scripts/check_forms_signin.mjs`: `checkLabelScale` including the touch floor.

All three run in `npm test` for `ui-kit`.
