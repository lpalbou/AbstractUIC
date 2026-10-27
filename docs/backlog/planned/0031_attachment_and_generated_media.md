# Planned: attachment and generated-media rendering — one renderer per media kind

## Metadata
- Created: 2026-10-27
- Status: Planned (kit half partly in progress on `feat/ui-primitives-chat`)
- Completed: N/A
- Area: panel-chat (`ChatMessageCard` media, controller fold) + ui-kit (`AfFileViewer`)
- Root link: AbstractFramework backlog 1055

## ADR status
- Governing ADRs: ADR 0001 (§1, §2, §7)
- ADR impact: none beyond implementation

## Summary
Every media kind a run can receive or produce (image, audio, video, pdf, text/code/json/markdown,
music, speech-to-text transcript, run artifacts) renders through one shared component, inline in
the chat when it belongs to a message and in `AfFileViewer` otherwise; the controller fills
`message.media` / `message.attachments` from the ledger so hosts stop hand-building previews.

## Why (audit `chat-media-approvals.md` §A2, §B rows "image preview" to "run artifacts")
- `AfFileViewer` has no `video` kind (`ui-kit/src/af_file_viewer.tsx:34-46`); Observer, Flow and the
  console each render `<video>` locally; Code offers video as download only.
- No app shows a speech-to-text transcript: every one drops it into the draft.
- Sent-message attachments are shown nowhere (Code) or as names (Assistant web); Flow has two upload
  response parsers; Observer, Flow and Continuum carry local classifiers and card families
  (`artifact_previews.tsx` 345 + `artifact_rendering.ts` 388; `Generated*Card` ~320; `team_file_viewer.tsx` 121).
- The replay view's `artifacts[]` carry `{id, run_id, step_id, seq, path}` with no content type, so a
  client still needs per-artifact metadata (gateway gap).

## Kit half
1. `ChatMedia.kind` gains `"file"` (pdf/text/code/json/markdown via `AfFileViewer`, inline or through a
   host opener); audio media gains `transcript?: string` (collapsible caption: the STT display); music rides on audio.
2. `AfFileViewer` gains `video`.
3. Transport hook `resolveArtifact?(runId, artifactId) → {src, contentType, name, size}`; the controller
   fills `message.attachments` from the run's `input_data.attachments` and `message.media` from `$artifact`
   refs and `abstract.media.*.generated` events.
4. Typed composer chips with thumbnails come from 0030 (`attachmentItems`).

## What the apps delete
Observer `artifact_previews.tsx` + most of `artifact_rendering.ts` (~700); Flow `ArtifactPlayer.tsx` (355),
`JsonViewer.tsx` (306), `MarkdownRenderer.tsx` (172), `Generated*Card` (~320), Follow-Up attach UI (~120);
Continuum `team_file_viewer.tsx` (121); Code's artifact list (~130, keeps the viewer); console sandbox media
wiring moves into the controller fold.

## Gateway routes relied on
`GET runs/{id}/artifacts`, artifact content routes, `POST attachments/upload`, `POST attachments/ingest`
(Code), `runs/{id}/{images|videos|music}/generate`, `runs/{id}/voice/tts`, `runs/{id}/audio/transcribe`.

## Gateway gaps
- `replay_view_v1.artifacts[]` lack `kind` / `content_type` / `name` / `size`.
- No batch artifact-metadata route; one request per artifact today.

## Acceptance
- [ ] `video` in `AfFileViewer` with a check; `"file"` media kind and `transcript` caption with
      `check_chat_media.mjs` extended; each confirmed red once.
- [ ] Controller fold fills attachments/media (or the item records it as the remaining half).
- [ ] Docs: api.md, adoption-guide row "Attachments and generated media".
- [ ] App adoption PRs with the deletion list above.

## Non-goals
A new media player (the kit's `AfAudioPlayer` stays); server-side thumbnailing.
