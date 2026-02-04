import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ReactFlow, {
  Background,
  ControlButton,
  Controls,
  MarkerType,
  MiniMap,
  Panel,
  ReactFlowProvider,
  type Edge,
  type Node,
  type NodeChange,
} from 'reactflow';

import {
  buildKgGraph,
  buildKgLayout,
  forceSimulationEnergy,
  forceSimulationPositions,
  hashStringToSeed,
  initForceSimulation,
  sanitizeViewport,
  shortestPath,
  stepForceSimulation,
  type ForceSimulationState,
  type KgLayoutKind,
  type ViewportTransform,
  type XY,
} from './graph';
import type { JsonValue, KgAssertion, KgQueryParams, KgQueryResult, MemoryScope, RecallLevel } from './types';

export interface KgActiveMemoryExplorerProps {
  title?: string;
  resetKey?: string;
  queryMode?: 'override' | 'replace';
  items: KgAssertion[];
  activeMemoryText?: string;
  packets?: JsonValue[];
  packetsVersion?: number;
  packedCount?: number;
  dropped?: number;
  estimatedTokens?: number;
  effort?: JsonValue;
  warnings?: JsonValue;
  onQuery?: (params: KgQueryParams) => Promise<KgQueryResult>;
  onItemsReplace?: (items: KgAssertion[], meta: { kind: 'live query' | 'expanded neighborhood'; result: KgQueryResult }) => void;
  onOpenSpan?: (args: { span_id: string; run_id: string; assertion: KgAssertion }) => void;
  onOpenTranscript?: (args: { run_id: string; span_id?: string; assertion: KgAssertion }) => void;
}

function normalizeScope(value: unknown, fallback: MemoryScope = 'session'): MemoryScope {
  const s = String(value ?? '')
    .trim()
    .toLowerCase();
  if (s === 'run' || s === 'session' || s === 'global' || s === 'all') return s;
  return fallback;
}

function isCompactViewport(): boolean {
  if (typeof window === 'undefined') return false;
  if (typeof window.matchMedia !== 'function') return false;
  try {
    return window.matchMedia('(pointer: coarse)').matches || window.matchMedia('(max-width: 720px)').matches;
  } catch {
    return false;
  }
}

function LegendIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      <rect x="3" y="3" width="3" height="3" rx="1" />
      <rect x="3" y="7" width="3" height="3" rx="1" />
      <rect x="3" y="11" width="3" height="3" rx="1" />
      <rect x="8" y="3.5" width="6" height="2" rx="1" fill="none" strokeWidth="1.4" />
      <rect x="8" y="7.5" width="6" height="2" rx="1" fill="none" strokeWidth="1.4" />
      <rect x="8" y="11.5" width="6" height="2" rx="1" fill="none" strokeWidth="1.4" />
    </svg>
  );
}

function clampNumber(value: unknown, lo: number, hi: number, fallback: number): number {
  const n = typeof value === 'number' && Number.isFinite(value) ? value : fallback;
  return Math.min(hi, Math.max(lo, n));
}

function forceOptionsForSpread(spread: number): { springLength: number; repulsionStrength: number } {
  const s = clampNumber(spread, 0.6, 2.4, 1);
  // Keep defaults in `graph.ts` as the baseline.
  const springLength = 240 * s;
  const repulsionStrength = 9000 * s * s;
  return { springLength, repulsionStrength };
}

type SavedLayoutV1 = {
  version: 1;
  kind: KgLayoutKind;
  seed: number;
  positions: Record<string, XY>;
  viewport?: ViewportTransform;
  saved_at: string;
};

const AMX_LAYOUT_STORAGE_KEY = 'abstractuic_amx_saved_layouts_v1';
const AMX_VIEWPORT_MIN_ZOOM = 0.025;
const AMX_VIEWPORT_MAX_ZOOM = 6;
const AMX_VIEWPORT_MAX_ABS_TRANSLATE = 1_000_000;

function safeLocalStorage(): Storage | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function normalizeLayoutKind(value: unknown, fallback: KgLayoutKind = 'grid'): KgLayoutKind {
  const v = String(value ?? '')
    .trim()
    .toLowerCase();
  if (v === 'grid' || v === 'circle' || v === 'radial' || v === 'force') return v;
  return fallback;
}

function coerceXY(value: unknown): XY | null {
  const obj = value && typeof value === 'object' && !Array.isArray(value) ? (value as any) : null;
  if (!obj) return null;
  const x = typeof obj.x === 'number' && Number.isFinite(obj.x) ? obj.x : null;
  const y = typeof obj.y === 'number' && Number.isFinite(obj.y) ? obj.y : null;
  if (x === null || y === null) return null;
  return { x, y };
}

function loadSavedLayout(layoutKey: string): SavedLayoutV1 | null {
  const storage = safeLocalStorage();
  if (!storage) return null;
  const k = String(layoutKey ?? '').trim();
  if (!k) return null;
  try {
    const raw = storage.getItem(AMX_LAYOUT_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const map = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, any>) : null;
    if (!map) return null;
    const entry = map[k];
    const obj = entry && typeof entry === 'object' && !Array.isArray(entry) ? (entry as Record<string, any>) : null;
    if (!obj) return null;
    const version = obj.version === 1 ? 1 : null;
    if (version === null) return null;
    const kind = normalizeLayoutKind(obj.kind, 'grid');
    const seed = typeof obj.seed === 'number' && Number.isFinite(obj.seed) ? Math.trunc(obj.seed) : hashStringToSeed(k);
    const positionsRaw = obj.positions && typeof obj.positions === 'object' && !Array.isArray(obj.positions) ? (obj.positions as Record<string, any>) : null;
    const positions: Record<string, XY> = {};
    if (positionsRaw) {
      for (const [id, p] of Object.entries(positionsRaw)) {
        const xy = coerceXY(p);
        if (xy) positions[String(id)] = xy;
      }
    }
    const viewport =
      sanitizeViewport(obj.viewport, {
        minZoom: AMX_VIEWPORT_MIN_ZOOM,
        maxZoom: AMX_VIEWPORT_MAX_ZOOM,
        maxAbsTranslate: AMX_VIEWPORT_MAX_ABS_TRANSLATE,
      }) ?? undefined;
    const saved_at = typeof obj.saved_at === 'string' && obj.saved_at.trim() ? obj.saved_at.trim() : '';
    return { version, kind, seed, positions, viewport, saved_at };
  } catch {
    return null;
  }
}

function saveLayout(layoutKey: string, layout: SavedLayoutV1): void {
  const storage = safeLocalStorage();
  if (!storage) return;
  const k = String(layoutKey ?? '').trim();
  if (!k) return;
  try {
    const raw = storage.getItem(AMX_LAYOUT_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    const map: Record<string, any> =
      parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? { ...(parsed as Record<string, any>) } : {};
    map[k] = layout;
    storage.setItem(AMX_LAYOUT_STORAGE_KEY, JSON.stringify(map));
  } catch {
    // ignore
  }
}

function deleteLayout(layoutKey: string): void {
  const storage = safeLocalStorage();
  if (!storage) return;
  const k = String(layoutKey ?? '').trim();
  if (!k) return;
  try {
    const raw = storage.getItem(AMX_LAYOUT_STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    const map = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? { ...(parsed as Record<string, any>) } : null;
    if (!map || !(k in map)) return;
    delete map[k];
    storage.setItem(AMX_LAYOUT_STORAGE_KEY, JSON.stringify(map));
  } catch {
    // ignore
  }
}

function parseOptionalFloat(text: string): number | undefined {
  const raw = String(text ?? '').trim();
  if (!raw) return undefined;
  const n = Number(raw);
  if (!Number.isFinite(n)) return undefined;
  return n;
}

function parseOptionalInt(text: string, opts?: { allowZero?: boolean; allowNegativeOne?: boolean }): number | undefined {
  const allowZero = Boolean(opts?.allowZero);
  const allowNegativeOne = Boolean(opts?.allowNegativeOne);
  const raw = String(text ?? '').trim();
  if (!raw) return undefined;
  const n = Number(raw);
  if (!Number.isFinite(n)) return undefined;
  const i = Math.trunc(n);
  if (allowNegativeOne && i === -1) return -1;
  if (!allowZero && i <= 0) return undefined;
  if (allowZero && i < 0) return undefined;
  return i;
}

function formatEffort(effort: JsonValue | undefined): string | null {
  if (!effort || typeof effort !== 'object' || Array.isArray(effort)) return null;
  const obj = effort as Record<string, unknown>;
  const recallLevel = typeof obj.recall_level === 'string' ? obj.recall_level : '';
  const applied = obj.applied && typeof obj.applied === 'object' && !Array.isArray(obj.applied) ? (obj.applied as Record<string, unknown>) : null;

  const parts: string[] = [];
  if (recallLevel) parts.push(`recall_level=${recallLevel}`);
  if (applied) {
    if (typeof applied.limit === 'number') parts.push(`limit=${applied.limit}`);
    if (typeof applied.min_score === 'number') parts.push(`min_score=${applied.min_score}`);
    if (typeof applied.max_input_tokens === 'number') parts.push(`max_input_tokens=${applied.max_input_tokens}`);
  }
  return parts.length ? parts.join(' · ') : null;
}

function formatAssertionMeta(a: KgAssertion): string | null {
  if (!a || typeof a !== 'object') return null;
  const parts: string[] = [];
  const scope = typeof a.scope === 'string' ? a.scope.trim() : '';
  const owner = typeof a.owner_id === 'string' ? a.owner_id.trim() : '';
  if (scope) parts.push(`scope=${scope}`);
  if (owner) parts.push(`owner_id=${owner}`);

  const conf = typeof a.confidence === 'number' && Number.isFinite(a.confidence) ? a.confidence : null;
  if (conf !== null) parts.push(`confidence=${conf.toFixed(3)}`);

  const prov = a.provenance && typeof a.provenance === 'object' && !Array.isArray(a.provenance) ? (a.provenance as Record<string, any>) : null;
  if (prov) {
    const wr = typeof prov.writer_run_id === 'string' ? prov.writer_run_id.trim() : '';
    const wf = typeof prov.writer_workflow_id === 'string' ? prov.writer_workflow_id.trim() : '';
    if (wr) parts.push(`writer_run_id=${wr}`);
    if (wf) parts.push(`writer_workflow_id=${wf}`);
  }

  const attrs = a.attributes && typeof a.attributes === 'object' && !Array.isArray(a.attributes) ? (a.attributes as Record<string, any>) : null;
  const ret = attrs && attrs._retrieval && typeof attrs._retrieval === 'object' && !Array.isArray(attrs._retrieval) ? (attrs._retrieval as Record<string, any>) : null;
  const score = ret && typeof ret.score === 'number' && Number.isFinite(ret.score) ? ret.score : null;
  if (score !== null) parts.push(`score=${score.toFixed(3)}`);

  return parts.length ? parts.join(' · ') : null;
}

function renderHighlight(text: string, needle: string) {
  const hay = String(text ?? '');
  const q = String(needle ?? '').trim();
  if (!q) return hay;

  const idx = hay.toLowerCase().indexOf(q.toLowerCase());
  if (idx < 0) return hay;
  const before = hay.slice(0, idx);
  const match = hay.slice(idx, idx + q.length);
  const after = hay.slice(idx + q.length);
  return (
    <>
      {before}
      <span className="amx-hl">{match}</span>
      {after}
    </>
  );
}

function kindColor(kind: unknown): { stroke: string; bg: string; minimap: string } {
  const k = String(kind ?? '').trim().toLowerCase();
  if (k === 'person') return { stroke: 'rgba(96, 165, 250, 0.82)', bg: 'rgba(96, 165, 250, 0.10)', minimap: 'rgba(96, 165, 250, 0.85)' };
  if (k === 'org') return { stroke: 'rgba(34, 197, 94, 0.78)', bg: 'rgba(34, 197, 94, 0.10)', minimap: 'rgba(34, 197, 94, 0.82)' };
  if (k === 'concept') return { stroke: 'rgba(168, 85, 247, 0.78)', bg: 'rgba(168, 85, 247, 0.10)', minimap: 'rgba(168, 85, 247, 0.82)' };
  if (k === 'claim') return { stroke: 'rgba(251, 191, 36, 0.78)', bg: 'rgba(251, 191, 36, 0.10)', minimap: 'rgba(251, 191, 36, 0.82)' };
  if (k === 'event') return { stroke: 'rgba(239, 68, 68, 0.74)', bg: 'rgba(239, 68, 68, 0.10)', minimap: 'rgba(239, 68, 68, 0.80)' };
  if (k === 'doc') return { stroke: 'rgba(14, 165, 233, 0.74)', bg: 'rgba(14, 165, 233, 0.10)', minimap: 'rgba(14, 165, 233, 0.80)' };
  if (k === 'vocab') return { stroke: 'rgba(148, 163, 184, 0.55)', bg: 'rgba(148, 163, 184, 0.06)', minimap: 'rgba(148, 163, 184, 0.70)' };
  if (k === 'thing') return { stroke: 'rgba(255, 255, 255, 0.20)', bg: 'rgba(255, 255, 255, 0.04)', minimap: 'rgba(255, 255, 255, 0.30)' };
  return { stroke: 'rgba(255, 255, 255, 0.14)', bg: 'rgba(0, 0, 0, 0.18)', minimap: 'rgba(255, 255, 255, 0.24)' };
}

function parseIsoMs(ts: unknown): number | null {
  const raw = typeof ts === 'string' ? ts.trim() : '';
  if (!raw) return null;
  // Trim microseconds to milliseconds for Date.parse compatibility.
  const normalized = raw.replace(/(\.\d{3})\d+/, '$1');
  const ms = Date.parse(normalized);
  return Number.isFinite(ms) ? ms : null;
}

function formatUtcMinute(ts: unknown): string {
  const ms = parseIsoMs(ts);
  if (ms === null) return '';
  const d = new Date(ms);
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const mi = String(d.getUTCMinutes()).padStart(2, '0');
  return `${yyyy}/${mm}/${dd} ${hh}:${mi}`;
}

function shortTerm(term: unknown): string {
  const s = String(term ?? '').trim();
  if (!s) return '';
  const idx = s.indexOf(':');
  if (idx !== -1 && idx < s.length - 1) return s.slice(idx + 1);
  return s;
}

function isStructuralPredicate(predicate: unknown, structural: Set<string>): boolean {
  const p = String(predicate ?? '')
    .trim()
    .toLowerCase();
  return Boolean(p && structural.has(p));
}

function predicateSummary(assertions: KgAssertion[], opts: { maxPredicates?: number } = {}): string {
  const max = Math.max(1, opts.maxPredicates ?? 3);
  const predCounts = new Map<string, number>();
  for (const a of assertions) {
    const p = String(a?.predicate || '').trim();
    if (!p) continue;
    predCounts.set(p, (predCounts.get(p) || 0) + 1);
  }
  const preds = Array.from(predCounts.entries());
  preds.sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const top = preds.slice(0, max);
  const label = top
    .map(([p, c]) => {
      const term = shortTerm(p);
      return c > 1 ? `${term}×${c}` : term;
    })
    .join(' | ');
  const more = preds.length > max ? ` +${preds.length - max}` : '';
  return `${label}${more}`.trim();
}

export function KgActiveMemoryExplorer({
  resetKey,
  queryMode,
  items,
  activeMemoryText,
  packets,
  packetsVersion,
  packedCount,
  dropped,
  estimatedTokens,
  effort,
  warnings,
  onQuery,
  onItemsReplace,
  onOpenSpan,
  onOpenTranscript,
}: KgActiveMemoryExplorerProps) {
  const flowRef = useRef<any>(null);
  const stepSig = useMemo(() => {
    const first = items?.[0];
    const last = items?.[items.length - 1];
    const f = first ? `${first.subject}|${first.predicate}|${first.object}` : '';
    const l = last ? `${last.subject}|${last.predicate}|${last.object}` : '';
    return `${items?.length || 0}:${f}:${l}`;
  }, [items]);

  const resetSig = String(resetKey ?? stepSig);
  const queryMode2: 'override' | 'replace' = queryMode === 'replace' ? 'replace' : 'override';

  const [override, setOverride] = useState<KgQueryResult | null>(null);
  const [overrideKind, setOverrideKind] = useState<'live query' | 'expanded neighborhood' | null>(null);
  const [queryLoading, setQueryLoading] = useState(false);
  const [queryError, setQueryError] = useState<string>('');
  const [expandLoading, setExpandLoading] = useState(false);
  const [expandError, setExpandError] = useState<string>('');

  useEffect(() => {
    setOverride(null);
    setOverrideKind(null);
    setQueryError('');
    setQueryLoading(false);
    setExpandError('');
    setExpandLoading(false);
  }, [resetSig]);

  const [search, setSearch] = useState('');
  const [groupEdges, setGroupEdges] = useState(true);
  // Users typically want “connectivity between ideas”, so default to undirected.
  const [directedPath, setDirectedPath] = useState(false);
  const [showStructural, setShowStructural] = useState(true);

  const [miniMapDefaults] = useState(() => {
    const compact = isCompactViewport();
    // Default to collapsed across viewports to keep the graph usable (especially on dense maps).
    return { compact, show: false };
  });
  const compactViewport = miniMapDefaults.compact;
  const [showMiniMap, setShowMiniMap] = useState(miniMapDefaults.show);
  const [showLegend, setShowLegend] = useState(false);

  const layoutKey = resetSig;
  const defaultLayoutSeed = useMemo(() => hashStringToSeed(layoutKey), [layoutKey]);
  const [layoutKind, setLayoutKind] = useState<KgLayoutKind>('grid');
  const [layoutSeed, setLayoutSeed] = useState<number>(defaultLayoutSeed);
  const [layoutPlaying, setLayoutPlaying] = useState(false);
  const [layoutSpread, setLayoutSpread] = useState(1.0);
  const simRef = useRef<ForceSimulationState | null>(null);
  const pendingViewportRef = useRef<ViewportTransform | null>(null);
  const pendingFitViewRef = useRef(false);
  const [flowEpoch, setFlowEpoch] = useState(0);
  const graphWrapRef = useRef<HTMLDivElement | null>(null);
  const rescueRemountsRef = useRef(0);
  const rescueAttemptsRef = useRef(0);
  const rescueProbeRef = useRef(0);
  const rescueRafRef = useRef(0);

  const [hasSavedLayout, setHasSavedLayout] = useState(false);
  const [savedLayoutAt, setSavedLayoutAt] = useState('');

  const [nodePositions, setNodePositions] = useState<Record<string, XY>>({});
  const nodePositionsRef = useRef<Record<string, XY>>({});
  useEffect(() => {
    nodePositionsRef.current = nodePositions;
  }, [nodePositions]);

  const [pathStart, setPathStart] = useState<string>('');
  const [pathEnd, setPathEnd] = useState<string>('');

  const inferredScope = useMemo(() => {
    const s = items?.[0]?.scope;
    return normalizeScope(s, 'session');
  }, [items]);

  const [scope, setScope] = useState<MemoryScope>(inferredScope);
  const [recallLevel, setRecallLevel] = useState<RecallLevel>('standard');
  const [queryText, setQueryText] = useState('');
  const [subject, setSubject] = useState('');
  const [predicate, setPredicate] = useState('');
  const [object, setObject] = useState('');
  const [minScore, setMinScore] = useState<string>('');
  const [limit, setLimit] = useState<string>('');
  const [maxInputTokens, setMaxInputTokens] = useState<string>('');
  const [model, setModel] = useState<string>('qwen/qwen3-next-80b');

  // If the "context" changes (e.g. different step/run), default scope to match.
  // For streaming use-cases, set `resetKey` so scope doesn't flap as items update.
  useEffect(() => {
    setScope(inferredScope);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetSig]);

  const stepItems = Array.isArray(items) ? items : [];
  const stepActiveMemoryText = typeof activeMemoryText === 'string' ? activeMemoryText : '';
  const stepPackets = Array.isArray(packets) ? packets : [];
  const stepPacketsVersion = typeof packetsVersion === 'number' ? packetsVersion : undefined;
  const stepPackedCount = typeof packedCount === 'number' ? packedCount : undefined;
  const stepDropped = typeof dropped === 'number' ? dropped : undefined;
  const stepEstimatedTokens = typeof estimatedTokens === 'number' ? estimatedTokens : undefined;
  const stepEffort = effort;
  const stepWarnings = warnings;

  const displayItems =
    queryMode2 === 'override' && override?.items && Array.isArray(override.items) ? (override.items as KgAssertion[]) : stepItems;
  const displayActiveMemoryText =
    typeof override?.active_memory_text === 'string' && override.active_memory_text.trim()
      ? override.active_memory_text
      : stepActiveMemoryText;
  const displayEffort = override?.effort ?? stepEffort;
  const displayWarnings = override?.warnings ?? stepWarnings;

  const structuralPredicates = useMemo(
    () =>
      new Set<string>([
        'rdf:type',
        'schema:name',
        'skos:preflabel',
        'skos:altlabel',
        'dcterms:title',
        'dcterms:identifier',
      ]),
    []
  );

  const visibleItems = useMemo(() => {
    if (showStructural) return displayItems;
    return (displayItems || []).filter((a) => !isStructuralPredicate(a?.predicate, structuralPredicates));
  }, [displayItems, showStructural, structuralPredicates]);

  const baseGraph = useMemo(() => buildKgGraph(displayItems, { groupEdges }), [displayItems, groupEdges]);

  const graph = useMemo(() => {
    if (showStructural) return baseGraph;

    const edges: Edge[] = [];
    for (const e of baseGraph.edges) {
      const assertionsRaw = e && e.data && Array.isArray((e.data as any).assertions) ? ((e.data as any).assertions as KgAssertion[]) : [];
      const assertions = assertionsRaw.filter((a) => !isStructuralPredicate(a?.predicate, structuralPredicates));
      if (!assertions.length) continue;
      const summary = predicateSummary(assertions);
      edges.push({
        ...e,
        label: summary,
        data: {
          ...(e.data as any),
          assertions,
          predicateSummary: summary,
        },
      });
    }
    return { nodes: baseGraph.nodes, edges };
  }, [baseGraph, showStructural, structuralPredicates]);

  const nodeIds = useMemo(() => graph.nodes.map((n) => n.id), [graph.nodes]);
  const nodeIdsSig = useMemo(() => {
    const first = nodeIds[0] || '';
    const last = nodeIds[nodeIds.length - 1] || '';
    return `${nodeIds.length}:${first}:${last}`;
  }, [nodeIds]);
  const nodeLabelById = useMemo(() => {
    const m = new Map<string, string>();
    for (const n of graph.nodes) m.set(n.id, String(n.data?.label || n.id));
    return m;
  }, [graph.nodes]);
  const nodeKindById = useMemo(() => {
    const m = new Map<string, string>();
    for (const n of graph.nodes) m.set(n.id, String((n.data as any)?.kind || ''));
    return m;
  }, [graph.nodes]);

  const searchKey = search.trim().toLowerCase();
  const matchedNodeIds = useMemo(() => {
    if (!searchKey) return new Set<string>();
    const set = new Set<string>();
    for (const n of graph.nodes) {
      const id = String(n.id || '').toLowerCase();
      const label = String(n.data?.label || '').toLowerCase();
      if (id.includes(searchKey) || label.includes(searchKey)) set.add(n.id);
    }
    return set;
  }, [graph.nodes, searchKey]);

  const applyPositionsToNodes = useCallback(
    (positions: Record<string, XY>, fallback: Record<string, XY>): Record<string, XY> => {
      const next: Record<string, XY> = {};
      for (const id of nodeIds) {
        const p = positions[id] || fallback[id];
        next[id] = p ? { x: p.x, y: p.y } : { x: 0, y: 0 };
      }
      return next;
    },
    [nodeIds]
  );

  useEffect(() => {
    // Ensure all current nodes have a position (preserve user-dragged positions).
    setNodePositions((prev) => {
      const fallback = buildKgLayout(graph, { kind: layoutKind, seed: layoutSeed });
      const next: Record<string, XY> = {};
      for (const id of nodeIds) {
        const p = prev[id] || fallback[id];
        next[id] = p ? { x: p.x, y: p.y } : { x: 0, y: 0 };
      }
      return next;
    });
  }, [graph, layoutKind, layoutSeed, nodeIds, nodeIdsSig]);

  useEffect(() => {
    if (!pendingFitViewRef.current) return;
    const inst = flowRef.current;
    if (!inst || typeof inst.fitView !== 'function') return;
    if (!nodeIds.length) return;
    pendingFitViewRef.current = false;
    try {
      inst.fitView({ padding: 0.2, duration: 0 });
    } catch {
      try {
        inst.fitView({ padding: 0.2 });
      } catch {
        // ignore
      }
    }
  }, [nodeIds.length, nodeIdsSig, nodePositions]);

	  useEffect(() => {
	    // Load saved layout for this view key (if present). Falls back to a deterministic layout.
	    setLayoutPlaying(false);
	    simRef.current = null;
	    pendingViewportRef.current = null;
	    pendingFitViewRef.current = false;
	    rescueRemountsRef.current = 0;
	    rescueAttemptsRef.current = 0;
	    rescueProbeRef.current = 0;

	    const saved = loadSavedLayout(layoutKey);
	    if (saved && Object.keys(saved.positions || {}).length) {
      setLayoutKind(saved.kind);
      setLayoutSeed(saved.seed);
      setHasSavedLayout(true);
      setSavedLayoutAt(saved.saved_at || '');
      if (saved.viewport) {
        pendingViewportRef.current = saved.viewport;
        const inst = flowRef.current;
        if (inst && typeof (inst as any).setViewport === 'function') {
          try {
            (inst as any).setViewport(saved.viewport, { duration: 0 });
          } catch {
            try {
              (inst as any).setViewport(saved.viewport);
            } catch {
              // ignore
            }
          }
          pendingViewportRef.current = null;
        }
      } else {
        pendingFitViewRef.current = true;
      }

      const fallback = buildKgLayout(graph, { kind: saved.kind, seed: saved.seed });
      setNodePositions(applyPositionsToNodes(saved.positions, fallback));
      return;
    }

    setHasSavedLayout(false);
    setSavedLayoutAt('');
    const seed = hashStringToSeed(layoutKey);
    setLayoutSeed(seed);
    const fallback = buildKgLayout(graph, { kind: layoutKind, seed });
    setNodePositions(fallback);

	    // If the user chose a force layout but hasn't saved one, auto-run a short stabilization pass.
	    if (layoutKind === 'force' && graph.nodes.length > 0 && graph.nodes.length <= 320) {
	      simRef.current = initForceSimulation(graph, { seed, positions: fallback, ...forceOptionsForSpread(layoutSpread) });
	      setLayoutPlaying(true);
	    }
	    // eslint-disable-next-line react-hooks/exhaustive-deps
	  }, [layoutKey]);

  const path = useMemo(() => {
    const s = String(pathStart || '').trim();
    const e = String(pathEnd || '').trim();
    if (!s || !e) return null;
    return shortestPath(graph, s, e, { directed: directedPath });
  }, [graph, pathStart, pathEnd, directedPath]);

  const isPathFocus = Boolean(path && String(pathStart || '').trim() && String(pathEnd || '').trim());

  const noPathDiagnostics = useMemo(() => {
    const s = String(pathStart || '').trim();
    const e = String(pathEnd || '').trim();
    if (!s || !e) return null;

    const directed = directedPath;
    const adj = new Map<string, string[]>();
    const add = (from: string, to: string) => {
      const cur = adj.get(from);
      if (cur) cur.push(to);
      else adj.set(from, [to]);
    };
    for (const edge of graph.edges) {
      add(edge.source, edge.target);
      if (!directed) add(edge.target, edge.source);
    }

    const visited = new Set<string>();
    const q: string[] = [];
    visited.add(s);
    q.push(s);
    while (q.length) {
      const cur = q.shift()!;
      const neigh = adj.get(cur) || [];
      for (const n of neigh) {
        if (visited.has(n)) continue;
        visited.add(n);
        q.push(n);
      }
    }

    return {
      reachableFromStart: visited.size,
      endReachable: visited.has(e),
      nodes: graph.nodes.length,
      edges: graph.edges.length,
      assertions: visibleItems.length,
    };
  }, [directedPath, graph.edges, graph.nodes.length, pathEnd, pathStart, visibleItems.length]);

  const selectedPathNodeSet = useMemo(() => new Set(path?.nodeIds || []), [path]);
  const selectedPathEdgeSet = useMemo(() => new Set(path?.edgeIds || []), [path]);

  const [selectedNodeId, setSelectedNodeId] = useState<string>('');
  const [selectedEdgeId, setSelectedEdgeId] = useState<string>('');
  const selectionActive = Boolean(String(selectedNodeId || '').trim() || String(selectedEdgeId || '').trim());

  const selectionNeighborhood = useMemo(() => {
    const nodes = new Set<string>();
    const edges = new Set<string>();
    const nid = String(selectedNodeId || '').trim();
    const eid = String(selectedEdgeId || '').trim();
    if (nid) {
      nodes.add(nid);
      for (const e of graph.edges) {
        if (e.source === nid || e.target === nid) {
          edges.add(e.id);
          nodes.add(e.source);
          nodes.add(e.target);
        }
      }
      return { nodes, edges };
    }
    if (eid) {
      const e = graph.edges.find((x) => x.id === eid);
      if (e) {
        edges.add(e.id);
        nodes.add(e.source);
        nodes.add(e.target);
      }
    }
    return { nodes, edges };
  }, [graph.edges, selectedEdgeId, selectedNodeId]);

  useEffect(() => {
    setSelectedNodeId('');
    setSelectedEdgeId('');
    setPathStart('');
    setPathEnd('');
  }, [resetSig]);

  const [showPackets, setShowPackets] = useState(false);
  useEffect(() => {
    setShowPackets(false);
  }, [resetSig]);

	  useEffect(() => {
	    if (!layoutPlaying) {
	      simRef.current = null;
	    }
	  }, [layoutPlaying]);

	  useEffect(() => {
	    if (layoutKind !== 'force') return;
	    const sim = simRef.current;
	    if (!sim) return;
	    const opts = forceOptionsForSpread(layoutSpread);
	    sim.options.springLength = opts.springLength;
	    sim.options.repulsionStrength = opts.repulsionStrength;
	  }, [layoutKind, layoutSpread]);

	  useEffect(() => {
	    if (layoutKind === 'force') return;
	    if (layoutPlaying) setLayoutPlaying(false);
	  }, [layoutKind, layoutPlaying]);

  useEffect(() => {
    if (!layoutPlaying) return;
    if (layoutKind !== 'force') return;
    if (graph.nodes.length === 0) return;
    if (typeof window === 'undefined' || typeof window.requestAnimationFrame !== 'function') return;

	    if (!simRef.current) {
	      simRef.current = initForceSimulation(graph, {
	        seed: layoutSeed,
	        positions: nodePositionsRef.current,
	        ...forceOptionsForSpread(layoutSpread),
	      });
	    }

    let raf = 0;
    let lastTs = 0;
    let ticks = 0;
    const stepsPerFrame = graph.nodes.length <= 140 ? 2 : 1;
    const maxTicks = 1600;
    const energyThreshold = 0.08;

    const loop = (ts: number) => {
      raf = window.requestAnimationFrame(loop);
      if (ts - lastTs < 33) return; // ~30fps cap
      lastTs = ts;

      const sim = simRef.current;
      if (!sim) {
        setLayoutPlaying(false);
        return;
      }
      stepForceSimulation(sim, stepsPerFrame);
      ticks += stepsPerFrame;
      setNodePositions(forceSimulationPositions(sim));

      const energy = forceSimulationEnergy(sim);
      if (energy <= energyThreshold || ticks >= maxTicks) {
        setLayoutPlaying(false);
      }
    };

    raf = window.requestAnimationFrame(loop);
    return () => {
      window.cancelAnimationFrame(raf);
    };
  }, [graph, layoutKind, layoutPlaying, layoutSeed]);

  const nodes: Node[] = useMemo(() => {
    return graph.nodes.map((n) => {
      const isPath = selectedPathNodeSet.has(n.id);
      const isMatch = matchedNodeIds.has(n.id);
      const isSelected = selectedNodeId === n.id;
      const isNeighborhood = selectionActive && selectionNeighborhood.nodes.has(n.id);

      const base = kindColor((n.data as any)?.kind);
      const matchBorder = 'rgba(34, 211, 238, 0.88)';
      const matchGlow = isMatch
        ? '0 0 0 1px rgba(34, 211, 238, 0.34), 0 0 16px rgba(34, 211, 238, 0.26), 0 0 44px rgba(34, 211, 238, 0.14)'
        : '';
      const borderColor = isPath ? 'rgba(168, 85, 247, 0.9)' : isMatch ? matchBorder : base.stroke;
      const baseShadow = isSelected
        ? '0 0 0 2px rgba(255,255,255,0.20), 0 18px 46px rgba(0,0,0,0.55)'
        : isNeighborhood
          ? '0 0 0 1px rgba(96, 165, 250, 0.28), 0 12px 34px rgba(0,0,0,0.45)'
          : undefined;
      const shadow = matchGlow && baseShadow ? `${matchGlow}, ${baseShadow}` : baseShadow || (matchGlow || undefined);
      const bg = isPath ? 'rgba(168, 85, 247, 0.10)' : isMatch ? 'rgba(34, 211, 238, 0.08)' : base.bg;
      const opacity = isPathFocus
        ? isPath || isSelected
          ? 1
          : 0.16
        : selectionActive
          ? isNeighborhood || isSelected
            ? 1
            : 0.10
          : 1;

      return {
        ...n,
        position: nodePositions[n.id] ? { x: nodePositions[n.id].x, y: nodePositions[n.id].y } : n.position,
        style: {
          ...(n.style || {}),
          border: `1px solid ${borderColor}`,
          borderRadius: 10,
          background: bg,
          color: 'rgba(255,255,255,0.92)',
          opacity,
          padding: 8,
          fontSize: 12,
          boxShadow: shadow,
          width: 180,
          cursor: 'pointer',
        },
      };
    });
  }, [graph.nodes, isPathFocus, matchedNodeIds, nodePositions, selectedNodeId, selectedPathNodeSet, selectionActive, selectionNeighborhood.nodes]);

  const edges: Edge[] = useMemo(() => {
    return graph.edges.map((e) => {
      const isPath = selectedPathEdgeSet.has(e.id);
      const isSelected = selectedEdgeId === e.id;
      const isNeighborhood = selectionActive && selectionNeighborhood.edges.has(e.id);
      const stroke = isPath
        ? 'rgba(168, 85, 247, 0.9)'
        : selectionActive
          ? isNeighborhood || isSelected
            ? 'rgba(96, 165, 250, 0.55)'
            : 'rgba(255,255,255,0.14)'
          : 'rgba(255,255,255,0.18)';
      const width = isPath ? 2.75 : selectionActive ? (isNeighborhood || isSelected ? 2.25 : 1.25) : 1.5;
      const glow = isSelected ? 'drop-shadow(0 0 10px rgba(168, 85, 247, 0.25))' : undefined;
      const markerColor = isPath ? 'rgba(168, 85, 247, 0.9)' : isPathFocus ? 'rgba(255,255,255,0.10)' : 'rgba(255,255,255,0.28)';
      const opacity = isPathFocus
        ? isPath || isSelected
          ? 1
          : 0.10
        : selectionActive
          ? isNeighborhood || isSelected
            ? 1
            : 0.08
          : 1;
      const labelOpacity = isPathFocus ? (isPath || isSelected ? 1 : 0) : selectionActive ? (isNeighborhood || isSelected ? 1 : 0) : 1;
      const label = isPathFocus ? (isPath || isSelected ? String(e.label || '') : '') : String(e.label || '');
      return {
        ...e,
        label,
        style: {
          ...(e.style || {}),
          stroke,
          strokeWidth: width,
          filter: glow,
          opacity,
        },
        animated: false,
        markerEnd: { type: MarkerType.ArrowClosed, color: markerColor, width: 20, height: 20 },
        labelShowBg: true,
        labelBgPadding: [6, 3],
        labelBgBorderRadius: 10,
        labelBgStyle: {
          fill: `rgba(0, 0, 0, ${0.38 * labelOpacity})`,
          stroke: `rgba(255, 255, 255, ${0.14 * labelOpacity})`,
          strokeWidth: 1,
        },
        labelStyle: {
          fill: `rgba(255, 255, 255, ${0.92 * labelOpacity})`,
          fontSize: 10,
          fontWeight: 600,
          letterSpacing: 0.2,
          textTransform: 'lowercase',
        },
      };
    });
  }, [graph.edges, isPathFocus, selectedEdgeId, selectedPathEdgeSet, selectionActive, selectionNeighborhood.edges]);

  const selectedEdgeAssertions = useMemo(() => {
    if (!selectedEdgeId) return [];
    const e = graph.edges.find((x) => x.id === selectedEdgeId);
    const a = e && e.data && Array.isArray((e.data as any).assertions) ? ((e.data as any).assertions as KgAssertion[]) : [];
    return Array.isArray(a) ? a : [];
  }, [graph.edges, selectedEdgeId]);

  const selectedEdge = useMemo(() => {
    if (!selectedEdgeId) return null;
    return graph.edges.find((x) => x.id === selectedEdgeId) || null;
  }, [graph.edges, selectedEdgeId]);

  const selectedNodeAssertions = useMemo(() => {
    const id = String(selectedNodeId || '').trim();
    if (!id) return [];
    return displayItems.filter((a) => {
      if (!a || typeof a !== 'object') return false;
      if (!(a.subject === id || a.object === id)) return false;
      if (showStructural) return true;
      return !isStructuralPredicate(a.predicate, structuralPredicates);
    });
  }, [displayItems, selectedNodeId, showStructural, structuralPredicates]);

  const selectedAssertions = useMemo(() => {
    return selectedEdgeId ? selectedEdgeAssertions : selectedNodeAssertions;
  }, [selectedEdgeAssertions, selectedEdgeId, selectedNodeAssertions]);

  const selectedSources = useMemo(() => {
    const out = new Map<
      string,
      {
        span_run_id: string;
        span_id: string;
        writer_run_id: string;
        count: number;
        last_observed_at: string;
        last_observed_at_fmt: string;
        assertion: KgAssertion;
      }
    >();
    for (const a of selectedAssertions) {
      if (!a || typeof a !== 'object') continue;
      const prov = a.provenance && typeof a.provenance === 'object' && !Array.isArray(a.provenance) ? (a.provenance as Record<string, any>) : null;
      const spanId = prov && typeof prov.span_id === 'string' ? prov.span_id.trim() : '';
      const writerRunId = prov && typeof prov.writer_run_id === 'string' ? prov.writer_run_id.trim() : '';
      const ownerId = typeof a.owner_id === 'string' ? a.owner_id.trim() : '';
      const spanRunId = writerRunId || ownerId;
      if (!spanRunId || !spanId) continue;

      const key = `${spanRunId}|${spanId}`;
      const cur = out.get(key);
      const obs = typeof a.observed_at === 'string' ? a.observed_at.trim() : '';
      if (cur) {
        cur.count += 1;
        if (obs && (!cur.last_observed_at || obs > cur.last_observed_at)) {
          cur.last_observed_at = obs;
          cur.last_observed_at_fmt = formatUtcMinute(obs);
          cur.assertion = a;
        }
      } else {
        out.set(key, {
          span_run_id: spanRunId,
          span_id: spanId,
          writer_run_id: writerRunId,
          count: 1,
          last_observed_at: obs,
          last_observed_at_fmt: formatUtcMinute(obs),
          assertion: a,
        });
      }
    }

    return Array.from(out.values()).sort((a, b) => String(b.last_observed_at || '').localeCompare(String(a.last_observed_at || '')));
  }, [selectedAssertions]);

  const selectedRunTranscripts = useMemo(() => {
    const out = new Map<string, { run_id: string; count: number; last_observed_at: string; last_observed_at_fmt: string; assertion: KgAssertion }>();
    for (const a of selectedAssertions) {
      if (!a || typeof a !== 'object') continue;
      const prov = a.provenance && typeof a.provenance === 'object' && !Array.isArray(a.provenance) ? (a.provenance as Record<string, any>) : null;
      const spanId = prov && typeof prov.span_id === 'string' ? prov.span_id.trim() : '';
      const writerRunId = prov && typeof prov.writer_run_id === 'string' ? prov.writer_run_id.trim() : '';
      if (!writerRunId) continue;
      if (spanId) continue;

      const cur = out.get(writerRunId);
      const obs = typeof a.observed_at === 'string' ? a.observed_at.trim() : '';
      if (cur) {
        cur.count += 1;
        if (obs && (!cur.last_observed_at || obs > cur.last_observed_at)) {
          cur.last_observed_at = obs;
          cur.last_observed_at_fmt = formatUtcMinute(obs);
          cur.assertion = a;
        }
      } else {
        out.set(writerRunId, {
          run_id: writerRunId,
          count: 1,
          last_observed_at: obs,
          last_observed_at_fmt: formatUtcMinute(obs),
          assertion: a,
        });
      }
    }

    return Array.from(out.values()).sort((a, b) => String(b.last_observed_at || '').localeCompare(String(a.last_observed_at || '')));
  }, [selectedAssertions]);

  const openTranscript = useCallback(
    (args: { run_id: string; span_id?: string; assertion: KgAssertion }) => {
      const run_id = String(args.run_id || '').trim();
      const span_id = typeof args.span_id === 'string' ? String(args.span_id).trim() : '';
      if (!run_id) return;

      if (onOpenTranscript) {
        try {
          onOpenTranscript({ run_id, span_id: span_id || undefined, assertion: args.assertion });
        } catch {
          // Best-effort.
        }
        return;
      }

      if (onOpenSpan && span_id) {
        try {
          onOpenSpan({ run_id, span_id, assertion: args.assertion });
        } catch {
          // Best-effort.
        }
      }
    },
    [onOpenSpan, onOpenTranscript]
  );

  const copyText = useCallback(async (text: string) => {
    const s = String(text ?? '');
    if (!s) return;
    try {
      await navigator.clipboard.writeText(s);
    } catch {
      // Best-effort.
    }
  }, []);

  const fitSelected = useCallback(() => {
    const inst = flowRef.current;
    if (!inst || typeof inst.fitView !== 'function') return;
    if (selectedNodeId && typeof inst.getNode === 'function') {
      const n = inst.getNode(selectedNodeId);
      if (n) {
        inst.fitView({ nodes: [n], padding: 0.55, duration: 350 });
        return;
      }
    }
    inst.fitView({ padding: 0.2, duration: 350 });
  }, [selectedNodeId]);

	  const applyLayoutNow = useCallback(
	    (next: { kind: KgLayoutKind; seed: number; autoPlay?: boolean }) => {
      const kind = next.kind;
      const seed = Math.trunc(next.seed);
      setLayoutPlaying(false);
      simRef.current = null;
      pendingViewportRef.current = null;
      setLayoutKind(kind);
      setLayoutSeed(seed);

      const positions = buildKgLayout(graph, { kind, seed });
	      setNodePositions(positions);

	      if (kind === 'force' && (next.autoPlay ?? true) && graph.nodes.length > 0 && graph.nodes.length <= 320) {
	        simRef.current = initForceSimulation(graph, { seed, positions, ...forceOptionsForSpread(layoutSpread) });
	        setLayoutPlaying(true);
	      }
	    },
	    [graph, layoutSpread]
	  );

	  const toggleSimulation = useCallback(() => {
	    if (layoutKind !== 'force') return;
	    if (layoutPlaying) {
	      setLayoutPlaying(false);
	      return;
	    }
	    simRef.current = initForceSimulation(graph, {
	      seed: layoutSeed,
	      positions: nodePositionsRef.current,
	      ...forceOptionsForSpread(layoutSpread),
	    });
	    setLayoutPlaying(true);
	  }, [graph, layoutKind, layoutPlaying, layoutSeed, layoutSpread]);

	  useEffect(() => {
	    return () => {
	      if (typeof window === 'undefined') return;
	      if (typeof window.cancelAnimationFrame !== 'function') return;
	      if (rescueRafRef.current) window.cancelAnimationFrame(rescueRafRef.current);
	    };
	  }, []);

	  const isGraphViewportBlank = useCallback((): boolean | null => {
	    const inst = flowRef.current;
	    if (!inst || typeof inst.getViewport !== 'function') return null;
	    if (!nodeIds.length) return null;
	    const el = graphWrapRef.current;
	    if (!el) return null;
	    const rect = el.getBoundingClientRect();
	    if (!Number.isFinite(rect.width) || !Number.isFinite(rect.height) || rect.width < 64 || rect.height < 64) return null;

	    const vp = inst.getViewport();
	    const zoom = typeof vp?.zoom === 'number' && Number.isFinite(vp.zoom) ? vp.zoom : null;
	    const tx = typeof vp?.x === 'number' && Number.isFinite(vp.x) ? vp.x : null;
	    const ty = typeof vp?.y === 'number' && Number.isFinite(vp.y) ? vp.y : null;
	    if (zoom === null || tx === null || ty === null || zoom <= 0) return null;

	    const margin = 140;
	    const maxCheck = Math.min(nodeIds.length, 180);
	    const pos = nodePositionsRef.current;
	    let checked = 0;
	    let valid = 0;

	    for (const id of nodeIds) {
	      const p = pos[id];
	      if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y)) continue;
	      valid += 1;

	      const candidates: XY[] = [
	        { x: p.x, y: p.y },
	        { x: p.x + 90, y: p.y + 24 },
	      ];

	      for (const c of candidates) {
	        const sx = c.x * zoom + tx;
	        const sy = c.y * zoom + ty;
	        if (sx > -margin && sx < rect.width + margin && sy > -margin && sy < rect.height + margin) return false;
	      }

	      checked++;
	      if (checked >= maxCheck) break;
	    }

	    if (!valid) return null;
	    return true;
	  }, [nodeIds]);

	  const scheduleViewportRescue = useCallback(
	    (why: string) => {
	      if (typeof window === 'undefined' || typeof window.requestAnimationFrame !== 'function') return;
	      if (rescueRafRef.current) return;
	      rescueRafRef.current = window.requestAnimationFrame(() => {
	        rescueRafRef.current = 0;
	        const blank = isGraphViewportBlank();
	        if (blank === null) {
	          if (rescueProbeRef.current >= 12) return;
	          rescueProbeRef.current += 1;
	          window.setTimeout(() => scheduleViewportRescue(`${why}:probe`), 120);
	          return;
	        }
	        if (blank !== true) {
	          rescueProbeRef.current = 0;
	          rescueAttemptsRef.current = 0;
	          return;
	        }
	        rescueProbeRef.current = 0;

	        const inst = flowRef.current;
	        if (inst && typeof inst.fitView === 'function') {
	          try {
	            inst.fitView({ padding: 0.2, duration: 0 });
	          } catch {
	            try {
	              inst.fitView({ padding: 0.2 });
	            } catch {
	              // ignore
	            }
	          }
	        }

	        rescueAttemptsRef.current += 1;
	        if (rescueAttemptsRef.current >= 4 && rescueRemountsRef.current < 1) {
	          rescueAttemptsRef.current = 0;
	          rescueRemountsRef.current += 1;
	          setFlowEpoch((v) => v + 1);
	          return;
	        }

	        if (rescueAttemptsRef.current < 8) {
	          window.setTimeout(() => scheduleViewportRescue(`${why}:retry`), 220);
	        }
	      });
	    },
	    [isGraphViewportBlank]
	  );

	  useEffect(() => {
	    rescueAttemptsRef.current = 0;
	    rescueRemountsRef.current = 0;
	    rescueProbeRef.current = 0;
	    scheduleViewportRescue('mount');
	  }, [resetSig, scheduleViewportRescue]);

	  useEffect(() => {
	    scheduleViewportRescue('graph change');
	  }, [nodeIdsSig, scheduleViewportRescue]);

	  useEffect(() => {
	    const el = graphWrapRef.current;
	    if (!el) return;
	    if (typeof window === 'undefined') return;
	    if (typeof ResizeObserver !== 'function') return;
	    const obs = new ResizeObserver(() => scheduleViewportRescue('resize'));
	    obs.observe(el);
	    return () => obs.disconnect();
	  }, [scheduleViewportRescue]);

	  const saveLayoutNow = useCallback(() => {
	    const now = new Date().toISOString();
	    const positions: Record<string, XY> = {};
	    for (const id of nodeIds) {
	      const p = nodePositionsRef.current[id];
      if (p && typeof p.x === 'number' && typeof p.y === 'number') positions[id] = { x: p.x, y: p.y };
    }

    const inst = flowRef.current;
    const vpObj = inst && typeof inst.toObject === 'function' ? inst.toObject() : null;
    const viewportRaw = vpObj && vpObj.viewport ? vpObj.viewport : inst && typeof inst.getViewport === 'function' ? inst.getViewport() : null;
    const viewport =
      sanitizeViewport(viewportRaw, {
        minZoom: AMX_VIEWPORT_MIN_ZOOM,
        maxZoom: AMX_VIEWPORT_MAX_ZOOM,
        maxAbsTranslate: AMX_VIEWPORT_MAX_ABS_TRANSLATE,
      }) ?? undefined;

    saveLayout(layoutKey, { version: 1, kind: layoutKind, seed: layoutSeed, positions, viewport, saved_at: now });
    setHasSavedLayout(true);
    setSavedLayoutAt(now);
    setLayoutPlaying(false);
  }, [layoutKey, layoutKind, layoutSeed, nodeIds]);

  const loadSavedLayoutNow = useCallback(() => {
    const saved = loadSavedLayout(layoutKey);
    if (!saved) return;
    setLayoutPlaying(false);
    simRef.current = null;
    setLayoutKind(saved.kind);
    setLayoutSeed(saved.seed);
    setHasSavedLayout(true);
    setSavedLayoutAt(saved.saved_at || '');
    pendingViewportRef.current = saved.viewport || null;
    pendingFitViewRef.current = !saved.viewport;

    const fallback = buildKgLayout(graph, { kind: saved.kind, seed: saved.seed });
    setNodePositions(applyPositionsToNodes(saved.positions, fallback));

    if (saved.viewport) {
      const inst = flowRef.current;
      if (inst && typeof (inst as any).setViewport === 'function') {
        try {
          (inst as any).setViewport(saved.viewport, { duration: 0 });
        } catch {
          try {
            (inst as any).setViewport(saved.viewport);
          } catch {
            // ignore
          }
        }
        pendingViewportRef.current = null;
      }
    }
  }, [applyPositionsToNodes, graph, layoutKey]);

  const clearSavedLayoutNow = useCallback(() => {
    deleteLayout(layoutKey);
    setHasSavedLayout(false);
    setSavedLayoutAt('');
  }, [layoutKey]);

  const onNodesChange = useCallback(
    (changes: NodeChange[]) => {
      if (!Array.isArray(changes) || changes.length === 0) return;
      let sawDrag = false;
      setNodePositions((prev) => {
        let next = prev;
        let changed = false;
        for (const ch of changes) {
          const id = ch && typeof ch === 'object' && 'id' in ch && typeof (ch as any).id === 'string' ? String((ch as any).id) : '';
          const pos = (ch as any)?.type === 'position' ? (ch as any)?.position : null;
          if (id && pos && typeof pos.x === 'number' && typeof pos.y === 'number') {
            if (!changed) {
              next = { ...prev };
              changed = true;
            }
            next[id] = { x: pos.x, y: pos.y };
            if ((ch as any)?.dragging) sawDrag = true;
          }
        }
        return changed ? next : prev;
      });
      if (sawDrag && layoutPlaying) setLayoutPlaying(false);
    },
    [layoutPlaying]
  );

  const edgeById = useMemo(() => {
    const m = new Map<string, any>();
    for (const e of graph.edges) m.set(e.id, e);
    return m;
  }, [graph.edges]);

  const pathSegments = useMemo(() => {
    if (!path) return [];
    const nodes2 = path.nodeIds || [];
    const edges2 = path.edgeIds || [];
    const segs: Array<{ from: string; to: string; edgeId: string; predicate: string; dir: 'forward' | 'reverse' | 'unknown' }> = [];
    for (let i = 0; i < Math.min(nodes2.length - 1, edges2.length); i++) {
      const from = nodes2[i];
      const to = nodes2[i + 1];
      const edgeId = edges2[i];
      const e = edgeById.get(edgeId);
      const predicate = String(e?.data?.predicateSummary || e?.label || '').trim();
      const dir: 'forward' | 'reverse' | 'unknown' =
        e && e.source === from && e.target === to ? 'forward' : e && e.source === to && e.target === from ? 'reverse' : 'unknown';
      segs.push({ from, to, edgeId, predicate, dir });
    }
    return segs;
  }, [edgeById, path]);

  const runQuery = useCallback(async () => {
    if (!onQuery) return;
    setQueryError('');
    setExpandError('');
    setQueryLoading(true);
    try {
      const minScoreValue = parseOptionalFloat(minScore);
      const limitValue = parseOptionalInt(limit, { allowZero: true, allowNegativeOne: true });
      const maxInputTokensValue = parseOptionalInt(maxInputTokens, { allowZero: true });
      const res = await onQuery({
        scope,
        owner_id: undefined,
        recall_level: recallLevel,
        query_text: queryText || undefined,
        subject: subject || undefined,
        predicate: predicate || undefined,
        object: object || undefined,
        min_score: minScoreValue,
        limit: limitValue,
        max_input_tokens: maxInputTokensValue,
        model: model || undefined,
      });
      setOverride(res);
      setOverrideKind('live query');
      if (queryMode2 === 'replace' && onItemsReplace && res && Array.isArray(res.items)) {
        onItemsReplace(res.items as KgAssertion[], { kind: 'live query', result: res });
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setQueryError(msg || 'Query failed');
    } finally {
      setQueryLoading(false);
    }
  }, [limit, maxInputTokens, minScore, model, object, onItemsReplace, onQuery, predicate, queryMode2, queryText, recallLevel, scope, subject]);

  const expandNeighborhoodForPath = useCallback(async () => {
    if (!onQuery) return;
    const s = String(pathStart || '').trim();
    const e = String(pathEnd || '').trim();
    if (!s || !e) return;

    const fetchLimit = Math.max(200, parseOptionalInt(limit) ?? 80);
    const maxExpandNodes = 60;

    setExpandError('');
    setQueryError('');
    setExpandLoading(true);
    try {
      const merged: KgAssertion[] = [];
      const seenAssertions = new Set<string>();

      const addAssertion = (a: KgAssertion) => {
        if (!a || typeof a !== 'object') return;
        if (typeof a.subject !== 'string' || typeof a.predicate !== 'string' || typeof a.object !== 'string') return;
        const key = `${a.subject}|${a.predicate}|${a.object}|${String(a.observed_at || '')}|${String(a.scope || '')}|${String(a.owner_id || '')}`;
        if (seenAssertions.has(key)) return;
        seenAssertions.add(key);
        merged.push(a);
      };

      // Seed with the currently loaded subgraph.
      for (const a of displayItems) addAssertion(a);

      // Incremental neighborhood expansion (bounded) until we either find a path or hit caps.
      const directed = directedPath;
      const expanded = new Set<string>();
      const frontier: string[] = [s];
      const discovered = new Set<string>([s]);

      const expandNode = async (nodeId: string) => {
        // Outgoing (subject==node) always.
        const out = await onQuery({
          scope,
          recall_level: recallLevel,
          min_score: 0,
          limit: fetchLimit,
          subject: nodeId,
          query_text: undefined,
          max_input_tokens: 0,
          model: undefined,
        });
        if (out && Array.isArray(out.items)) {
          for (const it of out.items as KgAssertion[]) {
            addAssertion(it);
            if (typeof it.subject === 'string' && it.subject.trim() === nodeId && typeof it.object === 'string') {
              const neigh = it.object.trim();
              if (neigh && !discovered.has(neigh)) {
                discovered.add(neigh);
                frontier.push(neigh);
              }
            }
          }
        }

        // In undirected mode, also include incoming (object==node).
        if (!directed) {
          const inc = await onQuery({
            scope,
            recall_level: recallLevel,
            min_score: 0,
            limit: fetchLimit,
            object: nodeId,
            query_text: undefined,
            max_input_tokens: 0,
            model: undefined,
          });
          if (inc && Array.isArray(inc.items)) {
            for (const it of inc.items as KgAssertion[]) {
              addAssertion(it);
              if (typeof it.object === 'string' && it.object.trim() === nodeId && typeof it.subject === 'string') {
                const neigh = it.subject.trim();
                if (neigh && !discovered.has(neigh)) {
                  discovered.add(neigh);
                  frontier.push(neigh);
                }
              }
            }
          }
        }
      };

      while (frontier.length && expanded.size < maxExpandNodes) {
        if (discovered.has(e)) break;
        const cur = frontier.shift()!;
        if (!cur || expanded.has(cur)) continue;
        expanded.add(cur);
        await expandNode(cur);
      }

      setOverride({
        ok: true,
        count: merged.length,
        items: merged,
        active_memory_text: displayActiveMemoryText,
        raw: { expanded_for_path: true, expanded_nodes: expanded.size, discovered_nodes: discovered.size, merged: merged.length, directed },
      });
      setOverrideKind('expanded neighborhood');
      if (queryMode2 === 'replace' && onItemsReplace) {
        onItemsReplace(merged, {
          kind: 'expanded neighborhood',
          result: {
            ok: true,
            count: merged.length,
            items: merged,
            active_memory_text: displayActiveMemoryText,
            raw: { expanded_for_path: true, expanded_nodes: expanded.size, discovered_nodes: discovered.size, merged: merged.length, directed },
          },
        });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setExpandError(msg || 'Expand neighborhood failed');
    } finally {
      setExpandLoading(false);
    }
  }, [directedPath, displayActiveMemoryText, displayItems, limit, onItemsReplace, onQuery, pathEnd, pathStart, queryMode2, recallLevel, scope]);

  const resetToStep = useCallback(() => {
    setOverride(null);
    setOverrideKind(null);
    setQueryError('');
    setQueryLoading(false);
    setExpandError('');
    setExpandLoading(false);
    setPathStart('');
    setPathEnd('');
    setSelectedNodeId('');
    setSelectedEdgeId('');
  }, []);

	  const header = 'Search KG';
  const nodeCount = graph.nodes.length;
  const edgeCount = graph.edges.length;
  const itemCount = visibleItems.length;

  return (
    <div className="amx-root">
      <div className="amx-left">
        <div className="amx-graphbar" role="toolbar" aria-label="Graph layout controls">
	          <div className="amx-graphbar-row">
	            <span className="amx-graphbar-title">layout</span>
	            <select value={layoutKind} onChange={(e) => setLayoutKind(normalizeLayoutKind(e.target.value, layoutKind))} disabled={!nodeIds.length}>
	              <option value="grid">grid (deterministic)</option>
	              <option value="radial">radial (bfs)</option>
	              <option value="circle">circle</option>
	              <option value="force">force (simulation)</option>
	            </select>
	            {layoutKind === 'force' ? (
	              <label className="amx-graphbar-spread">
	                <span className="amx-graphbar-title">spread</span>
	                <input
	                  type="range"
	                  min="0.7"
	                  max="2.2"
	                  step="0.1"
	                  value={layoutSpread}
	                  onChange={(e) => setLayoutSpread(clampNumber(Number(e.target.value), 0.7, 2.2, 1))}
	                />
	                <span className="amx-small">{layoutSpread.toFixed(1)}×</span>
	              </label>
	            ) : null}
	            <button type="button" className="amx-btn" onClick={() => applyLayoutNow({ kind: layoutKind, seed: layoutSeed })} disabled={!nodeIds.length}>
	              Apply
	            </button>
	            <button type="button" className="amx-btn" onClick={toggleSimulation} disabled={!nodeIds.length || layoutKind !== 'force'}>
	              {layoutPlaying ? 'Pause simulation' : 'Play simulation'}
            </button>
          </div>
        </div>

	        <div className="amx-graph" aria-label="Knowledge graph" ref={graphWrapRef}>
	          <ReactFlowProvider key={flowEpoch}>
	            <ReactFlow
                nodes={nodes}
                edges={edges}
                defaultViewport={{ x: 0, y: 0, zoom: 1 }}
                minZoom={AMX_VIEWPORT_MIN_ZOOM}
                maxZoom={AMX_VIEWPORT_MAX_ZOOM}
	                onInit={(inst) => {
	                  flowRef.current = inst;

	                  const vp = pendingViewportRef.current;
	                  if (vp && typeof (inst as any).setViewport === 'function') {
	                    try {
	                      (inst as any).setViewport(vp, { duration: 0 });
	                    } catch {
	                      try {
	                        (inst as any).setViewport(vp);
	                      } catch {
	                        // ignore
	                      }
	                    }
	                  }

	                  if (pendingFitViewRef.current && typeof inst.fitView === 'function') {
	                    try {
	                      inst.fitView({ padding: 0.2, duration: 0 });
	                    } catch {
	                      try {
	                        inst.fitView({ padding: 0.2 });
	                      } catch {
	                        // ignore
	                      }
	                    }
	                  }

	                  pendingViewportRef.current = null;
	                  pendingFitViewRef.current = false;
	                  scheduleViewportRescue('init');
	                }}
              nodesDraggable
              nodesConnectable={false}
              elementsSelectable
              onNodesChange={onNodesChange}
              onNodeClick={(_, n) => {
                setSelectedEdgeId('');
                setSelectedNodeId(n.id);
              }}
              onEdgeClick={(_, e) => {
                setSelectedNodeId('');
                setSelectedEdgeId(e.id);
              }}
              onPaneClick={() => {
                setSelectedNodeId('');
                setSelectedEdgeId('');
              }}
	            >
	              <Controls className="amx-flow-controls">
	                <ControlButton
	                  type="button"
	                  className={`amx-control-legend ${showLegend ? 'amx-control-legend-active' : ''}`}
	                  onClick={() => setShowLegend((v) => !v)}
	                  title={showLegend ? 'Hide node color legend' : 'Show node color legend'}
	                  aria-label={showLegend ? 'Hide node color legend' : 'Show node color legend'}
	                >
	                  <LegendIcon />
	                </ControlButton>
	              </Controls>
	              <Panel position="bottom-right" className="amx-panel-bottom-right">
	                <div className="amx-panel-toggles">
	                  <button
	                    type="button"
	                    className="amx-minimap-toggle"
	                    onClick={() => setShowMiniMap((v) => !v)}
	                    title={showMiniMap ? 'Hide minimap preview' : 'Show minimap preview'}
	                    aria-label={showMiniMap ? 'Hide minimap preview' : 'Show minimap preview'}
	                  >
	                    {showMiniMap ? 'minimap on' : 'minimap off'}
	                  </button>
	                </div>
	              </Panel>
	              {showMiniMap ? (
	                <MiniMap
	                  position="bottom-right"
	                  pannable
	                  zoomable
	                  maskColor="rgba(0,0,0,0.45)"
	                  style={{
	                    background: 'rgba(12, 18, 34, 0.88)',
	                    border: '1px solid rgba(255,255,255,0.12)',
	                    borderRadius: 10,
	                    width: compactViewport ? 120 : 160,
	                    height: compactViewport ? 80 : 110,
	                    marginBottom: 56,
	                  }}
	                  nodeColor={(n) => kindColor((n.data as any)?.kind).minimap}
	                />
	              ) : null}
	              {showLegend ? (
	                <Panel position="bottom-left" className="amx-legend-panel">
	                  <div className="amx-legend-title">node colors</div>
	                  <div className="amx-legend">
	                    {[
	                      { k: 'person', label: 'person' },
	                      { k: 'org', label: 'org' },
	                      { k: 'concept', label: 'concept' },
	                      { k: 'claim', label: 'claim' },
	                      { k: 'event', label: 'event' },
	                      { k: 'doc', label: 'doc' },
	                      { k: 'vocab', label: 'vocab' },
	                    ].map(({ k, label }) => (
	                      <span key={k} className="amx-legend-item" style={{ borderColor: kindColor(k).stroke }}>
	                        {label}
	                      </span>
	                    ))}
	                  </div>
	                </Panel>
	              ) : null}
	              <Background gap={20} size={1} color="rgba(255,255,255,0.06)" />
		            </ReactFlow>
		          </ReactFlowProvider>

	        <details className="amx-panel amx-controls">
          <summary>
            <span className="amx-controls-title">{header}</span>
            <span className="amx-small">
              {itemCount} assertions · {nodeCount} nodes · {edgeCount} edges
            </span>
          </summary>

          <div className="amx-toolbar" style={{ marginTop: 10 }}>
            <div className="amx-toolbar-grid">
              <label>
                search / highlight
                <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="filter nodes by id/label" />
              </label>

              <label>
                group edges
                <select value={String(groupEdges)} onChange={(e) => setGroupEdges(e.target.value === 'true')}>
                  <option value="true">group (subject→object)</option>
                  <option value="false">no grouping</option>
                </select>
              </label>

              <label>
                view
                <select value={String(showStructural)} onChange={(e) => setShowStructural(e.target.value === 'true')}>
                  <option value="true">all assertions</option>
                  <option value="false">hide rdf:type / labels</option>
                </select>
              </label>

              <label>
                path mode
                <select value={String(directedPath)} onChange={(e) => setDirectedPath(e.target.value === 'true')}>
                  <option value="false">undirected</option>
                  <option value="true">directed</option>
                </select>
              </label>
            </div>

            <details className="amx-details">
              <summary>layout</summary>
              <div className="amx-toolbar-grid" style={{ marginTop: 10 }}>
                <label>
                  layout
                  <select value={layoutKind} onChange={(e) => setLayoutKind(normalizeLayoutKind(e.target.value, layoutKind))}>
                    <option value="grid">grid (deterministic)</option>
                    <option value="radial">radial (bfs)</option>
                    <option value="circle">circle</option>
                    <option value="force">force (simulation)</option>
                  </select>
                </label>

                <label>
                  seed
                  <input type="number" step="1" value={layoutSeed} onChange={(e) => setLayoutSeed(Math.trunc(Number(e.target.value || 0) || 0))} />
                </label>
              </div>

              <div className="amx-actions" style={{ marginTop: 10 }}>
                <button type="button" className="amx-btn" onClick={() => applyLayoutNow({ kind: layoutKind, seed: layoutSeed })} disabled={!nodeIds.length}>
                  Apply layout
                </button>
                {layoutKind === 'force' ? (
                  <button type="button" className="amx-btn" onClick={toggleSimulation} disabled={!nodeIds.length}>
                    {layoutPlaying ? 'Pause simulation' : 'Play simulation'}
                  </button>
                ) : null}
                <button type="button" className="amx-btn" onClick={saveLayoutNow} disabled={!nodeIds.length}>
                  Save layout
                </button>
                {hasSavedLayout ? (
                  <>
                    <button type="button" className="amx-btn" onClick={loadSavedLayoutNow}>
                      Load saved
                    </button>
                    <button type="button" className="amx-btn" onClick={clearSavedLayoutNow}>
                      Clear saved
                    </button>
                  </>
                ) : null}
              </div>

              <div className="amx-small" style={{ marginTop: 10, opacity: 0.9 }}>
                Drag nodes to adjust manually; use <span className="amx-mono">Save layout</span> for a stable, replayable view.
                {hasSavedLayout ? (
                  <span>
                    {' '}
                    (saved{savedLayoutAt ? `: ${savedLayoutAt}` : ''})
                  </span>
                ) : (
                  <span> (no saved layout)</span>
                )}
              </div>
            </details>

            <details className="amx-details">
              <summary>path</summary>
              <div className="amx-toolbar-grid" style={{ marginTop: 10 }}>
                <label>
                  path start
                  <select value={pathStart} onChange={(e) => setPathStart(e.target.value)}>
                    <option value="">(none)</option>
                    {nodeIds.map((id) => (
                      <option key={id} value={id}>
                        {(() => {
                          const label = nodeLabelById.get(id) || id;
                          return label === id ? label : `${label} (${id})`;
                        })()}
                      </option>
                    ))}
                  </select>
                </label>

                <label>
                  path end
                  <select value={pathEnd} onChange={(e) => setPathEnd(e.target.value)}>
                    <option value="">(none)</option>
                    {nodeIds.map((id) => (
                      <option key={id} value={id}>
                        {(() => {
                          const label = nodeLabelById.get(id) || id;
                          return label === id ? label : `${label} (${id})`;
                        })()}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              {path ? (
                <div className="amx-small" style={{ marginTop: 10 }}>
                  {pathSegments.map((seg, idx) => {
                    const fromLabel = nodeLabelById.get(seg.from) || seg.from;
                    const toLabel = nodeLabelById.get(seg.to) || seg.to;
                    const arrow = seg.dir === 'reverse' ? ' ← ' : ' → ';
                    const pred = seg.predicate ? ` (${seg.predicate})` : '';
                    return (
                      <div key={`${seg.edgeId}:${idx}`}>
                        {idx === 0 ? <span>{fromLabel}</span> : null}
                        {arrow}
                        <span>
                          {toLabel}
                          {pred}
                        </span>
                      </div>
                    );
                  })}
                </div>
              ) : pathStart && pathEnd ? (
                <div className="amx-small" style={{ marginTop: 10, opacity: 0.9 }}>
                  No path found in the current subgraph ({noPathDiagnostics?.assertions ?? itemCount} assertions · {noPathDiagnostics?.nodes ?? graph.nodes.length} nodes ·{' '}
                  {noPathDiagnostics?.edges ?? graph.edges.length} edges). Start reaches {noPathDiagnostics?.reachableFromStart ?? 0} nodes.
                  {onQuery ? (
                    <div style={{ marginTop: 10 }}>
                      <button type="button" className="amx-btn" onClick={() => void expandNeighborhoodForPath()} disabled={expandLoading}>
                        {expandLoading ? 'Expanding…' : 'Expand neighborhood'}
                      </button>
                    </div>
                  ) : null}
                </div>
              ) : (
                <div className="amx-small" style={{ marginTop: 10 }}>
                  (no path)
                </div>
              )}
            </details>

            <details className="amx-details">
              <summary>query</summary>
              <div className="amx-toolbar-grid" style={{ marginTop: 10 }}>
                <label>
                  query_text (semantic)
                  <input value={queryText} onChange={(e) => setQueryText(e.target.value)} placeholder="e.g. emotion chip" />
                </label>

                <label>
                  subject (exact)
                  <input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="e.g. ex:person-data" />
                </label>

                <label>
                  predicate (exact)
                  <input value={predicate} onChange={(e) => setPredicate(e.target.value)} placeholder="e.g. schema:about" />
                </label>

                <label>
                  object (exact)
                  <input value={object} onChange={(e) => setObject(e.target.value)} placeholder="e.g. ex:concept-emotion-chip" />
                </label>

                <label>
                  min_score
                  <input type="number" step="any" value={minScore} onChange={(e) => setMinScore(e.target.value)} placeholder="(auto)" />
                </label>

                <label>
                  limit
                  <input
                    type="number"
                    min="-1"
                    step="1"
                    value={limit}
                    onChange={(e) => setLimit(e.target.value)}
                    placeholder="0/-1 = unlimited (if supported)"
                  />
                </label>
              </div>
            </details>

            <details className="amx-details">
              <summary>advanced</summary>
              <div className="amx-toolbar-grid" style={{ marginTop: 10 }}>
                <label>
                  scope
                  <select value={scope} onChange={(e) => setScope(normalizeScope(e.target.value, scope))}>
                    <option value="run">run</option>
                    <option value="session">session</option>
                    <option value="global">global</option>
                    <option value="all">all</option>
                  </select>
                </label>

                <label>
                  recall level
                  <select value={recallLevel} onChange={(e) => setRecallLevel((e.target.value as RecallLevel) || 'standard')}>
                    <option value="urgent">urgent</option>
                    <option value="standard">standard</option>
                    <option value="deep">deep</option>
                  </select>
                </label>

                <label>
                  max_input_tokens
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={maxInputTokens}
                    onChange={(e) => setMaxInputTokens(e.target.value)}
                    placeholder="(auto)"
                  />
                </label>

                <label>
                  model (budgeting)
                  <input value={model} onChange={(e) => setModel(e.target.value)} placeholder="qwen/qwen3-next-80b" />
                </label>
              </div>
            </details>

            <div className="amx-actions">
              <button type="button" className="amx-btn" onClick={() => void runQuery()} disabled={!onQuery || queryLoading}>
                {queryLoading ? 'Querying…' : 'Query store'}
              </button>
              <button type="button" className="amx-btn" onClick={resetToStep} disabled={!override && !queryError && !queryLoading}>
                Reset to step output
              </button>
              {override ? (
                <span className="amx-small">showing: {overrideKind || 'live query'}</span>
              ) : (
                <span className="amx-small">showing: step output</span>
              )}
              {queryError ? <span className="amx-small" style={{ color: 'rgba(255, 80, 80, 0.95)' }}>{queryError}</span> : null}
              {expandError ? <span className="amx-small" style={{ color: 'rgba(255, 80, 80, 0.95)' }}>{expandError}</span> : null}
            </div>

	          </div>
	        </details>
	        </div>
	      </div>

      <div className="amx-right">
        <div className="amx-panel">
          <h3>Details</h3>
          <div className="amx-small" style={{ marginBottom: 8 }}>
            Derived from `memory_kg_query` packetization (max_input_tokens); safe to inject into an LLM system prompt.
          </div>
          {(() => {
            const s = formatEffort(displayEffort);
            if (!s) return null;
            return (
              <div className="amx-small" style={{ marginBottom: 8, opacity: 0.9 }}>
                {s}
              </div>
            );
          })()}
          {(() => {
            const w = displayWarnings;
            if (!w) return null;
            const text = typeof w === 'string' ? w : Array.isArray(w) ? w.map((x) => String(x)).join(' · ') : JSON.stringify(w);
            if (!text || !text.trim()) return null;
            return (
              <div className="amx-small" style={{ marginBottom: 8, color: 'rgba(255, 180, 90, 0.95)' }}>
                {text}
              </div>
            );
          })()}
          <div className="amx-small" style={{ marginBottom: 8, opacity: 0.9 }}>
            {(() => {
              const pv = override?.packets_version ?? stepPacketsVersion;
              const pc = override?.packed_count ?? stepPackedCount;
              const dr = override?.dropped ?? stepDropped;
              const et = override?.estimated_tokens ?? stepEstimatedTokens;
              const parts: string[] = [];
              if (typeof pv === 'number') parts.push(`packets_v${pv}`);
              if (typeof pc === 'number') parts.push(`packed=${pc}`);
              if (typeof dr === 'number') parts.push(`dropped=${dr}`);
              if (typeof et === 'number') parts.push(`est_tokens=${et}`);
              return parts.length ? parts.join(' · ') : 'No packetization stats (set max_input_tokens > 0).';
            })()}
          </div>
          <div className="amx-active-memory">{renderHighlight(displayActiveMemoryText || '(empty)', search)}</div>
          {(() => {
            const pkts = (override?.packets && Array.isArray(override.packets) ? override.packets : stepPackets) as JsonValue[];
            if (!Array.isArray(pkts) || pkts.length === 0) return null;
            return (
              <div style={{ marginTop: 10 }}>
                <button type="button" className="amx-btn" onClick={() => setShowPackets((v) => !v)}>
                  {showPackets ? 'Hide' : 'Show'} packets ({pkts.length})
                </button>
                {showPackets ? (
                  <div className="amx-list" style={{ marginTop: 10 }}>
                    {pkts.slice(0, 120).map((p, idx) => {
                      const obj = p && typeof p === 'object' && !Array.isArray(p) ? (p as Record<string, any>) : null;
                      const stmt = obj && typeof obj.statement === 'string' ? obj.statement : typeof p === 'string' ? p : '';
                      const score = obj && (typeof obj.retrieval_score === 'number' || typeof obj.retrieval_score === 'string') ? obj.retrieval_score : null;
                      const ts = obj && typeof obj.observed_at === 'string' ? obj.observed_at : null;
                      return (
                        <div key={idx} className="amx-item">
                          <div className="amx-mono">{stmt || '(packet)'}</div>
                          {ts || score !== null ? (
                            <div className="amx-small">
                              {ts ? `[${ts}]` : null}
                              {ts && score !== null ? ' ' : null}
                              {score !== null ? `score:${score}` : null}
                            </div>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                ) : null}
              </div>
            );
          })()}
          <div style={{ marginTop: 14, marginBottom: 12, borderTop: '1px solid rgba(255,255,255,0.08)' }} />
          <div className="amx-small" style={{ marginBottom: 8, fontWeight: 700, opacity: 0.9 }}>
            Inspect
          </div>
          <div className="amx-small" style={{ marginBottom: 8 }}>
            Click a node or edge to inspect its assertions.
          </div>
          {selectedNodeId ? (
            <div className="amx-item" style={{ marginBottom: 10, display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center' }}>
              <div style={{ minWidth: 0 }}>
                <div className="amx-mono" style={{ fontSize: 11, opacity: 0.95 }}>
                  {nodeLabelById.get(selectedNodeId) || selectedNodeId}
                </div>
                <div className="amx-small">
                  kind={nodeKindById.get(selectedNodeId) || 'entity'} · id={selectedNodeId}
                </div>
              </div>
              <div className="amx-actions">
                <button type="button" className="amx-btn" onClick={() => void copyText(selectedNodeId)}>
                  Copy id
                </button>
                <button type="button" className="amx-btn" onClick={fitSelected}>
                  Focus
                </button>
              </div>
            </div>
          ) : selectedEdge && selectedEdge.source && selectedEdge.target ? (
            <div className="amx-item" style={{ marginBottom: 10, display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center' }}>
              <div style={{ minWidth: 0 }}>
                <div className="amx-mono" style={{ fontSize: 11, opacity: 0.95 }}>
                  {selectedEdge.source} —{String(selectedEdge.label || selectedEdge.data?.predicateSummary || '').trim() || '?'}→ {selectedEdge.target}
                </div>
                <div className="amx-small">edge_id={selectedEdge.id}</div>
              </div>
              <div className="amx-actions">
                <button type="button" className="amx-btn" onClick={() => void copyText(selectedEdge.id)}>
                  Copy id
                </button>
                <button type="button" className="amx-btn" onClick={fitSelected}>
                  Fit
                </button>
              </div>
            </div>
          ) : (
            <div className="amx-small" style={{ marginBottom: 10, opacity: 0.9 }}>
              (no selection)
            </div>
          )}
          <div className="amx-list">
            {selectedAssertions.slice(0, 80).map((a, idx) => {
              const s = String(a.subject || '').trim();
              const p = String(a.predicate || '').trim();
              const o = String(a.object || '').trim();
              const sLabel = nodeLabelById.get(s) || s;
              const oLabel = nodeLabelById.get(o) || o;
              const sKind = nodeKindById.get(s) || 'entity';
              const oKind = nodeKindById.get(o) || 'entity';
              const sColor = kindColor(sKind);
              const oColor = kindColor(oKind);

              const t = formatUtcMinute(a.observed_at);
              const meta = formatAssertionMeta(a);
              const prov = a.provenance && typeof a.provenance === 'object' && !Array.isArray(a.provenance) ? (a.provenance as Record<string, any>) : null;
              const spanId = prov && typeof prov.span_id === 'string' ? prov.span_id.trim() : '';
              const writerRunId = prov && typeof prov.writer_run_id === 'string' ? prov.writer_run_id.trim() : '';
              const ownerId = typeof a.owner_id === 'string' ? a.owner_id.trim() : '';
              const spanRunId = writerRunId || ownerId;
              const canOpenSpan = Boolean((onOpenTranscript || onOpenSpan) && spanId && spanRunId);
              const canOpenRun = Boolean(onOpenTranscript && writerRunId && !spanId);
              const canOpen = canOpenSpan || canOpenRun;

              return (
                <div key={idx} className="amx-item amx-triple-card">
                  <div className="amx-triple-row">
                    <button
                      type="button"
                      className="amx-term"
                      style={{ borderColor: sColor.stroke, background: sColor.bg }}
                      title={s}
                      onClick={() => {
                        if (!s) return;
                        setSelectedEdgeId('');
                        setSelectedNodeId(s);
                      }}
                    >
                      {sLabel || s || '(subject)'}
                    </button>
                    <span className="amx-arrow">—</span>
                    <span className="amx-predicate" title={p}>
                      {shortTerm(p) || '(predicate)'}
                    </span>
                    <span className="amx-arrow">→</span>
                    <button
                      type="button"
                      className="amx-term"
                      style={{ borderColor: oColor.stroke, background: oColor.bg }}
                      title={o}
                      onClick={() => {
                        if (!o) return;
                        setSelectedEdgeId('');
                        setSelectedNodeId(o);
                      }}
                    >
                      {oLabel || o || '(object)'}
                    </button>
                  </div>
                  <div className="amx-triple-meta">
                    {t ? (
                      <span className="amx-small" title={String(a.observed_at || '')}>
                        [{t}]
                      </span>
                    ) : null}
                    {meta ? <span className="amx-small">{meta}</span> : null}
                  </div>
                  {spanId || writerRunId ? (
                    <div className="amx-triple-actions">
                      {spanId ? <span className="amx-small">span:{spanId}</span> : null}
                      {writerRunId ? <span className="amx-small">run:{writerRunId}</span> : null}
                      {canOpen ? (
                        <button
                          type="button"
                          className="amx-btn"
                          onClick={() => {
                            if (canOpenSpan && spanId && spanRunId) {
                              openTranscript({ run_id: spanRunId, span_id: spanId, assertion: a });
                              return;
                            }
                            if (canOpenRun && writerRunId) {
                              openTranscript({ run_id: writerRunId, assertion: a });
                            }
                          }}
                        >
                          Open transcript
                        </button>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>

        <div className="amx-panel">
          <h3>Transcript</h3>
          <div className="amx-small" style={{ marginBottom: 8 }}>
            Pivot from a triple to its provenance transcript (span/note artifact, or run input fallback).
          </div>
          {selectedSources.length ? (
            <div style={{ marginBottom: 12 }}>
              <div className="amx-small" style={{ marginBottom: 6, opacity: 0.85 }}>
                spans
              </div>
              <div className="amx-list" style={{ maxHeight: 320 }}>
                {selectedSources.slice(0, 60).map((src) => (
                  <div
                    key={`${src.span_run_id}|${src.span_id}`}
                    className="amx-item"
                    style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center' }}
                  >
                    <div style={{ minWidth: 0 }}>
                      <div className="amx-mono" style={{ fontSize: 11, opacity: 0.95 }}>
                        span:{src.span_id}
                      </div>
                      <div className="amx-small">
                        run_id={src.span_run_id} · assertions={src.count}
                        {src.last_observed_at_fmt ? ` · last=[${src.last_observed_at_fmt}]` : ''}
                      </div>
                    </div>
                    {onOpenSpan || onOpenTranscript ? (
                      <button
                        type="button"
                        className="amx-btn"
                        onClick={() => openTranscript({ run_id: src.span_run_id, span_id: src.span_id, assertion: src.assertion })}
                      >
                        Open transcript
                      </button>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {onOpenTranscript && selectedRunTranscripts.length ? (
            <div style={{ marginBottom: 12 }}>
              <div className="amx-small" style={{ marginBottom: 6, opacity: 0.85 }}>
                runs (fallback)
              </div>
              <div className="amx-list" style={{ maxHeight: 240 }}>
                {selectedRunTranscripts.slice(0, 40).map((src) => (
                  <div
                    key={src.run_id}
                    className="amx-item"
                    style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center' }}
                  >
                    <div style={{ minWidth: 0 }}>
                      <div className="amx-mono" style={{ fontSize: 11, opacity: 0.95 }}>
                        run:{src.run_id}
                      </div>
                      <div className="amx-small">
                        assertions={src.count}
                        {src.last_observed_at_fmt ? ` · last=[${src.last_observed_at_fmt}]` : ''}
                      </div>
                    </div>
                    <button
                      type="button"
                      className="amx-btn"
                      onClick={() => openTranscript({ run_id: src.run_id, assertion: src.assertion })}
                    >
                      Open transcript
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {!selectedSources.length && !(onOpenTranscript && selectedRunTranscripts.length) ? <div className="amx-small">(no provenance)</div> : null}
        </div>
      </div>
    </div>
  );
}
