# @abstractuic/panel-chat

Shared chat helpers for AbstractFramework UIs.

## Exports
- `ChatMessageContent`: auto-detects JSON vs Markdown and picks the right renderer.
- `chatToMarkdown`: exports a chat transcript as Markdown.
- `copyText`, `downloadTextFile`: small browser utilities for export UX.

## Usage
```ts
import { ChatMessageContent, chatToMarkdown, downloadTextFile } from "@abstractuic/panel-chat";
```

