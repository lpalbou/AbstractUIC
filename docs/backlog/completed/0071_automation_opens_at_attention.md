# 0071 — An automation opens at what needs the person; the wait card's text in the standard colour

**Status**: completed (2026-10-29, unreleased; in a PR, not done until merged, released and verified) · **Priority**: P1
· **Created**: 2026-10-29
**Cross-package**: the desktop Assistant has the same rule in its own Qt view (AbstractAssistant 1082). Code web and
the Observer render this panel, so they get it with the next ui-kit release and no change of their own (their
attention badge is a count; opening an automation is the way in).

## Why (operator, 2026-10-29)
"If I click an attention icon, I should get directly to where you need my attention": an automation opened at the
top of its conversation, with the approval card at the bottom, out of view. The wait card's text also took its run's
dimmed tone.

## What shipped
- `AutomationPanel` gains `openAt` ("attention" by default, or "none"). Once per automation, when its runs are on
  screen, the panel picks the first unresolved wait's card in the thread (runs are listed oldest first), else the run
  of the oldest unseen result. That item is scrolled into view (`block: "start"`) and outlined for
  `ATTENTION_FOCUS_MS` (2.6 s, `.is-attention-focus`). `attentionTarget(root, unseenIndex)` is exported.
- `.af-auto-wait` sets `color: var(--text-primary)`: the standard text colour, whatever the run's tone.
- Check: `scripts/check_automation_panel.mjs` covers the target's order and fallbacks, the selectors against the
  panel's real markup, and the styles. Mutation-checked: a wrong selector fails it.
