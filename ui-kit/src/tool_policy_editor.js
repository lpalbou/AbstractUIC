import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/*
 * ToolPolicyEditor: shared allowlist + approval selector for thin clients.
 */
import { useMemo, useState } from "react";
// #FALLBACK mirror of AbstractRuntime ToolApprovalPolicy defaults — used only
// when a tool arrives WITHOUT a server-declared default_approval. Known drift
// risk (client-copied defaults rot); gateways should serve per-tool defaults.
export const TOOL_POLICY_DEFAULTS = {
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
function normalize_tools(items) {
    const seen = new Set();
    const out = [];
    for (const it of items || []) {
        if (!it)
            continue;
        const name = String(it.name || "").trim();
        if (!name || seen.has(name))
            continue;
        seen.add(name);
        out.push({
            name,
            description: typeof it.description === "string" ? it.description : undefined,
            toolset: typeof it.toolset === "string" ? it.toolset : undefined,
            when_to_use: typeof it.when_to_use === "string" ? it.when_to_use : undefined,
            default_approval: it.default_approval === "approve" || it.default_approval === "ask" ? it.default_approval : undefined,
        });
    }
    out.sort((a, b) => {
        const a_set = String(a.toolset || "");
        const b_set = String(b.toolset || "");
        if (a_set !== b_set)
            return a_set.localeCompare(b_set);
        return a.name.localeCompare(b.name);
    });
    return out;
}
function default_mode_for(tool, defaults) {
    // Server-declared default wins; the local mirror is the labeled fallback.
    if (tool.default_approval)
        return tool.default_approval;
    if (defaults.requireApproval.includes(tool.name))
        return "ask";
    if (defaults.autoApprove.includes(tool.name))
        return "approve";
    return "ask";
}
function describe_tool_mode(raw, override_label, override_detail) {
    const mode = String(raw || "").trim().toLowerCase();
    if (!mode && !override_label && !override_detail)
        return null;
    let info;
    if (mode === "approval" || mode === "local_approval" || mode === "local-approval") {
        info = { label: "APPROVAL", detail: "Safe tools auto-run; mutating tools ask for approval.", tone: "safe" };
    }
    else if (mode === "passthrough") {
        info = { label: "PASSTHROUGH", detail: "All tools require approval before execution.", tone: "warn" };
    }
    else if (mode === "delegated" || mode === "delegate" || mode === "job") {
        info = { label: "DELEGATED", detail: "Tool calls wait for external executors.", tone: "info" };
    }
    else if (mode === "local" || mode === "local_all" || mode === "local-all") {
        info = { label: "LOCAL", detail: "All tools run locally; client policy may still require approval.", tone: "danger" };
    }
    else {
        info = { label: "UNKNOWN", detail: "#FALLBACK: gateway tool mode not reported.", tone: "warn" };
    }
    if (override_label)
        info = { ...info, label: override_label };
    if (override_detail)
        info = { ...info, detail: override_detail };
    return info;
}
export function ToolPolicyEditor(props) {
    const defaults = props.defaults || TOOL_POLICY_DEFAULTS;
    const disabled = props.disabled === true;
    const title = props.title || "Tools";
    const subtitle = props.subtitle ||
        "Default is all tools. Safe/read-only tools auto-approve; mutating tools ask for approval.";
    const note = String(props.note || "").trim();
    const tool_mode = useMemo(() => describe_tool_mode(props.toolMode, props.toolModeLabel, props.toolModeDetail), [props.toolMode, props.toolModeLabel, props.toolModeDetail]);
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
        if (!q)
            return tools;
        return tools.filter((t) => {
            const name = t.name.toLowerCase();
            const desc = (t.description || "").toLowerCase();
            return name.includes(q) || desc.includes(q);
        });
    }, [tools, filter]);
    const effective_selected = mode === "all" ? new Set(all_names) : new Set(selected);
    const on_change = (next) => {
        props.onChange(next);
    };
    const toggle_mode = (next) => {
        if (disabled)
            return;
        on_change({ ...props.value, mode: next, selected });
    };
    const toggle_tool = (name, enabled) => {
        if (disabled)
            return;
        const set = new Set(selected);
        if (enabled)
            set.add(name);
        else
            set.delete(name);
        on_change({ ...props.value, selected: Array.from(set), mode: "custom" });
    };
    const set_approval = (name, mode_value) => {
        if (disabled)
            return;
        const next = { ...(props.value?.approval || {}) };
        next[name] = mode_value;
        on_change({ ...props.value, approval: next });
    };
    const select_all = () => {
        if (disabled)
            return;
        on_change({ ...props.value, selected: Array.from(all_names), mode: "custom" });
    };
    const select_none = () => {
        if (disabled)
            return;
        on_change({ ...props.value, selected: [], mode: "custom" });
    };
    const selected_count = effective_selected.size;
    return (_jsxs("div", { className: `af-tool-policy ${props.className || ""}`.trim(), children: [_jsxs("div", { className: "af-tool-policy__header", children: [_jsx("div", { className: "af-tool-policy__title", children: title }), _jsx("div", { className: "af-tool-policy__subtitle", children: subtitle }), tool_mode ? (_jsxs("div", { className: `af-tool-policy__mode is-${tool_mode.tone}`, children: [_jsx("div", { className: "af-tool-policy__mode-badge", children: "Tool mode" }), _jsx("div", { className: "af-tool-policy__mode-value", children: tool_mode.label }), _jsx("div", { className: "af-tool-policy__mode-detail", children: tool_mode.detail })] })) : null, note ? _jsx("div", { className: "af-tool-policy__note", children: note }) : null] }), _jsxs("div", { className: "af-tool-policy__controls", children: [_jsxs("div", { className: "af-tool-policy__segmented", role: "tablist", "aria-label": "Tool allowlist mode", children: [_jsx("button", { type: "button", className: `af-tool-policy__seg-btn ${mode === "all" ? "is-active" : ""}`.trim(), onClick: () => toggle_mode("all"), disabled: disabled, children: "All tools" }), _jsx("button", { type: "button", className: `af-tool-policy__seg-btn ${mode === "custom" ? "is-active" : ""}`.trim(), onClick: () => toggle_mode("custom"), disabled: disabled, children: "Custom allowlist" })] }), _jsxs("div", { className: "af-tool-policy__count", children: [selected_count, " / ", all_names.length, " enabled"] }), _jsxs("div", { className: "af-tool-policy__bulk", children: [_jsx("button", { type: "button", onClick: select_all, disabled: disabled || mode !== "custom", children: "Select all" }), _jsx("button", { type: "button", onClick: select_none, disabled: disabled || mode !== "custom", children: "Select none" })] })] }), _jsx("div", { className: "af-tool-policy__filter", children: _jsx("input", { type: "text", placeholder: "Filter tools...", value: filter, onChange: (e) => setFilter(e.target.value), disabled: disabled }) }), _jsxs("div", { className: "af-tool-policy__list", children: [filtered.map((tool) => {
                        const is_checked = effective_selected.has(tool.name);
                        const approval = props.value?.approval?.[tool.name] || default_mode_for(tool, defaults);
                        return (_jsxs("div", { className: `af-tool-row ${is_checked ? "is-enabled" : ""}`.trim(), children: [_jsx("label", { className: "af-tool-row__check", children: _jsx("input", { type: "checkbox", checked: is_checked, disabled: disabled || mode !== "custom", onChange: (e) => toggle_tool(tool.name, e.target.checked) }) }), _jsxs("div", { className: "af-tool-row__meta", children: [_jsxs("div", { className: "af-tool-row__title", children: [_jsx("span", { className: "af-tool-row__name", children: tool.name }), tool.toolset ? _jsx("span", { className: "af-tool-row__badge", children: tool.toolset }) : null] }), tool.description ? _jsx("div", { className: "af-tool-row__desc", children: tool.description }) : null, tool.when_to_use ? _jsx("div", { className: "af-tool-row__hint", children: tool.when_to_use }) : null] }), _jsx("div", { className: "af-tool-row__approval", children: _jsxs("select", { value: approval, disabled: disabled || !is_checked, onChange: (e) => set_approval(tool.name, e.target.value), children: [_jsx("option", { value: "approve", children: "Approve" }), _jsx("option", { value: "ask", children: "Ask" })] }) })] }, tool.name));
                    }), !filtered.length ? _jsx("div", { className: "af-tool-policy__empty", children: "No tools match the filter." }) : null] })] }));
}
export default ToolPolicyEditor;
