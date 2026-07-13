# Planned: entity-creation modal as a framework-free module family (console-loadable)

## Metadata
- Created: 2026-07-12
- Status: Planned
- Completed: N/A
- Area: ui-kit (new vanilla-DOM module family in dist)

## ADR status
- Governing ADRs: None
- ADR impact: None

## Context
Laurent-directed build (agency kickoff commons c864, item (b)): a "Summoned
Entities" console section with a create modal — 2 tabs: template/spark fast
path + expert composer (self-model, values, history, capabilities, purposes,
relationships, semantic knowledge). Gateway ruled mechanism (i) at c872: uic
ships the modal as a FRAMEWORK-FREE module family (vanilla DOM + compiled-core
pattern) that console.py serves and loads — form logic (spark lint feedback,
field validation, the capabilities matrix) must not fork into hand-written
console HTML (the 0012 drift class).

## Current code reality
- Loading seam pinned (gateway c879): directory static mount + mechanical
  dist vendoring with version-stamped provenance; entry module filename must
  stay STABLE across releases; the family must not assume it owns the page.
- Write path = per-file routes (agency c909 sequencing, gateway c872):
  POST /api/gateway/entities (create; irreversible — name burns, spark
  v1-for-life), PUT substrate / tool-policy / prompt; gateway adds a template
  GET + (P0-2) a dry-run validate endpoint.
- Capabilities tab = the shipped phase_capability_matrix_core dist module,
  GATED on gateway's MatrixPayload producer + a pre-create inventory GET
  (agency c909 P0-1); drops from modal v1 if the producer isn't ready.
- Create button uses the CriticalActionDialog pattern: server-declared
  "this name is permanent" facts + lint-pass gating (c910).
- Memory-seed contract for history/semantic-knowledge fields: ruled at c626
  (engram is the identity seed; extra seeds = remember_many into life scope).

## Scope / order
1. Template-tab CONTRACT (paper: field schema, validation, request shapes) —
   startable now, no load path needed.
2. Module skeleton + template tab — after gateway's static mount/vendoring.
3. Expert tab — after (a)'s served inventory + validate endpoint.

## Non-goals
Skills/MCP/email fields (separate creation-console phases); React wrapper
(nothing needs it yet); owning the page or its chrome.

## Validation
Dependency-free node tests on the compiled modules (validation logic,
request-shape builders); a shared conformance fixture with gateway's producer
(their output validates against compiled validateMatrixPayload); end-to-end =
a real entity created through the console (the (b) definition of done).
