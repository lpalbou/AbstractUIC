# Proposed: tool-approval defaults — one served source (three drifted copies today)

## Metadata
- Created: 2026-07-12
- Status: Proposed
- Completed: N/A

## ADR status
- Governing ADRs: None
- ADR impact: None

## Context
Census gap-check (2026-07-12): the tool approve/ask default sets exist in
THREE packages and already DISAGREE — a security-relevant divergence, not a
style one.

## Current code reality
- `abstractruntime/.../tool_executor.py:773-814` — authoritative: puts
  `send_email`/`send_whatsapp_message` in REQUIRE_APPROVAL (exfil/spam risk),
  auto-approves `agora_*`.
- `abstractuic/ui-kit/src/tool_policy_editor.tsx:51-75` — the kit mirror
  (now labeled #FALLBACK; server-declared `default_approval` per ToolSpec
  wins since 2026-07-11): auto-approves `send_email`/`send_whatsapp`, omits
  `agora_*`/`shell_*` — the drift the label warns about has already happened.
- `abstractassistant/.../core/tool_policy.py:9-43` — a third full copy,
  agreeing with the stale kit values, not with runtime.

## Proposed direction
One source, served: gateway's tool discovery surfaces per-tool
`default_approval` derived from runtime's authoritative policy (the 2026-02-21
decision already has the gateway applying runtime defaults server-side — this
exposes them on the wire). Kit consumes via the existing `default_approval`
ToolSpec field; the kit mirror demotes to themeless-fallback only; the
assistant deletes its copy in favor of the runtime import it already
#FALLBACKs to. Lanes: gateway (serve), assistant (delete copy), uic (done —
the field shipped 2026-07-11).

## Why it might matter
The copies disagree on whether outbound email/WhatsApp sends need approval —
whichever client the operator uses silently changes a safety default.

## Promotion criteria
Gateway confirms serving `default_approval` in the discovery payload;
assistant seat takes the copy deletion.

## Non-goals
Changing WHAT the defaults are (runtime's word stands); building a new
component.
