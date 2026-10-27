# ADR 0001: Shared primitives are composed on the gateway's contracts; apps customize through props, slots and theme tokens, never by forking

Status: Accepted.
Date: 2026-10-27

## Context

AbstractFramework ships eight web surfaces (AbstractCode web, Observer, Entity, Flow,
Continuum, Note, Assistant web, the gateway console) that all talk to the same AbstractGateway.
A 2026-10-27 audit of every surface (`untracked/ui-primitives/audit/*.md`, divergence matrices
per primitive) found that the same user-facing jobs are implemented several times over:

- The chat surface: three apps use panel-chat's `WorkflowChat`; four assemble their own from
  its pieces or hand-roll a thread and composer; eight different attachment-chip
  implementations exist; no app displays a speech-to-text transcript.
- Questions and approvals: four wordings for the same decision ("Deny / Allow once" in the kit,
  "Reject / Approve only / Approve and execute" in Observer, "Deny / Approve / Approve All" in
  Flow, "Approve / Deny" in Assistant web); two apps never surface a `waiting` run at all, so a
  run that asks the user hangs silently; pending-interaction detection exists in five
  independent client folds.
- Tool selection, provider/model pickers, voice settings, the top-right cluster, the drawer
  rail: each has a kit component and between one and four app-local twins, with different
  storage keys, labels and defaults.

Each twin was written for a good local reason (a prop the kit lacked, a wording preference, a
deadline). The cost is paid by the people using the apps: the same gateway behaves differently
from one app to the next, a fix to one surface does not reach the others, and new apps start
from zero instead of composing. The library's purpose (adoption-guide: "if the job is listed
here, the shared component is the supported path") was stated but not enforced.

## Decision

1. **One component per user-facing job.** For each job in the adoption guide's table there is
   exactly one shared implementation (ui-kit or panel-chat). The jobs this ADR names explicitly:
   the chat surface and its controls; attachment and generated-media rendering; questions to the
   user and gated approvals; tool selection; the provider/model/reasoning/speculation picker;
   the voice section; the top-right widget cluster (identity, gateway connection, appearance,
   about, docs assistant); the drawer system.
2. **Composed on the gateway's contracts.** A shared component renders what the gateway serves
   (`/api/gateway/...` routes, the run ledger / served `waiting`, and the replay view
   `replay_view_v1` once it ships) and posts through the gateway's command routes. It never
   re-derives server policy client-side (tool defaults, approval policy, model capabilities,
   voice defaults come from the gateway); a missing value renders the labeled `#FALLBACK` state.
   Data access is injected (transport functions, `GatewayFetch`): the component never imports
   host code and never fetches on its own authority.
3. **Apps customize through props, slots and theme tokens.** The customization points of every
   shared component are: typed props (labels, feature switches, callbacks), React slots
   (`header`, `footer`, `extraActions`, `composerExtras`, per-message `renderFooter`, ...),
   and the theme tokens of `theme.css`. An app that needs something the component cannot do
   adds the prop or slot to the kit (and its check), then consumes it. **Forking is not a
   customization point**: copying a kit component (or re-implementing its job) into an app tree
   is a defect, recorded as a backlog item with the deletion plan, never a steady state.
4. **The gateway default is shown first.** Wherever a choice has a gateway default (provider,
   model, voice, speech engine, tool approval), the component shows that default as the
   selected state with its value in words ("Gateway default · ollama / qwen3"), and the
   override is an explicit action that can be undone ("Use gateway default"). Nobody has to
   configure anything to use an app.
5. **One wording set per job.** Labels are decided once in the kit (e.g. tool approval: Deny /
   Allow once / Allow for this chat / Allow all enabled tools; the voice capture button: Hold to
   talk / Tap to talk; the unset choice: Gateway default). Apps may relabel through props only
   when the job itself differs, not for taste.
6. **Panels are opaque to the shell.** The drawer system and the top bar take panels as
   `{id, label, icon, content}` and never inspect their content, so a future flow-diagram panel
   or a memory-graph viewer mounts without an API change.

## Consequences

### Positive
- One fix reaches every app; one wording; one storage convention; one set of checks.
- A new app composes `AfAppShell` + `WorkflowChat` + the pickers and is at parity on day one.
- The gateway's contracts are exercised by one client surface, so a route change breaks one
  component (loudly) rather than eight apps (quietly).

### Negative
- An app with a local need waits for a kit release (a patch release of the kit is about one
  hour including the adversarial review); the kit's prop surface grows.
- Migration deletes roughly 8,600 lines of chat/media/approval code, ~1,800 of voice code and
  ~1,500 of shell/connection code across the apps; each app PR must be reviewed and its tests
  kept green, and the apps wait on the gateway 0.16.0 release for routes the kit already uses.

### Neutral
- Reference designs (the native AbstractAssistant on Qt, iPhone and watch) stay native; they
  define the model (tool states deny / approve / approve-all; gateway default first) that the
  shared web components implement. They are not migration targets.
- The replay view (`replay_view_v1`) is not a dependency of this ADR: today's data path (ledger
  fold + served `waiting`, `useWorkflowSession`) stays behind the same component API and the
  view replaces it when it ships.

## Enforcement
- Every shared component ships with a check script under `ui-kit/scripts/check_*.mjs` or
  `panel-chat/scripts/check_*.mjs` wired into `npm test`; the check pins the behavior this ADR
  promises (gateway default shown first, the one wording set, the slot/prop that an app
  depends on). A check whose absent-input case passes is not a check.
- Code review refuses an app PR that adds a component whose job is in the adoption guide's
  table; the reviewer asks for the kit prop/slot instead. The adoption guide is the list of
  jobs; a new job is added there with the component that owns it.
- Backlog items that absorb an app twin carry a "what the app deletes" table with file paths;
  completion reports cite the deletion commits.
- Docs: `docs/adoption-guide.md` and `docs/api.md` are updated in the same PR as the component.

## Validation
- `npm test` at the repository root (every workspace's checks, the islands drift check, the
  relative-URL check).
- Per app: `npm test` and `npm run build` green on the adoption PR; the app's twin files are
  gone (`git rm` in the same PR).
- The periodic backlog hygiene pass (`docs/backlog/recurrent/backlog-and-adr-hygiene.md`)
  re-greps the apps for the twin names listed in the consolidation items and files a drift
  item for any that reappear.

## Backlog links
- Originating audit: `untracked/ui-primitives/audit/` (chat-media-approvals.md, tools-and-models.md,
  voice.md, topbar-drawers.md), 2026-10-27.
- Adoption items (one per primitive): 0030 one chat surface, 0031 attachment and generated
  media, 0032 questions and approvals, 0033 tool selection, 0034 provider/model/reasoning/
  speculation picker, 0035 voice section, 0036 app shell (top bar + drawer system).
- Proposed, designed-for: 0037 flow diagram panel, 0038 memory graph viewer panel.
- Earlier items this ADR gives a rule to: 0009, 0010, 0011, 0015, 0016, 0017, 0021.

## Related
- `docs/adoption-guide.md` ("Which component for which job", "Server truth renders, clients
  never re-derive", "Degradations are labeled").
- `docs/architecture.md` (host-driven data flow).
- AbstractGateway ADR 0001 (the gateway's own layering rule; the same shape one layer down).
