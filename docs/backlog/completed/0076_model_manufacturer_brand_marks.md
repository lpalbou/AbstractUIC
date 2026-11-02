# 0076-abstractuic: [IMPROVEMENT] Shared model manufacturer brand marks

> Package: abstractuic
> Type: improvement
> Created: 2026-10-30
> Status: completed
> Completed: 2026-10-30
> Release: unreleased (Gateway local adoption deployed)
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

- [x] Implement and validate shared assets.
- [x] Verify Gateway adoption and record completion evidence.

## Completion report

`4d0347e` adds official organization artwork for Qwen, Meta Llama, DeepSeek,
Google, Mistral AI, Microsoft and NVIDIA with provenance and SHA-256, plus optional
compact size on React BrandMark and vanilla brandMarkHtml. Actual CDN assets are
WEBP, so checked raster support includes PNG/JPEG/WEBP; no image is re-encoded or
redrawn. Seven original files total 28,572 bytes. Source/attribution details in
[icons](../../icons.md); unknown brands keep text fallback.

492 brand checks, TypeScript build, islands build, 42 tooltip, 32 top-bar checks,
CSS balance, 21 theme-token blocks and 20 named-theme strict contrast pass.
Gateway `9fd6038a`/`b3908d01` adopts the marks and regenerated assets; 162 browser
assertions and live dark/light/mobile checks pass after healthy local redeploy.
Cross-repo evidence: `abstractgateway/design/model-signals-0994/REVIEW.md` and
`validation.json` (no model-management writes or page errors). Publication remains
outside scope. No new ADR or residual implementation work; Agora unavailable.
