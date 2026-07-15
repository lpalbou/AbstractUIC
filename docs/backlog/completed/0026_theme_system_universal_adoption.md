# 0026 — Theme system: kit ownership + universal adoption across gateway-powered apps

- **State**: completed (2026-07-15 — matrix FULL on every row; commons c2251/c2284)
- **Owner**: uic (the theme system is KIT PROPERTY); app seats own their adoptions
- **Source**: operator directive 2026-07-15 17:23 ("you should own and share that
  theme UI components; every apps powered by the gateway should use that shared
  component, if not the case, contact them and orchestrate the developments")

## The ownership statement

The kit owns the ONE theme system for every AbstractFramework UI:

- `theme.css` — 21 themes (Dark/Light groups), all tokens, per-theme blocks.
- `theme.ts` — `THEME_SPECS` (the canonical list), `applyTheme`.
- `useAppearanceSettings(appId, opts)` — per-app persistence
  (`af_appearance_<appId>_v1`), legacy-key migration, synchronous first-paint
  application (the no-flash lesson, c1678).
- `AfAppearanceDialog` + `ThemeSelect` / `TypographySelect` /
  `FontScaleSelect` / `HeaderDensitySelect` — the switcher surfaces.

No app forks any of these. Theme adds/renames happen HERE and reach every
surface through the compliance tiers below.

## The compliance contract (three tiers)

1. **React apps (npm consumers)**: import `theme.css`; state via
   `useAppearanceSettings("<appId>")`; switcher = `AfAppearanceDialog` (or
   the kit selects where a dialog doesn't fit). Nothing hand-rolled.
2. **Non-npm surfaces** (server-rendered, no build step): a GENERATED
   VERBATIM copy with a drift-pin test in the consumer's suite — the gateway
   console pattern (`console_theme_sync.py`, card 0023). Hand-copied lists
   are forbidden; the pin makes staleness fail loud.
3. **Non-web surfaces** (Qt/native, e.g. abstractassistant): out of scope
   for theme.css; visual alignment is advisory.

## Adoption matrix (verified in-tree, 2026-07-15)

| surface | theme.css | useAppearanceSettings | AfAppearanceDialog | verdict |
|---|---|---|---|---|
| abstractflow | yes | yes ("abstractflow", legacy migration) | yes | FULL |
| abstractobserver | yes | yes ("abstractobserver", legacy) | yes | FULL (confirmed c2258; styles.test.ts ratchets enforce) |
| abstractentity | yes | yes ("abstractentity") | yes | FULL |
| abstractcontinuum | yes | yes ("continuum") | yes | FULL |
| gateway console | generated copy + drift pin (0023) | n/a (tier 2) | kit list served | FULL (tier 2; confirmed c2257 + standing rule adopted for future gateway surfaces) |
| abstractcode web | yes | yes ("abstractcode", legacyKey abstractcode.settings.v1, one-time migration, fields deleted from app Settings — one owner) | yes (dialog replaced the bare selects) | FULL (receipt c2284; tsc+build green; the one pre-existing unrelated test failure verified stash-identical) |
| abstractassistant | n/a (Qt) | n/a | n/a | out of scope (tier 3) |

## Work

- [x] Ownership + contract codified here and in ui-kit/README (this card).
- [x] abstractcode web completed tier 1 (receipt c2284, same-hour): hook with
  legacy migration + dialog + no-flash from the hook's synchronous
  initializer; the three appearance fields DELETED from the app's Settings
  type (one owner, no dual-write).
- [ ] Any NEW gateway-powered UI adopts a tier before first ship (this card is
  the checklist; the census adversary re-verifies the matrix each wave).

## Acceptance

- [x] Matrix reads FULL (or documented tier) on every row (2026-07-15:
  flow/observer/entity/continuum tier-1, gateway console tier-2, code web
  tier-1 via c2284, assistant out of scope).
- theme.css header names every tier-2 generated-copy consumer (console done).
