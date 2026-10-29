/**
 * `ToolCallWordsList`: tool calls as sentences (see `tool_call_words.ts`). Each call: the tool's
 * verb as a coloured chip, the key argument highlighted, the secondary options small and muted; a
 * tool without a template shows "Key: value" lines. A group line counts repeated tools
 * ("2 web searches, 2 page fetches"). The tool's own name rides the chip's tooltip.
 */
import React from "react";
import { describeToolCall, groupToolCalls, type ToolCallInput } from "./tool_call_words.js";

export type ToolCallWordsListProps = {
  calls: readonly ToolCallInput[];
  /** Accessible name of the list ("Tool calls to approve"). */
  label?: string;
  className?: string;
};

export function ToolCallWordsList(props: ToolCallWordsListProps): React.ReactElement {
  const calls = props.calls || [];
  const group = calls.length > 1 ? groupToolCalls(calls) : "";
  return (
    <div className={`af-toolwords${props.className ? ` ${props.className}` : ""}`}>
      {group ? <p className="af-toolwords__group">{group}</p> : null}
      <ul className="af-toolwords__list" aria-label={props.label ?? "Tool calls"}>
        {calls.map((call, i) => {
          const w = describeToolCall(call);
          return (
            <li key={`${call.name}:${i}`} className="af-toolwords__call" data-tool={call.name}>
              <span className="af-toolwords__verb" title={call.name}>{w.verb}</span>{" "}
              {w.fallback ? (
                <span className="af-toolwords__fallback">
                  {w.fallback.length ? w.fallback.map((f) => (
                    <span key={f.label} className="af-toolwords__line"><span className="af-toolwords__muted">{f.label}:</span> {f.value}</span>
                  )) : <span className="af-toolwords__muted">no arguments</span>}
                </span>
              ) : (
                <span className="af-toolwords__text">
                  {w.lead ? `${w.lead} ` : ""}
                  {w.key ? <strong className="af-toolwords__key">{w.key}</strong> : null}
                  {w.details.length ? <span className="af-toolwords__muted"> ({w.details.join(", ")})</span> : null}
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
