# Planned: provider / model / reasoning / speculation picker — gateway default first, named

## Metadata
- Created: 2026-10-27
- Status: Planned — kit half MERGED (PR #6): `gateway_models.ts`, named gateway default, served ladders, compact layout, pinned, "(saved)"; app adoption PRs pending
- Completed: N/A
- Area: ui-kit (`ProviderModelPicker`, `gateway_models.ts`, `gateway_paths.ts`, island)
- Root link: AbstractFramework backlog 1055

## ADR status
- Governing ADRs: ADR 0001 (§2, §4)
- ADR impact: none beyond implementation

## Summary
One picker for provider, model, reasoning effort and speculation (MTP) depth that shows the
gateway default first with its resolved value in words, gates reasoning and depth by served
capabilities only, keeps a saved value the model no longer advertises visible as "(saved)",
and offers a compact layout for node panels; plus the three helpers the apps copied.

## Why (audit `tools-and-models.md` §A.4, §B.2, §C.2, §D)
- The kit's segment puts "Gateway default" first but never names it (`provider_model_picker.tsx:50-51, 188-191`);
  only Entity shows "Gateway default: p · m" through a local hint; the desktop names it
  ("Gateway default (derived from …): p/m", `route_editor.py:531-558`).
- Three copies of `gatewayTextDefault` (Code `model_discovery.ts:27-41`, Flow `useExecutionCapabilities.ts:4-11`,
  `AuthoringAssistantDrawer.tsx:535-546`); Flow gates reasoning with a model-name regex
  (`utils/thinkingControls.ts:15-26`); Continuum has its own `ReasoningSelect` (tri-state); the console hardcodes two
  different reasoning ladders and writes `require_acceleration: strict(false)` where the kit writes `true`.
- Observer's launch picker is a raw `<select>` with no default fetch; Note wraps `ProviderModelSelect` in a local row.

## Kit half
1. `gateway_models.ts`: `gatewayTextDefault(capabilityDefaults)` (reasoning from `routes[output.text].reasoning`,
   MTP from `routes[input.text].options.speculation`), `createGatewayModelTransport(request)`
   (`discovery/providers`, `discovery/providers/{p}/models?capability_route=output.text`,
   `discovery/models/capabilities`, `config/capability-defaults`), `withRunModel(input_data, value, {topLevelPins})`.
2. `ProviderModelPicker` props: `fetchGatewayDefault`, `reasoningLadder` (from `discovery/capabilities`),
   `unknownReasoning: "hide" | "allow-override"`, `layout: "segmented" | "compact"`, `pinned`.
   Default segment: "Gateway default · {provider} / {model} · reasoning {r} · MTP depth n". "(saved)" label.
3. Paths in `gateway_paths.ts`; `mountProviderModelPicker` gains the new props.

## What the apps delete
Code inline fetchers (~20) + unused `fetchDefaultModel`; Observer `ProviderModelSelect` + raw selects (~36);
Entity `mindDefaultHint` (~6) + discovery fetchers (~23); Flow `thinkingControls.ts` (70), `useExecutionCapabilities.ts`
(27), agent block (~120), llm_call block (~180), authoring drawer selects (~58); Continuum `ReasoningSelect` (~98);
Note `ModelRow` (~69); console Sandbox + Defaults-modal selects (~130) → island.

## Gateway routes relied on
`GET discovery/providers`, `GET discovery/providers/{p}/models`, `GET discovery/models/capabilities`,
`GET discovery/capabilities`, `GET config/capability-defaults`, `POST runs/start` (`_runtime.{provider,model,thinking,speculation}`).

## Gateway gaps
No single default record (`discovery/defaults/text` → {provider, model, reasoning, speculation, source});
no batch capabilities per provider; `thinking` not validated at run start; no per-account model preference.

## Acceptance
- [ ] `check_gateway_models.mjs`; `check_route_picker.mjs` extended (default named first, "(saved)", compact,
      pinned, unknownReasoning); each confirmed red once.
- [ ] No model-name heuristic anywhere in the kit (grep pinned).
- [ ] Docs: api.md, adoption-guide row "Provider + model pickers".
- [ ] App adoption PRs with the deletions above; console `strict=false` divergence decided.

## Non-goals
Server-side persistence of the model choice (a gateway gap, not a kit job).
