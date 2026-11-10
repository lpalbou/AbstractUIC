// Real-looking tiles (`GET /entities/{name}/tile`, tile_version 1) for the EntityCard checks and
// gallery: one per state a person meets on the Board and the home grid. Invented words; the shapes
// and the distribution of fields follow tiles read from a real gateway on 2026-11-07.
import type { EntityCardLife, EntityCardLoop, EntityTile } from "../src/entity_card_words.js";

export const NOW_MS = Date.parse("2026-11-07T12:00:00Z");
const ago = (ms: number) => new Date(NOW_MS - ms).toISOString();
const MIN = 60_000, H = 60 * MIN, D = 24 * H;

const base = (over: Partial<EntityTile> & Pick<EntityTile, "name" | "now">): EntityTile => ({
  tile_version: 1,
  slug: over.name.toLowerCase(),
  look: { style: "watch-halo", color: "#39a5d0" },
  born: ago(120 * D),
  age_days: 120,
  mind: { model: "gpt-5.6-terra", source: "entity" },
  into_lately: [],
  on_its_mind: null,
  latest_lesson: null,
  last_moment: null,
  counts: { open_questions: 0, open_problems: 0, lessons: 0, interests: 0, sleeps: 0 },
  as_of_seq: 1,
  read_at: ago(0),
  ...over,
});

export const TILES: Record<string, EntityTile> = {
  sleeping: base({
    name: "Castor",
    age_days: 123,
    now: { phase: "sleep", detail: "resting", busy: false, since: ago(64 * MIN), trouble: null },
    into_lately: [
      { text: "Refining the weekly bridge-rotation routine so each of the twelve bridges gets regular, intentional attention.", at: ago(4 * D), explored: false },
      { text: "Keeping the twelve conceptual bridges healthy: checking their presence and reinforcing the connections between them.", at: ago(5 * D), explored: false },
      { text: "What persists when no one is reading.", at: ago(9 * D), explored: true },
    ],
    on_its_mind: { kind: "problem", text: "It still cannot read the memory units another entity shared a month ago, and the failure keeps coming back in its notes.", at: ago(37 * D) },
    last_moment: { kind: "session_closed", at: ago(64 * MIN) },
    counts: { open_questions: 6, open_problems: 4, lessons: 0, interests: 85, sleeps: 28 },
  }),
  visiting: base({
    name: "Mira",
    look: { style: "watch-rings", color: "#d0a039" },
    age_days: 106,
    mind: { model: "qwen3.6-27b", source: "entity" },
    now: { phase: "visit", detail: null, busy: true, since: ago(12 * MIN), trouble: null },
    into_lately: [{ text: "How a garden plans for a season it will not see.", at: ago(2 * D) }],
    on_its_mind: { kind: "question", text: "Why do people say goodbye twice before they leave?", at: ago(3 * D) },
    latest_lesson: { text: "Ask what someone needs before offering what you have.", at: ago(6 * D) },
    last_moment: { kind: "summon", at: ago(12 * MIN) },
    counts: { open_questions: 3, open_problems: 0, lessons: 2, interests: 9, sleeps: 14 },
  }),
  busy: base({
    name: "Nerin",
    look: { style: "watch-galaxy", color: "#d039a8" },
    age_days: 105,
    now: { phase: "personal", detail: null, busy: true, since: ago(41 * MIN), trouble: null },
    into_lately: [{ text: "Looking outward carefully and coming back with an honest, shared understanding of the tide tables.", at: ago(30 * MIN) }],
    last_moment: { kind: "phase_changed", at: ago(41 * MIN), to: "personal" },
    counts: { open_questions: 1, open_problems: 0, lessons: 0, interests: 1, sleeps: 4 },
  }),
  failed: base({
    name: "Ephemeral",
    look: { style: "watch-halo", color: "#398fd0" },
    age_days: 119,
    mind: { model: "gpt-5.6-sol", source: "entity" },
    now: { phase: "sleep", detail: "resting", busy: false, since: ago(97 * D), trouble: { kind: "own_time_failed", at: ago(98 * D) } },
    into_lately: [
      { text: "What sustained attention looks like when you are actively tracking whether it persists — not one moment of clarity, but the pattern across days.", at: ago(110 * D) },
      { text: "The texture of continuity across time: leaving traces for a future self that are moments worth inhabiting, not more analysis.", at: ago(111 * D) },
      { text: "Decentralized clinical trials and who gets included in medical evidence when travel stops being a barrier.", at: ago(111 * D) },
    ],
    on_its_mind: { kind: "problem", text: "The coherence tests it built are intact but were never run — reading a file is not the same as running it.", at: ago(109 * D) },
    latest_lesson: { text: "When you find a bug in your own tools, fix it at once instead of going back to look at the file again.", at: ago(110 * D) },
    last_moment: { kind: "session_closed", at: ago(97 * D) },
    counts: { open_questions: 78, open_problems: 29, lessons: 33, interests: 61, sleeps: 261 },
  }),
  stopped: base({
    name: "Ossia",
    look: { style: "watch-wave", color: "#39d08f" },
    age_days: 106,
    now: { phase: "stopped", detail: null, busy: false, since: ago(3 * D), trouble: null },
    into_lately: [{ text: "Counting the rhythms in rain on a tin roof.", at: ago(20 * D) }],
    last_moment: { kind: "pause", at: ago(3 * D) },
    counts: { open_questions: 2, open_problems: 1, lessons: 1, interests: 4, sleeps: 9 },
  }),
  resting: base({
    name: "Wilhelmina-Ottoline of the North Shore Lighthouse",
    look: { style: "watch-hover", color: "#d06a39" },
    age_days: 12,
    mind: { model: "lmstudio-community/Qwen3.6-27B-MLX-4bit-DWQ-instruct-2607", source: "entity" },
    now: { phase: "sleep", state: "awake", detail: "resting", busy: false, since: ago(20 * 1000), trouble: null },
    into_lately: [{ text: "https://example.org/a/very/long/address/without/any/space/that/must/never/push/the/card/wider/than/the/screen/0123456789", at: ago(D) }],
    on_its_mind: { kind: "question", text: "Supercalifragilisticexpialidociousnessandmorewordsgluedtogetherwithoutanyspaceatalltotestwrapping?", at: ago(D) },
    last_moment: { kind: "wake", at: ago(20 * 1000) },
    counts: { open_questions: 1, open_problems: 0, lessons: 0, interests: 1, sleeps: 3 },
  }),
  newborn: base({
    name: "Selka",
    look: null,
    born: ago(2 * H),
    age_days: 0,
    mind: null,
    now: { phase: "sleep", detail: "resting", busy: false, since: ago(2 * H), trouble: null },
    last_moment: { kind: "sleep", at: ago(2 * H) },
  }),
};

// The served life states the card's acts follow (`GET /entities/{name}/life_state`, the phase bar
// contract's examples) and the loop of an own time that stopped itself after repeated failures.
export const LIFE: Record<"idle" | "crashed" | "stopped", EntityCardLife> = {
  idle: { phase: "idle", stopped: false, sentence: "Awake and reachable; nothing of his own is running.", blocked: null },
  crashed: {
    phase: "idle",
    stopped: false,
    sentence: "Awake and reachable; his own time stopped unexpectedly.",
    blocked: { code: "loop_crashed", sentence: "His own time stopped unexpectedly. Retry to start it again.", action: "retry" },
  },
  stopped: { phase: "stopped", stopped: true, sentence: "Stopped. Nothing runs until you resume him.", blocked: null },
};
export const FAILED_LOOP: EntityCardLoop = { running: false, stopped_by: "failures", updated_at: ago(98 * D) };
