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

## v3 distinctiveness wave + v3.2 mindset widgets (2026-07-14)

Operator watched the v2 replay: "not enough distinctive movement to notice." Root
cause MEASURED: raw qwen3 embeddings are anisotropic (mean pairwise cos 0.41) —
contrast scores compressed + correlated. Second adversary round (signal + perception):

- **Scoring pipeline (kept)**: anisotropy whitening (all-but-top-1: pairwise cos
  0.41→−0.05, channel spread ×1.35–1.55) → axes = PC1 of the paired anchor
  differences (Bolukbasi construction) → Löwdin orthogonalization (killed the
  measured warmth/tension r=−0.85 mirror; max inter-axis |cos| = 0.000) →
  median/MAD spread-normalize. Movement (mean |Δ|/utterance) rose ~0.15→0.60-0.90.
  Plus "current" = conversation PC1 (the data's own most distinctive axis).
- **Rendering ruling (operator, 2026-07-14 01:10)**: v3's sawtooth/square waveforms,
  under-damped overshoot, and transition flashes REVERTED — "smooth curves, always";
  amplitude + continuity + aesthetics. Scoring stayed. Cold poles keep per-channel
  hues (the gray-collapse fix survives the revert).
- **Mindset register (v3.2, operator: "smile, cry, fear, surprise, anxiety,
  discovery — things we can read on faces")**: eight emotion prototypes
  (joy/discovery/surprise/anxiety/fear/sadness/calm/tenderness), each the whitened
  centroid of ~5 first-person anchors; per-utterance-centered relative similarity,
  positive part, p85-scaled. Three NEW widgets: V4 Aura (circumplex orb — blend
  color, mood-leaning position, arousal-paced breath), V5 River (emotion braid over
  time, tanh-compressed), V6 Bloom (petal flower, shape-readable flinch/smile).
  Verified reads: distress→fear 95%, gratitude→tenderness 97%, closing→calm 91%.
- **Named limitation**: speech ABOUT fear reads as fear (comfort u16 → fear 84%) —
  N=1 stance-vs-topic; queued attack = qwen3 instructed re-embedding (adversary A).
- **Parked with measurements**: turning angle (flat ~118°±8 at utterance rate),
  recurrence/return (max 0.36, sparse + semantically right — "dream ← wonder");
  candidates for a live monitor over longer histories.

## v3.3 — twelve forms (operator round 3, 2026-07-14 02:21)

Operator read of the six: Bloom + Aura most readable, River plain, channel forms
too abstract. Directive: six MORE, two mandated 3D variants, research-grounded.
Shipped (research: EmotionScope/emotion-qwen orb mappings; ISD 2024 speed↔arousal
validation; syuzhet/Reagan story arcs; Emosaic VAD→color; Chernoff-face lineage):
V7 Iso Scope (isometric volumetric ridges), V8 Wave Field (3D water surface,
top-right camera), V9 Visage (minimal face — mouth=valence, eyes=arousal,
brows=worry/fear, tear=deep sadness), V10 Arc (story-shape journey), V11
Murmuration (flock character), V12 Aurora (additive light curtains). All twelve
share one spring state; chrome-verified at five moments incl. a full-journey
playback (arc/river/iso show the whole conversation's shape).

## Live-use lane (entity first consumer, c1791→c1825)

Entity app is the first consumer (their harvest adapter turns Castor's real
utterance text — visit replies, diary via the operator door, episode verbatims —
into the sample shape; reply-only + sealed-diary-never-read test-pinned on their
side). Delivery ruling (c1807): kit function + shipped frozen basis + INJECTED
embed() — no bespoke gateway endpoint. SHIPPED (c1825):

- `cognition_scorer.js` — framework-free live scorer; consumes `basis_vN.json`;
  M1 refusals (embedder-id mismatch, wrong dim) throw loudly; wandering is the
  one session-relative output (reset() per conversation).
- `data/basis_v0.json` — frozen basis v0.1.0 (qwen3-embedding-0.6b @1024,
  whitening mean+PC1, Löwdin axes, med/MAD norms, emotion protos + p85 scale),
  provenance-labeled `calibrated_on: {curated_arc: 20, castor_utterances: 0}`.
- `test_scorer.mjs` — JS↔python parity on shipped fixtures (1e-6), refusals,
  session-state reset. Green.
- Corpus pull ruling (c1824): operator-driven client-side via entity's adapter
  (marker-first — diary reads must land in Castor's replay stream; their privacy
  filters are already the tested product). Basis v1 re-cut on real text when the
  pull lands; every re-cut = version bump + visible label, never silent.

## Promotion criteria

1. Operator picks a direction (one form or a mode prop) from the test page.
2. Package `monitor-cognition`: `cognition_wave_core.ts` (channels, scoring, stepper) +
   `CognitionWaveMonitor` (canvas React component) + node tests (stepper determinism,
   score math against fixture embeddings) + README with the honesty contract.
3. Anchor sets versioned with the package; embedder identity pinned in the replay/live
   contract (the M1 lesson: never mix embedding spaces silently).
4. Live consumer path: entity app (visit drawer sidecar), observer (run page lane) —
   scores computed host-side via the gateway embeddings route.
