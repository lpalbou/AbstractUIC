import type { Edge, Node } from 'reactflow';

import type { KgAssertion } from './types';

export interface KgGraphNodeData {
  label: string;
  kind: 'entity';
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

function shortLabel(term: string): string {
  const s = String(term || '').trim();
  if (!s) return '';
  const idx = s.indexOf(':');
  if (idx !== -1 && idx < s.length - 1) return s.slice(idx + 1);
  return s;
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
    data: { label: shortLabel(id), kind: 'entity' },
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
