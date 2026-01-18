import { useMemo, useState } from "react";

function is_json_object(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function is_json_array(value: unknown): value is unknown[] {
  return Array.isArray(value);
}

function try_parse_json_string(value: string): unknown {
  const trimmed = value.trim();
  if (!trimmed) return value;
  if ((trimmed.startsWith("{") && trimmed.endsWith("}")) || (trimmed.startsWith("[") && trimmed.endsWith("]"))) {
    try {
      return JSON.parse(trimmed) as unknown;
    } catch {
      return value;
    }
  }
  return value;
}

function copy_string_for_json(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

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

function Token({
  kind,
  children,
}: {
  kind: "key" | "string" | "number" | "boolean" | "null";
  children: string;
}): React.ReactElement {
  return <span className={`json-token ${kind}`}>{children}</span>;
}

function render_primitive(value: unknown): React.ReactElement {
  if (value === null) return <Token kind="null">null</Token>;
  if (typeof value === "string") return <Token kind="string">{JSON.stringify(value)}</Token>;
  if (typeof value === "number") return <Token kind="number">{String(value)}</Token>;
  if (typeof value === "boolean") return <Token kind="boolean">{value ? "true" : "false"}</Token>;
  return <Token kind="string">{JSON.stringify(String(value))}</Token>;
}

function count_summary(value: unknown): string {
  if (is_json_array(value)) return value.length === 1 ? "1 item" : `${value.length} items`;
  if (is_json_object(value)) return Object.keys(value).length === 1 ? "1 key" : `${Object.keys(value).length} keys`;
  return "";
}

type JsonNodeProps = {
  label?: string;
  value: unknown;
  depth: number;
  collapse_after_depth: number;
  trailing_comma: boolean;
};

function JsonNode(props: JsonNodeProps): React.ReactElement {
  const { label, value, depth, collapse_after_depth, trailing_comma } = props;
  const indent_px = depth * 14;

  const is_object = is_json_object(value);
  const is_array = is_json_array(value);
  const is_container = is_object || is_array;
  const default_open = depth < collapse_after_depth;
  const [open, set_open] = useState(default_open);

  const prefix = label ? (
    <>
      <Token kind="key">{JSON.stringify(label)}</Token>
      {": "}
    </>
  ) : null;

  if (!is_container) {
    return (
      <div className="json-viewer__line" style={{ paddingLeft: indent_px }}>
        {prefix}
        {render_primitive(value)}
        {trailing_comma ? "," : ""}
      </div>
    );
  }

  const container_open = is_array ? "[" : "{";
  const container_close = is_array ? "]" : "}";
  const summary_text = count_summary(value);

  const summary_value = open ? `${container_open}` : `${container_open}…${container_close}${summary_text ? `  (${summary_text})` : ""}`;

  const entries = is_array
    ? (value as unknown[]).map((v, i) => ({ key: String(i), label: undefined as string | undefined, value: v }))
    : Object.entries(value as Record<string, unknown>).map(([k, v]) => ({ key: k, label: k, value: v }));

  return (
    <details className="json-viewer__details" open={open} onToggle={(e) => set_open((e.currentTarget as HTMLDetailsElement).open)}>
      <summary className="json-viewer__summary" style={{ paddingLeft: indent_px }}>
        {prefix}
        <span className="json-viewer__caret" aria-hidden="true">
          {open ? "▾" : "▸"}
        </span>
        <span className="json-viewer__punct">{summary_value}</span>
        {!open && trailing_comma ? <span className="json-viewer__punct">,</span> : null}
      </summary>

      {open ? (
        <div className="json-viewer__children">
          {entries.length === 0 ? (
            <div className="json-viewer__line" style={{ paddingLeft: indent_px }}>
              <span className="json-viewer__punct">{container_close}</span>
              {trailing_comma ? "," : ""}
            </div>
          ) : (
            <>
              {entries.map((e, idx) => {
                const is_last = idx === entries.length - 1;
                return (
                  <JsonNode
                    key={`${depth}:${label || "root"}:${e.key}`}
                    label={e.label}
                    value={e.value}
                    depth={depth + 1}
                    collapse_after_depth={collapse_after_depth}
                    trailing_comma={!is_last}
                  />
                );
              })}
              <div className="json-viewer__line" style={{ paddingLeft: indent_px }}>
                <span className="json-viewer__punct">{container_close}</span>
                {trailing_comma ? "," : ""}
              </div>
            </>
          )}
        </div>
      ) : null}
    </details>
  );
}

export function JsonViewer(props: { value: unknown; className?: string; collapseAfterDepth?: number; showCopy?: boolean }): React.ReactElement {
  const { value, className, showCopy = true } = props;
  const collapse_after_depth = Number.isFinite(props.collapseAfterDepth ?? NaN) ? Number(props.collapseAfterDepth) : 3;

  const display_value = useMemo(() => {
    if (typeof value === "string") return try_parse_json_string(value);
    return value;
  }, [value]);

  const copy_value = useMemo(() => copy_string_for_json(value), [value]);
  const cls = ["json-viewer", "run-details-output", className].filter(Boolean).join(" ");

  return (
    <div className={cls}>
      {showCopy ? (
        <div className="json-viewer__toolbar">
          <button type="button" className="modal-button json-viewer__copy" onClick={() => void copy_text(copy_value)}>
            Copy
          </button>
        </div>
      ) : null}

      <div className="json-viewer__tree" role="tree" aria-label="JSON viewer">
        <JsonNode value={display_value} depth={0} collapse_after_depth={collapse_after_depth} trailing_comma={false} />
      </div>
    </div>
  );
}

