# Proposed: the Docs assistant reads its answers aloud in an app with TTS

## Metadata
- Created: 2026-10-28
- Status: Proposed
- Area: panel-chat (`docs_assistant.tsx`: `DocsAssistantDrawer`, `docsAssistantPanel`, `DocsAssistantPanel`)
- Found by: message footer spec (0062), 2026-10-28

## Summary
The message footer spec puts a speaker on every assistant message whenever the host has a read-aloud path. The Docs
assistant renders its thread with `messageProps={{ showCopy: true }}` and takes no voice from its host, so its answers
have no speaker even in AbstractCode web, Observer or Entity, which have `useGatewayVoice`. Add an optional
`readAloud?: { onSpeakToggle, getSpeakState }` (or a narrow `messageProps` passthrough) to the drawer, the panel
helper and the view; each app passes its voice hook's toggle. No speaker without it (unchanged).

## Done when
- The three entry points take it; `check_docs_assistant.mjs` pins the speaker with it and its absence without it.
- The apps that have a voice pass it (pin bump + one prop each).
