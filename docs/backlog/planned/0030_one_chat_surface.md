# Planned: one chat surface — `WorkflowChat` with the customization props the apps forked for

## Metadata
- Created: 2026-10-27
- Status: Planned (kit half in progress on `feat/ui-primitives-chat`)
- Completed: N/A
- Area: panel-chat (`WorkflowChat`, `ChatThread`, `ChatComposer`, `useWorkflowSession`)
- Root link: AbstractFramework backlog 1055 (release wave 2026-10-27), track "Shared UI primitives consolidation"

## ADR status
- Governing ADRs: ADR 0001 (one component per job; props/slots/tokens, never forks; designed for `replay_view_v1`)
- ADR impact: implements §1, §3, §7

## Summary
Make panel-chat's `WorkflowChat` the one chat surface of the framework by adding the handful of
props the apps re-implemented locally (steer while busy, typed attachment chips with an upload
hook, a toolbar row, per-message footer/variant slots, abortable cancel, sessions, run status),
then migrate every app chat onto it and delete the twins.

## Why (audit `untracked/ui-primitives/audit/chat-media-approvals.md`, §A1, §B, §D1)
- Three apps use `WorkflowChat` (Code, Observer discussion, console sandbox); Observer Ask and
  Continuum assemble `ChatThread`+`ChatComposer`; Entity wraps the card in a local list because
  `ChatThread` "can only render whole cards" (`abstractentity/src/chat_drawer.tsx:1277-1280`);
  Flow, Note and Assistant web hand-roll thread and composer.
- Eight attachment-chip implementations; Code's steer/queue select (`abstractcode/web/src/workspace/app.tsx:2017-2092`)
  and Observer's separate `SteerComposer`; export/clear/new-session buttons differ per app;
  Continuum's Stop does not abort (`abstractcontinuum/src/app.tsx:349`).
- Live token streaming exists in Code and Assistant web only; Observer Ask, Entity, Flow,
  Continuum, Note and the console block on one POST.

## Kit half (this item)
1. `steer?: { onSteer(text): Promise<{accepted; seq?}>; modes?: ("guide"|"queue")[] }` — the send
   button becomes Steer/Queue while busy, honest "queued (seq N)" text (reuses `submitSteer`).
2. `attachmentItems?: ComposerAttachment[]` + `onRemoveAttachment` / `onRetryAttachment`;
   exported `useAttachmentUploads({upload, maxBytes, concurrency})` lifted from
   `abstractcode/web/src/workspace/attachment_uploads.ts`; the `attachments` ReactNode slot stays.
3. `toolbar?: { onNewSession?; onClear?; exportTranscript?; copyTranscript? }` using
   `chatToMarkdown` / `downloadTextFile`.
4. `messageProps.renderFooter?(m)` and `messageProps.variant?(m) → "hint"` (Entity's only reason to fork).
5. `onCancel(signal?: AbortSignal)` so request/response hosts abort.
6. `sessions?` (or `ChatSessionList`) and `runStatus?` (metrics, pause/resume/conclude).
7. `ChatMessage` gains optional `kind` and `artifactIds` so a `replay_view_v1.messages[]`
   projection maps onto it without a new type; the mapping is documented in the panel-chat README.
   No `/view` fetch until the gateway on `main` serves it (ADR §7).

## What the apps delete (approximate lines; audit §D3)
| App | Deletes / replaces |
|---|---|
| abstractcode/web | composer_attachments.tsx (128), attachment_uploads.ts (149), run_status_bar.tsx (130), steer/queue block in app.tsx (~110), stream_replies.ts (165), dead wait_resolution.ts / runtime_extractors.ts / subworkflow_follow.ts / history_bundle_seed.ts (324), most of 99 `.pc-*` overrides in workspace.css |
| abstractobserver | Ask-tab chat + history/export app.tsx:3445-3700, 6315-6482 (~420) → WorkflowChat + toolbar + sessions |
| abstractentity | chat_message_list.tsx (197) → ChatThread + renderFooter/variant; meet_console thread/composer (~120); use_flow_conversation.ts (473) + flow_lane.ts (181) → useWorkflowSession |
| abstractflow | assistant/AssistantMessageList.tsx (52), AssistantComposer.tsx (108), AssistantStatusCard.tsx (235), assistantActivity.ts (253), followLive.ts (83), CodeAssistantPanel.tsx (200; keep "Insert into editor" as an action) |
| abstractcontinuum | advisor_drawer.tsx chrome (~200 of 412), advisor_attachments.ts (24), Team composer/drop/chips (~350) |
| abstractnote/web | runs.ts follow loop (177) → useWorkflowSession; FileChip previews (~25) |
| abstractassistant/web | Conversation.tsx (125), Composer.tsx (125), SessionList.tsx (75), run_events.ts (333), follow.ts (160), sse.ts (45), turn_store.ts (28), history.ts (64); bump stale pins (panel-chat 0.4.1 / ui-kit 0.8.7) |
| gateway console | SandboxAttachmentChips (22); entity Talk chat console.py:6705-6810 (~105) → a second island; re-sync the islands bundle (0.8.7 → current) |

## Gateway routes relied on
`POST runs/start`, `GET runs/{id}`, `GET runs/{id}/ledger[/stream]`, `GET runs/{id}/history_bundle`,
`POST commands` (resume / cancel / emit_event / inject_guidance), `POST attachments/upload`,
`GET runs/{id}/artifacts`. Later: `GET runs/{id}/view[/stream]` (replay view, not on `main`).

## Acceptance
- [ ] Props 1-5 shipped with `panel-chat/scripts/check_chat_surface.mjs` wired into `npm test`; each
      check confirmed red once by removing the behavior.
- [ ] `ChatMessage.kind` / `artifactIds` documented with the `replay_view_v1` mapping.
- [ ] `docs/api.md`, `docs/adoption-guide.md` ("Chat UI", "Live replies") and the panel-chat README updated.
- [ ] Bundle size before/after recorded (panel-chat dist JS bytes; baseline 316,280 at c6b7cc6).
- [ ] App adoption PRs (one per app, after the kit release and gateway 0.16.0) with the deletion table above
      executed; each app's `npm test` + `npm run build` green.

## Validation
`npm test` at the repository root; adversarial review of the kit PR; per-app build/test on adoption.

## Non-goals
Flow's step-tree run window (it is not a chat); Continuum's hub semantics (asks, votes, retract);
fetching the replay view before the gateway serves it.
