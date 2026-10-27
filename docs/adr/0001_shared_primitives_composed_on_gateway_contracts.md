# ADR 0001: Shared primitives are composed on the gateway's contracts; apps customize through props, slots and theme tokens, never by forking

Status: Accepted.
Date: 2026-10-27
Root backlog: `docs/backlog/planned/1055_release_wave_2026_10_27_voice_library_replay_memory.md` (AbstractFramework), track "Shared UI primitives consolidation".

## Context

### What the framework is building

AbstractFramework's central native primitive is the **workflow**: a programmable AI system
built and published with AbstractFlow and run by AbstractRuntime behind AbstractGateway.
Agents, automations and trigger responses are workflows. Every app is a view on the same
gateway contracts (`/api/gateway/...` routes, the run ledger, the served run state) and on
those workflows. The shared components in this repository exist so that apps are **composed**
on top of those contracts rather than written one by one, toward the future visual app
designer recorded as a proposed item in the root backlog. A component that is right once is
right in every app; a component that an app forks is right nowhere for long.

### What the audit found

AbstractFramework ships eight web surfaces (AbstractCode web, Observer, Entity, Flow,
Continuum, Note, Assistant web, the gateway console) that all talk to the same AbstractGateway.
A 2026-10-27 audit of every surface (`untracked/ui-primitives/audit/*.md`, divergence matrices
per primitive, every cell cited `path:line`) found that the same user-facing jobs are
implemented several times over:

- The chat surface: three apps use panel-chat's `WorkflowChat`; four assemble their own from
  its pieces or hand-roll a thread and composer; eight different attachment-chip
  implementations exist; no app displays a speech-to-text transcript.
- Questions and approvals: four wordings for the same decision ("Deny / Allow once" in the kit,
  "Reject / Approve only / Approve and execute" in Observer, "Deny / Approve / Approve All" in
  Flow, "Approve / Deny" in Assistant web); two apps never surface a `waiting` run at all, so a
  run that asks the user hangs silently; pending-interaction detection exists in five
  independent client folds.
- Tool selection: the gateway serves `approval_default`, the kit reads `default_approval`, so
  the "server truth wins" path never fires; "approve" means auto on the desktop and ask on the
  iPhone; only the watch implements the layering the operator wants (gateway-authorized → my
  defaults → this session, sparse overrides, deny / approve / approve-all).
- Provider/model pickers, voice settings, the top-right cluster, the drawer rail: each has a
  kit component and between one and four app-local twins, with different storage keys, labels
  and defaults; the gateway default is shown first in some apps and never named in most.

Each twin was written for a good local reason (a prop the kit lacked, a wording preference, a
deadline). The cost is paid by the people using the apps: the same gateway behaves differently
from one app to the next, a fix to one surface does not reach the others, and new apps start
from zero instead of composing. The library's purpose (adoption-guide: "if the job is listed
here, the shared component is the supported path") was stated but not enforced.

### What is arriving

A replayable-ledger projection is being built in parallel (AbstractRuntime
`abstractruntime.replay`, `replay_view_v1`; gateway `GET /api/gateway/runs/{id}/view` and
`/view/stream`). It serves, for a run tree, `status`, one person-facing `interaction`,
`messages[]` with provenance, `activities[]` and `artifacts[]`. On 2026-10-27 it exists on a
runtime feature branch only, with no gateway route and no client. It is the state every chat
and run panel wants; it is not a dependency of this release.

## Decision

1. **One component per user-facing job.** For each job in the adoption guide's table there is
   exactly one shared implementation (ui-kit or panel-chat). The jobs this ADR names explicitly:
   the chat surface and its controls; attachment and generated-media rendering; questions to the
   user and gated approvals; tool selection; the provider/model/reasoning/speculation picker;
   the voice section and its standalone voice-in / voice-out widgets; the top-right widget
   cluster (identity, gateway connection, appearance, about, docs assistant); the drawer system.

2. **Composed on the gateway's contracts.** A shared component renders what the gateway serves
   (`/api/gateway/...` routes, the run ledger and the served `waiting`, and `replay_view_v1`
   once it ships) and posts through the gateway's command routes. It never re-derives server
   policy client-side (tool defaults, approval policy, model capabilities, voice defaults come
   from the gateway); a missing value renders the labeled `#FALLBACK` state, never a guess and
   never a model-name heuristic. Data access is injected (transport functions, `GatewayFetch`):
   the component never imports host code and never fetches on its own authority. A field or
   route the component relies on is read in the gateway's live source and cited in a comment;
   a hedge (`if (field exists) ... else invent`) is a defect.

3. **Apps customize through props, slots and theme tokens.** The customization points of every
   shared component are: typed props (labels, feature switches, callbacks), React slots
   (`header`, `footer`, `extraActions`, `composerExtras`, per-message `renderFooter`, `ttsSlot`,
   ...), and the theme tokens of `theme.css`. An app that needs something the component cannot
   do adds the prop or slot to the kit (with its check), then consumes it. **Forking is not a
   customization point**: copying a kit component (or re-implementing its job) into an app tree
   is a defect, recorded as a backlog item with the deletion plan, never a steady state.

4. **The gateway default is shown first.** Wherever a choice has a gateway default (provider,
   model, reasoning, speculation, voice, speech engine, tool approval, workflow), the component
   shows that default as the selected state with its resolved value in words ("Gateway default ·
   ollama / qwen3"), and the override is an explicit, undoable action ("Use gateway default").
   Nobody has to configure anything to use an app. Layered choices (tools) resolve
   gateway-authorized → app defaults → this session, each layer a **sparse** set of differences,
   so a tool the gateway adds later follows the gateway, and the states are deny / approve /
   approve-all (`off` / `ask` / `auto` on the wire, normalized at the edges).

5. **One wording set per job.** Labels are decided once in the kit (tool approval: Deny / Allow
   once / Allow for this chat / Allow all enabled tools; decide later is never a deny; the voice
   capture button: Hold to talk / Tap to talk; preview: Play sample; the unset choice: Gateway
   default). Apps may relabel through props only when the job itself differs, not for taste.

6. **Panels are opaque to the shell.** The drawer system and the top bar take panels as
   `{id, label, icon, content, keepAlive, fill}` and never inspect their content, so a future
   flow-diagram panel (backlog 0037) or a memory-graph viewer (0038) mounts without an API
   change. Canvas-like panels get `fill` (the panel owns its viewport), `keepAlive: "always"`
   and a resize signal; nothing else is promised to them before they are built.

7. **Designed for the replay view, not blocked on it.** The chat and run panels take their data
   through one component API whose input shapes mirror `replay_view_v1` (status; one
   `interaction` with kind, prompt, choices, tool calls and a ready `command`; `messages[]` with
   role/kind and `artifact_ids`; `activities[]`; `artifacts[]`). Today the ledger fold plus the
   served `waiting` (`useWorkflowSession`) fills those shapes; when the gateway serves
   `/runs/{id}/view` the transport swaps and the components do not change. No component fetches
   a `/view` route before the gateway on `main` serves it.

8. **Voice in and voice out are standalone composables.** `AfVoiceInput` (input device, live
   level, mic test, gain) and `AfVoiceOutput` (output device, volume, mute, test chime) render
   alone or inside `AfVoiceSection`, and every surface that shows voice settings uses them.
   Voice vocabulary follows AbstractVoice: provider = engine, model, voice.

9. **One repository, several frameworks.** The shared components are a per-framework concern;
   the jobs, the wording, the gateway contracts and the tokens are not. The layout:
   - JS/TS (today): npm workspaces at the repository root (`ui-kit/`, `panel-chat/`,
     `monitor-*/`, `app-server/`), released by tag as documented in `docs/publishing.md`.
     They stay at the root: moving them would break the workspaces, the release workflow and
     every consumer's import for no user benefit.
   - Python (`python/`): the desktop AbstractAssistant's Qt widgets
     (`abstractassistant/abstractassistant/ui/*.py`: approval sheet, voice strip, settings
     rows, route editor) are the reference designs for approvals, voice and the model picker.
     A port lives in `python/abstractuic_qt/` (one package, its own `pyproject.toml`, tests under
     `python/abstractuic_qt/tests/`), released to PyPI independently of the npm packages.
   - Rust (`rust/`): terminal components for AbstractTUI live in `rust/abstractuic-tui/` (one
     crate, its own `Cargo.toml`), depending on `abstracttui`, released to crates.io.
   - Swift (`swift/`): the iPhone/watch `AssistantKit` and `AbstractGatewayClient` packages are
     the reference designs for tool layering and "gateway default first". A port lives in
     `swift/AbstractUIKit/` (one SwiftPM package).
   - Shared across languages (`contracts/`): the job table (`docs/adoption-guide.md` is the
     human form), the wording table and the gateway payload fixtures that every language's
     checks consume, and the theme tokens (`ui-kit/palette_seeds.json` today). A language port
     is listed in the adoption guide's job table under its own column with its location, or
     the column says "none"; a native implementation that is not listed is a fork.
   - This slice ports no native component. A port happens when a seat needs one, and it starts
     by adding the column, the directory and the fixture consumption; the JS/TS packages remain
     the first implementation of every job.

## Consequences

### Positive
- One fix reaches every app; one wording; one storage convention; one set of checks.
- A new app composes `AfAppShell` + `WorkflowChat` + the pickers and is at parity on day one;
  the visual app designer has a vocabulary of components to place.
- The gateway's contracts are exercised by one client surface, so a route change breaks one
  component (loudly) rather than eight apps (quietly).
- The replay view lands as a transport swap, not as a rewrite of eight chat panels.

### Negative
- An app with a local need waits for a kit release (a patch release of the kit is about one
  hour including the adversarial review); the kit's prop surface grows.
- Migration deletes roughly 8,600 lines of chat/media/approval code, ~1,800 of voice code and
  ~1,500 of shell/connection code across the apps; each app PR must be reviewed and its tests
  kept green, and the apps wait on the gateway 0.16.0 release for routes the kit already uses.
- Multi-language layout adds directories that will be empty until a port is needed; the ADR
  prefers an explicit empty convention over a second, undocumented place.

### Neutral
- Reference designs (the native AbstractAssistant on Qt, iPhone and watch) stay native; they
  define the model (tool states deny / approve / approve-all; gateway default first) that the
  shared web components implement. They are not migration targets of this slice.
- The replay view (`replay_view_v1`) is not a dependency of this ADR: today's data path (ledger
  fold + served `waiting`, `useWorkflowSession`) stays behind the same component API and the
  view replaces it when it ships.

## Enforcement
- Every shared component ships with a check script under `ui-kit/scripts/check_*.mjs` or
  `panel-chat/scripts/check_*.mjs` wired into `npm test`; the check pins the behavior this ADR
  promises (gateway default shown first and named, the one wording set, sparse tool layers,
  the slot/prop an app depends on, the opaque panel contract). A check whose absent-input case
  passes is not a check: each check is confirmed red once by removing what it checks.
- Code review refuses an app PR that adds a component whose job is in the adoption guide's
  table; the reviewer asks for the kit prop/slot instead. The adoption guide is the list of
  jobs; a new job is added there with the component that owns it.
- Backlog items that absorb an app twin carry a "what the app deletes" table with file paths;
  completion reports cite the deletion commits.
- Docs: `docs/adoption-guide.md` and `docs/api.md` are updated in the same PR as the component.
- A gateway field or route a component needs and the gateway does not serve is a "gateway gap"
  listed in the backlog item and raised to the gateway seat; it is never papered over client-side.

## Validation
- `npm test` at the repository root (every workspace's checks, the islands drift check, the
  relative-URL check).
- Per app: `npm test` and `npm run build` green on the adoption PR; the app's twin files are
  gone (`git rm` in the same PR).
- The periodic backlog hygiene pass (`docs/backlog/recurrent/backlog-and-adr-hygiene.md`)
  re-greps the apps for the twin names listed in the consolidation items and files a drift
  item for any that reappear.
- Bundle size is measured before and after each consolidation (kit `dist` JS bytes, the islands
  bundle, each app's `dist` JS bytes) and recorded in the backlog item.

## Backlog links
- Originating audit: `untracked/ui-primitives/audit/` (chat-media-approvals.md, tools-and-models.md,
  voice.md, topbar-drawers.md), 2026-10-27; lead report `untracked/ui-primitives/report.md`.
- Adoption items (one per primitive, planned): 0030 one chat surface, 0031 attachment and
  generated media, 0032 questions and approvals, 0033 tool selection, 0034 provider/model/
  reasoning/speculation picker, 0035 voice section with voice-in / voice-out widgets, 0036 app
  shell (top-right widget set + drawer system).
- Proposed, designed-for: 0037 flow diagram panel, 0038 memory graph viewer panel.
- Earlier items this ADR gives a rule to: 0009, 0010, 0011, 0017, 0021; superseded by 0033:
  0015, 0016.
- Root: AbstractFramework backlog 1055 (release wave), 0993 (one ledger, many views).

## Related
- `docs/adoption-guide.md` ("Which component for which job", "Server truth renders, clients
  never re-derive", "Degradations are labeled").
- `docs/architecture.md` (host-driven data flow).
- AbstractGateway ADR 0001 (the gateway's own layering rule; the same shape one layer down).
- AbstractRuntime ADR 0008 (facade rule) and the replay-view work (root backlog 0993).
