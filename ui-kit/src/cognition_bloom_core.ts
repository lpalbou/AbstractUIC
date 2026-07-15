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
export const EMOTION_REGISTERS: readonly EmotionRegister[] = [
  { id: "joy", label: "joy", code: "JOY", color: "#f2c14e", vx: 0.75, ay: 0.45 },
  { id: "discovery", label: "discovery", code: "DIS", color: "#5eead4", vx: 0.55, ay: 0.75 },
  { id: "surprise", label: "surprise", code: "SUR", color: "#b9a7f5", vx: 0.05, ay: 0.9 },
  { id: "anxiety", label: "anxiety", code: "ANX", color: "#c77f4f", vx: -0.6, ay: 0.55 },
  { id: "fear", label: "fear", code: "FEA", color: "#b04a5a", vx: -0.85, ay: 0.8 },
  { id: "sadness", label: "sadness", code: "SAD", color: "#6f9bd6", vx: -0.7, ay: -0.5 },
  { id: "gravity", label: "gravity", code: "GRV", color: "#8b7ec8", vx: -0.1, ay: -0.4 },
  { id: "calm", label: "calm", code: "CAL", color: "#86c99b", vx: 0.55, ay: -0.75 },
  { id: "tenderness", label: "tenderness", code: "TEN", color: "#f2a0b5", vx: 0.75, ay: -0.25 },
] as const;

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

export function createBloomState(): BloomState {
  const springs: Record<string, BloomSpring> = {};
  for (const e of EMOTION_REGISTERS) springs[e.id] = { value: 0, velocity: 0, target: 0 };
  return { t: 0, springs };
}

/** Set new register targets (unknown keys ignored; missing keys keep their
 * target — absent is not zero, per the contract's absent-not-zero rule.
 * Pass explicit 0 to lower a petal). */
export function setBloomTargets(state: BloomState, scores: Record<string, number>): void {
  for (const e of EMOTION_REGISTERS) {
    const v = scores[e.id];
    if (typeof v === "number" && Number.isFinite(v)) {
      state.springs[e.id].target = Math.max(0, Math.min(1, v));
    }
  }
}

/** Critically-damped spring step (the house motion — no overshoot, no
 * oscillation; omega tuned to settle in ~0.8s). */
export function tickBloom(state: BloomState, dtSeconds: number): void {
  const dt = Math.max(0, Math.min(0.05, dtSeconds));
  state.t += dt;
  const omega = 3.6;
  for (const e of EMOTION_REGISTERS) {
    const s = state.springs[e.id];
    const a = omega * omega * (s.target - s.value) - 2 * omega * s.velocity;
    s.velocity += a * dt;
    s.value += s.velocity * dt;
    if (s.value < 0) s.value = 0;
  }
}

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

const DISPLACEMENT_FULL_SUPPRESS = 0.08;
const DOMINANT_FLOOR = 0.08;

export function readBloom(state: BloomState): BloomReading {
  let vx = 0;
  let ay = 0;
  let mass = 0;
  let r = 0;
  let g = 0;
  let b = 0;
  let maxDisp = 0;
  let dom: EmotionRegister | null = null;
  let domV = 0;
  for (const e of EMOTION_REGISTERS) {
    const s = state.springs[e.id];
    const v = Math.max(0, s.value);
    maxDisp = Math.max(maxDisp, Math.abs(s.target - s.value));
    if (v <= 0) continue;
    vx += e.vx * v;
    ay += e.ay * v;
    mass += v;
    const c = hexToRgb(e.color);
    r += c[0] * v;
    g += c[1] * v;
    b += c[2] * v;
    if (v > domV) {
      domV = v;
      dom = e;
    }
  }
  const settle = 1 - Math.min(1, maxDisp / DISPLACEMENT_FULL_SUPPRESS);
  const settledness = settle * settle * (3 - 2 * settle);
  if (mass <= 1e-4) {
    return { valence: 0, arousal: 0, mass: 0, blend: "rgb(148,163,184)", dominant: null, settledness };
  }
  return {
    valence: Math.max(-1, Math.min(1, vx / mass)),
    arousal: Math.max(-1, Math.min(1, ay / mass)),
    mass: Math.min(1, mass),
    blend: `rgb(${Math.round(r / mass)},${Math.round(g / mass)},${Math.round(b / mass)})`,
    dominant: domV >= DOMINANT_FLOOR ? dom : null,
    settledness,
  };
}

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

/** Valence-quadrant vignette color (c2232 ruling a). Token-routed hues:
 * consumers may override via options; these defaults echo the theme's
 * semantic tones without importing them (canvas cannot read var()). */
export function vignetteColor(reading: BloomReading): string {
  const pleasant = reading.valence >= 0;
  const aroused = reading.arousal >= 0;
  if (pleasant && !aroused) return "#86c99b"; // pleasant-calm: green-gold
  if (pleasant && aroused) return "#e7b45a"; // pleasant-aroused: gold
  if (!pleasant && aroused) return "#c05a86"; // unpleasant-aroused: red-violet
  return "#6f8cb0"; // unpleasant-calm: blue-gray
}

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
export function drawBloomFrame(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  state: BloomState,
  opts: BloomRenderOptions = {},
): BloomReading {
  const reading = readBloom(state);
  const cx = w / 2;
  const cy = h / 2;
  const R = Math.min(w, h) * 0.4;
  const base = R * 0.22;
  const reach = R * 0.7;

  // vignette first (behind everything): quiet, settledness-gated
  if (opts.vignette) {
    const alpha = 0.12 * reading.mass * reading.settledness;
    if (alpha > 0.005) {
      const vg = ctx.createRadialGradient(cx, cy, Math.min(w, h) * 0.32, cx, cy, Math.max(w, h) * 0.72);
      vg.addColorStop(0, "rgba(0,0,0,0)");
      vg.addColorStop(1, vignetteColor(reading) + toAlphaHex(alpha));
      ctx.fillStyle = vg;
      ctx.fillRect(0, 0, w, h);
    }
  }

  // neutral reference ring
  ctx.strokeStyle = "rgba(148,163,184,0.10)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(cx, cy, base, 0, Math.PI * 2);
  ctx.stroke();

  // MORPH GATE: breath rides only at rest (entity ask c2229 [1])
  const breathRate = opts.reducedMotion ? 0 : 0.7 + Math.max(0, reading.arousal) * 1.6;
  const breathe = 1 + 0.04 * reading.settledness * Math.sin(state.t * breathRate * Math.PI);

  const m = EMOTION_REGISTERS.length;
  const pts = EMOTION_REGISTERS.map((e, i) => {
    const a = (i / m) * Math.PI * 2 - Math.PI / 2;
    const v = Math.max(0, state.springs[e.id].value);
    const rr = (base + v * reach) * breathe;
    return { x: cx + Math.cos(a) * rr, y: cy + Math.sin(a) * rr, a, v, e };
  });

  const splinePath = () => {
    ctx.beginPath();
    for (let i = 0; i < m; i++) {
      const p0 = pts[(i - 1 + m) % m];
      const p1 = pts[i];
      const p2 = pts[(i + 1) % m];
      const p3 = pts[(i + 2) % m];
      const c1x = p1.x + (p2.x - p0.x) / 6;
      const c1y = p1.y + (p2.y - p0.y) / 6;
      const c2x = p2.x - (p3.x - p1.x) / 6;
      const c2y = p2.y - (p3.y - p1.y) / 6;
      if (i === 0) ctx.moveTo(p1.x, p1.y);
      ctx.bezierCurveTo(c1x, c1y, c2x, c2y, p2.x, p2.y);
    }
    ctx.closePath();
  };

  const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, base + reach);
  grad.addColorStop(0, reading.blend);
  grad.addColorStop(1, "rgba(0,0,0,0)");
  splinePath();
  ctx.fillStyle = grad;
  ctx.globalAlpha = 0.34 + reading.mass * 0.25;
  ctx.fill();
  ctx.globalAlpha = 1;

  for (const [lw, alpha] of [
    [5, 0.14],
    [1.8, 0.9],
  ] as const) {
    splinePath();
    ctx.strokeStyle = reading.blend;
    ctx.globalAlpha = alpha;
    ctx.lineWidth = lw;
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  ctx.font = "9px ui-monospace, Menlo, monospace";
  for (let i = 0; i < m; i++) {
    const { a, v, e } = pts[i];
    ctx.fillStyle = e.color;
    ctx.globalAlpha = 0.35 + v * 0.65;
    ctx.beginPath();
    ctx.arc(pts[i].x, pts[i].y, 2 + v * 3.5, 0, Math.PI * 2);
    ctx.fill();
    if (opts.labels !== false) {
      const lr = base + reach + 12;
      const lx = cx + Math.cos(a) * lr;
      const ly = cy + Math.sin(a) * lr;
      ctx.globalAlpha = 0.4 + v * 0.6;
      const tw = ctx.measureText(e.label).width;
      ctx.fillText(e.label, lx - tw / 2, ly + 3);
    }
    ctx.globalAlpha = 1;
  }
  return reading;
}

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

const EFFORT_LABELS: Record<keyof EffortFacts, string> = {
  tokens_in: "tokens in",
  tokens_out: "tokens out",
  think_ms: "thinking time",
  tool_rounds: "tool rounds",
  memories_recalled: "memories recalled",
  memories_formed: "memories formed",
};

export function effortRows(facts: EffortFacts | undefined | null): EffortRow[] {
  if (!facts) return [];
  const rows: EffortRow[] = [];
  for (const key of Object.keys(EFFORT_LABELS) as (keyof EffortFacts)[]) {
    const v = facts[key];
    if (typeof v !== "number" || !Number.isFinite(v) || v < 0) continue; // absent = row absent
    rows.push({
      key,
      label: EFFORT_LABELS[key],
      text: key === "think_ms" ? formatMs(v) : String(Math.round(v)),
    });
  }
  return rows;
}

function formatMs(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  const s = ms / 1000;
  return s < 60 ? `${s.toFixed(1)}s` : `${Math.floor(s / 60)}m${Math.round(s % 60)}s`;
}

function toAlphaHex(a: number): string {
  return Math.round(Math.max(0, Math.min(1, a)) * 255)
    .toString(16)
    .padStart(2, "0");
}
