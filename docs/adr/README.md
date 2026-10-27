# Architectural Decision Records (ADRs)

ADRs record the durable rules AbstractUIC's design follows: *why* the shared components are
shaped the way they are. What was built, and when, lives in `docs/backlog/`. An accepted ADR is
live policy: code, checks, reviews and backlog items cite it, and a change that conflicts with it
revises the ADR first or is refused.

## Index

| ID | Title | Status | Date | Summary |
|----|-------|--------|------|---------|
| 0001 | [Shared primitives are composed on the gateway's contracts; apps customize through props, slots and theme tokens, never by forking](0001_shared_primitives_composed_on_gateway_contracts.md) | Accepted | 2026-10-27 | One component per user-facing job, composed on the gateway's routes and designed for `replay_view_v1`; apps adapt it with props/slots/tokens, the gateway default is shown first, one wording set; voice in/out are standalone; one repository holds JS/TS today with a documented place for Python, Rust and Swift ports; an app-local twin is a defect with a backlog item, not a shortcut |

## Adding an ADR

1. Create `docs/adr/NNNN_short_title.md` with Status, Context, Decision, Consequences,
   Enforcement, Validation, Backlog links, Related.
2. Add it to the index above and link it from the backlog items it governs.
3. Supersede rather than edit: an accepted ADR changes status to "Superseded by NNNN".
