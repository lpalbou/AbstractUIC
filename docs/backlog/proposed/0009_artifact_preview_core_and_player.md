# Proposed: ArtifactPreview — framework-free kind-resolution core + React player

## Metadata
- Created: 2026-07-11
- Status: Proposed
- Completed: N/A

## ADR status
- Governing ADRs: None
- ADR impact: None

## Context
The largest verified UI duplication in the framework (adversary A #1,
2026-07-11): ~1,500 lines across three full independent implementations of
artifact preview (kind sniffing from content_type/filename/modality/tags →
image/audio/video/pdf/markdown/text/binary player with blob-to-objectURL,
size caps, download fallback).

## Current code reality
- flow: `src/utils/artifactPreview.ts` (91 lines) + `ArtifactPlayer.tsx`
  (319 lines; 25 MB fetch cap / 200k-char clamp; pdf iframe branch).
- observer: `src/ui/artifact_rendering.ts` (~390 lines; richer sniffing —
  voice/music/sound, html/code/json/markdown, LaTeX/CSV heuristics) + ~475
  lines of in-app renderers; classifies pdf as document with NO player.
- abstractcode/web: `AttachmentPreviewModal` (~250 lines; 25 MB blob / 600k
  text caps; no pdf branch).
- gateway console.py sandbox attachments: a fourth kind-sniffing consumer for
  the CORE only (served HTML — needs the compiled-dist consumption pattern).
- Drift is live: the same artifact renders differently per app TODAY
  (pdf handling, caps, extension lists all disagree).

## Proposed direction
Framework-free core (`artifact_preview_core`) merging the sniffers (observer's
as the superset) + a React player wrapper in a kit package; markdown rendering
injected as a prop, never bundled. Migration order: core first with tests
pinning each app's CURRENT classifications (drift-pin), then players.

## Why it might matter
Every future surface touching gateway artifacts re-needs this; the divergence
is user-visible; the core/wrapper split is a proven pattern here
(PhaseCapabilityMatrix, monitor-gpu).

## Promotion criteria
Flow + observer + abstractcode seats each confirm migration appetite (their
trees carry the deletions); the classification-parity test matrix is agreed.

## Validation ideas
Dependency-free node tests on the compiled core reproducing each app's
(kind, cap, download-name) decisions for a shared fixture set.

## Non-goals
Does not authorize deleting any app's implementation before the core's parity
tests pass against that app's current behavior.
