# 0068 — Tool calls in words on approval cards (no raw JSON)

**Status**: completed (2026-10-29, unreleased) · **Priority**: P1 · **Created**: 2026-10-29
**Cross-package**: adopted by the Desktop Assistant (its own Qt rendering, same words, checked against
`tool_call_words.cases.json`). The web clients render the kit's wait card. iPhone and watch follow with the same
words.

## Why (operator QA, 2026-10-29)
The tool-approval sheet ("The run asks to use these tools:") printed each call as its name and its JSON
arguments: `fetch_url {"include_full_content": false, "keep_links": false, "url": "https://…"}` and
`skim_websearch {"num_results": 10, "query": "\"Oct. 28, 2026\" …", "region": "us-en", "safe_search": "moderate"}`.

## What shipped
- `ui-kit/src/tool_call_words.ts` (pure):
  - `describeToolCall({name, arguments})` gives `{verb, lead, key, details, sentence, fallback, noun}`, from a
    template per tool: fetch/skim a page, web search, read, write, edit or list files, run a command, send an
    email, check a page renders.
  - URLs are shortened to the host and first/last path segments (`shortUrl`), queries get typographic quotes,
    regions and safe search are put in words.
  - A tool without a template reads as "Key: value" lines (`readableKey`, readable values, never braces). An MCP
    tool is named by its own tool name.
  - `groupToolCalls` gives "2 web searches, 2 page fetches".
- `ui-kit/src/tool_call_words_view.tsx`, `ToolCallWordsList`: the verb as a coloured chip (the tool id in its
  tooltip), the key argument in bold, and the options muted. `theme.css` adds `.af-toolwords*`.
- `AutomationPanel.tsx`: the tool-approval wait card renders `ToolCallWordsList` instead of
  `JSON.stringify(arguments)`.
- `tool_call_words.cases.json`: the shared cases, i.e. the operator's two calls, a file read, an unknown MCP tool
  and the group line.

## Evidence
- `scripts/check_tool_call_words.mjs` (in `npm test`): the cases render exactly, there are no braces in the list,
  the chips and the highlighted key are present, and the wait card uses the list. It is red when a template is
  removed (mutation-checked).
- `check_automation_panel.mjs`: the wait card lists the call in words, and the old JSON check is inverted.
- Screenshot: framework root `untracked/release-closing/design/toolwords/approval-words-after.png`.
