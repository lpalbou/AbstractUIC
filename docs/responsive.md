# Responsive Layout

This page explains how the AbstractUIC packages adapt to phones, tablets, resized windows and
narrow panes, and how a host app adopts the same rules so every AbstractFramework surface behaves
consistently. On a regular desktop window the components keep their desktop look; below that,
layouts reflow, and on touch screens targets grow and text stays readable.

The contract lives in `ui-kit/src/theme.css` (the "RESPONSIVE LAYER" section) and
`ui-kit/src/responsive.ts`. panel-chat and monitor-active-memory follow it in their own CSS.

## Breakpoints and input axes

CSS custom properties cannot be used inside `@media`, so the breakpoint values are the contract.
Use desktop-first `max-width` queries with the `.98px` suffix so ranges never overlap.

| Name | Width | Typical devices | Query |
|---|---|---|---|
| `xs` | below 480 px | phone portrait | `@media (max-width: 479.98px)` |
| `sm` | below 768 px | phone landscape, small tablet | `@media (max-width: 767.98px)` |
| `md` | below 1024 px | tablet portrait, narrow window | `@media (max-width: 1023.98px)` |
| `lg` | below 1440 px | laptop windows, tablet landscape | `@media (max-width: 1439.98px)` |
| `xl` | 1440 px and wider | large laptops, monitors | `@media (min-width: 1440px)` |

Combine them with the input axes:

| Name | Query | Use for |
|---|---|---|
| short | `@media (max-height: 500px)` | phone landscape: thin chrome, full-height sheets |
| touch | `@media (pointer: coarse)` | 44 px targets, 16 px form text, comfortable density |
| no hover | `@media (hover: none)` | never hide an action behind `:hover` |

In JavaScript, use the same values when the markup itself must change (for example, a docked
sidebar that becomes a drawer):

```ts
import { AF_BREAKPOINTS, AF_MEDIA, useAfMedia } from "@abstractframework/ui-kit";

// AF_BREAKPOINTS = { xs: 480, sm: 768, md: 1024, lg: 1440 }
const narrow = useAfMedia(AF_MEDIA.md); // below 1024 px
const touch = useAfMedia(AF_MEDIA.touch);
```

Prefer CSS; switch markup in JavaScript only when the DOM differs.

## Tokens

All tokens are on `:root` and are the same in every theme.

| Group | Tokens | Values |
|---|---|---|
| Spacing | `--space-1` … `--space-6`, `--gutter` | 4, 8, 12, 16, 24, 32 px; gutter 12 px below 480 px, 16 px, 24 px from 1440 px |
| Touch | `--tap-min`, `--control-h` | 32 px; 44 px on touch |
| Density | `--row-pad-y`, `--row-pad-x`, `--control-pad-x` | dense on fine pointers, comfortable on touch |
| Viewport | `--vh-full`, `--safe-top/right/bottom/left`, `--keyboard-inset`, `--vv-height` | `100dvh` with a `100vh` fallback; `env(safe-area-inset-*)`; the last two from `installViewportVars()` |
| Widths | `--content-max`, `--reading-max`, `--form-max`, `--drawer-w` | 1200 px, 86ch, 720 px, 420 px |
| Text roles | `--font-size-body`, `--font-size-input`, `--font-size-code`, `--font-size-2xl` | on touch at least 14, 16 and 12 px |
| Select arrow | `--af-select-chevron` | the arrow image for selects on touch screens |

Set `data-density="dense"` or `data-density="comfortable"` on `<html>` to force a density (for
example from a Settings toggle). A dense setting never lowers `--tap-min` on a touch screen.

## Font sizes

The kit's font sizes are pixel values multiplied by the user's `--font-scale` (the Appearance
setting); `--font-size-xl` and `--font-size-2xl` are fluid and reach their desktop size from about
1000 px wide, so a phone is never larger than a laptop.

When several rules apply, this order decides:

1. The user's font scale multiplies every kit size.
2. Form fields stay at least 16 px on touch screens (`--font-size-input`); iOS zooms the page when a
   smaller field receives focus.
3. The app's own density choices. The kit never raises `--font-size-xxs` … `--font-size-lg` on touch,
   so an app that keeps dense 11–13 px text for its own UI keeps it.
4. The kit's touch floors (`--font-size-body` at least 14 px, `--font-size-code` at least 12 px),
   applied by the kit only to its reading surfaces (the automations panel, the critical dialog's
   main statement, About links; the chat body is 14 px on every device).

An app that wants kit panels to follow its dense text sets the role token on its own root:

```css
@media (pointer: coarse) {
  .my-app { --font-size-body: var(--font-size-sm); }
}
```

Do not size text in `rem` chains that multiply the kit's pixel tokens, do not set
`html { font-size }`, and do not use `vw` or `zoom` for text. The kit sets
`html { text-size-adjust: 100% }` so mobile browsers do not inflate text.

## Touch targets

On touch screens every interactive kit control is at least `var(--tap-min)` (44 px): buttons,
selects, inputs, list rows, tabs, the top-bar buttons and pill, drawer close buttons, checkbox and
radio labels, About links and link-styled buttons. Icon buttons are 44 px in both axes; the glyph
keeps its size and the box grows.

- Non-interactive chips, badges, pills and status dots get no minimum.
- Interactive chips keep their pill shape and receive an invisible 44 px hit area.
- Pin selects inside canvas nodes (`.af-select--pin`) scale with the canvas zoom and are exempt.
- Single-choice native `<select>` elements drop the native appearance on touch screens, because
  WebKit (iOS Safari) only honours a height without it. They show the `--af-select-chevron` arrow.
  List boxes (`multiple`, `size` above 1) keep the native look.

## Dialogs, sheets and drawers

- Kit dialogs (connect and sign-in, critical action, appearance, About, schedule) respect the safe
  areas. Below 768 px wide or 500 px tall they become bottom sheets: full width, up to the visible
  height, with the action row pinned to the bottom. Below 480 px the actions stack full width.
- Sheets and dialogs stay above the on-screen keyboard: their overlays pad the bottom by
  `--keyboard-inset`.
- Use `.af-sheet-overlay` and `.af-sheet` for an app dialog that should behave the same way.
- `AfDrawer` is full width below 768 px, respects the safe areas and stays above the keyboard.
  `side="left"` opens it from the left edge (for a navigation sidebar that becomes a drawer below
  1024 px) and `backdrop` adds a dimmed backdrop that closes it on tap. The drawer remains non-modal
  and keeps its children mounted when closed.

## Container queries

Components that sit in panes of different widths adapt to the pane, not the window, so the same
component works in a narrow desktop pane and on a phone. The narrow layouts start only where the
desktop layout no longer fits, so a 420 px desktop drawer keeps the desktop layout.

| Container | Element | Narrow layout |
|---|---|---|
| `pc-thread` | `.pc-chat-thread` | below 360 px: full-width bubbles, stacked tool rows (also below 480 px of viewport) |
| `pc-composer` | `.pc-composer` | below 360 px: tighter action row |
| `pc-chat` | `.pc-workflow-chat`, `.pc-assistant` | below 360 px: approval buttons stack full width |
| `af-signin` | `.af-gateway-signin` | below 320 px of content width, or below 768 px of viewport: labels above fields |
| `af-auto` | `.af-auto` | below 400 px: definition grid and buttons stack |
| `af-dialog` | `.af-appearance` (appearance, About, schedule) | below 480 px: label grids stack |
| `af-tool-policy` | `.af-tool-policy` | below 520 px: control row stacks; below 360 px: approval select under the tool name |
| `af-drawer` | `.af-drawer__body` | for your own content inside a drawer |
| `amx` | `.amx-host` (monitor-active-memory) | below 820 px: graph and details stack |

A container measures its content box, and it must get its width from its parent (block layout,
flex `stretch` or `flex: 1`, a grid track). Inside a shrink-to-fit parent (inline-block,
`width: max-content`, an absolutely positioned box without a width) it collapses to zero width;
give the parent a width.

## Viewport helpers

Call `installViewportVars()` once at startup when your app has a bottom composer or a fixed bottom
bar. It mirrors `window.visualViewport` into two CSS variables on `<html>`:

- `--vv-height`: the visible height in pixels.
- `--keyboard-inset`: the pixels of the layout viewport hidden by the on-screen keyboard, 0 when
  there is none.

When the page is pinch-zoomed, `--vv-height` stays the full layout height and `--keyboard-inset`
stays 0, so zooming never shrinks the app. The rule is available on its own as
`viewportVarsFrom(innerHeight, { height, offsetTop, scale })`.

```ts
import { installViewportVars } from "@abstractframework/ui-kit";

installViewportVars(); // idempotent; returns a cleanup function
```

```css
.app-shell {
  height: var(--vh-full);
}
```

Every `index.html` should declare:

```html
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, interactive-widget=resizes-content" />
```

Do not add `maximum-scale` or `user-scalable=no`: they block pinch-zoom. The 16 px form text already
prevents the focus zoom.

## Adopting the rules in a host app

- Import `@abstractframework/ui-kit/theme.css` first, then `@abstractframework/panel-chat/panel_chat.css`,
  then your own CSS.
- Build the app shell as a grid or flex column with `height: var(--vh-full)`; give every scrolling
  flex or grid child `min-height: 0` and `min-width: 0`.
- Move sidebars into `AfDrawer` below 1024 px; keep at most two docked panes below 1440 px.
- Wrap wide tables in `.af-table-wrap`.
- Pad fixed top and bottom bars with the safe-area tokens.
- When you override a kit control's height or font, keep `var(--tap-min)` and
  `var(--font-size-input)` in the same rule. App CSS loads after the kit and wins, so an override
  without them brings back small targets or the iOS focus zoom.
- On touch screens, an app rule that sets the `background` shorthand on a `<select>` hides the
  kit's arrow. Use `background-color`, or add `background-image: var(--af-select-chevron)`.
- A native checkbox keeps its small native size in WebKit; make its label the 44 px row
  (`display: inline-flex; align-items: center; min-height: var(--tap-min)`).
- Pages that copy the kit's tokens instead of importing `theme.css` (the AbstractGateway and
  AbstractCore consoles) re-sync their copy to receive the tokens by name.

## Checks

- `ui-kit`: `scripts/check_responsive.mjs` pins the breakpoint set, the tokens, the touch rules, the
  select and sheet rules and the containers; `scripts/check_viewport_vars.mjs` pins the viewport
  helper. Both run in `npm test`.
- `panel-chat`: `scripts/check_responsive.mjs` pins the containers, the thresholds, the touch targets,
  the 16 px composer text, the composer growth and the safe-area padding.

## Related docs

- [Theming & design tokens](./theming.md): colors, themes and the typography setting.
- [Adoption guide](./adoption-guide.md): which shared component to use for which job.
- [`ui-kit/README.md`](../ui-kit/README.md) and [`panel-chat/README.md`](../panel-chat/README.md).
