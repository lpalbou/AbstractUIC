# @abstractuic/panel-chat

Chat UI primitives for AbstractFramework-style UIs: thread rendering, message cards, a composer, and lightweight Markdown/JSON rendering.

## Peer dependencies

Declared in `panel-chat/package.json`:

- `react@^18`, `react-dom@^18`
- `@abstractuic/ui-kit` (icons used by `ChatMessageCard`)

## Install

- Workspace: add a dependency on `@abstractuic/panel-chat`
- npm (once published): `npm i @abstractuic/panel-chat`

## Exported API

See `panel-chat/src/index.ts` for the authoritative export list. Common entry points:

- Components: `ChatThread`, `ChatComposer`, `ChatMessageCard`, `ChatMessageContent`
- Renderers: `Markdown`, `JsonViewer`
- Types: `PanelChatMessage`, `ChatMessage`, `ChatAttachment`, `ChatStat`
- Utils: `chatToMarkdown`, `copyText`, `downloadTextFile`, `tryParseJson`

## Usage (typical)

```tsx
import React, { useState } from "react";
import { ChatThread, ChatComposer, type ChatMessage } from "@abstractuic/panel-chat";

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

## Rendering rules

`ChatMessageContent` auto-detects JSON (via `tryParseJson` in `panel-chat/src/utils.ts`) and renders:

- JSON ⇒ `JsonViewer`
- otherwise ⇒ `Markdown` (or your `renderMarkdown` override)

Markdown is intentionally minimal and implemented in `panel-chat/src/markdown.tsx` (headings 1–3, code fences, lists, tables, blockquotes, hr, emphasis, and optional highlighting).

## Styling & theming

- Components import `panel-chat/src/panel_chat.css`.
- For consistent tokens (colors/typography), import `@abstractuic/ui-kit/src/theme.css` in your app.

## Related docs

- Getting started: [`docs/getting-started.md`](../docs/getting-started.md)
- Architecture: [`docs/architecture.md`](../docs/architecture.md)
