# Proposed: MTP / speculation shows a raw reason code to people

## Metadata
- Created: 2026-10-28
- Status: Proposed (found by the release-closing aesthetic pass)
- Completed: N/A
- Area: ui-kit (`speculation_select.tsx`)
- Found by: release-closing W2 aesthetic pass
- Root link: AbstractFramework backlog 1055

## ADR status
- Governing ADRs: ADR 0001 §2 (render what the gateway serves; no guessing)
- ADR impact: none

## Current understanding
Under "MTP depth" the model panel prints `native_mtp_backend_unavailable`
(`ui-kit/src/speculation_select.tsx:25` renders `caps.reason` verbatim; the code comes from
AbstractCore `providers/speculation.py:377`, also `mtp_artifact_unverified`). People read a
machine identifier (screenshot AbstractFramework `untracked/release-closing/aesthetic/before/code_panel_model_light_1440.png`).

## Chosen route
A small table of the codes AbstractCore emits (cited) to one sentence each ("This provider has
no native MTP backend"), the raw code kept in the tooltip; an unknown code is shown as is.

## Acceptance criteria
- [ ] Known codes read as sentences; unknown codes still visible; a check.
