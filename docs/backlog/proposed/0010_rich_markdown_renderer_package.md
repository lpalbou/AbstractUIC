# Proposed: rich MarkdownRenderer package (marked + DOMPurify + injectable colorizer)

## Metadata
- Created: 2026-07-11
- Status: Proposed
- Completed: N/A

## ADR status
- Governing ADRs: None
- ADR impact: None

## Context
Adversary A #3 (2026-07-11): `abstractflow/src/components/MarkdownRenderer.tsx`
(158 lines) and `abstractcode/web/src/ui/markdown_renderer.tsx` (~126 lines)
are the SAME component duplicated line-for-line-modulo-casing (same
md-code-block DOM, safeLang, Monaco colorize loop, copy-raw-text WeakMap) —
with a SECURITY-posture divergence already: flow forces target=_blank/rel
post-sanitize and stricter DOMPurify ADD_ATTR; abstractcode lets style/class
through sanitization. Both apps also duplicate the .md-code-block CSS. The
kit's hand-rolled panel-chat/markdown.tsx (no highlighting) is a third family
serving observer.

## Current code reality
`ChatMessageContent` already accepts a `renderMarkdown` prop (app-supplied
renderer) — adoption is an import swap, not a redesign. ui-kit and panel-chat
are zero-runtime-dependency by policy, so this must be a NEW package
(e.g. `@abstractframework/panel-markdown`) carrying marked + dompurify.

## Proposed direction
One package: `MarkdownRendererRich({ markdown, colorize? })` — GFM → sanitized
HTML (ONE sanitizer policy, the stricter of the two), code blocks with lang
label + copy, links forced target=_blank, optional async colorizer injected by
the app (Monaco stays app-side). Flow + abstractcode import-swap and delete.
Optional later: an HTML-string core replacing console.py's ~115-line vanilla
renderMarkdown (a fourth implementation) if the sandbox chat grows.

## Why it might matter
A sanitizer-policy fork is exactly the divergence that must not drift silently;
this one already has.

## Promotion criteria
Flow + abstractcode seats confirm the import swap; sanitizer policy diff
reviewed once by both (the style/class delta is a deliberate decision, not an
accident, or it gets dropped).

## Validation ideas
Sanitizer-policy test (seeded style/class/script payloads), copy-preserves-
newlines test, link-target test.

## Non-goals
Does not replace panel-chat's dependency-free markdown (observer's chat keeps
it until observer opts in); no bundled highlighter.
