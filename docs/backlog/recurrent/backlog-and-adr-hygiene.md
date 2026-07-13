# Recurrent: backlog hygiene

## Metadata
- Created: 2026-07-11
- Status: Recurrent
- Completed: N/A (runs repeatedly)

## Purpose
Keep `docs/backlog/` truthful against the code: counts in `overview.md` match the
item files, item states match reality, links resolve, and stale items are moved
(not rewritten away). AbstractUIC has no ADR system yet; if a backlog item ever
creates a durable cross-task policy, record it explicitly in the item and flag
the ADR gap in `overview.md` instead of burying the rule in prose.

## Run conditions
Run whenever items are added, completed, or deprecated; fallback cadence: once
per release.

## Scope
May update `overview.md` counts/ledgers, move item files across lifecycle
directories, and fix broken links. Must not rewrite item history.

## Checklist
- [ ] Item filenames all match `NNNN_snake_case.md` with globally unique numbers.
- [ ] `overview.md` counts equal the actual file counts per directory.
- [ ] Completed/deprecated items carry their report sections.
- [ ] Cross-references (code paths, doc paths) still resolve.

## Expected output
An `overview.md` whose ledger matches the tree, with a dated note of what moved.

## Non-goals
No code changes; no rewriting of past item intent.
