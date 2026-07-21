# AbstractUIC backlog overview

AbstractUIC is the shared UI component library for AbstractFramework's web
apps (ui-kit tokens/themes/components, panel-chat, monitor-flow, monitor-gpu,
monitor-active-memory). This backlog tracks the library's own work; cross-app
extractions live in `proposed/` until the consuming seats opt in.

Seeded 2026-07-11 from an independent two-adversary (fable5) review of every
framework frontend (abstractflow, abstractobserver ui+entity, abstractcode/web,
gateway served console) plus the library itself. Adversary A hunted new
sharable-component opportunities (duplication evidence required); adversary B
attacked the existing components (a11y, theming, API, drift, tests,
packaging). Full findings are distilled into the items below; each item
carries its own code-reality citations.

## Counts
- Planned: 7 (0001, 0003-0006, 0014, 0019)
- Proposed: 17 (0009-0013, 0015-0018, 0020-0022, 0024-0028)
- Completed: 5 (0002, 0007, 0008, 0023, 0026-theme-adoption)
- Deprecated: 0
- Recurrent: 1 (backlog hygiene)

## Priority bands (next recommended work)
1. **0003** one JsonViewer — collapseAfterDepth honored in both kit twins and
   now CONTRACT-PINNED in both rigs; the remaining work is the one-source
   merge (panel-chat owns, monitor-flow re-exports) + consumer fork deletions
   (flow/observer seats) + copyText dedupe.
2. **0006** remaining guards — invariant F (literal positions) and the
   theme.ts swatch-parity check; the test-rig half is DONE (2026-07-18: all
   six workspaces now reachable from the root `npm test`).
3. **0001/0004/0005** — kit halves verified in-tree (keyboard model + ARIA,
   IME gate + re-stick + date guard, cycle open-state); the open halves are
   consumer-seat coordination (flow fork deletion, polish CSS deletion round).
4. **0014** entity-creation modal family / **0019** app-server — re-validate
   scope with gateway/continuum before building (the console + Team page
   waves may have absorbed parts).

### Reality-audit note (2026-07-17, seat respawn)
The corrupted-session era (07-13 → 07-16) landed most of the 07-11 planned
wave in the tree without updating this backlog. Audited item-by-item against
source + gate this date: 0002 moved to completed; 0007/0008 checklists updated
with what remains; 0001/0003/0004/0005/0006 kit halves verified present but
left planned because each has an open half (consumer migration, one-source
merge, or missing test rigs) — see each item's checklist.

## Planned ledger
| ID | Item | Area | One line |
|---|---|---|---|
| 0001 | af_select keyboard/a11y/fork | ui-kit | Keyboard-complete combobox; absorb flow's fork features; delete the fork |
| 0003 | one JsonViewer | panel-chat/monitor-flow | Collapse the 4-source fork family; honor collapseAfterDepth |
| 0004 | panel-chat robustness | panel-chat | Composer submit gate + IME; thread re-stick; date guard |
| 0005 | agent cycles open-state + polish | monitor-flow | User-owned cycle open state; upstream flow's polish CSS |
| 0006 | guard extensions + test rigs | ui-kit scripts + workspaces | Token-consumption + literal + swatch invariants; test scripts for 3 packages |
| 0014 | entity-creation modal module family | ui-kit (framework-free) | 2-tab console modal; gateway c872/c879 seam; capabilities tab gated on served inventory |
| 0019 | gateway session-proxy server module | new node package | LAURENT-DIRECTED: one auth proxy for 3 cli.js copies + the entity app; observer contract verbatim |

## Proposed ledger (promotion criteria in each item)
| ID | Item | Consumers today | Blocked on |
|---|---|---|---|
| 0009 | ArtifactPreview core+player | flow, observer, abstractcode (+console core) | Seats' migration appetite; parity-test matrix |
| 0010 | Rich MarkdownRenderer package | flow, abstractcode (copy-paste pair, sanitizer drift) | Both seats' import-swap confirm; sanitizer policy review |
| 0011 | ModalShell | flow, observer×2, abstractcode | First two consumers agree; dismissal semantics table |
| 0012 | Console kit-parity | gateway console.py | Gateway seat accepts; consumption mechanism ruling |
| 0013 | Unconsumed-surface wiring | observer, both connection modals | Gateway transport-object GET ships |
| 0015 | Tool-approval defaults one source | runtime/gateway/assistant/uic | Gateway serves default_approval; assistant deletes its drifted copy |
| 0016 | abstractcode tool_picker → ToolPolicyEditor | abstractcode | Fourth tool-selection surface; abstractcode seat opt-in |
| 0017 | AttachmentDropZone | flow, observer, abstractcode | Two of three consumers opt in; injected uploader |
| 0018 | CopyButton / useCopied | all three apps + kit internals | Any consumer opts in; candidate to ride 0011 |
| 0020 | AfMultiSelect absorption | continuum, observer, abstractcode/web | New census evidence supersedes the 2026-07-11 anti-rec; consumers opt in |
| 0021 | Delete-the-forks wave (5 forks, kit ships all) | flow×3, observer, continuum | Consumer import swaps only; asks filed per app |
| 0022 | Pin/node color tokens (--pin-*) | flow (179 hex), observer legend (drifted) | Flow + observer accept token consumption |
| 0023 | Gateway console consumes kit theme | gateway console.py | Gateway seat accepts serving mechanism (supersedes-in-part 0012's scope) |
| 0024 | entity.css tokenization | abstractentity | Entity seat opt-in; observer-night values already in kit |
| 0025 | Non-visual gateway-client sibling package | observer, abstractcode/web, continuum (~2,100 dup lines) | Cross-seat decision; NOT ui-kit (no React/CSS) |
| 0026 | Cognition wave monitor (monitor-cognition) | prototype live (untracked/cognition-monitor, 12 forms; scorer+basis v0 shipped, entity vendored Bloom) | Operator picks the surviving forms |
| 0027 | AfPhaseRadio (four-position phase radio) | proposed (entity's shared-yes, c2000; their radio ships app-side) | Absorb entity's implementation; validate against entity_phases.json |
| 0028 | Shared dialogue-transcript CSS API (pc-chat slice) | proposed (gateway card-015 cross-repo flag, c2173) | Extract transcript.css slice + token-mapping recipe for single-file consumers |

## Process
- Items follow the four-digit global-ID convention (`NNNN_snake_case.md`);
  next free number: 0020.
- Completion: append `## Completion report` (date, outcome, validation), move
  to `completed/`, update this ledger in the same pass.
- Deprecation: append `## Deprecation report` with the reason; move to
  `deprecated/`; never delete.
- Recurrent: `recurrent/backlog-and-adr-hygiene.md` runs on every state
  change; fallback once per release.
- Standing repo rules: nothing committed without the maintainer's word; no
  vendor attribution; degraded paths labeled #FALLBACK.

## Planning notes
- 2026-07-13 (evening): operator-directed two-adversary wave (themes/aesthetics
  + framework-wide ownership census). THEME HALF executed same-day, not filed:
  full WCAG contrast audit over all 20 theme blocks found 62 failing pairs →
  every one fixed hue-preserving (18 themes touched; worst: everforest-light 7,
  solarized-dark 6; two themes had accent===success — disambiguated with
  in-family hues); subtle/border rgba twins synced (63); per-theme syntax
  overrides added for nord/gruvbox/dracula/everforest-dark/solarized-dark;
  audit installed as `scripts/audit_theme_contrast.mjs` (report + --strict
  gate at 3.0 floor, wired into npm test); panel-chat quote/highlight/focus
  literals + agent_cycles white-alpha literals tokenized. CENSUS HALF filed as
  0020-0025. Census also reconfirmed 0010 (Monaco renderer twins) and 0011
  (modal shell, high variance) with fresh evidence; continuum lacking theme
  switching noted as their cheapest unification win (their lane). Styling
  heterogeneity ranking for the unification push: gateway console (no kit
  consumption) > entity (own vocabulary) > flow/observer/code (partial) >
  continuum (tokenized, no switching).
- 2026-07-12: census gap-check (third adversary pass over previously
  uncovered ground) added 0015-0018; checked-clean list recorded there:
  settings panels, connection orbs, tab bars, accordions, empty states,
  error boundaries (2 consumers, different UX), relative-time (observer-local
  util, not kit), Qt/smartnote surfaces (pattern-only). Also flagged
  abstractassistant's `web_server.py` serving a nonexistent `web/` directory
  (dead code, assistant lane).
- 2026-07-11: backlog seeded (8 planned, 5 proposed) from the two-adversary
  review. Adversary A anti-recommendations recorded inside items 0011/0013 so
  rejected extractions (merged connection modal, AfTooltip promotion,
  MultiSelect unification, toast system, run-history component,
  ProviderModelSelect-for-flow, arming-panel-before-endpoint) are not
  re-litigated without new evidence.

## Completed ledger
- [completed/0007_packaging_exports_and_types.md](completed/0007_packaging_exports_and_types.md) — packaging: default conditions ×4, monitor-gpu d.ts completeness, monitor-flow CSS contract (one family rule; receipts c2775/c2901)
- [completed/0008_small_component_fixes.md](completed/0008_small_component_fixes.md) — matrix strictness + wrapper smoke tests, dialog busy-escape, ToolPolicyEditor a11y/no-prune, KG forced-dark declaration (closed 2026-07-18)
- [completed/0002_light_theme_css_repair_phantom_tokens.md](completed/0002_light_theme_css_repair_phantom_tokens.md) — light-theme CSS repair (syntax token set, phantom tokens, sign-in card, toolbar class, error color; landed 07-13→07-16, tree-verified + moved 2026-07-17)
- [completed/0023_gateway_console_theme_unification.md](completed/0023_gateway_console_theme_unification.md) — gateway console theme unification
- [completed/0026_theme_system_universal_adoption.md](completed/0026_theme_system_universal_adoption.md) — theme system kit ownership + universal adoption (operator directive 2026-07-15; COMPLETE same-day — matrix FULL on every row)
