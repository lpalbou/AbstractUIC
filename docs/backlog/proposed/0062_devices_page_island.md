# Proposed: Devices page per account — a console island and a shared "where am I signed in" component

## Metadata
- Created: 2026-10-28
- Status: Proposed (discussion; the gateway item frames the questions first)
- Area: ui-kit (console islands: a Devices page island; a shared `AfDevicesList` for the apps' identity menu)
- Found by: operator request, 2026-10-28 closing pass ("the idea is not fully formulated, value to explore")
- Root link: AbstractFramework 1060 (gateway security standing duty), 1049 (Apple push relay); AbstractGateway 0965 (device management per account, discussion), 0940 (push every registered device)

## Summary
The gateway knows, per account, where the person is connected from (push registrations, session tokens issued
to the desktop / iPhone / watch / web apps / consoles, named API keys). Once AbstractGateway 0965 settles what a
device is and serves `GET /me/devices` (+ rename / revoke / block / push test), the console (web islands) needs a
Devices page and every app's identity menu (`AfTopBarActions`) could show "Signed in on 4 devices" with the
same list. One kit component, composed on the served contract (ADR 0001 §2): rows = device, app, version, last
seen, push registered, address (shown per the gateway's privacy rule), actions = rename, revoke, block, push test,
each with its confirmation inside the row (never a modal), readable labels (ADR 0001 §10: a device by its name,
never its id). The TUI console (`abstractgateway-console`, Rust) gets the same screen by the adoption-guide's
"none / port" column rule.

## Open questions (with 0965)
- Is the list per account only, or does an admin see every account's devices (owner rule)?
- What does "block" do for a watch paired through the phone?
- Address display: truncated by default, full on a copyable detail only for the owner.

## Next step
Wait for the gateway's design note (0965 decision gate); then the island + component with its check script and
the identity-menu slot.
