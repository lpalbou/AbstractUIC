import type { AvatarPose } from "./avatar_renderer.js";

/** Browser ports of AbstractAssistant's Orb.swift / OrbScenes.swift and OrbWeave.swift.
 * The Watch's point planet and phase targets are deliberately separate from the shaded
 * Rust avatars. No inference, audio capture, network, or invented voice signal lives here. */
export const APPLE_AVATARS = [
  { id: "watch-halo", name: "Halo", family: "Apple Watch", watchCode: "A", description: "A turning planet of light; voice becomes a flowing corona." },
  { id: "watch-vortex", name: "Vortex", family: "Apple Watch", watchCode: "B", description: "Points gather into two spiral arms, inward to listen and outward to speak." },
  { id: "watch-nebula", name: "Nebula", family: "Apple Watch", watchCode: "C", description: "A star cloud with a bright core, three coloured lobes and wisps." },
  { id: "watch-rings", name: "Rings", family: "Apple Watch", watchCode: "D", description: "Six turning geodesic rings, with running lights while working." },
  { id: "watch-liquid", name: "Liquid", family: "Apple Watch", watchCode: "E", description: "A planet whose surface rolls in travelling waves." },
  { id: "watch-galaxy", name: "Galaxy", family: "Apple Watch", watchCode: "F", description: "A dense core with two spreading arms of stars." },
  { id: "iphone-weave", name: "Woven orb", family: "iPhone", watchCode: "", description: "Five mint and lavender cords become a geodesic sphere or a raised hand." },
] as const;
export type AppleAvatarDesign = typeof APPLE_AVATARS[number];
export const isAppleAvatar = (id: string): boolean => APPLE_AVATARS.some((d) => d.id === id);
const TAU = 2 * Math.PI;
const clamp = (n: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, n));
const fract = (n: number) => n - Math.floor(n);
const smooth = (a: number, b: number, n: number) => { const u = clamp((n - a) / (b - a)); return u * u * (3 - 2 * u); };
const hash = (n: number, salt: number) => fract(Math.sin(n * 127.1 + salt * 311.7) * 43758.5453);
type Point = { x: number; y: number; z: number; lum: number; seed: number; phase: number; band: number; anchor: boolean };
const POINTS: readonly Point[] = Array.from({ length: 1600 }, (_, i) => {
  const jitter = .7 / Math.sqrt(1600);
  const u = clamp(fract(.5 + i * .7548776662466927) + (hash(i, 15) - .5) * jitter);
  const v = fract(.5 + i * .5698402909980532) + (hash(i, 16) - .5) * jitter;
  const y = 1 - 2 * u, r = Math.sqrt(Math.max(0, 1 - y * y)), a = TAU * v;
  const x = r * Math.cos(a), z = r * Math.sin(a);
  const land = .5 + .5 * Math.sin(1.9 * x + Math.sin(1.4 * z)) * Math.cos(2.2 * y - .8 * z);
  return { x, y, z, lum: .45 + .55 * smooth(.25, .7, land), seed: hash(i, 11), phase: TAU * hash(i, 12), band: Math.floor(hash(i, 13) * 9), anchor: i % 6 === 0 };
});
// OrbPalette.defaultHues: cyan, indigo, violet and rose, five light levels each.
const HUES = [["#0369a1", "#0284c7", "#38bdf8", "#7dd3fc", "#e0f2fe"], ["#3730a3", "#4f46e5", "#6366f1", "#8b9cf8", "#dbe1ff"], ["#6b21a8", "#9333ea", "#a855f7", "#c084fc", "#eedcff"], ["#9d174d", "#db2777", "#f472b6", "#f9a8d4", "#fff1f2"]];
const POSES: AvatarPose[] = ["ready", "listening", "thinking", "working", "speaking", "waiting", "error"];

/** Smoothed phase weights and real input level; time accumulates rather than jumping with a pose. */
export class AppleAvatarEngine {
  private weights = [1, 0, 0, 0, 0, 0, 0];
  private previous: number | null = null;
  private level = 0;
  private turn = 0;
  private swirl = 0;
  private readonly dots = new Float64Array(POINTS.length * 5);

  draw(ctx: CanvasRenderingContext2D, size: number, design: string, pose: AvatarPose, level: number, time: number, still = false): void {
    if (!isAppleAvatar(design) || !POSES.includes(pose)) throw new Error("Unknown Apple avatar or activity state");
    if (![size, level, time].every(Number.isFinite) || size < 1 || size > 1536) throw new Error("Invalid Apple avatar frame");
    const first = this.previous === null;
    const dt = first ? 0 : clamp(time - this.previous!, 0, .2);
    this.previous = time;
    const target = POSES.indexOf(pose);
    const mix = first || still ? 1 : 1 - Math.exp(-dt / .28);
    for (let i = 0; i < this.weights.length; i++) this.weights[i] += ((i === target ? 1 : 0) - this.weights[i]) * mix;
    const input = pose === "listening" || pose === "speaking" ? clamp(level) : 0;
    this.level += (input - this.level) * (first || still ? 1 : 1 - Math.exp(-dt / (input > this.level ? .045 : .2)));
    this.turn += dt * (.12 + 1.1 * this.weights[2] + 2 * this.weights[3]);
    this.swirl += dt * (this.weights[1] + this.weights[4]) * (.2 + 1.4 * this.level);
    ctx.clearRect(0, 0, size, size);
    ctx.save();
    if (design === "iphone-weave") this.weave(ctx, size, time);
    else if (design === "watch-rings") this.rings(ctx, size, time);
    else this.planet(ctx, size, design, time);
    ctx.restore();
  }

  private planet(ctx: CanvasRenderingContext2D, size: number, design: string, t: number) {
    const [rest, listen, think, work, speak, wait, error] = this.weights;
    const R = size * .23, cx = size / 2, cy = size / 2;
    const yaw = .08 * t + .36 * this.turn, tilt = .41;
    const voiced = listen + speak, inward = voiced > .001 ? listen / voiced : .5;
    const engagement = clamp(voiced + .6 * think + .9 * work);
    const signal = voiced * (.12 + .88 * this.level);
    const buckets = Array.from({ length: 20 }, () => [] as number[]);
    for (let i = 0; i < POINTS.length; i++) {
      const p = POINTS[i];
      const xx = p.x * Math.cos(yaw) + p.z * Math.sin(yaw), zz = -p.x * Math.sin(yaw) + p.z * Math.cos(yaw);
      const yy = p.y * Math.cos(tilt) - zz * Math.sin(tilt), z = p.y * Math.sin(tilt) + zz * Math.cos(tilt);
      let x = xx * (1 - .08 * think), y = yy * (1 - .08 * think);
      const lit = Math.max(0, x * -.55 + y * -.35 + z * .76);
      let brightness = (.22 + .68 * lit) * p.lum * (.22 + .78 * smooth(-.25, .15, z));
      brightness += .3 * Math.pow(1 - Math.min(1, Math.abs(z)), 3) * p.lum;
      let hue = clamp(.08 + .5 * (1 - lit) + .28 * smooth(.1, 1.1, .5 * x + .85 * y));
      const r = Math.max(.001, Math.hypot(x, y)), a = Math.atan2(y, x), u = p.seed;
      let tx = x, ty = y, light = 0;
      let blend = engagement * smooth(.5 - signal, 1 - signal, .72 * r + .28 * p.seed);
      // Rest remains the same turning planet on the Watch; the voice reveals each design.
      if (design === "watch-halo") {
        const flow = inward * fract(u - .4 * t) + (1 - inward) * fract(u + .4 * t);
        const stream = Math.pow(.5 + .5 * Math.sin(5 * a + .3 * t), 3) + .35 * Math.pow(.5 + .5 * Math.sin(8 * a - .2 * t), 5);
        const reach = .2 + .8 * this.level + .38 * think + .6 * work;
        const rr = .97 + (reach * stream + .12) * Math.pow(flow, 1.5);
        tx = Math.cos(a) * rr; ty = Math.sin(a) * rr; light = .28 + .5 * stream * (1 - flow); hue = .12 + .8 * flow;
      } else if (design === "watch-vortex") {
        const lh = 1.1 * this.level, rr = .55 + (.75 + .5 * lh) * u * (1 - .18 * inward);
        const angle = p.band % 2 * Math.PI + (3 - 1.4 * Math.min(1, lh) + .9 * inward) * Math.log(rr / .55) + .6 * this.swirl + .12 * t + .4 * this.turn;
        tx = Math.cos(angle) * rr; ty = Math.sin(angle) * rr; light = .45 * (1 - .5 * u); hue = .08 + .87 * u;
      } else if (design === "watch-nebula") {
        const g = Math.sqrt(-2 * Math.log(1 - .84 * p.seed)), gx = g * Math.cos(p.phase), gy = g * Math.sin(p.phase);
        if (p.band <= 1) { tx = .24 * (1 + .3 * this.level) * gx; ty = .24 * (1 + .3 * this.level) * gy; light = .15 + .7 * Math.exp(-g * g / 2); hue = .03 + .12 * g; }
        else if (p.band <= 6) {
          const j = p.band % 3, angle = TAU * j / 3 + .5 + .03 * t, c = .42 * (1 + .55 * this.level), lobe = .3 * (1 + .4 * this.level);
          tx = c * Math.cos(angle) + lobe * gy * Math.cos(angle) - 1.5 * lobe * gx * Math.sin(angle);
          ty = c * Math.sin(angle) + lobe * gy * Math.sin(angle) + 1.5 * lobe * gx * Math.cos(angle);
          light = .04 + .48 * Math.exp(-g * g / 2); hue = [.36, .62, .86][j];
        } else { const rr = .3 + .95 * u; const angle = 2.3 + 3.1 * (p.band % 2) + .03 * t + 1.9 * u; tx = rr * Math.cos(angle); ty = rr * Math.sin(angle); hue = .5 + .35 * u; light = .32 * (1 - .6 * u); }
      } else if (design === "watch-liquid") {
        const lift = (.06 + .14 * this.level + .04 * work) * (Math.sin(3 * x + 2 * y - 1.2 * t) + .5 * Math.sin(4 * z - 2 * y + 1.7 * t));
        tx = x * (1.12 + .22 * this.level + lift); ty = y * (1.12 + .22 * this.level + lift); light = .3 + 2 * Math.max(0, lift); hue = clamp(hue + 2.2 * lift);
      } else {
        let gr = p.band === 0 ? .3 * Math.pow(p.seed, .6) : Math.min(1.7, -.55 * Math.log(1 - .96 * p.seed)) + .08;
        let angle = p.band <= 2 ? p.phase : p.band % 2 * Math.PI + 2.3 * Math.log(gr + .08) + (hash(i, 4) - .5) * .6;
        angle -= this.swirl * (.8 / (.3 + gr)) + t * .04 + .4 * this.turn;
        gr *= 1 + .3 * this.level; tx = Math.cos(angle) * gr; ty = Math.sin(angle) * gr * .6; light = p.band === 0 ? .9 : .35; hue = p.band === 0 ? 0 : .1 + .8 * smooth(.15, 1.6, gr);
      }
      if (p.anchor) blend *= .15;
      // Thinking winds in; tools launch moving light rings. Waiting holds a quiet amber planet.
      blend = Math.max(blend, (think * .6 + work * .8) * (p.anchor ? .15 : 1));
      x += (tx - x) * blend; y += (ty - y) * blend;
      brightness += blend * light + .45 * work * Math.pow(Math.max(0, Math.cos(8 * r - 5 * t)), 12);
      brightness *= 1 - .3 * wait;
      const index = i * 5;
      this.dots[index] = cx + x * R;
      this.dots[index + 1] = cy + y * R;
      this.dots[index + 2] = Math.max(.55, size / 270) * (.7 + .6 * clamp(brightness));
      const hi = Math.min(3, Math.floor(clamp(hue) * 4)), bi = Math.min(4, Math.floor(clamp(brightness) * 5));
      this.dots[index + 3] = brightness;
      buckets[hi * 5 + bi].push(index);
    }
    ctx.globalCompositeOperation = "lighter";
    for (let b = 0; b < buckets.length; b++) {
      ctx.beginPath();
      for (const i of buckets[b]) ctx.rect(this.dots[i], this.dots[i + 1], this.dots[i + 2], this.dots[i + 2]);
      ctx.fillStyle = error > .5 ? "#ff5968" : wait > .5 ? "#ffc46e" : HUES[Math.floor(b / 5)][b % 5];
      ctx.globalAlpha = .2 + .16 * (b % 5);
      ctx.shadowColor = ctx.fillStyle; ctx.shadowBlur = b % 5 >= 3 ? size / 180 : 0; ctx.fill();
    }
    // A working orbit is evidence of tools, not simulated microphone loudness.
    if (work > .01) for (let i = 0; i < 3; i++) { const a = t * 1.5 + TAU * i / 3; ctx.globalAlpha = work * .7; ctx.fillStyle = "#a5b4fc"; ctx.beginPath(); ctx.arc(cx + Math.cos(a) * R * 1.65, cy + Math.sin(a) * R * .65, size / 230, 0, TAU); ctx.fill(); }
    void rest;
  }

  private rings(ctx: CanvasRenderingContext2D, size: number, t: number) {
    const [, listen, think, work, speak, wait, error] = this.weights;
    const R = size * .23, turn = this.turn, tilt = .42 + .1 * Math.sin(t * .21);
    ctx.globalCompositeOperation = "lighter"; ctx.lineWidth = Math.max(.7, size / 310);
    for (let ring = 0; ring < 6; ring++) {
      const angle = ring * Math.PI / 6, swing = .04 * Math.sin(t * (.4 + ring * .15)) + .3 * think * Math.sin(1.4 * t + ring) + .45 * work * Math.sin(3 * t - ring * Math.PI / 3);
      const radius = .97 + (listen + speak) * (.62 * this.level - .22);
      for (let segment = 0; segment < 100; segment++) {
        const point = (j: number) => {
          const a = TAU * j / 100, v = Math.sin(a), x = radius * Math.cos(a), y = radius * v * Math.cos(angle + swing), z = radius * v * Math.sin(angle + swing);
          const bx = x * Math.cos(turn) + z * Math.sin(turn), bz = -x * Math.sin(turn) + z * Math.cos(turn);
          return [size / 2 + bx * R, size / 2 + (y * Math.cos(tilt) - bz * Math.sin(tilt)) * R, bz];
        };
        const a = point(segment), b = point(segment + 1);
        ctx.strokeStyle = error > .5 ? "#ff5968" : wait > .5 ? "#ffc46e" : HUES[ring % 4][3];
        ctx.globalAlpha = .2 + .65 * smooth(-1, 1, a[2]);
        ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
        if (Math.cos(5 * (TAU * segment / 100 - t * (.1 + .05 * ring) - work * 3 * t)) > .94) { ctx.globalAlpha = .9; ctx.strokeStyle = "#e0f2fe"; ctx.stroke(); }
      }
    }
  }

  private weave(ctx: CanvasRenderingContext2D, size: number, time: number) {
    const [, listen, think, work, speak, hand, error] = this.weights;
    const geo = clamp(listen + think), stop = work, energy = this.level * (listen + speak);
    const projected = MESH.vertices.map((v) => project(v, time));
    const perCord = MESH.edges.length / 5;
    ctx.lineCap = "round"; ctx.lineJoin = "round";
    for (let edgeIndex = 0; edgeIndex < MESH.edges.length; edgeIndex++) {
      const [ai, bi] = MESH.edges[edgeIndex], a = projected[ai], b = projected[bi];
      const cord = edgeIndex % 5, section = Math.floor(edgeIndex / 5);
      ctx.beginPath();
      for (let sample = 0; sample <= 8; sample++) {
        const fraction = sample / 8, along = (section + fraction) / perCord, angle = along * TAU;
        const ripple = energy * (.19 * Math.sin(angle * 3 + time * 3 + cord * 1.7) + .075 * Math.sin(angle * 7 - time * 3));
        const exponent = 2 / (2 + 5 * stop);
        const px = Math.sign(Math.cos(angle)) * Math.pow(Math.abs(Math.cos(angle)), exponent) * (.53 + cord * .055 + energy * .16) * .5 * (1 + ripple);
        const py = Math.sign(Math.sin(angle)) * Math.pow(Math.abs(Math.sin(angle)), exponent) * (.39 + energy * .33 + stop * .16) * .5 * (1 + ripple);
        const rotation = (cord * 34 + time * 9 + energy * (cord - 2) * 28) * Math.PI / 180;
        const x = .5 + px * Math.cos(rotation) - py * Math.sin(rotation), y = .5 + px * Math.sin(rotation) + py * Math.cos(rotation);
        const gx = .5 + (a[0] + (b[0] - a[0]) * fraction) * .57, gy = .5 + (a[1] + (b[1] - a[1]) * fraction) * .57;
        const hp = handPoint(along, cord, time), sum = Math.max(1, hand + geo), h = hand / sum, g = geo / sum;
        const X = (x * (1 - g - h) + gx * g + hp[0] * h) * size, Y = (y * (1 - g - h) + gy * g + hp[1] * h) * size;
        if (!sample) ctx.moveTo(X, Y); else ctx.lineTo(X, Y);
      }
      const depth = (a[2] + b[2] + 2) / 4;
      ctx.lineWidth = Math.max(.65, size / 88) * (.75 + depth * .5 + hand * .3);
      ctx.strokeStyle = error > .5 ? "#ff5968" : hand > .5 ? "#ff9c33" : cord % 2 === 0 ? "#6be3cc" : "#ada6ff";
      ctx.globalAlpha = .35 + clamp(depth) * .55; ctx.stroke();
    }
  }
}

type Vertex = readonly [number, number, number];
function normal(x: number, y: number, z: number): Vertex { const n = Math.hypot(x, y, z); return [x / n, y / n, z / n]; }
function project(v: Vertex, t: number): Vertex {
  const yaw = t * 1.9, pitch = t * .83 + .4, a = v[0] * Math.cos(yaw) + v[2] * Math.sin(yaw), b = -v[0] * Math.sin(yaw) + v[2] * Math.cos(yaw);
  const ry = v[1] * Math.cos(pitch) - b * Math.sin(pitch), rz = v[1] * Math.sin(pitch) + b * Math.cos(pitch), k = 1 / (1.4 - rz * .22);
  return [a * k, ry * k, rz];
}
const MESH = (() => {
  const phi = (1 + Math.sqrt(5)) / 2, vertices: Vertex[] = [];
  for (const a of [-1, 1]) for (const b of [-phi, phi]) vertices.push(normal(0, a, b), normal(a, b, 0), normal(b, 0, a));
  const edges: [number, number][] = [], seen = new Set<string>(), mids = new Map<string, number>();
  const key = (a: number, b: number) => `${Math.min(a, b)}:${Math.max(a, b)}`;
  const near = (a: number, b: number) => vertices[a].reduce((sum, v, i) => sum + (v - vertices[b][i]) ** 2, 0) < 1.11;
  const middle = (a: number, b: number) => { const k = key(a, b); if (mids.has(k)) return mids.get(k)!; const n = vertices.length; vertices.push(normal(vertices[a][0] + vertices[b][0], vertices[a][1] + vertices[b][1], vertices[a][2] + vertices[b][2])); mids.set(k, n); return n; };
  for (let a = 0; a < 12; a++) for (let b = a + 1; b < 12; b++) if (near(a, b)) for (let c = b + 1; c < 12; c++) if (near(a, c) && near(b, c)) {
    const ab = middle(a, b), bc = middle(b, c), ca = middle(c, a);
    for (const [u, v] of [[a, ab], [ab, b], [b, bc], [bc, c], [c, ca], [ca, a], [ab, bc], [bc, ca], [ca, ab]]) if (!seen.has(key(u, v))) { seen.add(key(u, v)); edges.push([u, v]); }
  }
  return { vertices, edges };
})();
// OrbWeave.hand: rounded twice and resampled by distance, preserving the iPhone silhouette.
const HAND = (() => {
  let points = [[.38,.90],[.31,.78],[.22,.67],[.13,.56],[.13,.51],[.17,.48],[.21,.50],[.29,.60],[.29,.28],[.31,.22],[.35,.22],[.38,.25],[.38,.48],[.40,.49],[.41,.16],[.43,.11],[.47,.11],[.50,.15],[.50,.46],[.52,.47],[.53,.22],[.55,.17],[.59,.17],[.62,.21],[.62,.51],[.64,.52],[.65,.34],[.67,.29],[.71,.30],[.74,.34],[.74,.65],[.72,.75],[.65,.83],[.63,.90]];
  for (let pass = 0; pass < 2; pass++) points = points.flatMap((a, i) => { const b = points[(i + 1) % points.length]; return [[a[0] * .75 + b[0] * .25, a[1] * .75 + b[1] * .25], [a[0] * .25 + b[0] * .75, a[1] * .25 + b[1] * .75]]; });
  const distances = [0]; for (let i = 0; i < points.length; i++) { const a = points[i], b = points[(i + 1) % points.length]; distances.push(distances[i] + Math.hypot(b[0] - a[0], b[1] - a[1])); }
  return Array.from({ length: 240 }, (_, i) => { const d = distances[distances.length - 1] * i / 240; const j = Math.max(0, distances.findIndex((n) => n > d) - 1), a = points[j], b = points[(j + 1) % points.length], u = (d - distances[j]) / Math.max(.000001, distances[j + 1] - distances[j]); return [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u]; });
})();
function handPoint(along: number, cord: number, t: number) {
  const p = fract(along) * HAND.length, i = Math.floor(p), u = p - i, a = HAND[i], b = HAND[(i + 1) % HAND.length];
  const scale = .94 + cord * .025, wave = Math.sin(along * Math.PI * 8 + t * 3.8 + cord) * .003;
  return [.5 + (a[0] + (b[0] - a[0]) * u - .435) * scale + wave, .5 + (a[1] + (b[1] - a[1]) * u - .5) * scale + wave * .6];
}
