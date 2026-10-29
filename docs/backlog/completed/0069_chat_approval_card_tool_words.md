# 0069 — The chat's tool-approval card lists the calls in words (panel-chat adopts 0068)

**Status**: completed (2026-10-29, unreleased) · **Priority**: P1 · **Created**: 2026-10-29
**Cross-package**: AbstractCode web (chat approvals) and the Observer (automation discussions) render
`presentInteraction`, so both get it with the next panel-chat release; no client code changes.

## Why
Operator QA 2026-10-29 found raw tool names and JSON on approval cards. 0068 gave the kit `ToolCallWordsList` and the
automation wait card. The chat's approval card (`presentInteraction` → `WorkflowInteractionPanel`) still listed each
call with panel-chat's activity row: the tool's raw name and its first argument, with the arguments as JSON on
expansion.

## What shipped
- `panel-chat/src/present_interaction.tsx`: the approval detail renders `ToolCallWordsList` (verb chip with the
  tool's name on its tooltip, the key argument highlighted, a group count). String-encoded arguments are parsed
  first. The full JSON stays behind the "Review full tool arguments (JSON)" disclosure.
- Check: `panel-chat/scripts/check_present_interaction.mjs` asserts the list, the chip, each key argument, the
  group line, no JSON outside the disclosure, and string-encoded arguments. Mutation-checked: the previous
  activity rows fail it.

## Not here
- The Observer's own wait panels (`app.tsx` wait tool cards, `runtime_page.tsx`, `mission_control.tsx`) render
  calls with their own markup. They are adopted in the Observer's repository.
