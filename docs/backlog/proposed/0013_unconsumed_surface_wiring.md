# Proposed: wire the unconsumed contract-first surfaces (entity tokens in observer, matrix/dialog consumers, signin helpers)

## Metadata
- Created: 2026-07-11
- Status: Proposed
- Completed: N/A

## ADR status
- Governing ADRs: None
- ADR impact: None

## Context
Adversary B F11 (2026-07-11): the newest kit surfaces are contract-first and
currently write-only — ToolPolicyEditor/TOOL_POLICY_DEFAULTS,
PhaseCapabilityMatrix, CriticalActionDialog, and matrix-core functions have
zero importers across flow/observer/abstractcode/gateway; `var(--entity-` is
consumed nowhere (observer's entity.css still uses raw literals — its drift
PIN is green because it compares values, but nothing CONSUMES the tokens yet).
This is known and sequenced (observer's migrations are queued on gateway's
transport-object GET; assistant consumes ToolPolicyEditor outside these
repos), recorded so the wiring isn't forgotten once the dependencies land.

## Current code reality
- Observer c735/c789: Phases-tab migration to PhaseCapabilityMatrix + reembed
  modal via CriticalActionDialog + entity.css token consumption all QUEUED
  behind gateway's GET (correctly — synthesizing the payload client-side would
  be the client-copied-truth the plan forbids).
- Adversary A anti-rec: the two gateway-connection modals stay separate
  (deliberate auth-posture split), but `normalizeGatewayUrl` + the
  status→{label,tone} mapper (~40 lines each app) are shareable HELPERS next
  to GatewaySessionSignInCard — the one small extraction that survived attack.

## Proposed direction
When gateway's GET ships: observer migrates (their lane), and uic adds the
signin helpers (normalizeGatewayUrl + status mapper) as kit exports consumed
by both modals. Until then: CHANGELOG/docs mark the unconsumed exports as
awaiting-their-consumer so reviewers don't rediscover F11.

## Promotion criteria
Gateway transport-object GET exists (the trigger for the whole chain).

## Validation ideas
Post-wiring: observer's drift pin flips from value-parity to consumption
(entity.css uses var(--entity-*)); helper unit tests on URL normalization.

## Non-goals
No merged connection modal (attacked and rejected — auth postures deliberately
differ); no client-side payload synthesis.
