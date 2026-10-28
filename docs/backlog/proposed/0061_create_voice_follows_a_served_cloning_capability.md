# Proposed: "Create a voice" follows a served cloning capability

## Metadata
- Created: 2026-10-28
- Status: Proposed
- Area: ui-kit (`voice_settings.tsx` `CreateVoicePanel`), AbstractGateway / AbstractVoice (capability)
- Found by: operator QA (k), 2026-10-28

## Summary
"Create a voice" (From a description / From a recording) renders whenever the host injects `voiceLibrary` /
`createVoice` (by design: creation is host-injected, ADR 0001 §2). On a gateway with no cloning engine (no
Qwen3-TTS Base / OmniVoice / F5) and no VoiceDesign checkpoint, the panel is offered and the gateway refuses with a
sentence (501). The panel should hide each mode the gateway cannot serve. There is no served signal today:
AbstractVoice reports `controls.voice_clone.supported: true` statically (`abstractcore_plugin.py:3541`, `:4657`) and
`unavailable_providers.cloning` lists only refusals it knows. Route: AbstractVoice serves the available cloning engines
and whether VoiceDesign is installed; the gateway passes them through `voice/voices`; the kit hides the mode
when the served value says unavailable, and keeps it (with the gateway's sentence on failure) when the field is absent.

## Open decision
- Field name and shape (gateway seat + media seat).
