# 0021 — Delete-the-forks wave (kit already ships all five)

- **State**: proposed
- **Owner**: uic (coordination; the edits live in consumer trees)
- **Source**: framework-wide ownership census, fable5 adversary 2026-07-13 (evening pass)

## Problem

Five app-local copies remain of components the kit already ships — the absorption work is
done, only the import swaps are missing. Cheapest possible drift reduction.

## The five

| Fork | App | Kit replacement |
|---|---|---|
| `Select.tsx` (the pre-absorption AfSelect fork; 4 files still import it) | abstractflow | `AfSelect` (absorbed flow's features 2026-07-12) |
| Local `JsonViewer` | abstractflow | panel-chat `JsonViewer` (backlog 0003 lane) |
| Local `use_gateway_voice` copy | abstractobserver | `useGatewayVoice` (absorbed 2026-07-13) |
| `provider_model_picker.tsx` | abstractcontinuum | `ProviderModelPicker` (absorbed 2026-07-13; adoption already agreed c1551/c1558) |
| Local `fetchGatewayConnection` | abstractflow | kit connection helpers / `useGatewayConnection` |

## Proposal

File one ask per app naming file paths; each swap is S-effort. Kit-side work: none expected;
answer integration questions same-day.

## Acceptance

- Each fork deleted in its consumer tree; consumer builds green on the kit import.
