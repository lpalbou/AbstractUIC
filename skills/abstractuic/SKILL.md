---
name: abstractuic
description: Integrate AbstractFramework shared React controls, authenticated chat and Docs assistants, and voice settings into browser clients.
---

# Use AbstractUIC

Start with [the adoption guide](../../docs/adoption-guide.md) to choose an existing
component for the user-facing job. The repository ships multiple npm packages;
use the relevant package rather than importing a sibling app’s source.

Import `@abstractframework/ui-kit/theme.css` and, for chat,
`@abstractframework/panel-chat/panel_chat.css` in the host entry point. Use shared
theme tokens and `Icon`; keep the host’s appearance and connection state authoritative.
See [getting started](../../docs/getting-started.md) and [API](../../docs/api.md).

## Docs assistant and voice

Mount `DocsAssistantDrawer` from `@abstractframework/panel-chat` with `source`
(`app`, `name`), `connected`, `open`, `onClose`, and the host’s authenticated
`fetchGateway`. Keep it mounted while closed so its conversation survives.
The transport must support JSON writes and binary artifact reads, applying the
host’s session/CSRF or bearer authentication. Do not put credentials in component
state, localStorage keys, rendered markup or URLs.

The component resolves this app’s documentation through the Gateway and owns
its history, attachments and question lifecycle. It shows per-reply speech when
a voice route is configured. Pass `voicePreferences` when the app has overrides;
otherwise the Gateway default applies. Speech is manual, with play/pause/resume.
Opening past answers never speaks automatically. A rail host using
`docsAssistantPanel` should provide `visible` so hiding it stops playback.

Use `AfVoiceSection` for controlled engine, device, capture and playback settings;
`compact` fits narrow drawers. Preserve its `value`/`onChange` and reset semantics.
Use `useGatewayVoice` for playback/capture lifecycle instead of duplicating browser
audio state. Gateway synthesis owns models; components record/play locally.
See [panel-chat](../../panel-chat/README.md) and [ui-kit](../../ui-kit/README.md).

Tool and workspace controls express choices within Gateway limits. They cannot
grant a capability the Gateway forbids. Preserve blocked/error feedback and use
`AfTooltip` for brief, useful information; avoid repeating a label as help.

## Compact session lists

Use `SessionCard` for conversation rows and read `docs/session-cards.md` before integrating
unread state. Keep unread, human attention and working facts independent. Host applications
own transport and confirmation; reading must never resolve an approval or question.
