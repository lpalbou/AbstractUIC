import { useEffect, useMemo, useState } from "react";

const FOLDED_DEPTH = 3;
const UNFOLDED_DEPTH = Number.MAX_SAFE_INTEGER;

type JsonExpansionMode = "folded" | "unfolded";

function isJsonObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isJsonArray(value: unknown): value is unknown[] {
  return Array.isArray(value);
}

function copyStringForJson(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

async function copyText(text: string): Promise<void> {
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
  return <span className={`pc-json-token ${kind}`}>{children}</span>;
}

function JsonStringValue(props: { value: string; expansionMode: JsonExpansionMode; expansionVersion: number }): React.ReactElement {
  const rendered = JSON.stringify(props.value);
  const collapsible = rendered.length > 96 || rendered.includes("\\n") || rendered.includes("\\r") || rendered.includes("\\t");
  const [open, setOpen] = useState(!collapsible || props.expansionMode === "unfolded");

  useEffect(() => {
    if (!collapsible) return;
    setOpen(props.expansionMode === "unfolded");
  }, [collapsible, props.expansionMode, props.expansionVersion]);

  if (!collapsible) return <Token kind="string">{rendered}</Token>;

  return (
    <span className={`pc-json-string ${open ? "open" : "collapsed"}`}>
      <button
        type="button"
        className="pc-json-string__toggle"
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? "Collapse string value" : "Expand string value"}
        aria-expanded={open}
      >
        {open ? "▾" : "▸"}
      </button>
      {open ? (
        <span className="pc-json-token string pc-json-string__value">{rendered}</span>
      ) : (
        <button type="button" className="pc-json-string__preview" onClick={() => setOpen(true)} aria-label="Expand string value">
          <span className="pc-json-token string pc-json-string__preview_text">{rendered}</span>
          <span className="pc-json-string__suffix">(...)</span>
        </button>
      )}
    </span>
  );
}

function renderPrimitive(value: unknown, expansionMode: JsonExpansionMode, expansionVersion: number): React.ReactElement {
  if (value === null) return <Token kind="null">null</Token>;
  if (typeof value === "string") return <JsonStringValue value={value} expansionMode={expansionMode} expansionVersion={expansionVersion} />;
  if (typeof value === "number") return <Token kind="number">{String(value)}</Token>;
  if (typeof value === "boolean") return <Token kind="boolean">{value ? "true" : "false"}</Token>;
  return <Token kind="string">{JSON.stringify(String(value))}</Token>;
}

function countSummary(value: unknown): string {
  if (isJsonArray(value)) return value.length === 1 ? "1 item" : `${value.length} items`;
  if (isJsonObject(value)) return Object.keys(value).length === 1 ? "1 key" : `${Object.keys(value).length} keys`;
  return "";
}

type JsonNodeProps = {
  label?: string;
  value: unknown;
  depth: number;
  collapseAfterDepth: number;
  expansionMode: JsonExpansionMode;
  expansionVersion: number;
  trailingComma: boolean;
};

function JsonNode(props: JsonNodeProps): React.ReactElement {
  const { label, value, depth, collapseAfterDepth, expansionMode, expansionVersion, trailingComma } = props;
  const indentPx = depth * 14;

  const isObject = isJsonObject(value);
  const isArray = isJsonArray(value);
  const isContainer = isObject || isArray;
  const defaultOpen = depth < collapseAfterDepth;
  const [open, setOpen] = useState(defaultOpen);

  useEffect(() => {
    setOpen(defaultOpen);
  }, [defaultOpen, expansionVersion]);

  const prefix = label ? (
    <>
      <Token kind="key">{JSON.stringify(label)}</Token>
      {": "}
    </>
  ) : null;

  if (!isContainer) {
    return (
      <div className="pc-json-viewer__line" style={{ paddingLeft: indentPx }}>
        {prefix}
        {renderPrimitive(value, expansionMode, expansionVersion)}
        {trailingComma ? "," : ""}
      </div>
    );
  }

  const containerOpen = isArray ? "[" : "{";
  const containerClose = isArray ? "]" : "}";
  const summaryText = countSummary(value);
  const summaryValue = open ? `${containerOpen}` : `${containerOpen}…${containerClose}${summaryText ? `  (${summaryText})` : ""}`;

  const entries = isArray
    ? (value as unknown[]).map((v, i) => ({ key: String(i), label: undefined as string | undefined, value: v }))
    : Object.entries(value as Record<string, unknown>).map(([k, v]) => ({ key: k, label: k, value: v }));

  return (
    <details className="pc-json-viewer__details" open={open} onToggle={(e) => setOpen((e.currentTarget as HTMLDetailsElement).open)}>
      <summary className="pc-json-viewer__summary" style={{ paddingLeft: indentPx }}>
        {prefix}
        <span className="pc-json-viewer__caret" aria-hidden="true">
          {open ? "▾" : "▸"}
        </span>
        <span className="pc-json-viewer__punct">{summaryValue}</span>
        {!open && trailingComma ? <span className="pc-json-viewer__punct">,</span> : null}
      </summary>

      {open ? (
        <div className="pc-json-viewer__children">
          {entries.length === 0 ? (
            <div className="pc-json-viewer__line" style={{ paddingLeft: indentPx }}>
              <span className="pc-json-viewer__punct">{containerClose}</span>
              {trailingComma ? "," : ""}
            </div>
          ) : (
            <>
              {entries.map((e, idx) => {
                const isLast = idx === entries.length - 1;
                return (
                  <JsonNode
                    key={`${depth}:${label || "root"}:${e.key}`}
                    label={e.label}
                    value={e.value}
                    depth={depth + 1}
                    collapseAfterDepth={collapseAfterDepth}
                    expansionMode={expansionMode}
                    expansionVersion={expansionVersion}
                    trailingComma={!isLast}
                  />
                );
              })}
              <div className="pc-json-viewer__line" style={{ paddingLeft: indentPx }}>
                <span className="pc-json-viewer__punct">{containerClose}</span>
                {trailingComma ? "," : ""}
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
  const [expansion, setExpansion] = useState<{ mode: JsonExpansionMode; version: number }>({ mode: "folded", version: 0 });
  const collapseAfterDepth = expansion.mode === "unfolded" ? UNFOLDED_DEPTH : FOLDED_DEPTH;

  const copyValue = useMemo(() => copyStringForJson(value), [value]);
  const cls = ["pc-json-viewer", className].filter(Boolean).join(" ");

  useEffect(() => {
    setExpansion((prev) => ({ mode: "folded", version: prev.version + 1 }));
  }, [value]);

  const toggleExpansion = () => {
    setExpansion((prev) => ({
      mode: prev.mode === "unfolded" ? "folded" : "unfolded",
      version: prev.version + 1,
    }));
  };

  return (
    <div className={cls}>
      <div className="pc-json-viewer__toolbar">
        <button
          type="button"
          className="pc-btn pc-json-viewer__toggle-all"
          onClick={toggleExpansion}
          aria-expanded={expansion.mode === "unfolded"}
        >
          {expansion.mode === "unfolded" ? "Fold all" : "Unfold all"}
        </button>
        {showCopy ? (
          <button type="button" className="pc-btn pc-json-viewer__copy" onClick={() => void copyText(copyValue)}>
            Copy
          </button>
        ) : null}
      </div>

      <div className="pc-json-viewer__tree" role="tree" aria-label="JSON viewer">
        <JsonNode
          value={value}
          depth={0}
          collapseAfterDepth={collapseAfterDepth}
          expansionMode={expansion.mode}
          expansionVersion={expansion.version}
          trailingComma={false}
        />
      </div>
    </div>
  );
}
