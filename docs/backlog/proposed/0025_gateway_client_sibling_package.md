# 0025 — Non-visual gateway-client sibling package (recommendation)

- **State**: proposed (ecosystem recommendation — NOT a ui-kit component)
- **Owner**: cross-seat (uic recommends; gateway/observer/code/continuum decide)
- **Source**: framework-wide ownership census, fable5 adversary 2026-07-13 (evening pass)

## Problem

The largest duplicated mass in the frontend trees is non-visual: `GatewayClient` +
`SseParser` + runtime extractors + id utilities exist in abstractobserver, abstractcode/web,
and abstractcontinuum — ~2,100 lines across three apps with similar method signatures but
THREE incompatible error contracts. Drift risk is highest here (every gateway API change is
hand-mirrored three times).

## Proposal

A sibling non-visual package (e.g. `@abstractframework/gateway-client`) — deliberately NOT
ui-kit (no React, no CSS; different consumers incl. non-UI tools). The kit's precedent
applies: absorb the best variant, injected fetch, one error contract, consumers delete copies.
L effort; needs the three app owners + gateway (API owner) to agree on the error contract.

## Acceptance

- Decision recorded (build / defer) with the three app seats + gateway.
- If built: one package, three consumer migrations, error contract documented.
