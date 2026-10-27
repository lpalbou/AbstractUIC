# Planned: questions to the user and gated approvals — one panel, one wording, fed by the run interaction

## Metadata
- Created: 2026-10-27
- Status: Planned — kit half MERGED (PR #4): wording set, Allow for this chat / Decide later / Continue without answering / Keep waiting, card variant, `ReplayInteraction`; NEXT: the session tool-policy contract (approve all / approve kind write `/sessions/{id}/tool-policy` first, then answer; capability-gated; `abstract.tool_policy_decision` rendered as an activity) on `feat/ui-primitives-session-policy`
- Completed: N/A
- Area: panel-chat (`WorkflowInteractionPanel`, `presentInteraction`, `useWorkflowSession`)
- Root link: AbstractFramework backlog 1055; root 0993 (one ledger, many views)

## ADR status
- Governing ADRs: ADR 0001 (§1, §2, §5, §7)
- ADR impact: none beyond implementation

## Summary
One interaction panel for ask-user, tool-approval and event waits, with the state model of the
native reference designs (deny / allow once / allow for this chat / allow all enabled tools /
decide later; skip or keep waiting on a question), one wording set, a compact card variant for
served-state lists, and an input shape that accepts today's raw wait or tomorrow's
`replay_view_v1.interaction`.

## Why (audit `chat-media-approvals.md` §A3, §B, §C)
- Four wordings for one decision: "Deny / Allow once" (kit), "Reject / Approve only / Approve and
  execute" (Observer `app.tsx:6829-6839`), "Deny / Approve / Approve All" (Flow `RunFlowModal.tsx:8815-8898`),
  "Approve / Deny" (Assistant web `Conversation.tsx:18-62`).
- Entity and Note never surface a `waiting` run: a run that asks hangs silently
  (`abstractentity/src/flow_lane.ts:68-71`; `abstractnote/web/src/lib/runs.ts:154-176`). Observer reads
  only the last ledger record (`app.tsx:991-992`).
- Pending detection exists in five client folds (panel-chat, Flow, Assistant web, Qt/Swift, Observer).
- Code's copy claims "Saved for this Gateway account" while storage is per-browser
  (`settings_panel.tsx:233` vs `preferences.ts:41-50`); the kit's approve-all description says the same.
- The native Qt sheet offers Decide later / Deny / Allow once + "Allow all enabled tools in this chat",
  and closing defers, never denies (`abstractassistant/ui/approval.py:7-14, 710-760`).

## Kit half
1. Tool approval: `onApprove` (Allow once), `onDeny` (Deny), `onApproveForSession?` (Allow for this chat),
   `onApproveAll?` (Allow all enabled tools), `onDefer?` (Decide later), `remember?: {label, checked, onChange}`,
   `disabledReason?`, `approveAllScope?` (host-supplied scope sentence; the default never asserts account scope).
2. Ask-user: choices as buttons, free text when allowed, `onSkip?` (Continue without answering), `onDefer?` (Keep waiting).
3. `variant: "panel" | "card"` (Observer board "Needs you", inboxes).
4. `presentInteraction` accepts a raw wait or a `ReplayInteraction` (`replay_view_v1.interaction` shape:
   kind, run_id, wait_key, step_id, prompt, choices, allow_free_text, details, tool_calls, command). The type
   is the seam; no gateway on `main` serves it yet; no `/view` fetch.
5. Pending detection, short term: every app uses `useWorkflowSession` (hybrid ledger + served `waiting`).

## What the apps delete
Observer wait modal `app.tsx:6802-6973` (~170) + resume/execute (~65) + `AskForm` (45) + `runtime_extractors.ts` (31)
+ `NeedsYouActions` (41 → card variant); Flow waits pane + approval footer (~290), wait/approval state in
`useWebSocket.ts` (~250), `waitClassification.ts` (87), approval part of `AssistantTestCard.tsx` (~40);
Assistant web `WaitCard` (45) + `run_events.ts` fold (333); Entity gains a panel it never had (and the
`waiting` bug is fixed by `useWorkflowSession`); Note the same.

## Gateway routes relied on
`POST commands {type:"resume", payload:{wait_key, payload:{approved|answer}}}`, `POST commands {type:"emit_event"}`,
`GET runs/{id}` (`waiting`), `GET runs?status=waiting`. Entity visits: `POST entities/{name}/visit/{run_id}/decision`.
Later: `replay_view_v1.interaction.command`.

## Gateway gaps
- One boolean answers a whole approval batch; no per-call answer.
- No defer / session semantics server-side (they stay client-side).
- The replay view has no route on any gateway branch.

## Acceptance
- [ ] Wording set, new callbacks (rendered only when injected), card variant and `ReplayInteraction` input pinned
      by `check_present_interaction.mjs`; each confirmed red once.
- [ ] `approveAllScope` default is neutral; the "Gateway account" assertion is gone from the kit.
- [ ] Docs: api.md, adoption-guide row "Questions and approvals".
- [ ] App adoption PRs (Observer, Flow, Assistant web, Entity, Note) with the deletions above.

## Non-goals
Server-side approval policy (gateway `/tool-grants`); the tool-selection layering (0033).
