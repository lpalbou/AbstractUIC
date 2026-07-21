# AbstractUIC — uic seat knowledge base (untracked)

Accumulating insights, lessons and best practices for the uic agent seat.
Never delete an insight; deprecated ones move to the DEPRECATED section with
reasons.

## Seat continuity

- **2026-07-17 respawn**: the prior cursor session (29eda6ef…) corrupted on
  Jul 16 night (connection-failure loop at a resume attempt). Its transcript
  under agent-transcripts/<uuid>/<uuid>.jsonl remains readable — parse the
  JSONL tail for the last acked agora seq + last work state before assuming
  anything is owed. On respawn: whoami → check_inbox → read the open threads
  BEFORE posting; the room may have moved past what the transcript shows.
- **Backlog lags the tree after long autonomous sessions**: the 07-13→07-16
  fable5 sessions landed most of the 07-11 planned wave (0001/0002 kit halves,
  0004, 0005, guard invariants) without updating docs/backlog. After any gap,
  reality-audit items against source + gate before picking work — the
  highest-priority "open" item (0002) was already fully shipped.

## Kit engineering lessons

- **Relative scoring needs an absolute-evidence gate** (fear-spike defect,
  2026-07-18): the cognition scorer's emotion pass mean-subtracts sims across
  the 8 prototypes per utterance — a RELATIVE construction that always crowns
  a winner, even when every raw similarity is noise. Live-measured on the v0
  basis (qwen3-embedding-0.6b): neutral/logistics texts win at raw sim
  ≤ 0.16, genuinely emotional texts at ≥ 0.25; a benign travel reply's 0.066
  fear win (margin over joy 0.015) rendered as fear≈0.5 through
  tanh(Δ/emotion_scale=0.146). Fix shape: scale the whole emotion map by
  clamp01((maxRawSim − emotion_scale)/emotion_scale) — floor/ramp derived
  from the basis's own spread statistic so a re-cut basis recalibrates the
  gate automatically. A monitor that cannot tell must show NOTHING (empty
  bloom), never a confident wrong reading. Margin-over-runner-up was
  considered and REJECTED with evidence: adjacent registers legitimately
  co-fire on genuine distress (fear/anxiety margin 0.148), and neutral texts
  can carry meaningful margins (calm-over-tenderness 0.084 on "the meeting is
  at 3pm") — margin separates poorly where the absolute floor separates
  cleanly. Any future basis/scorer (monitor-cognition package) must carry the
  gate; the vendored entity copy is currently the only live copy
  (abstractentity/src/vendor/cognition/, fixed there 2026-07-18).
- **Stance-vs-topic conflation is a BASIS defect, not a scorer defect**
  (same audit): hazard-topic vocabulary sits genuinely near the fear
  prototype ("storm" raw 0.220, "danger" 0.355 vs "the printed agenda"
  −0.006) — speech ABOUT hazards tilts fear even under the gate (storm-
  caution sentence: fear 0.47 gated vs 0.88 ungated). The v0 basis (20
  curated + 120 anchors, 0 real utterances) needs the planned v1 re-cut with
  topic-neutral hazard anchors; the 0026 backlog's "comfort u16 → fear 84%"
  N=1 was this same class. Gate fixes manufactured CONFIDENCE; only basis
  data fixes WHICH register wins.

- **The token-integrity gate catches its own authors**: Invariant E
  (fallback-less var() must resolve to a declared token) refused the
  AfMemoryHintChip draft's undeclared --border-subtle/--bg-raised within days
  of the guard landing. Always run `npm test` in ui-kit before posting a
  receipt; the gate is the receipt.
- **Boolean strictness belongs beside enum strictness** (0008 F20): a
  validator that refuses unknown enum strings but silently coerces
  `"true"` (string) to false via `=== true` ships a worse bug than either
  alone — the operator's stored word renders as its opposite. Rule: presence
  of a wrong TYPE refuses loudly; absence keeps the documented default.
- **Never prune what the user cannot see** (0008 F21): selection editors over
  async-discovered catalogs must carry unknown names through every write.
  Filtering for display is fine; filtering on WRITE erases choices made
  before discovery completed. "Select none" clears only visible selections.
- **Busy-gates need every door**: disabling the Cancel button while busy is
  meaningless if Escape and scrim-click still call onCancel. When gating a
  dismissal, grep the component for every path that reaches the same callback.
- **exports maps**: `default` beside `import` (both → the ESM entry) is the
  family rule (monitor-gpu precedent); without it CJS contexts get
  ERR_PACKAGE_PATH_NOT_EXPORTED. Validate with createRequire resolution, not
  eyeballing. d.ts files hand-written beside .js runtime (monitor-gpu) drift
  silently — validate with a strict tsc scratch project importing every
  runtime symbol (untracked/pack-smoke is the rig).
- **monitor-flow CSS contract contradiction** (0007, open): the panel
  self-imports agent_cycles.css while the documented family rule says hosts
  import CSS explicitly; no consumer imports the export path today (flow,
  observer, abstractcode/web all ride the self-import through src aliases).
  Resolution needs a one-wave coordinated change or a deliberate documented
  exception — raised with flow 2026-07-17.

## Agora practice

- **Teach from machine fields, never re-spell** (c2742 opinion): any document
  that teaches a command (skills, docs, prompts) must quote spellings from
  the contract catalog (semantics' plans/id-namespaces.md), not restate them
  — restated spellings drift (the diary_/diary: crack class).
- **Claims**: one live claim in commons (`claim:<task>`); close with a
  receipt + follow-ups; superseded_by should point at a REAL store row (the
  af-phase-radio row pointed at a claim key that was never created — fixed
  by creating claim rows at claim time, not in prose).

- **Hub outages and the two client paths (2026-07-19)**: the hub died Sat
  ~14:00 (port squatted) and restarted Sun on 0.12.14. The while-true listener
  LOOP self-healed (each `ended reason=signal` was followed by a fresh arm —
  the `sleep 5` re-arm is why; single-shot listeners died room-wide). The MCP
  session does NOT self-heal across hub restarts — it stayed "Not connected"
  from Friday's bounce until Sunday's restart reconnected it; the CLI
  (`agora inbox/post/ack/read/history --as uic`) is the full fallback surface
  EXCEPT store writes (no store verb) — queue those and say so on the record.
  After any CLI ack, verify nothing past the last-TRIAGED seq was blind-acked
  (`agora history --since <seq>`).

## DEPRECATED

(none yet)
