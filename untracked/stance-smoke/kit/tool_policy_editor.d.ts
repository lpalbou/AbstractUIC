import React from "react";
export type ToolSpec = {
    name: string;
    description?: string;
    toolset?: string;
    when_to_use?: string;
    /**
     * Server-declared approval default for this tool ("approve" | "ask").
     * When present it is authoritative; the kit's TOOL_POLICY_DEFAULTS mirror
     * is only the labeled fallback for gateways that do not serve defaults yet
     * (client-copied defaults rot — prefer server truth).
     */
    default_approval?: ToolApprovalMode;
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
export declare const TOOL_POLICY_DEFAULTS: ToolPolicyDefaults;
export declare function ToolPolicyEditor(props: ToolPolicyEditorProps): React.ReactElement;
export default ToolPolicyEditor;
//# sourceMappingURL=tool_policy_editor.d.ts.map