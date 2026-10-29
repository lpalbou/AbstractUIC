# 0070 — Tool results in words (no raw result JSON)

**Status**: completed (2026-10-29, unreleased) · **Priority**: P1 · **Created**: 2026-10-29
**Cross-package**: adopted by the Observer's approval dialog ("Recent session turns"), which ships with the kit
release that carries this.

## Why (operator QA, 2026-10-29)
After 0068 the calls on an approval read in words, but the dialog's "Recent session turns" still printed earlier tool
RESULTS as raw JSON (a `skim_websearch` payload with its `results`, `counts` and snippets) above them.

## What shipped
- `ui-kit/src/tool_call_words.ts` `describeToolResult({name, result})` (pure): `{sentence, items, failed}`.
  - A list result: "Web search returned 10 results", with the first three titles and their short URLs.
  - A failure: "Page fetch failed: timed out after 30 s".
  - A page: "Page skim returned “FDA meeting” (fda.gov/news-events/…/b), 1,204 characters".
  - Plain text: "The tool returned N characters of text".
  - Anything else: "Make report returned 3 fields" with readable "Key: value" lines.
  - The subject is the tool's noun from the 0068 templates. JSON-string results are parsed first.
- `ToolResultWords` view (exported as `ToolResultWordsView`), plus `.af-toolresult` styles in `theme.css`. Hosts
  keep the exact payload behind a disclosure.
- Check: `scripts/check_tool_call_words.mjs` covers the six shapes and the view (no braces). Mutation-checked.
