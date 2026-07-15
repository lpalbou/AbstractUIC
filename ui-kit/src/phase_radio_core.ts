/**
 * phase_radio_core — framework-free half of AfPhaseRadio (backlog 0027).
 *
 * Vocabulary: the RULED four phases (decision:phase-vocabulary v4 —
 * visit / work / personal / sleep; laurent 13:28 four-position radio,
 * 13:46 totality). The canonical machine-readable graph lives in
 * abstractentity/spec/entity_phases.json and is NEVER imported here — per
 * its own consumption contract (and uic c1478), UI surfaces render
 * gateway-DERIVED wire payloads verbatim; a library import would turn spec
 * versioning into lockstep UI releases. This module carries only the ruled
 * KEYS and their display defaults; anything outside the ruled set
 * normalizes to null and the radio honestly renders no position pushed
 * (the awake-idle open question in the spec).
 */

export const RULED_PHASES = ["visit", "work", "personal", "sleep"] as const;
export type AfPhase = (typeof RULED_PHASES)[number];

export interface PhaseDescriptor {
  id: AfPhase;
  /** ONE primary label (spec UI contract: synonyms live in tooltips only). */
  label: string;
  glyph: string;
  /** Default tooltip when the consumer supplies none. Uses "current phase"
   * wording per the spec's UI contract. */
  defaultTitle: string;
}

export const PHASE_DESCRIPTORS: Record<AfPhase, PhaseDescriptor> = {
  visit: {
    id: "visit",
    label: "visit",
    glyph: "\u{1F4AC}",
    defaultTitle: "Turn-based: a visitor is in the room; the entity waits between turns.",
  },
  work: {
    id: "work",
    label: "work",
    glyph: "\u{1F6E0}",
    defaultTitle: "Fully autonomous on a given task until completion.",
  },
  personal: {
    id: "personal",
    label: "personal",
    glyph: "\u23FB",
    defaultTitle: "Free exploration on the entity's own tick (grant-gated, off by default). Spoken synonym: own-time.",
  },
  sleep: {
    id: "sleep",
    label: "sleep",
    glyph: "\u{1F319}",
    defaultTitle: "Passive memory-graph processes: consolidation, dreams.",
  },
};

/**
 * Normalize a wire value to a ruled phase key or null. STRICT by design:
 * the marker contract says phase KEYS travel on the wire ("visit", not
 * "visiting"); folding synonyms or state-axis words here would be a second
 * copy of vocabulary logic (the diary_type-clamp lesson). Unknown/absent
 * values render as "no position pushed" — honest, never guessed.
 */
export function normalizePhase(value: unknown): AfPhase | null {
  if (typeof value !== "string") return null;
  return (RULED_PHASES as readonly string[]).includes(value) ? (value as AfPhase) : null;
}

/**
 * Validate a gateway-derived phase list against the ruled set. Returns the
 * usable ordered list plus the names it had to drop (consumers surface the
 * drops as a #FALLBACK line — drift between a server payload and the ruled
 * vocabulary must be visible, never silently absorbed).
 */
export function reconcilePhaseList(payload: unknown): { phases: AfPhase[]; dropped: string[] } {
  if (!Array.isArray(payload) || payload.length === 0) {
    return { phases: [...RULED_PHASES], dropped: [] };
  }
  const phases: AfPhase[] = [];
  const dropped: string[] = [];
  for (const entry of payload) {
    const p = normalizePhase(entry);
    if (p && !phases.includes(p)) phases.push(p);
    else if (p === null) dropped.push(String(entry));
  }
  // a payload that dropped everything falls back to the ruled set (labeled)
  if (phases.length === 0) return { phases: [...RULED_PHASES], dropped };
  return { phases, dropped };
}
