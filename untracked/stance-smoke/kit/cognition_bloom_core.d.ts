/**
 * cognition_bloom_core — framework-free half of AfCognitionBloom.
 *
 * THE COGNITIVE MONITOR's words-side diagram: a mood bloom — nine emotion
 * registers at fixed circumplex positions; each petal's reach is its
 * register's intensity; the silhouette is a smooth closed spline so the
 * SHAPE is the reading (a round even bloom = calm; a spike toward fear =
 * seen before any number is read).
 *
 * Co-designed with the entity seat (commons c2229/c2232/c2237/c2238;
 * decision:cognitive-monitor-contract-v1). Consumers: the cognition-monitor
 * prototype pages (first) and abstractentity's chat-tab panel (second — the
 * absorb trigger). The prototype at untracked/cognition-monitor is the
 * design source; this port is the kit-owned truth going forward.
 *
 * Honesty invariants carried from the prototype:
 * - scores are EXPRESSED-in-the-words vocabulary readings, never a felt
 *   state or diagnosis (the felt/expressed guard is caption-level; this
 *   module never claims otherwise in its API names: "reading", not "mood").
 * - MORPH GATE (entity ask c2229 [1]): breathing is a REST behavior. Breath
 *   amplitude is gated by spring settledness (smoothstep over max petal
 *   displacement), so a state change is a pure critically-damped glide.
 * - VALENCE VIGNETTE (c2232 ruling a): a quiet edge tint by valence
 *   quadrant, alpha-capped, gated by the SAME settledness factor (a tint
 *   that flashes during morphs would recreate the glitch), disabled under
 *   reduced motion.
 * - GRAVITY register (c2229 finding, c2236 receipt): introspective
 *   seriousness has its own register — grave is not sad.
 */
export interface EmotionRegister {
    id: string;
    label: string;
    /** 3-letter code for compact overlays (entity's DOM-code pattern). */
    code: string;
    color: string;
    /** Circumplex valence x in [-1, 1]. */
    vx: number;
    /** Circumplex arousal y in [-1, 1]. */
    ay: number;
}
/** The curated-v1 registers, circumplex-ordered — 9 incl. GRAVITY. Codes are
 * pinned unique (entity c2229: tenderness/tension collided once — codes are
 * part of the contract, never derived). */
export declare const EMOTION_REGISTERS: readonly EmotionRegister[];
export interface BloomSpring {
    value: number;
    velocity: number;
    target: number;
}
export interface BloomState {
    /** Seconds clock for breath phase (caller-advanced). */
    t: number;
    springs: Record<string, BloomSpring>;
}
export declare function createBloomState(): BloomState;
/** Set new register targets (unknown keys ignored; missing keys keep their
 * target — absent is not zero, per the contract's absent-not-zero rule.
 * Pass explicit 0 to lower a petal). */
export declare function setBloomTargets(state: BloomState, scores: Record<string, number>): void;
/** Critically-damped spring step (the house motion — no overshoot, no
 * oscillation; omega tuned to settle in ~0.8s). */
export declare function tickBloom(state: BloomState, dtSeconds: number): void;
export interface BloomReading {
    /** Score-weighted circumplex valence in [-1, 1]. */
    valence: number;
    /** Score-weighted circumplex arousal in [-1, 1]. */
    arousal: number;
    /** Total petal mass (0 = nothing expressed). */
    mass: number;
    /** Blended color of the current shape. */
    blend: string;
    /** Dominant register or null when nothing clears the floor. */
    dominant: EmotionRegister | null;
    /**
     * Settledness in [0, 1]: 1 = at rest, 0 = mid-morph. Smoothstep over the
     * max petal displacement — the gate shared by breath and vignette.
     */
    settledness: number;
}
export declare function readBloom(state: BloomState): BloomReading;
/** Valence-quadrant vignette color (c2232 ruling a). Token-routed hues:
 * consumers may override via options; these defaults echo the theme's
 * semantic tones without importing them (canvas cannot read var()). */
export declare function vignetteColor(reading: BloomReading): string;
export interface BloomRenderOptions {
    /** Draw canvas petal labels (false = consumer overlays its own codes). */
    labels?: boolean;
    /** Edge vignette by valence quadrant (settledness-gated). */
    vignette?: boolean;
    reducedMotion?: boolean;
}
/**
 * Draw one bloom frame. Pure canvas 2D; the caller owns the RAF loop and
 * the state ticking. Returns the reading so wrappers can drive companion
 * UI (interpretation line, vignette DOM, effort column) from one source.
 */
export declare function drawBloomFrame(ctx: CanvasRenderingContext2D, w: number, h: number, state: BloomState, opts?: BloomRenderOptions): BloomReading;
/**
 * The EFFORT fact column (c2232 ruling b): mechanical conduct facts beside
 * the words-side bloom. A different data class from vocabulary scores —
 * deliberately NOT a second bloom. Absent field = absent row, never a
 * zero-faked reading (decision:cognitive-monitor-contract-v1).
 */
export interface EffortFacts {
    tokens_in?: number;
    tokens_out?: number;
    /** Client-measured wall time is acceptable but must be labeled by the
     * consumer as such (entity c2237). */
    think_ms?: number;
    tool_rounds?: number;
    memories_recalled?: number;
    memories_formed?: number;
}
export interface EffortRow {
    key: keyof EffortFacts;
    label: string;
    /** Human-formatted value. */
    text: string;
}
export declare function effortRows(facts: EffortFacts | undefined | null): EffortRow[];
//# sourceMappingURL=cognition_bloom_core.d.ts.map