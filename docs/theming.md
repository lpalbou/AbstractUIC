# Theming & Design Tokens

This page explains how the AbstractUIC theme system works and how to adopt it in a host app, so
every AbstractFramework surface shares one look and feel. It is the reference for package
developers who want their app to match the rest of the framework instead of maintaining a
parallel palette.

The single source of truth is `ui-kit/src/theme.css` (exported as
`@abstractframework/ui-kit/theme.css`). If your app defines its own color variables or hardcodes
colors, this page describes the migration path.

## How the system works

- The stylesheet defines **design tokens** (CSS custom properties) on `:root`, with a default
  dark palette.
- **Theme classes** (`theme-<name>` on `<html>`) override the tokens per theme. Components never
  reference theme names — they only consume tokens, so every component works in every theme
  automatically.
- `applyTheme(name)` sets the class at runtime; `THEMES` / `THEME_SPECS` enumerate the options
  (21 themes: 16 dark, 5 light) so apps can render a theme picker (`ThemeSelect` is the ready-made
  one).
- **Typography tokens** work the same way: `applyTypography(...)` sets `--font-scale` and header
  density classes; `FontScaleSelect` / `HeaderDensitySelect` are the ready-made pickers.

```ts
import "@abstractframework/ui-kit/theme.css";
import { applyTheme, THEMES } from "@abstractframework/ui-kit";

applyTheme("nord"); // sets class="theme-nord" on <html>
```

## Token vocabulary

Use these tokens in your app CSS. They are the same names the kit components consume, so
anything you build with them matches the kit in all 21 themes.

| Group | Tokens | Use for |
|---|---|---|
| Backgrounds | `--bg-primary`, `--bg-secondary`, `--bg-tertiary`, `--bg-card` | Page, panel, inset, and card surfaces |
| Text | `--text-primary`, `--text-secondary`, `--text-muted` | Body, secondary copy, hints/placeholders |
| Accent | `--accent`, `--accent-hover` | Primary actions, active states, links to act on |
| Status | `--error`, `--success`, `--warning`, `--info` (+ `--error-border`, `--error-subtle`, …) | Semantic states only — never decoration |
| Surfaces/overlays | `--ui-surface-1`, `--ui-overlay-bg`, `--ui-border-1`, `--ui-shadow-1` | Elevated cards, modal scrims, hairlines, shadows |
| Syntax | `--syntax-key`, `--syntax-string`, `--syntax-number`, `--syntax-keyword` | Code and JSON highlighting |
| Typography | `--font-sans`, `--font-mono`, `--font-size-xxs` … `--font-size-xl`, `--font-scale` | Font stacks and the size scale |
| Shape | `--radius-sm`, `--radius-md`, `--radius-lg` | Corner radii |

Guidance:

- **Text on backgrounds**: pair `--text-*` with `--bg-*` as named; the palettes are tuned so
  those pairs hold WCAG contrast across themes.
- **Status colors are semantic**: `--error` means something failed, `--warning` means attention,
  `--success` means confirmed, `--info` is neutral emphasis. Use `--accent` for brand/action
  emphasis instead of borrowing a status color for looks.
- **Muted text**: `--text-muted` is the placeholder/hint color. The kit ships a `::placeholder`
  rule for its own inputs; give custom inputs `font-family: inherit` and `color: var(--text-muted)`
  placeholders for the same look.

## Adoption rules (what keeps the framework consistent)

1. **Consume tokens, never literals.** A hardcoded `#1e293b` or `rgba(255,255,255,0.1)` is
   invisible to theme switching and breaks on light themes. If a color you need has no token,
   derive it from one (see rule 3) or propose a token.
2. **Fallback pattern for standalone robustness.** Kit components use
   `var(--token, <literal>)` so they render sanely even if the host forgot to import
   `theme.css`. App code that always imports the theme can use bare `var(--token)`.
3. **Derive, don't invent.** For tints and emphasis, derive from tokens with `color-mix`:
   `color-mix(in srgb, var(--accent) 22%, var(--ui-overlay-bg))` is the kit's accent-tinted
   button surface. Derivation keeps custom UI theme-proof; a `color-mix` percentage that looks
   right on dark themes should be checked on a light theme too (`solarized-light`,
   `github-light`).
4. **Respect the interaction polish rules.** Interactive elements get hover/active feedback and
   ride the kit's shared 120ms transition; `prefers-reduced-motion` disables transitions. If you
   add custom buttons, mirror this (see the “Kit-wide interaction polish” block in `theme.css`).
5. **Density and scale are user settings.** `--font-scale` and header density are operator
   preferences; prefer `min-height` over fixed `height` and the `--font-size-*` scale over raw
   px so your surfaces grow with the user's settings.
6. **Test on the extremes.** The quick manual matrix: one default-dark check, one
   `observer-night` (darkest), one `solarized-light` or `github-light` (lightest). Most
   theme bugs are dark-only assumptions.

## Migrating an app with its own palette

Typical path, one surface at a time:

1. Import `@abstractframework/ui-kit/theme.css` in the app entrypoint and call
   `applyTheme(...)`. `ThemeSelect` is a controlled picker (value + onChange);
   persisting the choice is the app's job (a per-app storage key — see the
   adoption guide's appearance section).
2. Map your local variables to kit tokens (e.g. your `--bg` → `--bg-primary`, `--fg` →
   `--text-primary`) — alias first (`--bg: var(--bg-primary)`), then migrate usages and delete
   the aliases.
3. Replace hardcoded colors with tokens or `color-mix` derivations.
4. Delete your theme-switching machinery in favor of `applyTheme`/`ThemeSelect`.
5. Keep any genuinely app-specific colors (e.g. a graph's categorical palette) but define them
   per theme class or derive them from tokens so they follow light/dark.

## Palette seeds (non-CSS consumers)

Terminals and other non-browser surfaces can consume `ui-kit/palette_seeds.json` — a generated
4-token reduction (primary, surface, secondary, muted) of every theme. It is regenerated by
`node scripts/generate_palette_seeds.mjs` and verified in `npm test` (`--check` mode fails the
build if the seeds drift from `theme.css`).

## Guard scripts

- `ui-kit/scripts/check_theme_tokens.mjs` — verifies every theme block defines the tokens the
  components rely on (runs in `npm test`).
- `ui-kit/scripts/generate_palette_seeds.mjs --check` — verifies the palette seeds match the
  stylesheet.

Both run in the package test chain, so a published `ui-kit` cannot drift silently.

## Related docs

- Integration overview: [Getting started](./getting-started.md)
- Component inventory for app developers: [Adoption guide](./adoption-guide.md)
- API surface: [API reference](./api.md)
- Package README: [`ui-kit/README.md`](../ui-kit/README.md)
