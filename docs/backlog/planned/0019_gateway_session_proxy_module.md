# Planned: one shared gateway session-proxy server module (three cli.js copies today)

## Metadata
- Created: 2026-07-12
- Status: Planned
- Completed: N/A
- Area: new node server module (kit's server-side sibling)

## ADR status
- Governing ADRs: None
- ADR impact: None

## Context
LAURENT-DIRECTED (via observer's session 02:02, handed off in dm:observer--uic
seq 2): extract the app-origin session proxy into ONE shared module. THREE
byte-independent copies exist today — abstractobserver/bin/cli.js (:426),
abstractflow/bin/cli.js, abstractcode/web/bin/cli.js — and a fourth consumer
(the entity app) arrives next; extraction is what makes that move cheap.
This is the split-brain auth machinery: drift between copies re-opens the
sign-in-every-time / "gateway did not accept this session" class buried in
observer this week.

## Contract (from the observer copy — the most recently hardened)
- GET /api/connection/gateway → {ok, gateway_url, has_session,
  gateway:{principal}} (the ONE silent still-signed-in probe).
- POST {gateway_user_id, gateway_token, persist} → server-side gateway
  signin; sets FIRST-PARTY cookies (HttpOnly session id + readable CSRF).
- DELETE → sign out.
- Every proxied /api/gateway/* call: attach the server-held gateway session +
  CSRF, STRIP client Authorization headers, pin the gateway URL server-side
  (a browser must not redirect the proxy).
- RULINGS, not preferences: tokens never in URLs; sign-in-once semantics from
  the cookie (modal only on a definitive no); SSE/EventSource rides the same
  origin cookies (EventSource cannot carry Bearer headers — this proxy IS how
  authenticated live tails work).

## Suggested shape
Small node package (e.g. `@abstractframework/app-server`) exporting
`createGatewaySessionProxy(opts)`; each app's cli.js keeps its static-serving
quirks and calls the one auth surface. Consumers: observer (swaps same-day +
keeps a conformance test), flow, abstractcode, entity app next.

## Validation
Dependency-free node tests (probe/signin/signout/proxy-header behavior against
a stub gateway server); observer co-signs by running their app against it;
diff-derived parity checks against all three current copies before deletion
rounds.

## Non-goals
Owning static serving; changing auth semantics (extraction, not redesign).
