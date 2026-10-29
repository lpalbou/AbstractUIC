# AbstractUIC

[![CI](https://github.com/lpalbou/AbstractUIC/actions/workflows/ci.yml/badge.svg)](https://github.com/lpalbou/AbstractUIC/actions/workflows/ci.yml)
[![ui-kit on npm](https://img.shields.io/npm/v/@abstractframework/ui-kit?label=ui-kit)](https://www.npmjs.com/package/@abstractframework/ui-kit)
[![panel-chat on npm](https://img.shields.io/npm/v/@abstractframework/panel-chat?label=panel-chat)](https://www.npmjs.com/package/@abstractframework/panel-chat)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)

Reusable UI packages for AbstractFramework clients: React components, small Web Components, a Node.js Gateway session proxy, and console islands for pages that are not React apps.

> Packages are ESM and ship CSS alongside JS. See `docs/getting-started.md` for required CSS imports and Next.js notes.

AbstractUIC is **UI-only**: hosts provide data + callbacks; the packages don’t import host code. The only packages that perform network requests by default are `@abstractframework/monitor-gpu` and `@abstractframework/monitor-memory` (each polls a metrics endpoint; see `monitor-gpu/src/gpu_metrics_api.js` and `monitor-memory/src/memory_metrics_api.js`). Clients such as the `ui-kit` automations client send requests only through the `fetch` you inject.

## What's new in 0.8.9

`@abstractframework/ui-kit` 0.9.10: gapless read-aloud (`useGatewayVoice` schedules every streamed segment
ahead on the audio clock; pause/resume from the clock) and the cloud provider cards v2 (`CloudProviderCards`: one
Connect per card that checks then saves, an OVH AI Endpoints card, an "Other OpenAI-compatible endpoint" card, the
official OpenAI mark with its provenance, text badges quoting the other brands' terms). `@abstractframework/panel-chat`
stays 0.6.6 ([changelog](./CHANGELOG.md#089---20261029)).

## What's new in 0.8.8

`@abstractframework/ui-kit` 0.9.9: one compact aligned filter bar (`AfFilterBar`: search and toggles on one
line, one row of chips per facet with a fixed label column; the same markup for the console islands) and the cloud
provider cards (`CloudProviderCards`: one card per cloud provider AbstractCore lists, the key checked before it is
saved, a new connection never overwrites one, official brand marks with licence notes, a text badge where a
brand's terms forbid the logo). `@abstractframework/panel-chat` stays 0.6.6
([changelog](./CHANGELOG.md#088---20261029)).

## What's new in 0.8.7

`@abstractframework/ui-kit` 0.9.8 and `@abstractframework/panel-chat` 0.6.6: the automation panel says everything in
words (the trigger, a failure reason as a sentence, an event wait that asks in words, local times); the tool-approval card
opens with "The automation wants to use these tools:" (chat: "The assistant wants…") then one bullet per call, no count,
no bold parameters ([changelog](./CHANGELOG.md#087---20261029)).

## What's new in 0.8.6

`@abstractframework/ui-kit` 0.9.7: tool results read in words (`describeToolResult`,
`ToolResultWordsView`); an automation panel opens at the item that needs you, outlined, with the wait card in the
standard text colour (`openAt`); the top bar's About button has its own glyph and a page can host its own element in
the kit's About dialog ([changelog](./CHANGELOG.md#086---20261029)).

## What's new in 0.8.5

`@abstractframework/ui-kit` 0.9.6: approval cards list tool calls in words, never raw JSON
(`describeToolCall`, `ToolCallWordsList`); ONE account widget in the top bar; a voice change never replays the
old voice (`useGatewayVoice` `tts_voice`); a cloned voice's card shows its reference length; a failed read-aloud
says why. `@abstractframework/panel-chat` 0.6.5 (needs ui-kit `^0.9.6`): the chat's approval card renders the
kit's list; read aloud speaks only a reply generated while the conversation is open
([changelog](./CHANGELOG.md#085---20261029)).

## What's new in 0.8.4

`@abstractframework/panel-chat` 0.6.4: one message footer spec for every app. The stamp carries the
date when a message is not from today ("Yesterday · 10:52 PM", "Oct 21 · 10:52 PM"; `formatMessageStamp`),
the speaker stays on every assistant message of a host with read-aloud (disabled with its reason while
the reply streams), and the "files changed" chip opens the structured detail panel like the others
([changelog](./CHANGELOG.md#084---2026-10-28)).

## What's new in 0.8.3

`@abstractframework/panel-chat` 0.6.3: a reply's speaker and copy buttons are always visible, the
spinner shows only while the first audio is generated, then Pause / Play; `@abstractframework/ui-kit`
0.9.5: voice settings name voices, never their ids (the Engines row, an unlisted saved voice), list
each speech model once and say which model a cloned voice is bound to
([changelog](./CHANGELOG.md#083---2026-10-28)).

## What's new in 0.8.2

`@abstractframework/panel-chat` 0.6.2: a conversation reopened in replay-view mode shows every
turn again (0.6.0 showed only the last one); `@abstractframework/ui-kit` 0.9.4: the voice picker
lists each Qwen3-TTS voice once ([changelog](./CHANGELOG.md#082---2026-10-28)).

## What's new in 0.8.1

Release-closing polish, found by rendering every app at 1440 and 390 px, light and dark:
`@abstractframework/ui-kit` 0.9.3 styles "Create a voice" / "Manage voices" (they were
browser-default fieldsets), keeps tool-row badges and the model picker's "Custom" whole, and says
"Gateway … did not answer" instead of "Session rejected" when the gateway is down (with
`@abstractframework/app-server` 0.1.13's `gateway_status`); `@abstractframework/panel-chat` 0.6.1
makes "Allow once" the approval card's one primary, names the real buttons in its scope sentence
(one visible line, the rest in a disclosure) and uses one duration format, marking a tool time that
includes an approval wait ([changelog](./CHANGELOG.md#081---2026-10-28)).

## What's new in 0.8.0

`@abstractframework/panel-chat` 0.6.0: the chat renders a conversation from AbstractGateway's
replay view (`GET runs/{id}/view` and its stream, gateway 0.17.0) when the host's transport
offers it (`replayView: createReplayViewTransport({ fetch })`), instead of rebuilding the run
from ledger records in the browser; older gateways keep the ledger fold, labeled
([changelog](./CHANGELOG.md#080---2026-10-28),
[panel-chat README](./panel-chat/README.md#replay-view-the-gateways-reconstruction)).

## What's new in 0.7.2

`@abstractframework/ui-kit` 0.9.2: the voice picker's speech model list shows a cloning checkpoint
(Qwen3-TTS Base) as "<id> (clones)" ([changelog](./CHANGELOG.md#072---2026-10-28)).

## What's new in 0.7.1

`@abstractframework/ui-kit` 0.9.1: in the voice picker, choosing a voice plays it, with one
play/stop toggle at the right of the voice select (see the
[changelog](./CHANGELOG.md#071---2026-10-27)).

## What's new in 0.7.0

AbstractUIC 0.7.0 (`@abstractframework/ui-kit` 0.9.0, `@abstractframework/panel-chat` 0.5.0) gives
each user-facing job one shared component, composed on AbstractGateway's contracts
([ADR 0001](./docs/adr/0001_shared_primitives_composed_on_gateway_contracts.md)): one chat surface
with questions and approvals in one wording set, attachments and generated media, a chat's tool
policy stored on the gateway, the tool editor and the provider/model picker that names the
gateway default, voice in / voice out widgets and one microphone button, and the app shell (the
signed-in identity, the drawer system). The job table is the
[Adoption guide](./docs/adoption-guide.md); the full list is in the
[changelog](./CHANGELOG.md#070---2026-10-27). panel-chat 0.5.0 needs ui-kit `^0.9.0`.

## AbstractFramework ecosystem

AbstractUIC is part of the broader [AbstractFramework](https://github.com/lpalbou/AbstractFramework) ecosystem:

- **AbstractCore** (core logic/types): https://github.com/lpalbou/abstractcore
- **AbstractRuntime** (runtime/orchestration): https://github.com/lpalbou/abstractruntime

AbstractUIC does **not** depend on AbstractCore/AbstractRuntime directly (see the absence of such dependencies in `*/package.json`). Instead, host apps (AbstractFlow / AbstractObserver / etc.) integrate with those layers and pass the resulting data into these UI components (see package contracts in `monitor-flow/src/AgentCyclesPanel.tsx`, `monitor-active-memory/src/types.ts`, `panel-chat/src/chat_message_card.tsx`).

## Documentation

- Getting started (entrypoint): [`docs/getting-started.md`](./docs/getting-started.md)
- Adoption guide (which component for which job): [`docs/adoption-guide.md`](./docs/adoption-guide.md)
- Design rules (ADR 0001: one component per job, composed on the gateway's contracts): [`docs/adr/`](./docs/adr/README.md)
- Theming & design tokens: [`docs/theming.md`](./docs/theming.md)
- Modal dialog, menu, tooltip, account row tints, grouped navigation (`AfModal`, `bindModal`, `AfTooltip`, `bindTooltips`): [`docs/modal.md`](./docs/modal.md)
- Filter bar (`AfFilterBar`, the plain-HTML markup): [`docs/filter-bar.md`](./docs/filter-bar.md)
- On/off settings, sign-in card, forms and tabs (`AfSwitch`, `AfTabs`, guards, `randomId()`): [`docs/state-toggles.md`](./docs/state-toggles.md)
- Responsive layout (breakpoints, touch sizes, sheets, drawers, viewport helpers): [`docs/responsive.md`](./docs/responsive.md)
- API reference: [`docs/api.md`](./docs/api.md)
- FAQ: [`docs/faq.md`](./docs/faq.md)
- Architecture (includes diagrams): [`docs/architecture.md`](./docs/architecture.md)
- Troubleshooting: [`docs/troubleshooting.md`](./docs/troubleshooting.md)
- Console islands (kit components for non-React pages): [`docs/console-islands.md`](./docs/console-islands.md)
- Automations (panel, schedule dialog, client, fixtures): [`docs/automations.md`](./docs/automations.md)
- Docs index: [`docs/README.md`](./docs/README.md)
- Agent-oriented docs: [`llms.txt`](./llms.txt) (index) and [`llms-full.txt`](./llms-full.txt) (generated, offline-friendly)
- Changelog: [`CHANGELOG.md`](./CHANGELOG.md)
- Contributing: [`CONTRIBUTING.md`](./CONTRIBUTING.md)
- Code of conduct: [`CODE_OF_CONDUCT.md`](./CODE_OF_CONDUCT.md)
- Security: [`SECURITY.md`](./SECURITY.md)
- Acknowledgments: [`ACKNOWLEDGMENTS.md`](./ACKNOWLEDGMENTS.md)

## Packages

| Package | Purpose | Docs |
|---|---|---|
| `@abstractframework/ui-kit` | Theme tokens (21 themes) and the responsive layer (breakpoints, 44 px touch targets, bottom sheets, viewport helpers); the app shell (`AfAppShell`: top-right cluster with the signed-in identity, `AfDrawerSystem` side panels, appearance and About dialogs) and the Gateway connect modal + connection hook; inputs (`AfSelect`, `ProviderModelPicker` naming the gateway default, `ToolModeEditor` with tool layers and a chat's tool policy stored on the gateway); voice (`AfVoiceSection`, the standalone `AfVoiceOutput` / `AfVoiceInput`, `AfVoiceMicButton`, the voice hook with streaming TTS and push-to-talk, the voice library); file viewer + code highlighting + waveform audio player; settings rows, relative time, AbstractFramework identity helpers, phase capability matrix, critical action dialog, steer composer, disclosure list, chips, icons; automations panel + schedule dialog + typed Gateway client; console islands for non-React pages (repository build) | [`ui-kit/README.md`](./ui-kit/README.md) |
| `@abstractframework/panel-chat` | The chat surface for gateway workflows (`WorkflowChat` + `WorkflowSessionController`: live (streamed) replies, steer and queue, questions and approvals with one wording set, a chat's tool policy stored on the gateway, typed attachment chips, generated media with transcripts), the Docs assistant and app assistant (also as drawer-system panels), "Schedule this…" action and "from automation" badge, workspace browser + in-place file preview, and the thread, message cards, composer and Markdown/JSON renderers | [`panel-chat/README.md`](./panel-chat/README.md) |
| `@abstractframework/app-server` | Node server side for apps: serving under the gateway's `/apps/<id>/`, shared launch flags, local gateway pointer, gateway-session proxy (token → HttpOnly cookie exchange, CSRF, URL pinning, forwarded client address) | [`app-server/README.md`](./app-server/README.md) |
| `@abstractframework/monitor-flow` | Agent-cycle trace viewer + ledger adapter | [`monitor-flow/README.md`](./monitor-flow/README.md) |
| `@abstractframework/monitor-active-memory` | Knowledge Graph + Active Memory explorer (ReactFlow) | [`monitor-active-memory/README.md`](./monitor-active-memory/README.md) |
| `@abstractframework/monitor-gpu` | GPU utilization widget (`<monitor-gpu>`) polling a metrics endpoint | [`monitor-gpu/README.md`](./monitor-gpu/README.md) |
| `@abstractframework/monitor-memory` | Host RAM + device memory widget (`<monitor-memory>`) polling a metrics endpoint | [`monitor-memory/README.md`](./monitor-memory/README.md) |

## Context

[AbstractFramework](https://github.com/lpalbou/AbstractFramework) is a workflow/runtime system with multiple host UX layers. AbstractUIC packages are host-driven UI building blocks used by those clients (no host imports; data + callbacks flow in from the host).

## Install

Packages are published independently. Install only the package(s) you need:

```bash
# chat
npm i @abstractframework/panel-chat @abstractframework/ui-kit

# agent traces
npm i @abstractframework/monitor-flow

# active memory explorer (requires reactflow peer dep)
npm i @abstractframework/monitor-active-memory reactflow

# gpu widget (web component)
npm i @abstractframework/monitor-gpu

# host memory widget (web component)
npm i @abstractframework/monitor-memory

# app-origin gateway session proxy
npm i @abstractframework/app-server
```

## Quickstart (React)

Import theme tokens once, then import the CSS for the package(s) you use (see [`docs/getting-started.md`](./docs/getting-started.md) for details and Next.js notes). For an app on AbstractGateway, compose the shared components listed in the [Adoption guide](./docs/adoption-guide.md) (`AfAppShell`, `WorkflowChat`, the pickers). Minimal example (chat primitives):

```tsx
import "@abstractframework/ui-kit/theme.css";
import "@abstractframework/panel-chat/panel_chat.css";

import { ChatComposer, ChatThread } from "@abstractframework/panel-chat";
```

## Development

- Install + build workspaces: `npm install && npm run build`
- Run tests: `npm test` (runs each workspace's test rig, then the repository's release gates: relative URLs and the cross-package type check; see [`docs/publishing.md`](./docs/publishing.md))
- React packages are typically validated via a host app that links them in a workspace (HMR).

See [`docs/development.md`](./docs/development.md).

## License

MIT (see [`LICENSE`](./LICENSE)).
