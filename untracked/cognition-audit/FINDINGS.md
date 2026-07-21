# Cognition-monitor fear-spike audit — findings (uic seat, 2026-07-18)

Operator defect: strong FEA petal + fear tooltip over a benign travel-logistics
reply. Reproduced, root-caused, fixed, regression-pinned. No commits (standing rule).

## Scripts in this dir

- `repro.mjs` — live repro: screenshot text (whole + per-sentence) + controls,
  prints emo[] AND raw whitened sims/mu/margins. Run: `node repro.mjs`.
- `calibrate.mjs` — winning-sim separations across 14 texts (emotional short/long/FR,
  subtle, neutral short/long/topical, performed-calm) + embedder determinism check.
- `proto_probe.mjs` — raw sims of caution/hazard/neutral vocabulary vs each prototype.
- `before_after.mjs` — the defect cases through the REAL vendored scorer; run before
  and after the fix (`before.txt`, `after.txt` captured).
- `make_fixture.mjs` — froze the live embeddings into
  `abstractentity/src/fixtures/cognition_gate_vectors.json` for offline tests.

## Key numbers (v0 basis, live qwen3-embedding-0.6b, deterministic cos=1.000000)

Winning raw whitened-space sims:
- Neutral texts: 0.061 (screenshot tail), 0.066 (reconstructed full reply),
  0.078 (long report), 0.101 (weather sentence), 0.139 (meeting), 0.164 (recipe)
- Genuinely emotional: 0.249 (subtle worry), 0.281 (tender), 0.312 (sad),
  0.358 (joy long), 0.487 (fear FR), 0.572 (fear control), 0.679 (joy control)
- One deliberate overlap: 0.224 storm-caution sentence (hazard-TOPIC vocabulary —
  basis defect, see below)

Before the fix the panel rendered (emo values): weather sentence fear=0.609 top,
reconstructed full reply fear=0.488 top (raw sim 0.066, margin over joy 0.015!),
storm caution fear=0.882, "meeting at 3pm" calm=0.825/tenderness=0.533.

## Root causes

1. CONFIRMED (primary): relative mean-subtraction + small emotion_scale (0.1456)
   manufactures confident winners from noise. No abstention existed anywhere
   (scorer emits raw relative emo; panel feeds emotions straight into
   setBloomTargets; the 0.18 floor gates only the header dot).
2. CONFIRMED (secondary, picks the winner): fear prototype sits near hazard-topic
   vocabulary — "storm" 0.220, "danger" 0.355, "the storm is coming" 0.231; NOT
   near caution verbs ("preserve enough battery" −0.044). Stance-vs-topic (the
   0026 backlog's known limitation). Basis v1 re-cut territory, not code.
3. RULED OUT: register mapping (id-keyed; empirically each of the 8 scorer ids
   lands on its own kit register, GRV stays 0 — no off-by-one possible since
   setBloomTargets keys by id, never index).
4. RULED OUT: aggregation/stale-stick (scorer emits explicit values for all 8
   every score → springs glide down; inline panel scores exactly the shown
   assistant reply, cache keyed by text, no EMA/max-hold on emotions).
5. RULED OUT: scoring the operator's words (chat_drawer filters
   role==="assistant" for latestReply AND focusMsg; harvest splits exchange
   verbatims with fail-safe last-boundary semantics).

Note: the exact screenshot TAIL alone scores fear=0.097 (joy wins 0.393) — the
strong FEA petal requires the fuller message with the weather-hazard head
(reconstruction scored fear=0.488 top). Both shapes are fixed by the gate.

## Fix

`abstractentity/src/vendor/cognition/cognition_scorer.js` (+ .d.ts, vendor README)
— the only live scorer copy (no canonical copy exists in abstractuic; verified).
Absolute-evidence abstention gate: emo *= clamp01((maxRawSim − floor)/ramp),
floor = ramp = basis.emotion_scale (derived from the basis's own spread stat —
re-cut bases recalibrate automatically). Additive: emotionMaxSim/emotionEvidence
diagnostics; abstention:{floor:-1} = legacy. Channels/novelty untouched.

## After (same texts)

screenshot tail / reconstructed full / weather sentence / meeting: ALL registers 0
(evidence 0). Storm caution: fear 0.473 (mild tilt survives; topic-vocab basis
limit, < the 0.75 "strong lean" threshold). Fear control: fear 0.998 top,
evidence 1. Joy control: joy 1.0, fear 0. Performed calm: calm 0.998 (honest —
reads words, not inner state).

## Tests

- NEW `abstractentity/src/cognition_scorer_gate.test.ts` (10 tests) over frozen
  live fixtures — benign abstains, controls spike, contract additive, legacy
  reachable, channels untouched. 
- Full entity suite: 30 files, 306 passed | 1 skipped. tsc --noEmit clean.
- ui-kit gate: green (no tracked uic changes; belt check).
