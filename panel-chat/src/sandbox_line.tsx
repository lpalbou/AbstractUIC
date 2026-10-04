/*
 * The command sandbox of one tool call, from the run ledger (R12.1 / R13.4).
 *
 * Every process-spawning tool (execute_command, shell_exec, local_helper_start,
 * execute_python) records the sandbox it ran under in its result:
 * `output.sandbox = {kind, label, posture, default_mode, private_workspace,
 * tmpdir, allowed: [{path, mode}], refused: [path], builtin_refused: <count>}`
 * (AbstractCore's Sandbox.describe(), kept by the gateway's ledger). This module
 * turns that record into ONE line — "Sandbox: macOS sandbox-exec · 3 workspaces
 * enforced", or "Sandbox: none — refused" when the host refused the command —
 * plus the enforced paths. The label is the ledger's own `label`; nothing is
 * inferred from the command, the tool name or the platform.
 */
import React from "react";

export type ToolSandboxRow = {
  path: string;
  /** "Read & write" | "Read-only" | "Refused" */
  mode: string;
  /** True for the run's private workspace. */
  private?: boolean;
};

export type ToolSandbox = {
  /** "sandboxed" (an OS sandbox ran the command), "refused" (no sandbox: nothing ran),
   *  "unsandboxed" (the host allowed commands without a sandbox). */
  state: "sandboxed" | "refused" | "unsandboxed";
  kind: string;
  label: string;
  /** The one line shown for the call. */
  line: string;
  /** The paths the sandbox enforced (empty when refused). */
  rows: ToolSandboxRow[];
  /** Built-in protected folders refused on top of the rows (host policy; counted, never listed). */
  builtinRefused: number;
};

function obj(value: unknown): Record<string, any> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, any>) : null;
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/** The sandbox evidence of one tool result: `result.output.sandbox` (or `sandbox` on the value given). */
export function sandboxEvidence(value: unknown): Record<string, any> | null {
  const v = obj(value);
  if (!v) return null;
  const direct = obj(v.sandbox);
  if (direct && text(direct.kind)) return direct;
  const nested = obj(obj(v.output)?.sandbox);
  return nested && text(nested.kind) ? nested : null;
}

/** One tool call's sandbox, or null when its result carries no sandbox evidence. */
export function toolSandbox(value: unknown): ToolSandbox | null {
  const sb = sandboxEvidence(value);
  if (!sb) return null;
  const kind = text(sb.kind);
  const label = text(sb.label) || kind;
  const builtinRefused = Number.isFinite(Number(sb.builtin_refused)) ? Math.max(0, Math.trunc(Number(sb.builtin_refused))) : 0;
  if (kind === "none") {
    return { state: "refused", kind, label, line: `Sandbox: ${label} — refused`, rows: [], builtinRefused: 0 };
  }
  const rows: ToolSandboxRow[] = [];
  const priv = text(sb.private_workspace);
  if (priv) rows.push({ path: priv, mode: "Read & write", private: true });
  for (const item of Array.isArray(sb.allowed) ? sb.allowed : []) {
    const row = obj(item);
    const path = text(row?.path);
    if (path) rows.push({ path, mode: text(row?.mode) === "ro" ? "Read-only" : "Read & write" });
  }
  for (const item of Array.isArray(sb.refused) ? sb.refused : []) {
    const path = text(item);
    if (path) rows.push({ path, mode: "Refused" });
  }
  if (kind === "unsandboxed") {
    return { state: "unsandboxed", kind, label, line: `Sandbox: ${label}`, rows: [], builtinRefused: 0 };
  }
  const n = rows.length;
  return {
    state: "sandboxed",
    kind,
    label,
    line: `Sandbox: ${label} · ${n} ${n === 1 ? "workspace" : "workspaces"} enforced`,
    rows,
    builtinRefused,
  };
}

/** The line (and, for a sandboxed call, the enforced paths) in a tool call's detail. */
export function ToolSandboxLine({ sandbox, className }: { sandbox: ToolSandbox | null | undefined; className?: string }): React.ReactElement | null {
  if (!sandbox) return null;
  return (
    <div className={`pc-tool-sandbox is-${sandbox.state}${className ? ` ${className}` : ""}`} data-sandbox-kind={sandbox.kind}>
      <div className="pc-tool-sandbox__line">{sandbox.line}</div>
      {sandbox.rows.length ? (
        <ul className="pc-tool-sandbox__rows" aria-label="Workspaces the sandbox enforced">
          {sandbox.rows.map((row, i) => (
            <li key={`${row.mode}:${row.path}:${i}`}>
              <code>{row.path}</code>
              <span className="pc-tool-sandbox__mode">{row.private ? `${row.mode} · this run's folder` : row.mode}</span>
            </li>
          ))}
          {sandbox.builtinRefused ? (
            <li className="pc-tool-sandbox__builtin">
              {sandbox.builtinRefused} built-in protected {sandbox.builtinRefused === 1 ? "folder" : "folders"} refused
            </li>
          ) : null}
        </ul>
      ) : null}
    </div>
  );
}
