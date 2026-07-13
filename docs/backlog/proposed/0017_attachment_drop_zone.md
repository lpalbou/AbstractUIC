# Proposed: AttachmentDropZone — drop target + per-file upload-state chips (injected uploader)

## Metadata
- Created: 2026-07-12
- Status: Proposed
- Completed: N/A

## ADR status
- Governing ADRs: None
- ADR impact: None

## Context
Census gap-check (2026-07-12): three hand-rolled web implementations of the
same concept — a drag-drop file zone with per-file chips carrying
loading/error state and an upload path:
- `abstractflow/src/components/RunFlowModal.tsx` (followUpAttachments,
  uploads via /api/gateway/attachments/upload),
- `abstractobserver/src/entity/chat_drawer.tsx:465-485` (onDrop),
- `abstractcode/web/src/ui/app.tsx` (attached_files with per-file
  loading/error state).
A Qt twin exists in smartnote (pattern-only; out of scope for shared code).

## Proposed direction
One kit component: drop zone + file chips (name, size, progress/error,
remove), with the UPLOADER INJECTED (async callback per file) since the
endpoint and auth transport differ per app — same injection discipline as
0009's fetcher pin. Paste-from-clipboard support rides along if any consumer
has it today (verify at build time).

## Why it might matter
Three implementations of upload-state bookkeeping; every future chat/run
surface re-needs it (the creation modal's expert tab may too).

## Promotion criteria
Two of the three consumers opt in (the stage-tint pattern: kit absorbs, forks
delete same-pass).

## Non-goals
Owning upload endpoints or auth; Qt/smartnote surfaces.
