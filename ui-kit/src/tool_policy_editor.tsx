/*
 * ToolPolicyEditor: shared allowlist + approval selector for thin clients.
 */
import React, { useMemo, useState } from "react";

export type ToolSpec = {
  name: string;
  description?: string;
  toolset?: string;
  when_to_use?: string;
};

export type ToolApprovalMode = "approve" | "ask";

export type ToolPolicyDefaults = {
  autoApprove: string[];
  requireApproval: string[];
};

export type ToolPolicySelection = {
  mode: "all" | "custom";
  selected: string[];
  approval: Record<string, ToolApprovalMode>;
};

export type ToolPolicyEditorProps = {
  tools: ToolSpec[];
  value: ToolPolicySelection;
  onChange: (next: ToolPolicySelection) => void;
  defaults?: ToolPolicyDefaults;
  disabled?: boolean;
  title?: string;
  subtitle?: string;
  note?: string;
  toolMode?: string;
  toolModeLabel?: string;
  toolModeDetail?: string;
  className?: string;
};

// Mirrors AbstractRuntime ToolApprovalPolicy defaults (keep in sync).
export const TOOL_POLICY_DEFAULTS: ToolPolicyDefaults = {
  autoApprove: [
    "list_files",
    "skim_folders",
    "analyze_code",
    "read_file",
    "skim_files",
    "search_files",
    "open_attachment",
    "web_search",
    "skim_websearch",
    "skim_url",
    "fetch_url",
    "list_email_accounts",
    "list_emails",
    "read_email",
    "list_whatsapp_messages",
    "read_whatsapp_message",
    "send_email",
    "send_whatsapp_message",
    "send_telegram_message",
    "send_telegram_artifact",
  ],
  requireApproval: ["write_file", "edit_file", "execute_command"],
};

function normalize_tools(items: ToolSpec[]): ToolSpec[] {
  const seen = new Set<string>();
  const out: ToolSpec[] = [];
  for (const it of items || []) {
    if (!it) continue;
    const name = String(it.name || "").trim();
    if (!name || seen.has(name)) continue;
    seen.add(name);
    out.push({
      name,
      description: typeof it.description === "string" ? it.description : undefined,
      toolset: typeof it.toolset === "string" ? it.toolset : undefined,
      when_to_use: typeof it.when_to_use === "string" ? it.when_to_use : undefined,
    });
  }
  out.sort((a, b) => {
    const a_set = String(a.toolset || "");
    const b_set = String(b.toolset || "");
    if (a_set !== b_set) return a_set.localeCompare(b_set);
    return a.name.localeCompare(b.name);
  });
  return out;
}

function default_mode_for(name: string, defaults: ToolPolicyDefaults): ToolApprovalMode {
  if (defaults.requireApproval.includes(name)) return "ask";
  if (defaults.autoApprove.includes(name)) return "approve";
  return "ask";
}

type ToolModeInfo = {
  label: string;
  detail: string;
  tone: "safe" | "warn" | "danger" | "info";
};

function describe_tool_mode(
  raw: string | undefined,
  override_label?: string,
  override_detail?: string
): ToolModeInfo | null {
  const mode = String(raw || "").trim().toLowerCase();
  if (!mode && !override_label && !override_detail) return null;

  let info: ToolModeInfo;
  if (mode === "approval" || mode === "local_approval" || mode === "local-approval") {
    info = { label: "APPROVAL", detail: "Safe tools auto-run; mutating tools ask for approval.", tone: "safe" };
  } else if (mode === "passthrough") {
    info = { label: "PASSTHROUGH", detail: "All tools require approval before execution.", tone: "warn" };
  } else if (mode === "delegated" || mode === "delegate" || mode === "job") {
    info = { label: "DELEGATED", detail: "Tool calls wait for external executors.", tone: "info" };
  } else if (mode === "local" || mode === "local_all" || mode === "local-all") {
    info = { label: "LOCAL", detail: "All tools run locally; client policy may still require approval.", tone: "danger" };
  } else {
    info = { label: "UNKNOWN", detail: "#FALLBACK: gateway tool mode not reported.", tone: "warn" };
  }

  if (override_label) info = { ...info, label: override_label };
  if (override_detail) info = { ...info, detail: override_detail };
  return info;
}

export function ToolPolicyEditor(props: ToolPolicyEditorProps): React.ReactElement {
  const defaults = props.defaults || TOOL_POLICY_DEFAULTS;
  const disabled = props.disabled === true;
  const title = props.title || "Tools";
  const subtitle =
    props.subtitle ||
    "Default is all tools. Safe/read-only tools auto-approve; mutating tools ask for approval.";
  const note = String(props.note || "").trim();
  const tool_mode = useMemo(
    () => describe_tool_mode(props.toolMode, props.toolModeLabel, props.toolModeDetail),
    [props.toolMode, props.toolModeLabel, props.toolModeDetail]
  );

  const tools = useMemo(() => normalize_tools(props.tools), [props.tools]);
  const all_names = useMemo(() => tools.map((t) => t.name), [tools]);
  const all_names_set = useMemo(() => new Set(all_names), [all_names]);

  const [filter, setFilter] = useState("");

  const selected = useMemo(() => {
    const raw = Array.isArray(props.value?.selected) ? props.value.selected : [];
    return raw.map((n) => String(n || "").trim()).filter((n) => n && all_names_set.has(n));
  }, [props.value?.selected, all_names_set]);

  const mode = props.value?.mode === "custom" ? "custom" : "all";

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return tools;
    return tools.filter((t) => {
      const name = t.name.toLowerCase();
      const desc = (t.description || "").toLowerCase();
      return name.includes(q) || desc.includes(q);
    });
  }, [tools, filter]);

  const effective_selected = mode === "all" ? new Set(all_names) : new Set(selected);

  const on_change = (next: ToolPolicySelection) => {
    props.onChange(next);
  };

  const toggle_mode = (next: "all" | "custom") => {
    if (disabled) return;
    on_change({ ...props.value, mode: next, selected });
  };

  const toggle_tool = (name: string, enabled: boolean) => {
    if (disabled) return;
    const set = new Set(selected);
    if (enabled) set.add(name);
    else set.delete(name);
    on_change({ ...props.value, selected: Array.from(set), mode: "custom" });
  };

  const set_approval = (name: string, mode_value: ToolApprovalMode) => {
    if (disabled) return;
    const next = { ...(props.value?.approval || {}) };
    next[name] = mode_value;
    on_change({ ...props.value, approval: next });
  };

  const select_all = () => {
    if (disabled) return;
    on_change({ ...props.value, selected: Array.from(all_names), mode: "custom" });
  };

  const select_none = () => {
    if (disabled) return;
    on_change({ ...props.value, selected: [], mode: "custom" });
  };

  const selected_count = effective_selected.size;

  return (
    <div className={`af-tool-policy ${props.className || ""}`.trim()}>
      <div className="af-tool-policy__header">
        <div className="af-tool-policy__title">{title}</div>
        <div className="af-tool-policy__subtitle">{subtitle}</div>
        {tool_mode ? (
          <div className={`af-tool-policy__mode is-${tool_mode.tone}`}>
            <div className="af-tool-policy__mode-badge">Tool mode</div>
            <div className="af-tool-policy__mode-value">{tool_mode.label}</div>
            <div className="af-tool-policy__mode-detail">{tool_mode.detail}</div>
          </div>
        ) : null}
        {note ? <div className="af-tool-policy__note">{note}</div> : null}
      </div>

      <div className="af-tool-policy__controls">
        <div className="af-tool-policy__segmented" role="tablist" aria-label="Tool allowlist mode">
          <button
            type="button"
            className={`af-tool-policy__seg-btn ${mode === "all" ? "is-active" : ""}`.trim()}
            onClick={() => toggle_mode("all")}
            disabled={disabled}
          >
            All tools
          </button>
          <button
            type="button"
            className={`af-tool-policy__seg-btn ${mode === "custom" ? "is-active" : ""}`.trim()}
            onClick={() => toggle_mode("custom")}
            disabled={disabled}
          >
            Custom allowlist
          </button>
        </div>

        <div className="af-tool-policy__count">
          {selected_count} / {all_names.length} enabled
        </div>

        <div className="af-tool-policy__bulk">
          <button type="button" onClick={select_all} disabled={disabled || mode !== "custom"}>
            Select all
          </button>
          <button type="button" onClick={select_none} disabled={disabled || mode !== "custom"}>
            Select none
          </button>
        </div>
      </div>

      <div className="af-tool-policy__filter">
        <input
          type="text"
          placeholder="Filter tools..."
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          disabled={disabled}
        />
      </div>

      <div className="af-tool-policy__list">
        {filtered.map((tool) => {
          const is_checked = effective_selected.has(tool.name);
          const approval = props.value?.approval?.[tool.name] || default_mode_for(tool.name, defaults);
          return (
            <div key={tool.name} className={`af-tool-row ${is_checked ? "is-enabled" : ""}`.trim()}>
              <label className="af-tool-row__check">
                <input
                  type="checkbox"
                  checked={is_checked}
                  disabled={disabled || mode !== "custom"}
                  onChange={(e) => toggle_tool(tool.name, e.target.checked)}
                />
              </label>
              <div className="af-tool-row__meta">
                <div className="af-tool-row__title">
                  <span className="af-tool-row__name">{tool.name}</span>
                  {tool.toolset ? <span className="af-tool-row__badge">{tool.toolset}</span> : null}
                </div>
                {tool.description ? <div className="af-tool-row__desc">{tool.description}</div> : null}
                {tool.when_to_use ? <div className="af-tool-row__hint">{tool.when_to_use}</div> : null}
              </div>
              <div className="af-tool-row__approval">
                <select
                  value={approval}
                  disabled={disabled || !is_checked}
                  onChange={(e) => set_approval(tool.name, e.target.value as ToolApprovalMode)}
                >
                  <option value="approve">Approve</option>
                  <option value="ask">Ask</option>
                </select>
              </div>
            </div>
          );
        })}
        {!filtered.length ? <div className="af-tool-policy__empty">No tools match the filter.</div> : null}
      </div>
    </div>
  );
}

export default ToolPolicyEditor;
