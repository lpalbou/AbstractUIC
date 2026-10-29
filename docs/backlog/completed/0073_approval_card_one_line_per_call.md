# 0073 — The tool-approval card: one bold first line, one bullet per call on one line

**Status**: completed (2026-10-29, unreleased; in a PR, not done until merged, released and verified) · **Priority**: P1
· **Created**: 2026-10-29
**Cross-package**: the desktop Assistant applies the same rule in its own Qt cards (AbstractAssistant, separate PR).
Code web and the Observer render these kit cards.

## Why (operator ruling, 2026-10-29)
The card read as a block of bold fragments: a kind label, a count line ("2 page fetches, 2 web searches"), the key
argument in bold, and long calls wrapping over several lines.

## What shipped
- `ToolCallWordsList` (`ui-kit/src/tool_call_words_view.tsx`):
  - an optional `heading` (with `headingId`), the card's only bold;
  - no count line;
  - each call is one bullet on ONE line: the coloured verb chip, then plain text (`toolCallLine`: no bold on the
    parameters; a tool without a template reads "Key: value · Key: value");
  - a long call is cut with an ellipsis, and the whole sentence sits on the line's tooltip.
- `AutomationPanel`'s tool-approval card opens with "The automation wants to use these tools:"
  (`TOOL_APPROVAL_HEADING`, the card's label). Approve and Deny are unchanged.
- panel-chat's chat approval card opens with "The assistant wants to use these tools:".
- `theme.css` styles: `.af-toolwords__heading`; `.af-toolwords__list` as disc bullets in the standard text colour;
  `.af-toolwords__call` as `nowrap` + `text-overflow: ellipsis`; `.af-toolwords__key` at normal weight.
- Checks: `check_tool_call_words.mjs` covers no bold, no count line, one line per call with a tooltip, the heading
  as the only bold, the ellipsis CSS and the fallback line. Also updated: `check_automation_panel.mjs` and
  panel-chat `check_present_interaction.mjs`. Mutation-checked: the previous view fails them.
