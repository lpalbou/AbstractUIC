# Completed: release-closing polish (Create a voice, approval card, gateway-down state, durations, tool rows, picker)

## Metadata
- Created: 2026-10-28
- Status: Completed (AbstractUIC 0.8.1: ui-kit 0.9.3, panel-chat 0.6.1, app-server 0.1.13)
- Completed: 2026-10-28
- Area: ui-kit (`theme.css`, `gateway_connect_modal.tsx`), panel-chat (`present_interaction.tsx`, `workflow_interaction.tsx`, `tool_activity.tsx`, `chat_message_card.tsx`, `replay_view_projection.ts`, `panel_chat.css`), app-server (`gateway_session_proxy.js`)
- Found by: release-closing W2 aesthetic pass: AbstractCode web, Observer, Entity, Continuum and the gateway console rendered against a scratch AbstractGateway 0.17.0 at 1440 and 390 px, light and dark (AbstractFramework `untracked/release-closing/aesthetic/`: `before/`, `after/`)
- Root link: AbstractFramework backlog 1055 (shared UI primitives track)
- Follow-ups filed: 0055 (top bar at 390 px), 0056 (raw speculation reason codes), 0057 (message provenance)

## ADR status
- Governing ADRs: ADR 0001 (§2 render what the gateway serves; §5 one wording set: labels unchanged)
- ADR impact: none

## Summary
The highest-value visible defects of the shared components, fixed in the kit so every host gets them
by a pin bump:
1. "Create a voice" / "Manage voices" were browser-default fieldsets; now themed cards.
2. The tool approval card printed a literal "<toolset>" and two always-open scope paragraphs that pushed
   the decision off a phone screen, with all five buttons equally accent-tinted. The sentence names the
   real buttons, sits in one disclosure plus each broad button's tooltip, and "Allow once" is the only primary.
3. A gateway that did not answer read "Session rejected — sign in again". The app-server probe reports
   `gateway_status`; the badge says "Gateway unreachable at <host> — is it running?" or "Gateway error (HTTP n)".
4. Four duration formats on one screen; a tool row's time silently included the approval wait. One
   `formatDuration`; "3m 26s incl. approval" from the view's `wait.kind == "tool_approval"`.
5. Tool-row badge broke mid-word ("DESTRO/Y"); the picker's "Custom" was truncated ("Cus…").

## Evidence
- Before/after screenshots (AbstractFramework `untracked/release-closing/aesthetic/`):
  `before/code_voice_create_light_1440.png` → `after/code_voice_create_el_{light,dark}_1440.png`;
  `before/code_approval_light_390.png` → `after/code_approval_light_390.png` (the whole decision on one
  phone screen); `before/code_approval_light_1440.png` → `after/code_approval_light_1440.png`;
  `before/code_gatewaydown_light_1440.png` ("Session rejected — sign in again") →
  `after/code_gatewaydown_light_1440.png`; `before/code_panel_tools_light_1440.png` ("DESTRO/Y") →
  `after/code_panel_tools_dark_1440.png`; tool row "205.8s" → "26m 58s incl. approval wait" and chip
  "215s" → "27m 00s" (`after/code_done_light_1440.png`, measured in the DOM against the scratch gateway).
- Checks: `ui-kit/scripts/check_polish_css.mjs` (16), `panel-chat/scripts/check_polish.mjs` (14),
  `check_session_policy.mjs` (98, +8), `check_gateway_connection.mjs` (45, +8), app-server proxy test
  (+3: `gateway_status` 200 / 401 / 0). Mutation check: 22 mutants (each fix removed in turn), all red.
- `npm test` and `npm run build` green at the root.
- Adversarial review (Opus, read-only, fresh): 1 blocker (the Ask warning moved into a collapsed
  disclosure: now one visible summary line), should-fix: alternatives wording over-claimed for kind
  buttons; a singular-sentence check that could not fail; "incl. approval" on denied/terminal-cut waits
  (now only with the view's `outcome`); ledger-fold parity; release metadata. Nits fixed: 401/403-only
  "Session rejected", 502/503/504 "unavailable", redundant touch line, test cleanup order, long
  `customLabel`. All fixed with checks; re-verified.
