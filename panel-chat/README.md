# @abstractframework/panel-chat

Chat UI primitives for AbstractFramework-style UIs: thread rendering, message cards, a composer, and lightweight Markdown/JSON rendering.

## Peer dependencies

Declared in `panel-chat/package.json`:

- `react@^18`, `react-dom@^18`
- `@abstractframework/ui-kit` (icons used by `ChatMessageCard`)

## Install

- Workspace: add a dependency on `@abstractframework/panel-chat`
- npm: `npm i @abstractframework/panel-chat`

## Exported API

See `panel-chat/src/index.ts` for the authoritative export list. Common entry points:

- Components: `ChatThread`, `ChatComposer`, `ChatMessageCard`, `ChatMessageContent`
- App assistant: `AssistantPanel` (injected `ask` transport; see below)
- Controlled workflow surface: `WorkflowChat` and the `WorkflowInteraction` union
- Transport-injected runtime: `WorkflowSessionController`, `useWorkflowSession`, and `WorkflowTransport`
- Renderers: `Markdown`, `JsonViewer`
- Tool and run evidence: `ToolActivity`, `ToolActivityGroup`, `toolArguments`, `toolPreview`,
  `workflowProgress`, `workflowEvidence`, `foldWorkflowTools`, `historyRecords`,
  `statDetail`, `StatDetailPanel`
- Types: `ChatMessage`, `ChatAttachment`, `ChatMessageLevel`, `ChatStat`
- Utils: `chatToMarkdown`, `copyText`, `downloadTextFile`, `tryParseJson`

## Usage (typical)

```tsx
import React, { useState } from "react";
import { ChatThread, ChatComposer, type ChatMessage } from "@abstractframework/panel-chat";

export function ChatView() {
  const [value, setValue] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);

  return (
    <>
      <ChatThread messages={messages} autoScroll />
      <ChatComposer value={value} onChange={setValue} onSubmit={() => setMessages((m) => [...m, { role: "user", content: value }])} />
    </>
  );
}
```

## App assistant

`AssistantPanel` is the docs Q&A surface an app places in the kit's `AfDrawer`
(opened from `AfTopBarActions`). It never fetches: pass an `ask(question, { signal, history })`
transport that returns a `Promise<string>` or an `AsyncIterable<string>` of deltas. Optional
props: `assistantName`, `suggestions`, `emptyState`, `placeholder`, `blockedNotice` (disables
the composer and shows the notice, e.g. while disconnected) and a controlled
`messages` / `onMessagesChange` pair. See the
[Adoption guide](../docs/adoption-guide.md) for the shared docs Q&A transport.

## Workflow chat

`WorkflowChat` is a controlled, presentation-only surface for hosts that own
their own gateway/workflow protocol. Supply `messages`, `draft`,
`onDraftChange`, and async `onSend`; the component retains the draft when a
send fails and presents an actionable retry. `busy` and `onCancel` add a stop
control. `disabled` gives observers a read-only transcript without hiding a
pending interaction.

Use `interaction` for a pending `WorkflowInteraction`: `ask-user` supports
choices and optional free text, `tool-approval` provides approve/deny actions,
and `event-wait` sends a host-defined payload. The callbacks are injected: the
component never fetches, polls, or resumes a workflow itself.

`renderMarkdown` is passed through to each `ChatThread` message card. Use it
when the host owns a sanitizer or a richer Markdown renderer; the chat surface
does not make a separate unsafe rendering path.

The composer is controlled. Clear `draft` in the host only after `onSend`
resolves; a rejected callback retains it and the component offers a retry.
Set `sendWhileBusy` to permit an explicit queue/steer mode during a running
workflow while retaining the Stop control. Otherwise `busy` disables sending.

For hosts that need a reusable gateway-facing controller, `WorkflowSessionController`
and `useWorkflowSession` consume an injected `WorkflowTransport`. They retain no
gateway URL, bearer token, or browser persistence. Pass a non-secret `authScopeKey`
that changes on sign-in/out or account switching to reset the controller safely.

`useWorkflowSession({ transport, runId, authScopeKey })` returns `{ controller,
snapshot }`. `transport` owns requests, SSE parsing, and ephemeral credentials;
the controller owns no URL, header, localStorage, or bearer token. The snapshot
contains lifecycle `status`, optional workflow-provided `displayStatus`, folded
messages, records, a pending raw wait, and connection/error state. Render
`workflowPendingInteraction(snapshot)`, not the raw `snapshot.interaction`: a
tool approval the controller has already granted under the host's
`toolApprovalPolicy` (or an accepted Allow) sets `snapshot.toolApprovalGranted`,
is presented as running tools, and must not show an approval card. See
[`examples/workflow_assistant.tsx`](examples/workflow_assistant.tsx) for a small
embedded consumer that maps raw waits to `WorkflowInteraction`. Its required
`onSend(message)` prop remains host-owned: it may start, steer, or durably queue
a turn, but the shared component never invents an event or command vocabulary.
Event waits use `resolveWorkflowEventTarget(rawWait, records, run)` to recover
the exact canonical scope from matching ledger evidence; an ambiguous wait is
shown as unavailable rather than guessed.

## Rendering rules

`ChatMessageContent` auto-detects JSON (via `tryParseJson` in `panel-chat/src/utils.ts`) and renders:

- JSON ⇒ `JsonViewer`
- otherwise ⇒ `Markdown` (or your `renderMarkdown` override)

Markdown is intentionally minimal and implemented in `panel-chat/src/markdown.tsx` (headings 1–5, code fences, lists, tables, blockquotes, hr, emphasis, and optional highlighting).

## Styling & theming

- Import CSS in your app entrypoint (recommended):
  - `import "@abstractframework/panel-chat/panel_chat.css";`
  - `import "@abstractframework/ui-kit/theme.css";` (shared tokens)

## Related docs

- Getting started: [`docs/getting-started.md`](../docs/getting-started.md)
- API reference: [`docs/api.md`](../docs/api.md)
- Architecture: [`docs/architecture.md`](../docs/architecture.md)
- Troubleshooting: [`docs/troubleshooting.md`](../docs/troubleshooting.md)
