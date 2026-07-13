# Changelog

All notable changes to AbstractUIC are documented in this file.

This project is a **multi-package repository**; versions are currently kept in sync across packages.

## Unreleased

### Added

- UI Kit `SteerComposer`: the shared "speak to a live run" input (hooks plan
  H4). Posts `inject_guidance` to `/api/gateway/commands` through the
  app-origin proxy (CSRF twin attached; `submit` injectable for direct-bearer
  apps), reports queue truth honestly ("Queued (seq N)" — delivery is the
  `abstract.steer_seen` ledger ack consumers already render), and surfaces
  the parked-run delivery semantics (steers do not wake runs). Entity-visit
  403 refusals render verbatim per the H5 rite contract.
- UI Kit `DisclosureList`: the shared expandable-rows list on the amended
  contract (c1116 + flow's two amendments): dual-key `{entityId, rowKey}`
  selection (row = keyboard/aria anchor, entity = preview; same-entity
  siblings get a `data-entity-selected` echo, never a second ring),
  controlled per-row-path expansion over consumer-supplied VISIBLE rows,
  flat-with-depth row model, `role=tree` + roving tabindex, Enter/dblclick
  activation, Home/End + typeahead, `scrollOnSelect` + `scrollToRow` handle,
  muted `hint` slot (name-collision disambiguation) and the
  `.af-disclosure__rail` badge-rail overflow fade.
- UI Kit `AfChip` / `AfChipButton`: the shared chip family. Kit owns tones +
  geometry + ONE derivation recipe (bg 12% hue, border 35%, text mixed 45%
  hue / 55% `--text-primary` — the measured AA recipe); no filled variant by
  contract; `tone="custom"` accepts only `var(--token)` hue references (raw
  colors refused → neutral) so app hues cannot re-fork the theme system.
  Split by interaction reality: `AfChip` (span + optional remove button) vs
  `AfChipButton` (real button with `aria-pressed`/`aria-expanded`).
- UI Kit `Icon`: seven nav glyphs contributed by continuum (c1126) — `board`,
  `inbox`, `server`, `agent`, `playCircle`, `list`, `gear` — rendered from
  their native 16-grid (stroke 1.4) so the paths stay verbatim.
- UI Kit `useGatewayVoice`: the shared voice hook absorbed from the
  observer/continuum byte-similar copies before first divergence. Contract
  change: the two gateway calls are INJECTED (`tts: (text) =>
  Promise<ArrayBuffer>`, `transcribe: (blob, mime) => Promise<string>`) so
  the kit stays transport-free; return shape kept verbatim for mechanical
  adoption. NEW streaming half (operator item 3): optional `tts_stream`
  yields WAV segments that play as synthesis progresses (segment-queue
  player with pause/resume across segments; never auto-resumes while
  user-paused), plus `streamTtsJsonl` — the ready-made transport for the
  gateway's `/runs/{run_id}/voice/tts/stream` JSON-Lines endpoint
  (`audio_b64` segments, terminal done/cancelled, error events thrown).
- UI Kit `GatewayConnectModal` `initialStatus` prop: apps that probed the
  connection at boot seed the modal so opening it does not re-probe (the
  modal still refreshes after sign-in/out). Part of the 10-15s connect
  incident fold; the README connection contract now also pins the rule the
  incident proved — connected state flips on probe-ok, data fetches fill in
  AFTER and never gate first paint.
- UI Kit `palette_seeds.json`: generated 4-token reduction of every kit theme
  (`name → {primary, surface, secondary, muted}` hex) derived from
  `src/theme.css` by `scripts/generate_palette_seeds.mjs`. Ships in the npm
  package (`@abstractframework/ui-kit/palette_seeds.json`) as a parity fixture
  for terminal-side theme registries (the abstractcode TUI coordination,
  option (a) upgrade path) — a consumer CI can assert its palettes match kit
  truth without a runtime or build dependency. The generator refuses non-hex
  seed values loudly, resolves the real CSS cascade (`:root` defaults +
  grouped light block + own theme block in source order), and `--check` mode
  is wired into the ui-kit `test` chain so the committed artifact can never
  drift from `theme.css`.

### Fixed

- Adversarial-review folds on the component wave (2026-07-13, four fable5
  audits): `DisclosureList` row ids can no longer throw on lone-surrogate
  row keys (code-point fallback) and scroll-on-select now fires when a
  selected row is revealed later; `SteerComposer` treats a 200 with
  `accepted:false` as a refusal (never "Queued") and `submitSteer` retries
  the proxy's `csrf_required` refusal across all `*_gateway_csrf` cookie
  candidates with one idempotent command_id (localhost apps on different
  ports share a cookie jar, so the sender cannot know which twin pairs with
  this app's session); `GatewayConnectModal` honors `initialStatus` only on
  the FIRST open (a reopen probes fresh — the seed may predate a sign-out
  made elsewhere); `useGatewayVoice` reads its callbacks through a ref so
  async completions never fire stale closures; markdown list regions now
  BREAK on code fences (a fenced block inside a list rendered garbled inline
  code); nested list markers follow the GitHub/ChatGPT progression
  (decimal→alpha→roman, disc→circle→square) and list indents use
  `margin-inline-start` (RTL); ui-kit `prepublishOnly` runs the full test
  chain so a stale `palette_seeds.json` or token violation can never
  publish.
- Panel Chat markdown renderer now builds REAL nested lists (operator
  incident 2026-07-13, entity chat screenshot): the old list path flattened
  every region into one `<ol>`/`<ul>`, so documents mixing `1.` items with
  indented `-` sub-bullets rendered flat and a marker switch mid-region was
  swallowed into the wrong list type. Lists are parsed into a tree
  (`parseListItemLine`/`buildListTree`): bullets `-`/`*`/`+`, ordered
  `1.`/`1)`, tabs = 4 spaces, deeper indent nests under the previous item,
  a marker-type switch at the SAME indent starts a sibling list, indented
  continuation lines fold into their item, ordered start numbers are
  preserved. Nested lists get tight vertical spacing in `panel_chat.css`.
- Panel Chat `ChatMessageCard` header now honors `message.title` as the
  speaker identity for user and assistant roles ("You"/"Agent" are only the
  fallback when no identity is supplied) — entity replies show the entity's
  name instead of the role literal.

- UI Kit `PhaseCapabilityMatrix`: the phase × capability grid for the
  gateway-owned entity configuration object (config-object consensus plan,
  2026-07-11). Fully payload-driven — phases and sections arrive as ordered
  lists with server-supplied `label`/`hint`, so a new phase never needs a
  component release. Cell model carries server truth verbatim
  (`assigned`/`resolved_value`/`provenance`/`availability`/`reason`,
  `trust_state` for skill cells, and an `executable` axis distinct from
  availability so "standing config" grants — real but with no executor yet —
  stay editable). Edits emit cell-scoped patches only (`grant`/`deny`/`clear`;
  absent = untouched; explicit deny distinct from clear-to-default), so the
  component cannot express a whole-document write. All resolution/patch logic
  lives in a framework-free core module (`phase_capability_matrix_core.ts`)
  whose compiled output the served gateway console can consume directly; the
  React wrapper is DOM-only and renders from the core's single
  `MatrixCellControl` decision (absent | blocked | approval | tristate) so a
  consumer cannot rebuild a plain toggle over a requires-review cell. Unknown
  schema-version majors refuse loudly with a labeled degraded view.
- UI Kit `CriticalActionDialog`: confirmation surface for irreversible
  actions (embedding change / reembed). Server-supplied blast-radius facts
  are required for an enabled confirm; missing facts disable it with a
  labeled `#FALLBACK` unless the consumer explicitly opts into labeled
  degraded proceed; typed-confirm is strictly opt-in (ceremony-is-not-honesty
  ruling). Server JSON is normalized before render
  (`normalizeCriticalActionFacts`), Escape cancels, Tab is contained within
  the dialog, and focus returns to the opener on close.
- Dependency-free node test suite for both cores
  (`ui-kit/scripts/check_matrix_core.mjs`, 68 assertions) wired into the
  ui-kit `test` script; runs against the compiled `dist` artifact the
  consumers actually import. Pins the adversarial-review findings: stale
  patches are reconciled out after a payload refresh (and filtered from the
  wire), a pending clear on an operator-resolved cell displays as honestly
  indeterminate rather than a guessed "off", restating a stored word
  collapses only when the operator's word is the resolution source,
  reserved/`__proto__` phase ids refuse, `cells: null` refuses while omitted
  `cells` stays legal, and facts without a rows array render safely.

- `@abstractframework/monitor-flow` `AgentCyclesPanel` now owns the per-stage
  tinting of the agent think → act → observe loop (think=info, act=warning,
  observe=success), keyed on a `data-stage` attribute contract typed as a
  closed union in the component. Previously the tint CSS lived in AbstractFlow
  only, so other consumers (Observer, AbstractCode) rendered the loop as
  undifferentiated gray pills. Stage text mixes 45% hue / 55% `--text-primary`,
  which recovers ≥4.5:1 contrast at 11px on Nord-class muted palettes (55%
  did not); the lowest-contrast pastel themes (everforest-light) remain
  limited by their own `--text-primary` ceiling at any tint ratio, and the
  stage name stays readable as pill text regardless.
- UI Kit ships the `observer-night` theme (the Observer entity app's warm
  amber / deep blue-black palette) so kit components rendered inside the
  entity view match its chrome.
- UI Kit theme token integrity guard (`ui-kit/scripts/check_theme_tokens.mjs`,
  wired as the workspace `test` script): every theme that redefines a base
  semantic color must define hue-matched `-subtle`/`-border` derivatives —
  pins the leak class found by the 2026-07-11 adversarial review.
- Entity-semantic tokens (`--entity-identity/-memory/-diary/-standing/-scar/
  -bond/-accent`) join the UI Kit as the one source for summoned-entity
  surfaces (c594 contract with the observer seat). Dark values adopt the
  Observer entity app's shipped palette verbatim; light themes get darkened
  variants measured to hold ≥4.5:1 on every light theme's primary and
  secondary backgrounds and ≥3:1 as marks on tertiary surfaces (a scar red
  that vanishes on light would break the one-visual-language goal). These
  are mark colors by contract — entity-colored labels pair the mark with
  `--text-primary` text, and the warm identity/bond/accent family is never
  distinguished by color alone (bond keeps a ≥1.2x luminance gap from
  identity so the pair survives red-green color-vision deficiency). The
  integrity guard pins full-set coverage on the dark default, every light
  theme (CSS `color-scheme` or `theme.ts` group — the two sources are
  cross-checked), and any theme block partially overriding the set.

### Fixed

- Known-debt drift-class sweep (filed 2026-07-11): `ToolPolicyEditor`'s tool
  mode banner tones (`is-warn`/`is-danger`/`is-info`) derived from hardcoded
  Tailwind hues instead of the theme's `--warning`/`--error`/`--info` tokens,
  and `ProviderModelSelect` error text carried a raw red literal — both now
  token-driven. `ToolSpec` additionally accepts a server-declared
  `default_approval` ("approve" | "ask") which takes precedence over the kit's
  hardcoded runtime-defaults mirror; the mirror is now explicitly labeled a
  `#FALLBACK` for gateways that do not serve per-tool defaults (client-copied
  defaults rot — server truth preferred).
- `theme-solarized-light` was the only theme missing the semantic
  `--*-subtle`/`--*-border` token set, so the default dark theme's blue-family
  rgba values leaked into its cream palette wherever those tokens are consumed
  (stage pills, tool badges, ToolPolicyEditor's enabled-row accent border).
- Default (`:root`) `--success/--warning/--error` subtle + border literals
  carried Tailwind hues that did not match the base colors; aligned to one hue
  family per color role. `monitor-flow` and `panel-chat` fallback literals
  aligned to the same values (the tool badge previously carried a third,
  unrelated blue; one panel-chat background was a raw literal, now a proper
  token fallback).
- `monitor-flow` base stage pill derives from `--ui-pill-bg`/`--ui-pill-border`
  theme tokens instead of hardcoded white-alpha values, restoring correct
  rendering on light themes.

## 0.1.8 - 2026-06-14

### Fixed

- Improved the shared JSON viewer used by `@abstractframework/monitor-flow` and
  `@abstractframework/panel-chat` with a better default fold depth, fold-all
  controls, and correct wrapping for long structured output.
- Extended `@abstractframework/panel-chat` Markdown rendering so links and
  images render as first-class rich content instead of plain text.

## 0.1.7 - 2026-05-31

### Added

- UI Kit exports the shared Gateway browser-session sign-in card used by Gateway Console and thin clients.

### Changed

- Synchronized all AbstractUIC workspace package versions and updated `@abstractframework/panel-chat` to depend on `@abstractframework/ui-kit@^0.1.7`.

## 0.1.6 - 2026-05-26

### Added

- UI Kit exports `GatewaySessionSignInCard`, a shared Gateway user-token browser-session sign-in card for React thin clients.
- UI Kit `AfSelect` supports disabled options, disabled custom values with reason text, and custom option labels for dense editor selectors.

### Fixed

- UI Kit select popovers stop wheel-event propagation and style disabled options plus inline custom-value validation messages.

## 0.1.5 - 2026-05-12

### Fixed

- Correct `/monitor-flow` package exports so published consumers can resolve the bundled `agent_cycles.css` from `dist`.
- Use Node 24 in CI/release workflows for npm trusted publishing compatibility.

## 0.1.4 - 2026-05-12

### Fixed

- React package dist output is now usable as published ESM: relative runtime imports emit `.js` specifiers, and `@abstractframework/monitor-flow` copies `agent_cycles.css` into `dist`.
- `@abstractframework/panel-chat` now targets `@abstractframework/ui-kit@^0.1.4`.

### Added

- GitHub Actions CI for install, build, tests, and package dry-runs.
- GitHub Actions npm release workflow using trusted publishing/provenance, publishing packages in dependency order.

## 0.1.3 - 2026-02-05

### Fixed

- `@abstractframework/panel-chat` Markdown renderer now supports headings up to level 5 (`#####`) (see `panel-chat/src/markdown.tsx` + `panel-chat/src/panel_chat.css`).

## 0.1.2 - 2026-02-05

### Changed

- Documentation polish pass for public release (clearer entrypoints, tighter cross-links, and more actionable install guidance).
- Version bump to reflect the documentation release across packages.

## 0.1.1 - 2026-02-04

### Added

- User-facing documentation set and navigation:
  - `docs/getting-started.md` (entrypoint after `README.md`)
  - `docs/architecture.md` (includes Mermaid diagrams)
  - `docs/api.md` (package API map)
  - `docs/faq.md`
  - `docs/development.md`, `docs/publishing.md`, `docs/README.md`
- LLM-oriented docs: `llms.txt` and generated `llms-full.txt` (`scripts/generate-llms-full.py`).

### Changed

- React packages publish **compiled ESM + type declarations** from `dist/` (see `main` / `types` / `exports` in each package’s `package.json`).
- CSS is shipped as explicit package exports and must be imported by the host app:
  - `@abstractframework/ui-kit/theme.css`
  - `@abstractframework/panel-chat/panel_chat.css`
  - `@abstractframework/monitor-flow/agent_cycles.css`
  - `@abstractframework/monitor-active-memory/styles.css`
- `@abstractframework/monitor-gpu` custom element supports `mode: "full" | "icon"` (runtime + types).
- Docs are polished for first-time users (clear entrypoints, cross-links, and npm install examples).

## 0.1.0

- Initial repository snapshot (packages + baseline docs).

## Related docs

- Docs index: [`docs/README.md`](./docs/README.md)
- Publishing (maintainers): [`docs/publishing.md`](./docs/publishing.md)
