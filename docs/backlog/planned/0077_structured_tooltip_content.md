# 0077-abstractuic: [IMPROVEMENT] Structured tooltip content

> Package: abstractuic
> Type: improvement
> Created: 2026-10-30
> Status: planned
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

- [ ] Implement safe structured and multiline rendering with guards.
- [ ] Validate Gateway adoption and record completion.
