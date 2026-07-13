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
- Planned: 10 (0001-0008, 0014, 0019)
- Proposed: 9 (0009-0013, 0015-0018)
- Completed: 0
- Deprecated: 0
- Recurrent: 1 (backlog hygiene)

## Priority bands (next recommended work)
1. **0002** light-theme CSS repair — worst user-visible breakage (auth modal +
   every JSON surface unreadable on 6 of 21 themes), pure CSS, no API change.
2. **0001** AfSelect keyboard/a11y + fork absorption — highest-leverage
   component; keyboard users currently cannot operate non-searchable selects.
3. **0003** one JsonViewer + **0004** panel-chat robustness — cheap logic
   fixes with live consumer impact (observer's swallowed prop, IME submits).
4. **0005** AgentCyclesPanel open-state, **0006** guard extensions + test
   rigs, **0008** small fixes.
5. **0007** packaging — publish-only breakage; before the next npm release.

## Planned ledger
| ID | Item | Area | One line |
|---|---|---|---|
| 0001 | af_select keyboard/a11y/fork | ui-kit | Keyboard-complete combobox; absorb flow's fork features; delete the fork |
| 0002 | light-theme CSS repair | ui-kit/panel-chat/monitor-flow | Phantom tokens, JSON syntax colors, signin card, toolbar class |
| 0003 | one JsonViewer | panel-chat/monitor-flow | Collapse the 4-source fork family; honor collapseAfterDepth |
| 0004 | panel-chat robustness | panel-chat | Composer submit gate + IME; thread re-stick; date guard |
| 0005 | agent cycles open-state + polish | monitor-flow | User-owned cycle open state; upstream flow's polish CSS |
| 0006 | guard extensions + test rigs | ui-kit scripts + workspaces | Token-consumption + literal + swatch invariants; test scripts for 3 packages |
| 0007 | packaging | all packages | exports default conditions; monitor-gpu d.ts; CSS import contract |
| 0008 | small component fixes | ui-kit/monitor-active-memory | Matrix boolean strictness; dialog busy-escape; ToolPolicyEditor a11y/pruning; KG theming |
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
