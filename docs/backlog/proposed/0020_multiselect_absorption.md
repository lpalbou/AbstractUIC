# 0020 — MultiSelect absorption (three app copies)

- **State**: proposed
- **Owner**: uic
- **Source**: framework-wide ownership census, fable5 adversary 2026-07-13 (evening pass)

## Problem

Three apps carry near-identical MultiSelect implementations (checkbox-list dropdown with
search): abstractcontinuum, abstractobserver, and abstractcode/web. Same concept, parallel
implementations, drifting independently.

## Evidence / prior art

The 2026-07-11 backlog seeding recorded an anti-recommendation against "MultiSelect
unification" (adversary A, first pass) with the rule "not re-litigated without new evidence".
The 2026-07-13 census IS that new evidence: three copies confirmed near-identical (not two
loosely similar), each kit-shaped (no app business logic), and the variance between them is
cosmetic. The prior rejection is superseded by this finding.

## Proposal

Absorb as `AfMultiSelect` next to `AfSelect` (shared options/typeahead machinery where
practical; checkbox semantics + `aria-multiselectable`). Follow the absorption protocol: ship
kit version, consumers delete copies on adoption.

## Acceptance

- One kit component; three consumer copies deleted (joint asks filed).
- Keyboard/ARIA parity with `AfSelect` conventions.
- Token-only styling; SSR render check in the kit chain.
