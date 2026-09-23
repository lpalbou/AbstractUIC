import React, { useState } from "react";
import { Icon } from "@abstractframework/ui-kit";
import type { WorkflowToolActivity } from "./workflow_evidence.js";
import { JsonViewer } from "./json_viewer.js";
import { copyText } from "./utils.js";

export function toolArguments(value: unknown): unknown {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

/** A labeled preview only. Full arguments remain available on expansion. */
export function toolPreview(value: unknown): { label: string; value: string } {
  const args = toolArguments(value);
  if (!args || typeof args !== "object" || Array.isArray(args))
    return { label: "input", value: args == null ? "" : String(args) };
  const entries = Object.entries(args);
  const preferred = [
    "command",
    "query",
    "url",
    "file_path",
    "path",
    "pattern",
    "name",
  ];
  const entry =
    preferred
      .map((key) => entries.find(([name]) => name === key))
      .find(Boolean) || entries[0];
  return entry
    ? {
        label: entry[0].replace(/_/g, " "),
        value:
          typeof entry[1] === "string"
            ? entry[1]
            : (JSON.stringify(entry[1]) ?? ""),
      }
    : { label: "", value: "" };
}

export function ToolActivity({
  tool,
  showCopy = true,
}: {
  tool: WorkflowToolActivity;
  showCopy?: boolean;
}): React.ReactElement {
  const [copied, setCopied] = useState(false);
  const args = toolArguments(tool.arguments);
  const preview = toolPreview(tool.arguments);
  // #TRUNCATION: paths abbreviate in the preview only. Title and expanded
  // parameters retain the exact target, including its directory and basename.
  const previewText =
    ["file path", "path"].includes(preview.label) && preview.value.length > 60
      ? `${preview.value.split(/[\\/]/).pop()} · ${preview.value.slice(0, 24)}…`
      : preview.value;
  const errorPreview =
    tool.error && /^File ['"].+['"] does not exist\.?$/.test(tool.error)
      ? "File not found. Expand for the exact path."
      : tool.error && tool.error.length > 180
        ? `${tool.error.slice(0, 100)}…${tool.error.slice(-70)}`
        : tool.error;
  const labels = {
    running: "Running",
    waiting: "Approval needed",
    completed: "Done",
    failed: "Failed",
  };
  const duration =
    tool.startedAt && tool.endedAt
      ? Date.parse(tool.endedAt) - Date.parse(tool.startedAt)
      : NaN;
  const fields =
    args && typeof args === "object" && !Array.isArray(args)
      ? Object.entries(args)
      : null;
  return (
    <details className={`pc-tool-activity pc-tool-activity--${tool.status}`}>
      <summary className="pc-tool-activity__summary">
        <span className="pc-tool-activity__state-icon" aria-hidden="true">
          <Icon
            name={
              tool.status === "completed"
                ? "check"
                : tool.status === "failed"
                  ? "x"
                  : tool.status === "waiting"
                    ? "warning"
                    : "loader"
            }
            size={15}
          />
        </span>
        <strong>{tool.name}</strong>
        <span className="pc-tool-activity__preview" title={preview.value}>
          {preview.value ? (
            <>
              <span className="pc-tool-activity__key">{preview.label}</span>
              {previewText}
            </>
          ) : (
            "No parameters"
          )}
        </span>
        <span className="pc-tool-activity__status">{labels[tool.status]}</span>
        {Number.isFinite(duration) && duration >= 0 ? (
          <span className="pc-tool-activity__duration">
            {(duration / 1000).toFixed(1)}s
          </span>
        ) : null}
        <span className="pc-tool-activity__chevron" aria-hidden="true">
          <Icon name="chevronRight" size={13} />
        </span>
        {tool.error ? (
          <span className="pc-tool-activity__error" title={tool.error}>
            {errorPreview}
          </span>
        ) : null}
      </summary>
      <div className="pc-tool-activity__detail">
        {tool.error ? (
          <>
            <h4>Error</h4>
            <pre className="pc-tool-activity__output">{tool.error}</pre>
          </>
        ) : null}
        <div className="pc-tool-activity__detail-heading">
          <h4>Parameters</h4>
          {showCopy ? (
            <button
              type="button"
              onClick={async () =>
                setCopied(await copyText(JSON.stringify(tool, null, 2)))
              }
            >
              <Icon name="copy" size={13} />
              {copied ? "Copied" : "Copy details"}
            </button>
          ) : null}
        </div>
        {fields ? (
          <dl className="pc-tool-activity__parameters">
            {fields.map(([key, value]) => (
              <React.Fragment key={key}>
                <dt>{key}</dt>
                <dd>
                  {value && typeof value === "object" ? (
                    <JsonViewer value={value} />
                  ) : (
                    <code>
                      {typeof value === "string"
                        ? value
                        : JSON.stringify(value)}
                    </code>
                  )}
                </dd>
              </React.Fragment>
            ))}
          </dl>
        ) : tool.arguments === undefined ? (
          <p>Arguments are unavailable in this ledger.</p>
        ) : (
          <JsonViewer value={args} />
        )}
        {tool.output !== undefined ? (
          <>
            <h4>Result</h4>
            {typeof tool.output === "string" ? (
              <pre className="pc-tool-activity__output">{tool.output}</pre>
            ) : (
              <div className="pc-tool-activity__output">
                <JsonViewer value={tool.output} />
              </div>
            )}
          </>
        ) : null}
      </div>
    </details>
  );
}

/** Consecutive calls share one frame, not one full conversation card per call. */
export function ToolActivityGroup({
  tools,
  showCopy,
}: {
  tools: WorkflowToolActivity[];
  showCopy?: boolean;
}): React.ReactElement {
  const count = (status: WorkflowToolActivity["status"]) =>
    tools.filter((tool) => tool.status === status).length;
  return (
    <section className="pc-tool-group" aria-label="Tool activity">
      <div className="pc-tool-group__heading">
        <Icon name="terminal" size={14} />
        <strong>Tools</strong>
        <span>
          {tools.length} {tools.length === 1 ? "call" : "calls"}
        </span>
        <div />
        {count("running") ? (
          <span className="pc-tool-group__running">
            {count("running")} running
          </span>
        ) : null}
        {count("waiting") ? (
          <span className="pc-tool-group__waiting">
            {count("waiting")} need approval
          </span>
        ) : null}
        {count("failed") ? (
          <span className="pc-tool-group__failed">
            {count("failed")} failed
          </span>
        ) : null}
        {count("completed") ? (
          <span className="pc-tool-group__completed">
            {count("completed")} done
          </span>
        ) : null}
      </div>
      {tools.map((tool) => (
        <ToolActivity key={tool.id} tool={tool} showCopy={showCopy} />
      ))}
    </section>
  );
}
