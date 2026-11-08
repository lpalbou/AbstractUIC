# 1157 — EntityCard: "Into lately" shown whole behind a reveal, and a compact density for strips

> Package: AbstractUIC ui-kit (EntityCard, compact variant)
> Type: defect + small feature (root ADR 0053 §2 nothing truncated without a reveal; §4 one look from the kit)
> Status: planned
> Created: 2026-11-08 (found while the Observer Board adopted the kit card for its entity strip)
> Priority: P1
> Labels: ui-kit, entity-card, truncation, density

## Summary

The compact EntityCard clamps "Into lately" to one line with no reveal, so the operator's "never truncate" rule is broken
inside the kit itself; and the compact variant is ~282 px tall when a trouble note is present (vs ~130 px for a
hand-made chip), which is why the Observer worker had re-implemented chips before the review sent it back to the kit
component. Observer (Board entity strip), Entity and the consoles all render this card.

## Scope

- "Into lately", the trouble note and the last moment are shown whole: wrapped to two lines by default with the kit's
  "…" control revealing the rest (never `-webkit-line-clamp` without the control).
- A `density="compact"` prop (or a `chip` variant): avatar, name, state + duration, one line of context; the full card
  opens on hover/focus/click (the kit owns the popover so every app behaves the same).
- Tests: a 300-character "Into lately" is reachable whole; removing the reveal turns the test red; the compact chip's
  height is bounded (≤ 72 px) in the kit's own render test.
- Consumers: Observer Board strip, Entity list, console entity islands take the chip variant at their next kit bump.
