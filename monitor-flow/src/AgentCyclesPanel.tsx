import { useMemo, useState } from "react";

import "./agent_cycles.css";
import { JsonViewer } from "./JsonViewer";
import { Markdown } from "./Markdown";

export type TraceStep = Record<string, unknown>;

export type TraceItem = {
  id: string;
  runId: string;
  nodeId: string;
  ts?: string;
  status: string;
  step: TraceStep;
};

type TabId = "system" | "user" | "tools" | "response" | "reasoning" | "errors" | "raw";
type TabSpec = { id: TabId; label: string; hidden?: boolean };

type ToolResult = {
  call_id?: string;
  name: string;
  success: boolean;
  output?: unknown;
  error?: unknown;
};

type ToolCall = {
  call_id?: string;
  name: string;
  args: Record<string, unknown>;
};

type AgentCycle = {
  id: string;
  index: number;
  items: TraceItem[];
  think: TraceItem | null;
  acts: TraceItem[];
  others: TraceItem[];
  status: string;
  ts?: string;
};

export type AgentCyclesPanelProps = {
  items: TraceItem[];
  subRunId?: string | null;
  title?: string;
  subtitle?: string;
  onOpenSubRun?: () => void;
  defaultOpenLatest?: boolean;
};

async function copy_text(text: string): Promise<void> {
  const value = String(text || "");
  if (!value) return;
  try {
    await navigator.clipboard.writeText(value);
  } catch {
    const el = document.createElement("textarea");
    el.value = value;
    document.body.appendChild(el);
    el.select();
    document.execCommand("copy");
    document.body.removeChild(el);
  }
}

function as_record(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object") return null;
  return value as Record<string, unknown>;
}

function clamp_inline(text: string, max_len: number): string {
  const value = String(text || "").replace(/\s+/g, " ").trim();
  if (!value) return "";
  if (value.length <= max_len) return value;
  return `${value.slice(0, Math.max(0, max_len - 1)).trimEnd()}…`;
}

type LlmMessage = {
  role: string;
  content: string;
  name?: string;
};

function as_llm_message(value: unknown): LlmMessage | null {
  const obj = as_record(value);
  if (!obj) return null;
  const role = typeof (obj as any).role === "string" ? String((obj as any).role).trim() : "";
  const content = typeof (obj as any).content === "string" ? String((obj as any).content) : "";
  if (!role || content === "") return null;
  const name = typeof (obj as any).name === "string" ? String((obj as any).name).trim() : "";
  return { role, content, name: name || undefined };
}

function as_llm_messages(value: unknown): LlmMessage[] | null {
  if (Array.isArray(value)) {
    if (value.length === 0) return null;
    const out: LlmMessage[] = [];
    for (const item of value) {
      const msg = as_llm_message(item);
      if (!msg) return null;
      out.push(msg);
    }
    return out;
  }
  const single = as_llm_message(value);
  return single ? [single] : null;
}

function try_parse_json_container(text: string): unknown | null {
  const trimmed = String(text || "").trim();
  if (!trimmed) return null;
  const starts = trimmed[0];
  const ends = trimmed[trimmed.length - 1];
  const looks_like_container = (starts === "{" && ends === "}") || (starts === "[" && ends === "]");
  if (!looks_like_container) return null;
  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (parsed && typeof parsed === "object") return parsed;
    if (Array.isArray(parsed)) return parsed;
    return null;
  } catch {
    return null;
  }
}

function looks_like_markdown(text: string): boolean {
  const s = String(text || "");
  if (!s.trim()) return false;
  if (s.includes("```")) return true;
  if (/\n\s*#{1,3}\s+/.test(s)) return true;
  if (/\n\s*[-*]\s+/.test(s)) return true;
  if (/\n\s*\d+[\.\)]\s+/.test(s)) return true;
  if (s.includes("**")) return true;
  if (s.includes("`")) return true;
  return false;
}

function AutoText({ text }: { text: string }): React.ReactElement {
  const raw = String(text || "");
  const parsed = try_parse_json_container(raw);
  if (parsed !== null) return <JsonViewer value={parsed} />;

  const trimmed = raw.trim();
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    return <pre className="run-details-output">{raw || "(none)"}</pre>;
  }

  if (raw.includes("\n") || looks_like_markdown(raw)) {
    return (
      <div className="run-details-output">
        <Markdown text={raw} />
      </div>
    );
  }

  return <pre className="run-details-output">{raw || "(none)"}</pre>;
}

function AutoValue({ value }: { value: unknown }): React.ReactElement {
  if (value == null) return <pre className="run-details-output">(none)</pre>;
  const messages = as_llm_messages(value);
  if (messages) {
    return (
      <div className="mf-msg-list">
        {messages.map((m, idx) => (
          <div key={`${m.role}:${idx}`} className="mf-msg">
            <div className="mf-msg-meta">
              <span className={`mf-msg-role ${m.role}`}>{m.role}</span>
              {m.name ? <span className="mf-msg-name">{m.name}</span> : null}
            </div>
            <div className="mf-msg-content">
              <AutoText text={m.content} />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (typeof value === "string") return <AutoText text={value} />;
  return <JsonViewer value={value} />;
}

function effect_of(step: TraceStep): Record<string, unknown> | null {
  const effect = step.effect;
  if (!effect || typeof effect !== "object") return null;
  return effect as Record<string, unknown>;
}

function effect_type_of(step: TraceStep): string {
  const effect = effect_of(step);
  const t = effect && typeof effect.type === "string" ? effect.type : "";
  return t || "effect";
}

function payload_of(step: TraceStep): Record<string, unknown> | null {
  const effect = effect_of(step);
  const payload = effect?.payload;
  if (!payload || typeof payload !== "object") return null;
  return payload as Record<string, unknown>;
}

function result_of(step: TraceStep): Record<string, unknown> | null {
  const r = step.result;
  if (!r || typeof r !== "object") return null;
  return r as Record<string, unknown>;
}

function tool_results_for_step(step: TraceStep): ToolResult[] {
  const t = effect_type_of(step);
  if (t !== "tool_calls") return [];
  const res = result_of(step);
  const raw = res && Array.isArray(res.results) ? res.results : null;
  if (!raw) return [];
  const out: ToolResult[] = [];
  for (const r of raw) {
    const ro = as_record(r);
    if (!ro) continue;
    const name = typeof ro.name === "string" ? ro.name.trim() : "";
    if (!name) continue;
    out.push({
      call_id: typeof ro.call_id === "string" ? ro.call_id : undefined,
      name,
      success: Boolean(ro.success),
      output: ro.output,
      error: ro.error,
    });
  }
  return out;
}

function tool_calls_for_step(step: TraceStep): ToolCall[] {
  const t = effect_type_of(step);
  if (t !== "tool_calls") return [];
  const payload = payload_of(step);
  const raw = payload && Array.isArray(payload.tool_calls) ? payload.tool_calls : null;
  if (!raw) return [];
  const out: ToolCall[] = [];
  for (const c of raw) {
    const co = as_record(c);
    if (!co) continue;
    const name = typeof co.name === "string" ? co.name.trim() : "";
    if (!name) continue;
    const args = as_record(co.args) || as_record(co.arguments) || {};
    out.push({
      call_id: typeof co.call_id === "string" ? co.call_id : undefined,
      name,
      args,
    });
  }
  return out;
}

function error_text_of(step: TraceStep): string {
  const err = step.error;
  if (typeof err === "string") return err.trim();
  const ro = as_record(err);
  if (ro) {
    const msg = typeof ro.message === "string" ? ro.message.trim() : "";
    const stack = typeof ro.stack === "string" ? ro.stack.trim() : "";
    return msg || stack || "";
  }
  return "";
}

function reasoning_text_of_result(res: Record<string, unknown> | null): string {
  if (!res) return "";
  const raw = (res as any).reasoning;
  if (typeof raw === "string") return raw.trim();
  const rr = as_record(raw);
  const txt = rr && typeof rr.text === "string" ? rr.text.trim() : "";
  return txt;
}

function preview_for_step(step: TraceStep): string {
  const t = effect_type_of(step);
  const payload = payload_of(step);
  const res = result_of(step);

  const clamp = (text: string, max_len: number) => {
    const value = String(text || "").replace(/\s+/g, " ").trim();
    if (!value) return "";
    if (value.length <= max_len) return value;
    return `${value.slice(0, Math.max(0, max_len - 1)).trimEnd()}…`;
  };

  if (t === "llm_call") {
    const content = (res as any)?.content;
    const text = typeof content === "string" ? content.replace(/\s+/g, " ").trim() : "";
    const reasoning = reasoning_text_of_result(res);
    const tool_calls = Array.isArray((res as any)?.tool_calls) ? (res as any).tool_calls : null;
    const has_tool_calls = Boolean(tool_calls && tool_calls.length > 0);
    const preferred = has_tool_calls ? reasoning || text : text || reasoning;
    return clamp(preferred, 220);
  }

  if (t === "tool_calls") {
    const results = res && Array.isArray((res as any).results) ? (res as any).results : null;
    if (!results) return "";
    const failed = results.filter((r: any) => as_record(r)?.success === false);
    if (failed.length > 0) return `${failed.length} tool call(s) failed`;
    return `${results.length} tool call(s) executed`;
  }

  if (t === "ask_user") {
    const prompt = payload && typeof (payload as any).prompt === "string" ? String((payload as any).prompt).trim() : "";
    return prompt;
  }

  return "";
}

function effective_status_for_item(item: TraceItem): string {
  const status = typeof item.status === "string" ? item.status : "unknown";
  if (status === "failed") return "failed";
  const errs = error_text_of(item.step);
  if (errs) return "failed";
  return status;
}

function combine_status(items: TraceItem[]): string {
  const statuses = items.map((i) => effective_status_for_item(i));
  if (statuses.some((s) => s === "failed")) return "failed";
  if (statuses.some((s) => s === "waiting")) return "waiting";
  if (statuses.some((s) => s === "running")) return "running";
  return "completed";
}

function visible_tabs(tabs: TabSpec[]): TabSpec[] {
  return tabs.filter((t) => !t.hidden);
}

function tabs_for_step(step: TraceStep): TabSpec[] {
  const t = effect_type_of(step);
  const errs = error_text_of(step);
  if (t === "llm_call") {
    return visible_tabs([
      { id: "system", label: "System" },
      { id: "user", label: "User" },
      { id: "tools", label: "Tools" },
      { id: "response", label: "Response" },
      { id: "reasoning", label: "Reasoning" },
      { id: "errors", label: "Errors", hidden: !errs },
      { id: "raw", label: "Raw" },
    ]);
  }
  if (t === "tool_calls") {
    return visible_tabs([
      { id: "tools", label: "Tools" },
      { id: "errors", label: "Errors", hidden: !errs },
      { id: "raw", label: "Raw" },
    ]);
  }
  return visible_tabs([
    { id: "errors", label: "Errors", hidden: !errs },
    { id: "raw", label: "Raw" },
  ]);
}

function default_tab_for_step(step: TraceStep): TabId {
  const t = effect_type_of(step);
  if (t === "llm_call") return "user";
  if (t === "tool_calls") return "tools";
  if (error_text_of(step)) return "errors";
  return "raw";
}

function tool_defs_from_think_step(step: TraceStep): Map<string, string[]> {
  const out = new Map<string, string[]>();
  const payload = payload_of(step);
  const tools = payload && Array.isArray((payload as any).tools) ? (payload as any).tools : null;
  if (!tools) return out;
  for (const t of tools) {
    const to = as_record(t);
    if (!to) continue;
    const name = typeof to.name === "string" ? to.name.trim() : "";
    if (!name) continue;
    const params = Array.isArray((to as any).parameters) ? ((to as any).parameters as any[]) : [];
    const args = params
      .map((p) => {
        const po = as_record(p);
        const id = po && typeof po.id === "string" ? po.id.trim() : "";
        return id || "";
      })
      .filter(Boolean);
    out.set(name, args);
  }
  return out;
}

function format_tool_signature(name: string, args: Record<string, unknown>, param_order: string[] | null): string {
  const keys = Object.keys(args || {});
  const ordered = param_order && param_order.length ? param_order.filter((k) => keys.includes(k)) : [];
  const rest = keys.filter((k) => !ordered.includes(k)).sort();
  const all = [...ordered, ...rest];
  const parts = all.slice(0, 5).map((k) => {
    const v = args[k];
    if (typeof v === "string") return `${k}=${JSON.stringify(clamp_inline(v, 42))}`;
    if (typeof v === "number" || typeof v === "boolean") return `${k}=${String(v)}`;
    if (v == null) return `${k}=null`;
    return `${k}=${clamp_inline(JSON.stringify(v), 42)}`;
  });
  return `${name}(${parts.join(", ")}${all.length > 5 ? ", …" : ""})`;
}

function trace_step_time_label(item: TraceItem): string {
  const ts = item.ts ? String(item.ts) : "";
  if (!ts) return "";
  try {
    const d = new Date(ts);
    const s = Number.isFinite(d.getTime()) ? d.toLocaleTimeString() : "";
    return s;
  } catch {
    return "";
  }
}

function TraceStepCard({ item, label, toolDefs }: { item: TraceItem; label: string; toolDefs: Map<string, string[]> }): React.ReactElement {
  const step = item.step;
  const kind = effect_type_of(step);
  const tabs = tabs_for_step(step);
  const default_tab = default_tab_for_step(step);
  const [tab, set_tab] = useState<TabId>(default_tab);

  const payload = payload_of(step);
  const res = result_of(step);
  const errs = error_text_of(step);

  const time_label = trace_step_time_label(item);
  const node = item.nodeId ? String(item.nodeId) : "";
  const run = item.runId ? String(item.runId) : "";

  const tool_calls = kind === "tool_calls" ? tool_calls_for_step(step) : [];
  const tool_results = kind === "tool_calls" ? tool_results_for_step(step) : [];
  const tool_sigs = tool_calls.map((tc) => format_tool_signature(tc.name, tc.args, toolDefs.get(tc.name) || null));

  const output_for_tab = (): unknown => {
    if (tab === "raw") return step;
    if (tab === "errors") return errs || null;

    if (kind === "llm_call") {
      const p = payload || {};
      const system_prompt = typeof (p as any).system_prompt === "string" ? String((p as any).system_prompt) : "";
      const prompt = typeof (p as any).prompt === "string" ? String((p as any).prompt) : "";

      // Prefer the *effective* provider-visible message list when available (includes runtime injections
      // like session attachments + tool activity). Fall back to the raw payload.
      const meta = as_record((res as any)?.metadata);
      const obs = meta ? as_record((meta as any)._runtime_observability) : null;
      const obs_kwargs = obs ? as_record((obs as any).llm_generate_kwargs) : null;
      const obs_messages = obs_kwargs && Array.isArray((obs_kwargs as any).messages) ? ((obs_kwargs as any).messages as any[]) : null;

      const preq = meta ? as_record((meta as any)._provider_request) : null;
      const preq_payload = preq ? as_record((preq as any).payload) : null;
      const preq_messages = preq_payload && Array.isArray((preq_payload as any).messages) ? ((preq_payload as any).messages as any[]) : null;

      const raw_payload_messages = Array.isArray((p as any).messages) ? ((p as any).messages as any[]) : [];
      const raw_messages = obs_messages || preq_messages || raw_payload_messages;

      const system = raw_messages.filter((m: any) => String(m?.role || "").trim() === "system");
      // "User" tab is strictly the user prompt/messages (never assistant/tool output).
      const user = raw_messages.filter((m: any) => String(m?.role || "").trim() === "user");
      if (tab === "system") {
        const out: any[] = [];
        const sp = system_prompt.trim();
        const dup_system_prompt =
          Boolean(sp) &&
          system.some((m: any) => typeof m?.content === "string" && String(m.content).trim() === sp);
        if (sp && !dup_system_prompt) out.push({ role: "system", name: "system_prompt", content: system_prompt });
        out.push(...system);
        return out;
      }
      if (tab === "user") {
        const out: any[] = [];
        const pr = prompt.trim();
        const dup_prompt =
          Boolean(pr) &&
          user.some((m: any) => typeof m?.content === "string" && String(m.content).trim() === pr);
        if (pr && !dup_prompt) out.push({ role: "user", name: "prompt", content: prompt });
        out.push(...user);
        return out;
      }
      if (tab === "tools") return (p as any).tools || [];
      if (tab === "response") {
        const content = (res as any)?.content;
        if (typeof content === "string" && content.trim()) return content;
        const out = (res as any)?.output;
        if (out !== undefined) return out;
        const tool_calls = Array.isArray((res as any)?.tool_calls) ? (res as any).tool_calls : null;
        if (tool_calls && tool_calls.length) return { tool_calls };
        return res;
      }
      if (tab === "reasoning") return reasoning_text_of_result(res) || null;
    }

    if (kind === "tool_calls") {
      if (tab === "tools") return { tool_calls, tool_signatures: tool_sigs, results: tool_results };
    }

    return step;
  };

  const output = output_for_tab();
  const preview = preview_for_step(step);

  const status = effective_status_for_item(item);
  const badge = status === "completed" ? "OK" : status === "failed" ? "ERROR" : status === "waiting" ? "WAITING" : status.toUpperCase();

  return (
    <details className={`agent-trace-entry ${status}`} open={false}>
      <summary className="agent-trace-summary">
        <span className={`agent-trace-status ${status}`}>{badge}</span>
        <span className="agent-cycle-stage">{label}</span>
        <span className="agent-trace-kind">{kind}</span>
        {time_label ? <span className="agent-trace-node">{time_label}</span> : null}
        {node ? <span className="agent-trace-node">{node}</span> : null}
        {run ? <span className="agent-trace-run">{run}</span> : null}
      </summary>
      {preview ? <div className="agent-trace-preview">{preview}</div> : null}
      <div className="agent-trace-body">
        <div className="agent-trace-tabs">
          {tabs.map((t) => (
            <button key={t.id} type="button" className={`agent-trace-tab ${t.id === tab ? "active" : ""}`} onClick={() => set_tab(t.id)}>
              {t.label}
            </button>
          ))}
        </div>
        <AutoValue value={output} />
      </div>
    </details>
  );
}

function ObserveCard({ acts }: { acts: TraceItem[] }): React.ReactElement {
  const all = acts.flatMap((a) => tool_results_for_step(a.step));
  const failed = all.filter((r) => r.success === false);
  const header = failed.length ? `${failed.length} error(s)` : all.length ? `${all.length} tool result(s)` : "(none)";
  const status = failed.length ? "failed" : "completed";

  return (
    <details className={`agent-trace-entry ${status}`} open={false}>
      <summary className="agent-trace-summary">
        <span className={`agent-trace-status ${status}`}>{failed.length ? "ERROR" : "OK"}</span>
        <span className="agent-cycle-stage">observe</span>
        <span className="agent-trace-kind">OBSERVATIONS</span>
        <span className="agent-trace-preview-inline">{header}</span>
      </summary>
      <div className="agent-observe-body">
        {all.length === 0 ? (
          <div className="agent-observe-empty">(no tool results)</div>
        ) : (
          <div className="agent-observe-results">
            {all.map((r, idx) => {
              const st = r.success ? "completed" : "failed";
              const badge = r.success ? "OK" : "ERROR";
              const output = r.success ? r.output : r.error ?? r.output;
              return (
                <details key={`${r.name}:${r.call_id || ""}:${idx}`} className={`agent-observe-result ${st}`} open={false}>
                  <summary className="agent-observe-summary">
                    <span className={`agent-trace-status ${st}`}>{badge}</span>
                    <span className="agent-observe-name">{r.name}</span>
                    {r.call_id ? <span className="agent-observe-callid">{r.call_id}</span> : null}
                  </summary>
                  <AutoValue value={output} />
                </details>
              );
            })}
          </div>
        )}
      </div>
    </details>
  );
}

export function AgentCyclesPanel({ items: items_in, subRunId, title, subtitle, onOpenSubRun, defaultOpenLatest = true }: AgentCyclesPanelProps): React.ReactElement | null {
  const items = useMemo(() => {
    const next = Array.isArray(items_in) ? items_in.slice() : [];
    next.sort((a, b) => {
      const ta = a.ts ? new Date(a.ts).getTime() : NaN;
      const tb = b.ts ? new Date(b.ts).getTime() : NaN;
      if (Number.isFinite(ta) && Number.isFinite(tb)) return ta - tb;
      return 0;
    });
    return next;
  }, [items_in]);

  const cycles = useMemo<AgentCycle[]>(() => {
    const out: AgentCycle[] = [];
    let current: AgentCycle | null = null;
    let idx = 0;

    for (const item of items) {
      const kind = effect_type_of(item.step);
      if (kind === "llm_call") {
        idx += 1;
        current = {
          id: `cycle:${item.runId}:${idx}:${item.ts || ""}`,
          index: idx,
          items: [item],
          think: item,
          acts: [],
          others: [],
          status: effective_status_for_item(item),
          ts: item.ts,
        };
        out.push(current);
        continue;
      }

      if (!current) {
        idx += 1;
        current = {
          id: `cycle:${item.runId}:${idx}:${item.ts || ""}`,
          index: idx,
          items: [],
          think: null,
          acts: [],
          others: [],
          status: effective_status_for_item(item),
          ts: item.ts,
        };
        out.push(current);
      }

      current.items.push(item);
      if (kind === "tool_calls") current.acts.push(item);
      else current.others.push(item);
      current.status = combine_status(current.items);
    }

    return out;
  }, [items]);

  const title_text = typeof title === "string" && title.trim() ? title.trim() : "Agent calls";
  const subtitle_text = typeof subtitle === "string" && subtitle.trim() ? subtitle.trim() : "Live per-effect trace (LLM/tool calls).";
  const sub_run_id = typeof subRunId === "string" ? subRunId.trim() : "";

  return (
    <div className="agent-trace-panel">
      <div className="agent-trace-header">
        <div className="agent-trace-title">{title_text}</div>
        <div className="agent-trace-subtitle">
          {subtitle_text}
          {sub_run_id ? (
            <span className="agent-trace-subrun">
              {" "}
              sub_run_id: {sub_run_id}
              <button
                type="button"
                className="agent-trace-copy"
                onClick={(e) => {
                  e.stopPropagation();
                  void copy_text(sub_run_id);
                }}
                title={`Copy sub_run_id: ${sub_run_id}`}
                aria-label="Copy sub run id"
              >
                ⧉
              </button>
              {onOpenSubRun ? (
                <button
                  type="button"
                  className="agent-trace-open"
                  onClick={(e) => {
                    e.stopPropagation();
                    onOpenSubRun();
                  }}
                  title="Open sub-run"
                >
                  Open
                </button>
              ) : null}
            </span>
          ) : null}
        </div>
      </div>

      {items.length === 0 ? (
        <div className="agent-trace-empty">No trace entries yet.</div>
      ) : (
        <div className="agent-cycle-list">
          <div className="agent-cycle-meta">{cycles.length} cycle(s)</div>
          {cycles.map((c) => {
            const status_raw = c.status;
            const status_label = status_raw === "completed" ? "OK" : status_raw === "failed" ? "ERROR" : status_raw === "waiting" ? "WAITING" : status_raw.toUpperCase();
            const status_icon = status_raw === "completed" ? "✓" : status_raw === "failed" ? "✗" : "";
            const status_text = status_icon ? `${status_icon} ${status_label}` : status_label;
            const think_preview = c.think ? preview_for_step(c.think.step) : "";
            const tool_defs = c.think ? tool_defs_from_think_step(c.think.step) : new Map<string, string[]>();
            const cycle_tool_calls = c.acts.flatMap((a) => tool_calls_for_step(a.step));
            const cycle_tool_sigs = cycle_tool_calls.map((tc) => format_tool_signature(tc.name, tc.args, tool_defs.get(tc.name) || null));
            const open_by_default = defaultOpenLatest && c.index === cycles.length;
            return (
              <details key={c.id} className={`agent-cycle ${status_raw}`} open={open_by_default}>
                <summary className="agent-cycle-summary">
                  <span className={`agent-trace-status ${status_raw}`}>{status_text}</span>
                  <span className="agent-cycle-label">cycle</span>
                  <span className="agent-cycle-index">#{c.index}</span>
                  {cycle_tool_sigs.length ? (
                    <span className="agent-trace-badges">
                      {cycle_tool_sigs.slice(0, 3).map((sig) => (
                        <span key={sig} className="run-metric-badge metric-tool" title={sig}>
                          {clamp_inline(sig, 62)}
                        </span>
                      ))}
                      {cycle_tool_sigs.length > 3 ? <span className="run-metric-badge metric-tool">+{cycle_tool_sigs.length - 3}</span> : null}
                    </span>
                  ) : null}
                  <span className="agent-cycle-spacer" />
                  {think_preview ? <span className="agent-cycle-preview">{think_preview}</span> : null}
                </summary>
                <div className="agent-cycle-body">
                  {c.think ? <TraceStepCard item={c.think} label="think" toolDefs={tool_defs} /> : null}
                  {c.acts.map((a) => (
                    <TraceStepCard key={a.id} item={a} label="act" toolDefs={tool_defs} />
                  ))}
                  <ObserveCard acts={c.acts} />
                  {c.others.length ? (
                    <div className="agent-cycle-others">
                      <div className="agent-cycle-others-title">other</div>
                      {c.others.map((o) => (
                        <TraceStepCard key={o.id} item={o} label="other" toolDefs={tool_defs} />
                      ))}
                    </div>
                  ) : null}
                </div>
              </details>
            );
          })}
        </div>
      )}
    </div>
  );
}
