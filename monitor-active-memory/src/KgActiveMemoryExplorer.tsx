import { useCallback, useEffect, useMemo, useState } from 'react';
import ReactFlow, { Background, Controls, MiniMap, type Edge, type Node } from 'reactflow';

import { buildKgGraph, shortestPath } from './graph';
import type { KgAssertion, KgQueryParams, KgQueryResult, MemoryScope } from './types';
import './styles.css';

export interface KgActiveMemoryExplorerProps {
  title?: string;
  items: KgAssertion[];
  activeMemoryText?: string;
  onQuery?: (params: KgQueryParams) => Promise<KgQueryResult>;
}

function normalizeScope(value: unknown, fallback: MemoryScope = 'session'): MemoryScope {
  const s = String(value ?? '')
    .trim()
    .toLowerCase();
  if (s === 'run' || s === 'session' || s === 'global' || s === 'all') return s;
  return fallback;
}

function normalizeNumber(value: unknown, fallback: number): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return fallback;
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

export function KgActiveMemoryExplorer({ title, items, activeMemoryText, onQuery }: KgActiveMemoryExplorerProps) {
  const stepSig = useMemo(() => {
    const first = items?.[0];
    const last = items?.[items.length - 1];
    const f = first ? `${first.subject}|${first.predicate}|${first.object}` : '';
    const l = last ? `${last.subject}|${last.predicate}|${last.object}` : '';
    return `${items?.length || 0}:${f}:${l}`;
  }, [items]);

  const [override, setOverride] = useState<KgQueryResult | null>(null);
  const [queryLoading, setQueryLoading] = useState(false);
  const [queryError, setQueryError] = useState<string>('');

  useEffect(() => {
    setOverride(null);
    setQueryError('');
    setQueryLoading(false);
  }, [stepSig]);

  const [search, setSearch] = useState('');
  const [groupEdges, setGroupEdges] = useState(true);
  const [directedPath, setDirectedPath] = useState(true);

  const [pathStart, setPathStart] = useState<string>('');
  const [pathEnd, setPathEnd] = useState<string>('');

  const inferredScope = useMemo(() => {
    const s = items?.[0]?.scope;
    return normalizeScope(s, 'session');
  }, [items]);

  const [scope, setScope] = useState<MemoryScope>(inferredScope);
  const [queryText, setQueryText] = useState('');
  const [subject, setSubject] = useState('');
  const [predicate, setPredicate] = useState('');
  const [object, setObject] = useState('');
  const [minScore, setMinScore] = useState<number>(0.4);
  const [limit, setLimit] = useState<number>(80);
  const [maxInputTokens, setMaxInputTokens] = useState<number>(1200);
  const [model, setModel] = useState<string>('qwen/qwen3-next-80b');

  // If the step changes, update scope to match (but don’t clobber if user already chose a value).
  useEffect(() => {
    setScope(inferredScope);
  }, [inferredScope]);

  const stepItems = Array.isArray(items) ? items : [];
  const stepActiveMemoryText = typeof activeMemoryText === 'string' ? activeMemoryText : '';

  const displayItems = override?.items && Array.isArray(override.items) ? override.items : stepItems;
  const displayActiveMemoryText =
    typeof override?.active_memory_text === 'string' && override.active_memory_text.trim()
      ? override.active_memory_text
      : stepActiveMemoryText;

  const graph = useMemo(() => buildKgGraph(displayItems, { groupEdges }), [displayItems, groupEdges]);

  const nodeIds = useMemo(() => graph.nodes.map((n) => n.id), [graph.nodes]);
  const nodeLabelById = useMemo(() => {
    const m = new Map<string, string>();
    for (const n of graph.nodes) m.set(n.id, String(n.data?.label || n.id));
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

  const path = useMemo(() => {
    const s = String(pathStart || '').trim();
    const e = String(pathEnd || '').trim();
    if (!s || !e) return null;
    return shortestPath(graph, s, e, { directed: directedPath });
  }, [graph, pathStart, pathEnd, directedPath]);

  const selectedPathNodeSet = useMemo(() => new Set(path?.nodeIds || []), [path]);
  const selectedPathEdgeSet = useMemo(() => new Set(path?.edgeIds || []), [path]);

  const [selectedNodeId, setSelectedNodeId] = useState<string>('');
  const [selectedEdgeId, setSelectedEdgeId] = useState<string>('');

  useEffect(() => {
    setSelectedNodeId('');
    setSelectedEdgeId('');
    setPathStart('');
    setPathEnd('');
  }, [stepSig]);

  const nodes: Node[] = useMemo(() => {
    return graph.nodes.map((n) => {
      const isPath = selectedPathNodeSet.has(n.id);
      const isMatch = matchedNodeIds.has(n.id);
      const isSelected = selectedNodeId === n.id;

      const borderColor = isPath ? 'rgba(168, 85, 247, 0.9)' : isMatch ? 'rgba(251, 191, 36, 0.85)' : 'rgba(255,255,255,0.14)';
      const shadow = isSelected ? '0 0 0 2px rgba(255,255,255,0.18), 0 10px 30px rgba(0,0,0,0.45)' : undefined;
      const bg = isPath ? 'rgba(168, 85, 247, 0.10)' : isMatch ? 'rgba(251, 191, 36, 0.08)' : 'rgba(0,0,0,0.18)';

      return {
        ...n,
        style: {
          ...(n.style || {}),
          border: `1px solid ${borderColor}`,
          borderRadius: 10,
          background: bg,
          color: 'rgba(255,255,255,0.92)',
          padding: 8,
          fontSize: 12,
          boxShadow: shadow,
          width: 180,
        },
      };
    });
  }, [graph.nodes, matchedNodeIds, selectedNodeId, selectedPathNodeSet]);

  const edges: Edge[] = useMemo(() => {
    return graph.edges.map((e) => {
      const isPath = selectedPathEdgeSet.has(e.id);
      const isSelected = selectedEdgeId === e.id;
      const stroke = isPath ? 'rgba(168, 85, 247, 0.9)' : 'rgba(255,255,255,0.18)';
      const width = isPath ? 2.75 : 1.5;
      const glow = isSelected ? 'drop-shadow(0 0 10px rgba(168, 85, 247, 0.25))' : undefined;
      return {
        ...e,
        style: {
          ...(e.style || {}),
          stroke,
          strokeWidth: width,
          filter: glow,
        },
        animated: false,
      };
    });
  }, [graph.edges, selectedEdgeId, selectedPathEdgeSet]);

  const selectedEdgeAssertions = useMemo(() => {
    if (!selectedEdgeId) return [];
    const e = graph.edges.find((x) => x.id === selectedEdgeId);
    const a = e && e.data && Array.isArray((e.data as any).assertions) ? ((e.data as any).assertions as KgAssertion[]) : [];
    return Array.isArray(a) ? a : [];
  }, [graph.edges, selectedEdgeId]);

  const selectedNodeAssertions = useMemo(() => {
    const id = String(selectedNodeId || '').trim();
    if (!id) return [];
    return displayItems.filter((a) => a && typeof a === 'object' && (a.subject === id || a.object === id));
  }, [displayItems, selectedNodeId]);

  const runQuery = useCallback(async () => {
    if (!onQuery) return;
    setQueryError('');
    setQueryLoading(true);
    try {
      const res = await onQuery({
        scope,
        owner_id: undefined,
        query_text: queryText || undefined,
        subject: subject || undefined,
        predicate: predicate || undefined,
        object: object || undefined,
        min_score: normalizeNumber(minScore, 0.0),
        limit: Math.max(1, Math.floor(normalizeNumber(limit, 80))),
        max_input_tokens: Math.max(0, Math.floor(normalizeNumber(maxInputTokens, 0))),
        model: model || undefined,
      });
      setOverride(res);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setQueryError(msg || 'Query failed');
    } finally {
      setQueryLoading(false);
    }
  }, [limit, maxInputTokens, minScore, model, object, onQuery, predicate, queryText, scope, subject]);

  const resetToStep = useCallback(() => {
    setOverride(null);
    setQueryError('');
    setQueryLoading(false);
  }, []);

  const header = title ? `KG snapshot (${title})` : 'KG snapshot';
  const nodeCount = graph.nodes.length;
  const edgeCount = graph.edges.length;
  const itemCount = displayItems.length;

  return (
    <div className="amx-root">
      <div className="amx-left">
        <div className="amx-panel" style={{ paddingBottom: 12 }}>
          <h3 style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10 }}>
            <span>{header}</span>
            <span className="amx-small">
              {itemCount} assertions · {nodeCount} nodes · {edgeCount} edges
            </span>
          </h3>

          <div className="amx-toolbar">
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
              directed (path)
              <select value={String(directedPath)} onChange={(e) => setDirectedPath(e.target.value === 'true')}>
                <option value="true">directed</option>
                <option value="false">undirected</option>
              </select>
            </label>

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
              path start
              <select value={pathStart} onChange={(e) => setPathStart(e.target.value)}>
                <option value="">(none)</option>
                {nodeIds.map((id) => (
                  <option key={id} value={id}>
                    {nodeLabelById.get(id) || id}
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
                    {nodeLabelById.get(id) || id}
                  </option>
                ))}
              </select>
            </label>

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
              <input value={String(minScore)} onChange={(e) => setMinScore(normalizeNumber(e.target.value, minScore))} placeholder="0.4" />
            </label>

            <label>
              limit
              <input value={String(limit)} onChange={(e) => setLimit(normalizeNumber(e.target.value, limit))} placeholder="80" />
            </label>

            <label>
              max_input_tokens
              <input
                value={String(maxInputTokens)}
                onChange={(e) => setMaxInputTokens(normalizeNumber(e.target.value, maxInputTokens))}
                placeholder="1200"
              />
            </label>

            <label>
              model (budgeting)
              <input value={model} onChange={(e) => setModel(e.target.value)} placeholder="qwen/qwen3-next-80b" />
            </label>

            <div className="amx-actions">
              <button type="button" className="amx-btn" onClick={() => void runQuery()} disabled={!onQuery || queryLoading}>
                {queryLoading ? 'Querying…' : 'Query store'}
              </button>
              <button type="button" className="amx-btn" onClick={resetToStep} disabled={!override && !queryError && !queryLoading}>
                Reset to step output
              </button>
              {override ? <span className="amx-small">showing: live query</span> : <span className="amx-small">showing: step output</span>}
              {queryError ? <span className="amx-small" style={{ color: 'rgba(255, 80, 80, 0.95)' }}>{queryError}</span> : null}
            </div>
          </div>
        </div>

        <div className="amx-graph" aria-label="Knowledge graph">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            defaultViewport={{ x: 0, y: 0, zoom: 1 }}
            nodesDraggable={false}
            nodesConnectable={false}
            elementsSelectable
            onNodeClick={(_, n) => {
              setSelectedEdgeId('');
              setSelectedNodeId(n.id);
            }}
            onEdgeClick={(_, e) => {
              setSelectedNodeId('');
              setSelectedEdgeId(e.id);
            }}
          >
            <Controls />
            <MiniMap />
            <Background gap={20} size={1} color="rgba(255,255,255,0.06)" />
          </ReactFlow>
        </div>
      </div>

      <div className="amx-right">
        <div className="amx-panel">
          <h3>Active Memory</h3>
          <div className="amx-small" style={{ marginBottom: 8 }}>
            Derived from `memory_kg_query` packetization (max_input_tokens); safe to inject into an LLM system prompt.
          </div>
          <div className="amx-active-memory">{renderHighlight(displayActiveMemoryText || '(empty)', search)}</div>
        </div>

        <div className="amx-panel">
          <h3>Inspect</h3>
          <div className="amx-small" style={{ marginBottom: 8 }}>
            Click a node or edge to inspect its assertions.
          </div>
          <div className="amx-list">
            {(selectedEdgeId ? selectedEdgeAssertions : selectedNodeAssertions).slice(0, 80).map((a, idx) => (
              <div key={idx} className="amx-item">
                <div className="amx-mono">
                  {a.subject} —{a.predicate}→ {a.object}
                </div>
                {a.observed_at ? <div className="amx-small">[{a.observed_at}]</div> : null}
              </div>
            ))}
            {!selectedEdgeId && !selectedNodeId ? <div className="amx-small">(no selection)</div> : null}
          </div>
        </div>

        <div className="amx-panel">
          <h3>Path</h3>
          <div className="amx-small" style={{ marginBottom: 8 }}>
            Select start/end nodes to compute a shortest path within the loaded subgraph.
          </div>
          {path ? (
            <div className="amx-small">
              {path.nodeIds.map((id, i) => (
                <span key={id}>
                  {i > 0 ? ' → ' : ''}
                  {nodeLabelById.get(id) || id}
                </span>
              ))}
            </div>
          ) : (
            <div className="amx-small">(no path)</div>
          )}
        </div>
      </div>
    </div>
  );
}

