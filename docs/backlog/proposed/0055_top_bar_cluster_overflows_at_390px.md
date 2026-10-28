# Proposed: the top-right cluster overflows a 390 px screen

## Metadata
- Created: 2026-10-28
- Status: Proposed (found by the release-closing aesthetic pass)
- Completed: N/A
- Area: ui-kit (`AfTopBarActions`, `.af-topbar*`), hosts' headers
- Found by: release-closing W2 aesthetic pass (AbstractFramework root `untracked/release-closing/aesthetic/`)
- Root link: AbstractFramework backlog 1055 (shared UI primitives track)

## ADR status
- Governing ADRs: ADR 0001 (one top-right cluster, composed by the kit)
- ADR impact: none

## Current understanding
At 390 px, AbstractCode web's header shows the conversation title plus five cluster controls
(docs, appearance, about, identity menu, connection pill); on a coarse pointer each grows to the
44 px touch floor (`ui-kit/src/theme.css` touch block, `.af-topbar__btn, .af-topbar__pill`), so the
cluster ends at x=439: the connection pill is cut off (screenshot
AbstractFramework `untracked/release-closing/aesthetic/before/code_approval_light_390.png`, measured overflow `BUTTON 439`). The kit's phone rule only
hides the pill's word (`@media (max-width: 479.98px)`), it never reduces the button count.

## Chosen route
Under the xs breakpoint the cluster keeps the identity menu and the connection dot; docs,
appearance and about move into the identity menu (same callbacks, same labels).

## Acceptance criteria
- [ ] No horizontal overflow of the cluster at 360 and 390 px in Code, Observer, Entity, Continuum.
- [ ] A check pins the xs rule (red when removed).
