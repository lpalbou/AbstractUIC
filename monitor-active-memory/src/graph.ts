import type { Edge, Node } from 'reactflow';

import type { KgAssertion } from './types';

export type KgEntityKind = 'person' | 'org' | 'concept' | 'claim' | 'event' | 'doc' | 'thing' | 'vocab' | 'entity';

export interface KgGraphNodeData {
  label: string;
  kind: KgEntityKind;
}

export interface KgGraphEdgeData {
  assertions: KgAssertion[];
  predicateSummary: string;
}

export interface BuildKgGraphOptions {
  groupEdges?: boolean;
  maxEdgeLabelPredicates?: number;
}

export interface BuiltKgGraph {
  nodes: Node<KgGraphNodeData>[];
  edges: Edge<KgGraphEdgeData>[];
}

export type KgLayoutKind = 'grid' | 'circle' | 'radial' | 'force';

export interface XY {
  x: number;
  y: number;
}

export type ViewportTransform = {
  x: number;
  y: number;
  zoom: number;
};

export function sanitizeViewport(
  viewport: unknown,
  opts: { minZoom?: number; maxZoom?: number; maxAbsTranslate?: number } = {}
): ViewportTransform | null {
  const obj = viewport && typeof viewport === 'object' && !Array.isArray(viewport) ? (viewport as any) : null;
  if (!obj) return null;
  const x = typeof obj.x === 'number' && Number.isFinite(obj.x) ? obj.x : null;
  const y = typeof obj.y === 'number' && Number.isFinite(obj.y) ? obj.y : null;
  const zoom = typeof obj.zoom === 'number' && Number.isFinite(obj.zoom) ? obj.zoom : null;
  if (x === null || y === null || zoom === null) return null;

  const maxAbs =
    typeof opts.maxAbsTranslate === 'number' && Number.isFinite(opts.maxAbsTranslate) ? Math.abs(opts.maxAbsTranslate) : 1_000_000;
  if (Math.abs(x) > maxAbs || Math.abs(y) > maxAbs) return null;

  const minZoomRaw = typeof opts.minZoom === 'number' && Number.isFinite(opts.minZoom) ? opts.minZoom : 0.025;
  const maxZoomRaw = typeof opts.maxZoom === 'number' && Number.isFinite(opts.maxZoom) ? opts.maxZoom : 6;
  const lo = Math.min(minZoomRaw, maxZoomRaw);
  const hi = Math.max(minZoomRaw, maxZoomRaw);
  return { x, y, zoom: Math.min(hi, Math.max(lo, zoom)) };
}

function shortLabel(term: string): string {
  const s = String(term || '').trim();
  if (!s) return '';
  const idx = s.indexOf(':');
  if (idx !== -1 && idx < s.length - 1) return s.slice(idx + 1);
  return s;
}

function classifyKind(term: string): KgEntityKind {
  const s = String(term || '').trim();
  if (!s) return 'entity';
  const idx = s.indexOf(':');
  if (idx <= 0 || idx >= s.length - 1) return 'entity';
  const ns = s.slice(0, idx).toLowerCase();
  const local = s.slice(idx + 1).toLowerCase();

  if (ns === 'ex') {
    const dash = local.indexOf('-');
    const prefix = dash > 0 ? local.slice(0, dash) : local;
    if (prefix === 'person') return 'person';
    if (prefix === 'org') return 'org';
    if (prefix === 'concept') return 'concept';
    if (prefix === 'claim') return 'claim';
    if (prefix === 'event') return 'event';
    if (prefix === 'doc') return 'doc';
    if (prefix === 'thing') return 'thing';
    return 'entity';
  }

  if (ns === 'schema' || ns === 'skos' || ns === 'dcterms' || ns === 'rdf' || ns === 'cito') return 'vocab';
  return 'entity';
}

function displayLabel(term: string): string {
  const s = String(term || '').trim();
  if (!s) return '';
  const idx = s.indexOf(':');
  if (idx <= 0 || idx >= s.length - 1) return shortLabel(s);
  const ns = s.slice(0, idx).toLowerCase();
  const local = s.slice(idx + 1);
  if (ns === 'ex') {
    const dash = local.indexOf('-');
    if (dash > 0 && dash < local.length - 1) return local.slice(dash + 1);
  }
  return shortLabel(s);
}

function stableGridLayout(ids: string[]): Record<string, { x: number; y: number }> {
  const spacingX = 240;
  const spacingY = 120;
  const cols = Math.max(1, Math.ceil(Math.sqrt(ids.length)));
  const pos: Record<string, { x: number; y: number }> = {};
  for (let i = 0; i < ids.length; i++) {
    const row = Math.floor(i / cols);
    const col = i % cols;
    pos[ids[i]] = { x: col * spacingX, y: row * spacingY };
  }
  return pos;
}

export function hashStringToSeed(input: string): number {
  // FNV-1a (32-bit), returns an unsigned uint32.
  const s = String(input ?? '');
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function circleLayout(ids: string[], seed: number): Record<string, XY> {
  const out: Record<string, XY> = {};
  const n = ids.length;
  if (!n) return out;
  const radius = Math.max(260, Math.sqrt(n) * 150);
  const angle0 = ((seed % 360) * Math.PI) / 180;
  for (let i = 0; i < n; i++) {
    const a = angle0 + (2 * Math.PI * i) / n;
    out[ids[i]] = { x: radius * Math.cos(a), y: radius * Math.sin(a) };
  }
  return out;
}

function radialLayout(ids: string[], edges: Edge[], seed: number): Record<string, XY> {
  const out: Record<string, XY> = {};
  if (!ids.length) return out;

  const neighbors = new Map<string, Set<string>>();
  for (const id of ids) neighbors.set(id, new Set());
  for (const e of edges) {
    const s = String(e?.source || '').trim();
    const t = String(e?.target || '').trim();
    if (!s || !t || s === t) continue;
    const ns = neighbors.get(s);
    const nt = neighbors.get(t);
    if (ns) ns.add(t);
    if (nt) nt.add(s);
  }

  let root = ids[0];
  let rootDeg = -1;
  for (const id of ids) {
    const deg = neighbors.get(id)?.size ?? 0;
    if (deg > rootDeg || (deg === rootDeg && id.localeCompare(root) < 0)) {
      root = id;
      rootDeg = deg;
    }
  }

  const level = new Map<string, number>();
  const q: string[] = [];
  level.set(root, 0);
  q.push(root);

  while (q.length) {
    const cur = q.shift()!;
    const curLevel = level.get(cur) ?? 0;
    const neigh = Array.from(neighbors.get(cur) ?? []);
    neigh.sort((a, b) => a.localeCompare(b));
    for (const n of neigh) {
      if (level.has(n)) continue;
      level.set(n, curLevel + 1);
      q.push(n);
    }
  }

  // Keep disconnected nodes in an outer ring (still deterministic).
  let maxLevel = 0;
  for (const v of level.values()) maxLevel = Math.max(maxLevel, v);
  for (const id of ids) {
    if (!level.has(id)) level.set(id, maxLevel + 1);
  }

  const groups = new Map<number, string[]>();
  for (const id of ids) {
    const l = level.get(id) ?? 0;
    const cur = groups.get(l);
    if (cur) cur.push(id);
    else groups.set(l, [id]);
  }

  const levels = Array.from(groups.keys()).sort((a, b) => a - b);
  const ringSpacing = 260;
  const baseAngle = ((seed % 360) * Math.PI) / 180;

  for (const l of levels) {
    const idsInRing = groups.get(l) || [];
    idsInRing.sort((a, b) => a.localeCompare(b));
    if (l === 0) {
      // If the ring has multiple ids (rare; root tie), spread them slightly.
      if (idsInRing.length === 1) {
        out[idsInRing[0]] = { x: 0, y: 0 };
      } else {
        const r0 = 80;
        for (let i = 0; i < idsInRing.length; i++) {
          const a = baseAngle + (2 * Math.PI * i) / idsInRing.length;
          out[idsInRing[i]] = { x: r0 * Math.cos(a), y: r0 * Math.sin(a) };
        }
      }
      continue;
    }

    const r = ringSpacing * l;
    const count = idsInRing.length;
    if (count === 1) {
      out[idsInRing[0]] = { x: r, y: 0 };
      continue;
    }
    const angleOffset = baseAngle + l * 0.35;
    for (let i = 0; i < count; i++) {
      const a = angleOffset + (2 * Math.PI * i) / count;
      out[idsInRing[i]] = { x: r * Math.cos(a), y: r * Math.sin(a) };
    }
  }

  return out;
}

export function buildKgLayout(graph: BuiltKgGraph, opts: { kind?: KgLayoutKind; seed?: number } = {}): Record<string, XY> {
  const kind: KgLayoutKind = opts.kind ?? 'grid';
  const seed = typeof opts.seed === 'number' && Number.isFinite(opts.seed) ? Math.trunc(opts.seed) : 0;
  const ids = graph.nodes.map((n) => n.id);
  if (kind === 'grid') return stableGridLayout(ids);
  if (kind === 'circle') return circleLayout(ids, seed);
  if (kind === 'radial') return radialLayout(ids, graph.edges, seed);
  if (kind === 'force') {
    const base = radialLayout(ids, graph.edges, seed);
    const rng = mulberry32(seed || 1);
    const jitter = Math.max(10, Math.min(42, Math.sqrt(ids.length) * 2.75));
    const out: Record<string, XY> = {};
    for (const id of ids) {
      const p = base[id] || { x: 0, y: 0 };
      out[id] = { x: p.x + (rng() - 0.5) * jitter, y: p.y + (rng() - 0.5) * jitter };
    }
    return out;
  }
  return stableGridLayout(ids);
}

function safeAssertions(items: KgAssertion[]): KgAssertion[] {
  return Array.isArray(items)
    ? items.filter((a) => a && typeof a === 'object' && typeof a.subject === 'string' && typeof a.predicate === 'string' && typeof a.object === 'string')
    : [];
}

export function buildKgGraph(items: KgAssertion[], opts: BuildKgGraphOptions = {}): BuiltKgGraph {
  const groupEdges = Boolean(opts.groupEdges ?? true);
  const maxPreds = Math.max(1, opts.maxEdgeLabelPredicates ?? 3);

  const assertions = safeAssertions(items);

  const idsSet = new Set<string>();
  for (const a of assertions) {
    const s = String(a.subject || '').trim();
    const o = String(a.object || '').trim();
    if (s) idsSet.add(s);
    if (o) idsSet.add(o);
  }

  const ids = Array.from(idsSet);
  ids.sort((a, b) => a.localeCompare(b));
  const positions = stableGridLayout(ids);

  const nodes: Node<KgGraphNodeData>[] = ids.map((id) => ({
    id,
    type: 'default',
    data: { label: displayLabel(id), kind: classifyKind(id) },
    position: positions[id] || { x: 0, y: 0 },
  }));

  const edgeGroups = new Map<string, KgAssertion[]>();
  const edgeKey = (a: KgAssertion, idx: number) => {
    const s = String(a.subject || '').trim();
    const o = String(a.object || '').trim();
    const p = String(a.predicate || '').trim();
    if (!groupEdges) return `edge:${idx}:${s}:${p}:${o}`;
    return `edge:${s}:${o}`;
  };

  for (let i = 0; i < assertions.length; i++) {
    const a = assertions[i];
    const key = edgeKey(a, i);
    const cur = edgeGroups.get(key);
    if (cur) cur.push(a);
    else edgeGroups.set(key, [a]);
  }

  const edges: Edge<KgGraphEdgeData>[] = [];
  for (const [key, group] of edgeGroups.entries()) {
    const a0 = group[0];
    const source = String(a0.subject || '').trim();
    const target = String(a0.object || '').trim();
    if (!source || !target) continue;

    const predCounts = new Map<string, number>();
    for (const a of group) {
      const p = String(a.predicate || '').trim();
      if (!p) continue;
      predCounts.set(p, (predCounts.get(p) || 0) + 1);
    }
    const preds = Array.from(predCounts.entries());
    preds.sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    const top = preds.slice(0, maxPreds);
    const label = top
      .map(([p, c]) => (c > 1 ? `${shortLabel(p)}×${c}` : shortLabel(p)))
      .join(' | ');
    const more = preds.length > maxPreds ? ` +${preds.length - maxPreds}` : '';
    const predicateSummary = `${label}${more}`.trim();

    edges.push({
      id: key,
      source,
      target,
      label: predicateSummary,
      animated: false,
      data: { assertions: group, predicateSummary },
    });
  }

  return { nodes, edges };
}

export interface ShortestPathResult {
  nodeIds: string[];
  edgeIds: string[];
}

export function shortestPath(
  graph: BuiltKgGraph,
  startId: string,
  endId: string,
  opts: { directed?: boolean } = {}
): ShortestPathResult | null {
  const directed = opts.directed !== false;
  const start = String(startId || '').trim();
  const end = String(endId || '').trim();
  if (!start || !end) return null;
  if (start === end) return { nodeIds: [start], edgeIds: [] };

  const adj = new Map<string, Array<{ to: string; edgeId: string }>>();
  const add = (from: string, to: string, edgeId: string) => {
    const cur = adj.get(from);
    if (cur) cur.push({ to, edgeId });
    else adj.set(from, [{ to, edgeId }]);
  };

  for (const e of graph.edges) {
    add(e.source, e.target, e.id);
    if (!directed) add(e.target, e.source, e.id);
  }

  const q: string[] = [start];
  const prevNode = new Map<string, string | null>();
  const prevEdge = new Map<string, string | null>();
  prevNode.set(start, null);
  prevEdge.set(start, null);

  while (q.length) {
    const cur = q.shift()!;
    const neighbors = adj.get(cur) || [];
    for (const n of neighbors) {
      if (prevNode.has(n.to)) continue;
      prevNode.set(n.to, cur);
      prevEdge.set(n.to, n.edgeId);
      if (n.to === end) {
        q.length = 0;
        break;
      }
      q.push(n.to);
    }
  }

  if (!prevNode.has(end)) return null;

  const nodeIds: string[] = [];
  const edgeIds: string[] = [];
  let cur: string | null = end;
  while (cur) {
    nodeIds.push(cur);
    const e = prevEdge.get(cur);
    if (e) edgeIds.push(e);
    cur = prevNode.get(cur) || null;
  }

  nodeIds.reverse();
  edgeIds.reverse();
  return { nodeIds, edgeIds };
}

export interface ForceSimulationOptions {
  seed?: number;
  dt?: number;
  springLength?: number;
  springStrength?: number;
  repulsionStrength?: number;
  centeringStrength?: number;
  damping?: number;
  maxSpeed?: number;
  maxRepulsionNodes?: number;
}

export interface ForceSimulationState {
  nodeIds: string[];
  pos: Float64Array;
  vel: Float64Array;
  acc: Float64Array;
  edges: Uint32Array;
  options: Required<ForceSimulationOptions>;
  tick: number;
}

const DEFAULT_FORCE_OPTS: Required<ForceSimulationOptions> = {
  seed: 1,
  dt: 1,
  springLength: 240,
  springStrength: 0.03,
  repulsionStrength: 9000,
  centeringStrength: 0.003,
  damping: 0.85,
  maxSpeed: 90,
  maxRepulsionNodes: 320,
};

export function initForceSimulation(
  graph: BuiltKgGraph,
  opts: ForceSimulationOptions & { positions?: Record<string, XY> } = {}
): ForceSimulationState {
  const merged: Required<ForceSimulationOptions> = {
    ...DEFAULT_FORCE_OPTS,
    ...opts,
    seed: typeof opts.seed === 'number' && Number.isFinite(opts.seed) ? Math.trunc(opts.seed) : DEFAULT_FORCE_OPTS.seed,
  };

  const nodeIds = graph.nodes.map((n) => n.id);
  const n = nodeIds.length;
  const pos = new Float64Array(2 * n);
  const vel = new Float64Array(2 * n);
  const acc = new Float64Array(2 * n);

  const idxById = new Map<string, number>();
  for (let i = 0; i < n; i++) idxById.set(nodeIds[i], i);

  const basePos = opts.positions ?? buildKgLayout(graph, { kind: 'force', seed: merged.seed });
  const rng = mulberry32(merged.seed || 1);
  const jitter = Math.max(8, Math.min(38, Math.sqrt(n) * 2.25));

  for (let i = 0; i < n; i++) {
    const id = nodeIds[i];
    const p = basePos[id];
    const x = typeof p?.x === 'number' && Number.isFinite(p.x) ? p.x : (rng() - 0.5) * 500;
    const y = typeof p?.y === 'number' && Number.isFinite(p.y) ? p.y : (rng() - 0.5) * 500;
    pos[2 * i] = x + (rng() - 0.5) * jitter;
    pos[2 * i + 1] = y + (rng() - 0.5) * jitter;
    vel[2 * i] = 0;
    vel[2 * i + 1] = 0;
  }

  const pairs: number[] = [];
  for (const e of graph.edges) {
    const s = idxById.get(String(e?.source || '').trim());
    const t = idxById.get(String(e?.target || '').trim());
    if (typeof s !== 'number' || typeof t !== 'number' || s === t) continue;
    pairs.push(s, t);
  }

  return {
    nodeIds,
    pos,
    vel,
    acc,
    edges: new Uint32Array(pairs),
    options: merged,
    tick: 0,
  };
}

export function stepForceSimulation(state: ForceSimulationState, steps = 1): void {
  const n = state.nodeIds.length;
  if (!n) return;
  const opts = state.options;
  const dt = opts.dt;

  for (let step = 0; step < Math.max(1, Math.trunc(steps)); step++) {
    state.acc.fill(0);

    const doRepulse = n <= opts.maxRepulsionNodes;
    if (doRepulse) {
      const repulse = opts.repulsionStrength;
      for (let i = 0; i < n; i++) {
        const xi = state.pos[2 * i];
        const yi = state.pos[2 * i + 1];
        for (let j = i + 1; j < n; j++) {
          const dx = state.pos[2 * j] - xi;
          const dy = state.pos[2 * j + 1] - yi;
          const dist2 = dx * dx + dy * dy + 1e-6;
          const invDist = 1 / Math.sqrt(dist2);
          const f = repulse / dist2;
          const fx = f * dx * invDist;
          const fy = f * dy * invDist;
          state.acc[2 * i] -= fx;
          state.acc[2 * i + 1] -= fy;
          state.acc[2 * j] += fx;
          state.acc[2 * j + 1] += fy;
        }
      }
    }

    const springLen = opts.springLength;
    const springK = opts.springStrength;
    const edges = state.edges;
    for (let k = 0; k < edges.length; k += 2) {
      const a = edges[k];
      const b = edges[k + 1];
      const ax = state.pos[2 * a];
      const ay = state.pos[2 * a + 1];
      const bx = state.pos[2 * b];
      const by = state.pos[2 * b + 1];
      const dx = bx - ax;
      const dy = by - ay;
      const dist2 = dx * dx + dy * dy + 1e-6;
      const dist = Math.sqrt(dist2);
      const f = springK * (dist - springLen);
      const fx = (f * dx) / dist;
      const fy = (f * dy) / dist;
      state.acc[2 * a] += fx;
      state.acc[2 * a + 1] += fy;
      state.acc[2 * b] -= fx;
      state.acc[2 * b + 1] -= fy;
    }

    const centerK = opts.centeringStrength;
    for (let i = 0; i < n; i++) {
      state.acc[2 * i] += -centerK * state.pos[2 * i];
      state.acc[2 * i + 1] += -centerK * state.pos[2 * i + 1];
    }

    const damp = opts.damping;
    const maxSpeed = opts.maxSpeed;
    for (let i = 0; i < n; i++) {
      let vx = (state.vel[2 * i] + state.acc[2 * i] * dt) * damp;
      let vy = (state.vel[2 * i + 1] + state.acc[2 * i + 1] * dt) * damp;
      const speed = Math.sqrt(vx * vx + vy * vy);
      if (speed > maxSpeed) {
        const s = maxSpeed / speed;
        vx *= s;
        vy *= s;
      }
      state.vel[2 * i] = vx;
      state.vel[2 * i + 1] = vy;
      state.pos[2 * i] += vx * dt;
      state.pos[2 * i + 1] += vy * dt;
    }

    state.tick += 1;
  }
}

export function forceSimulationEnergy(state: ForceSimulationState): number {
  const n = state.nodeIds.length;
  if (!n) return 0;
  let sum = 0;
  for (let i = 0; i < n; i++) {
    const vx = state.vel[2 * i];
    const vy = state.vel[2 * i + 1];
    sum += Math.sqrt(vx * vx + vy * vy);
  }
  return sum / n;
}

export function forceSimulationPositions(state: ForceSimulationState): Record<string, XY> {
  const out: Record<string, XY> = {};
  const n = state.nodeIds.length;
  for (let i = 0; i < n; i++) {
    out[state.nodeIds[i]] = { x: state.pos[2 * i], y: state.pos[2 * i + 1] };
  }
  return out;
}
