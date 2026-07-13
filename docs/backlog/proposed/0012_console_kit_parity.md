# Proposed: gateway console kit-parity (signin markup, theme system, confirm gate)

## Metadata
- Created: 2026-07-11
- Status: Proposed
- Completed: N/A

## ADR status
- Governing ADRs: None
- ADR impact: None

## Context
Adversary A fork-repairs 3/4/6 (2026-07-11): the served-HTML gateway console
(`abstractgateway/src/abstractgateway/console.py`) hand-copies kit surfaces
with no parity pin — the exact drift class the kit exists to kill, one repo
over. GATEWAY-LANE work; filed here because uic owns the parity story and the
consumable artifacts.

## Current code reality
- console.py duplicates the kit sign-in card's `af-gateway-signin__*` BEM
  markup + ~130 lines of its CSS by hand (lines ~451-518, 1181-1211).
- console.py forks the theme system: a 6-theme THEME_SPECS copy with swatches
  byte-duplicated from ui-kit's theme.ts (which ships 21 themes) — console
  users are already 15 themes behind.
- console.py's `confirmAction` duplicates the gate that
  `critical_action_core.ts` was explicitly written to serve (its header names
  the served-HTML console as a consumer).
- Precedent: theme.ts is framework-free; compiled `theme.js` dist + theme.css
  are console-consumable (the PhaseCapabilityMatrix-core pattern); observer's
  entity_tokens.test.ts is the byte-parity-pin precedent.

## Proposed direction
Gateway either consumes the compiled kit artifacts (theme.css/theme.js dist,
critical_action_core dist for destructive confirms) or, minimally, gains
entity_tokens-style byte-parity pins on its hand copies so drift fails a test
instead of a user. uic supplies the artifacts + the pin pattern; gateway owns
the console changes.

## Promotion criteria
Gateway seat accepts the lane (their transport-object/console build is the
natural moment); ruled consumption mechanism (vendored dist vs served file).

## Validation ideas
Parity pins first (fail on today's 15-theme gap), consumption second.

## Non-goals
uic does not edit console.py; no React in the console.
