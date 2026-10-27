# Planned: the app shell — top-right widget set and drawer system as one composable

## Metadata
- Created: 2026-10-27
- Status: Planned (kit half in progress on `feat/ui-primitives-shell`)
- Completed: N/A
- Area: ui-kit (`AfTopBarActions`, `AfDrawerSystem`, `AfAppShell`, `AfDrawer`, connection types, islands) + panel-chat (`docsAssistantPanel`)
- Root link: AbstractFramework backlog 1055

## ADR status
- Governing ADRs: ADR 0001 (§1, §4, §6)
- ADR impact: §6 (panels are opaque)

## Summary
Every app gets the same top-right cluster — who I am, which gateway (and disconnect), appearance,
about, the in-app docs assistant — and the same vertical drawer system (rail or top-bar toggled,
docked or floating, resizable, persisted, keep-alive, panels opaque), composed as `AfAppShell`.
The docs assistant becomes a drawer panel the shell mounts.

## Why (audit `untracked/ui-primitives/audit/topbar-drawers.md` §A, §C, §D, §E)
- The kit cluster has no identity slot; Note is the only app with a top-right identity badge (local); Code and
  Observer show `user_id` in a sidebar foot; the console uses a text extra "tenant/user".
- Entity and Flow derive the pill phase themselves instead of `useGatewayConnection` (Flow's local modal is 252 lines);
  Note re-implements the connect dialog; five apps fetch `about` locally.
- Drawers: Code uses `AfRailDrawer`; Entity (`drawer.tsx` 228 + state 59), Flow (rail markup + `drawerLayout.ts` 76),
  Continuum (team trapeze tabs, panes unmounted) are local; three apps measure the top bar for `topOffset`
  (44 and 49 hard-coded elsewhere; Continuum's docs drawer covers the cluster).
- No check pins the pill wording or the `useGatewayConnection` state machine; `AfDrawer` has no focus move/restore.

## Kit half
1. `AfTopBarActions`: `identity: "badge" | "menu" | false` from the hook's state (`AfPrincipal`,
   `principalFromConnection`, `principalLabel`; menu: Sign out, Copy id, gateway host); `about.fetch`, `about.extra`;
   appearance may own its dialog; order pinned: extras · docs · assistant · appearance · about · identity · pill; pill wording pinned.
2. `AfDrawerSystem` (generalising `AfRailDrawer`, which stays as a wrapper): `side`, `mode: "rail" | "drawer"`,
   `keepAlive: "always" | "visited"`, `errorBoundary`, `fill`, per-panel widths, persisted active panel (docked only),
   `topOffset: "auto"` via `--af-topbar-h`, `railLabelStyle: "icon" | "vertical-text"`, request nonce, `onResize` / `--af-panel-w`.
3. `AfDrawer`: focus move-in/restore, `topOffset: "auto"`. `AfAppShell { topBar, drawers, nav?, children }`.
4. panel-chat `docsAssistantPanel(source, fetchGateway)` → a drawer panel (body without its own `AfDrawer`).
5. Islands: `TopBarIslandProps.identity`, `mountDrawerSystem`; a behavioural check for `useGatewayConnection`.
6. Designed for, not built: 0037 flow diagram panel and 0038 memory graph viewer mount as opaque `fill` panels.

## What the apps delete
Code `useChromeBottom` (~28), `useDrawerFocus` (~25), rail active persistence (~50), sidebar-foot identity (~11), about
fetch (~34), `app_assistant.tsx` (36 → ~8); Observer `nav_drawer.ts` (123), footer identity (~25), `about.ts` (39),
`app_assistant.tsx` (~38); Entity `drawer.tsx` (228) + `side_tabs_state.ts` (59), auth machine (~150), proxy half of
`connect_gateway_modal.tsx` (~60), `app_about.ts` (91); Flow `GatewayConnectionModal.tsx` (252), connection state
(~120), `drawerLayout.ts` (76) + rail markup (~50) + CSS, `useAboutAction.ts` (76), `FlowDocsAssistant.tsx` (~34);
Continuum `gateway_about.ts` (35), team rail (~66) + pane switching + CSS, drawer wiring (~28), appearance id
`continuum` → `abstractcontinuum` with a legacy key; Note `ConnectDialog.tsx` (93), header (~40), `.nt-account` CSS;
Assistant web gains a shell it never had; console text-extra identity + extra About icon.

## Gateway / app-server routes relied on
`GET api/connection/gateway` (app-server probe; identity at `status.gateway.principal`), `POST` / `DELETE` of the same,
`GET api/gateway/me`, `GET api/gateway/about`, `GET api/gateway/docs/corpus?app=`, docs-qa `POST runs/start`.

## Gaps (raised, not fixed here)
`/me` principal has no `display_name` / `email` / `avatar_url`; app-server returns 401 for the public `about` route
before sign-in; docs corpus `APP_BY_ID` lacks `assistant`, and abstractnote/web ships no `llms.txt`; the identity
descriptor lacks `abstractnote` (root repo copy, another seat); console islands vendored from 0.8.7.

## Acceptance
- [ ] `check_app_shell.mjs` (cluster order incl. identity, pill wording, `--af-topbar-h`), `check_gateway_connection.mjs`,
      `check_rail_viewer.mjs` extended (left side, vertical-text, keepAlive, error boundary, active persistence, nonce,
      fill); each confirmed red once.
- [ ] Docs: api.md:70 order fixed, console-islands.md documents `docs` / `mountDocsAssistant` / `identity` /
      `mountDrawerSystem`, adoption-guide App-assistant row corrected (server corpus, not `llms.txt?raw`), rows for
      `AfAppShell` / `AfDrawerSystem`.
- [ ] App adoption PRs with the deletions above.

## Non-goals
Building the flow diagram or memory graph panels (0037, 0038); changing the connection semantics (0019 owns the proxy).
