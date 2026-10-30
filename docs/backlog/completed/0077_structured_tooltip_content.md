# 0077-abstractuic: [IMPROVEMENT] Structured tooltip content

> Package: abstractuic
> Type: improvement
> Created: 2026-10-30
> Status: completed
> Completed: 2026-10-30
> Release: unreleased (local deployment verified)
> Priority: P1
> Labels: ux, theme, seat-framework
> Work-item id: abstractuic-0077
> Owner: framework
> Thread: unavailable (Agora connection refused)
> Hub refs: none

## Current code reality and scope

`af_tooltip_core.ts` writes a plain text string. Newlines in a long fit tooltip
produce undifferentiated prose; there is no shared title/fact/list vocabulary.
Add safe structured content (title, description, facts, labelled bullet sections,
short note) to React AfTooltip and vanilla attributes/islands, with textContent
DOM construction only, no caller HTML. Existing string API stays compatible;
multiline strings get paragraphs. Active theme, bounded viewport placement,
hover/focus/ARIA/Escape semantics stay shared. Allow internal overflow scrolling
without dismissing the tooltip. Invalid structured content warns and uses the
explicit plain-text fallback. No arbitrary rich markup or interactive popovers.

Gateway 0995 is the first adopter (fit/host/residency content). Document the
shared contract and tests, regenerate its vendored assets, verify light/dark and
mobile; scoped commits and local deployment evidence. No new ADR required:
shared-component ownership is unchanged. Publication outside scope.

- [x] Implement safe structured and multiline rendering with guards.
- [x] Validate Gateway adoption and record completion.

## Completion report

Implemented `3833355`: safe shared structured content for React and vanilla
islands, plain multiline paragraphs, explicit fallback validation, themed fact
and list layouts and internal scrolling. Caller content never becomes HTML.
Shared focus/ARIA/Escape and viewport behavior retained. Multiple filter switches
wrap on narrow screens without changing the single-switch contract.

55 tooltip, 41 filter-bar, 32 top-bar and 492 brand checks pass, with kit/islands
builds, CSS balance, 21 theme-token blocks and strict contrast on 20 themes.
Gateway `15a26edc` adopts the API and regenerated assets; 182 catalog and 122
Resources browser assertions plus live dark/light/320px verification pass after
healthy local redeploy. Cross-repo evidence:
`abstractgateway/design/model-tooltips-0995/REVIEW.md` and `validation.json`.
No new residual implementation work or ADR change. Registry publication outside
scope. Agora unavailable; completion recorded locally.
