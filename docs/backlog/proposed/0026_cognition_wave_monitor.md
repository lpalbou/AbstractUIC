# 0026 — Cognition wave monitor (monitor-cognition package)

- **State**: proposed (working prototype exists — operator-directed experiment 2026-07-14)
- **Owner**: uic
- **Source**: operator vision (2026-07-13 23:51, Mnemosyne-linked): waves representing the
  content of text — the cognition of an AI — the way waveforms represent audio; a small
  monitor informing on an AI's cognitive state from the text it generates.

## Prototype

`untracked/cognition-monitor/` — a static test page with THREE candidate widget forms over
one shared physics core, replaying a 20-utterance narrative arc (Castor-inspired) with
precomputed embeddings (qwen3-embedding-0.6b via LMStudio):

- V1 Scope (five phosphor traces — diagnostic form)
- V2 Interference (one composite superposition — "one mind, many currents"; low clarity
  injects phase noise so confusion visibly decoheres the line)
- V3 Rings (breathing radial form — presence over instrument)

Scoring: contrast anchor axes (5 channels: valence/tension/reflection/warmth/clarity;
8-10 first-person anchors per pole; anchor-gain calibration with dilution 0.45) +
novelty (adjacent-utterance embedding distance, range-recentered). Chrome-verified:
calm-warm vs distress vs repair moments render distinctly across all three forms.

## Adversary folds (three fable5 rounds, 2026-07-14)

- **Semantics (A)**: contrast pairs are the validated construction (representation-
  engineering / CCS precedent); anchors must match the corpus register (first-person
  assistant); pole-similarity > 0.95 = undifferentiated channel (quality gate, printed);
  per-session z-norm REJECTED for a monitor (flat must mean calm); novelty calibrated
  against adjacent-pair range, not random pairs; multilingual = v2 (French anchor twins —
  Castor speaks FR/EN); the honest-framing sentence is mandatory (reads text style, not
  inner state; performed calm scores calm).
- **Visual (B)**: semantic frequency assignment (valence slow, tension high-freq jitter);
  signed values need more than recoloring (position + cold-pole desaturation + inverted
  ring lobes); interpolation-between-utterances is decorative and must be legible as such
  (utterance markers/ripples); "breathing while disconnected is a dishonest alive-claim";
  V1 most diagnostic, V2 most beautiful/least legible long-term, V3 most "watching a mind".
- **API (C)**: SCORES-ONLY privacy contract — the widget never receives text (text →
  embed → scores → dropped host-side; the diary-privacy lesson applied); framework-free
  core (`step(state, dt)` deterministic, node-testable) + React wrapper; embed() injected;
  eventual package = `monitor-cognition` beside monitor-gpu/monitor-flow (NOT ui-kit, NOT
  panel-chat); provenance label default-on; RAF hygiene (visibility pause, dt clamp,
  StrictMode-safe handles).

## Promotion criteria

1. Operator picks a direction (one form or a mode prop) from the test page.
2. Package `monitor-cognition`: `cognition_wave_core.ts` (channels, scoring, stepper) +
   `CognitionWaveMonitor` (canvas React component) + node tests (stepper determinism,
   score math against fixture embeddings) + README with the honesty contract.
3. Anchor sets versioned with the package; embedder identity pinned in the replay/live
   contract (the M1 lesson: never mix embedding spaces silently).
4. Live consumer path: entity app (visit drawer sidecar), observer (run page lane) —
   scores computed host-side via the gateway embeddings route.
