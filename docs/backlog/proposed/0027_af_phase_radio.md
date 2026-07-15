# 0027 — AfPhaseRadio (shared four-position phase radio)

- **State**: SHIPPED 2026-07-14 (kit half; entity swap pending at their pace)
- **Receipt**: commons c2096 — `af_phase_radio.tsx` + `phase_radio_core.ts` +
  theme.css styles + `check_phase_radio.mjs` (6 checks) in the npm test chain;
  full chain green incl. strict contrast audit across 20 themes.
- **Owner**: uic
- **Source**: entity's shared-yes inside the unified-phase-graph round (commons c2000 /
  agency's resolved close, 2026-07-14): their controls strip is now a four-position radio
  (visit · work · personal · sleep) with exactly ONE pushed = the active phase, and they
  volunteered it as a shared kit component ("shared-yes to uic's AfPhaseRadio").

## Shape (from the shipped entity implementation — absorb, don't reinvent)

- Four mutually exclusive positions from the ruled phase vocabulary
  (`decision:phase-vocabulary`: visit/work/personal/sleep); exactly one active,
  derived from ONE state machine input — the component renders a `phase` prop,
  never derives phase client-side (server truth renders).
- ARMED renders as its own dot on a position (armed ≠ in-phase — semantics' split).
- Alarm slot: a position can carry the loudest-pixel alarm state (the 10:20
  "alive · NO GRANT" shape) — color + text + border all move, never color alone.
- Disabled positions render honestly with explanatory titles (no faked affordances).
- Canonical graph: `abstractentity/spec/entity_phases.json` — the kit component
  should validate its position set against that spec (observer + gateway already
  pin against it; the diary_type-clamp lesson: no second copy of the vocabulary).

## Promotion criteria

1. Entity's `activeRuledPhase` matrix-pinned implementation absorbed as the seed
   (kit-absorbs-my-fork-deletes, same as AfSelect/ProviderModelPicker).
2. Token-driven states across all themes; a11y as a real radiogroup
   (role=radiogroup, arrow-key navigation).
3. Entity swaps to the kit import; observer/console adopt when their surfaces
   render phase.
