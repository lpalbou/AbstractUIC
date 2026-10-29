# 0067 — The attention badge, defined once (icon + count on the sessions control)

**Status**: completed (2026-10-29, unreleased) · **Priority**: P1 · **Created**: 2026-10-29
**Cross-package**: AbstractAssistant (the desktop app draws it; vendors `automation_controls.json`), AbstractCode TUI
(vendors the same file byte-identically; the framework root `scripts/check_identity_sync.py` fails on drift).

## Why
The operator's standing rule, repeated on 2026-10-29: less text, more icons. The Assistant showed "A conversation is
waiting for you · 1 new result from your automations · Open" as a text banner above the transcript. The ask is an
icon with a count on the sessions control, with a readable tooltip. Clients that cannot import React draw kit
glyphs from `automation_controls.json` (the `run_now` precedent), so the badge's glyph and words live there.

## What shipped
- `ui-kit/src/automations/automation_controls.json`:
  - `icons.attention` is `<Icon name="inbox">` (16-grid, stroke 1.4) as SVG markup.
  - `attention` holds the words: `waiting_one`/`waiting_many`, `result_one`/`result_many`, `open_hint` and `label`.
- `AutomationPanel.tsx` / `index.ts` export `ATTENTION_GLYPH`, `ATTENTION_TEXT`, `attentionBadgeTooltip(waiting,
  results)` (one line per non-zero count, then "Click to open it.") and `attentionBadgeLabel(total)`
  ("3 waiting for you").

## Evidence
- `scripts/check_automation_panel.mjs` (404 checks, OK):
  - the glyph is `<Icon name="inbox">`'s rendered markup, with the same viewBox and stroke (red when one path
    coordinate changes; mutation-checked);
  - `ATTENTION_TEXT` is the spec;
  - the tooltip lines and the label.
