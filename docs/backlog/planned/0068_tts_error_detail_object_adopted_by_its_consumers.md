# Planned: the typed-error fix for read-aloud reaches its consumers with the next ui-kit release

## Metadata
- Created: 2026-10-29
- Status: Planned. The kit side is merged unreleased (no version bump tonight); consumers get it by bumping their pin.
- Area: ui-kit (`src/use_gateway_voice.ts`: `streamTtsJsonl` failure text, new export `ttsErrorDetail`)
- Related: 0066 (same adoption pattern); AbstractGateway #47 (the gateway also sends a plain `detail` string)

## Summary
When `/voice/tts/stream` failed, `streamTtsJsonl` rendered the answer as `String(data.detail)`. The gateway's typed
answers carry `detail: {reason_code, message, ...}`, so the thin clients showed "[object Object]". The kit now uses
`detail.message` when `detail` is an object, keeps a string `detail` unchanged, and falls back to `HTTP <status>`.
Check: `scripts/check_voice_stream.mjs`.

## Consumers (pick it up on the next ui-kit release by bumping `@abstractframework/ui-kit`)

| Consumer | Uses `streamTtsJsonl` in |
|---|---|
| AbstractCode web | `web/src/workspace/voice_tools.tsx` |
| AbstractObserver | `src/ui/observer_voice.tsx` |
| AbstractEntity | `src/entity_voice.tsx` |
| AbstractContinuum | `src/ui/team_page.tsx` |
| AbstractGateway console | the vendored islands bundle (`console_islands.py`, re-synced from the released kit) |

## Acceptance
- ui-kit is published with `ttsErrorDetail` at a version above 0.9.5.
- Each consumer bumps its pin, or re-syncs for the console. A typed 409 reads as its message sentence.
