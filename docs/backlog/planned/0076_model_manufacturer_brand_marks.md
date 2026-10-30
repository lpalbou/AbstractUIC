# 0076-abstractuic: [IMPROVEMENT] Shared model manufacturer brand marks

> Package: abstractuic
> Type: improvement
> Created: 2026-10-30
> Status: planned
> Priority: P1
> Labels: ux, theme, seat-framework
> Work-item id: abstractuic-0076
> Owner: framework
> Thread: unavailable (Agora connection refused)
> Hub refs: none

## Current code reality and scope

`brand_icons.tsx` already owns official engine/provider artwork and source/terms
metadata, rendered identically in React and vanilla islands. Extend this shared
registry for common model manufacturers, reusing existing OpenAI/Hugging Face
marks and embedding unchanged artwork from official model organizations. All
new assets carry primary source, attribution, date and content hash; no runtime
remote image requests or invented company logos. Generalize the existing embedded
PNG allowance (Portkey) to strictly checked PNG/JPEG data with bounded dimensions.
Add model-card IDs and documentation; unknown vendors retain neutral text fallback.
Gateway 0994 adopts the shared marks left of model titles. No API break or ADR
change; existing shared brand ownership contract applies.

## Validation

Build kit/islands; provenance/inline asset/React-and-HTML rendering checks and
Gateway browser checks in light/dark/mobile; sync vendored console assets, scoped
commits and live local deployment. Publication outside this request.

- [ ] Implement and validate shared assets.
- [ ] Verify Gateway adoption and record completion evidence.
