/**
 * `ToolCallWordsList`: tool calls in words (see `tool_call_words.ts`), the approval card's list
 * (operator ruling 2026-10-29): an optional bold first line (`heading`, e.g. "The assistant wants
 * to use these tools:", the card's only bold), then ONE bullet per call on ONE line, cut with an
 * ellipsis when too long (the whole sentence on its tooltip): the tool's verb as a coloured chip,
 * then plain text (no bold on the parameters). No count line. The tool's own name rides the chip.
 */
import React from "react";
import { describeToolCall, describeToolResult, type ToolCallInput } from "./tool_call_words.js";

export type ToolCallWordsListProps = {
  calls: readonly ToolCallInput[];
  /** Accessible name of the list ("Tool calls to approve"). */
  label?: string;
  /** The bold first line ("The assistant wants to use these tools:"); none when omitted. */
  heading?: string;
  /** The heading's id (a card's `aria-labelledby`). */
  headingId?: string;
  className?: string;
};

/** One call as the single line the list shows (and its tooltip): the words after the verb chip. */
export function toolCallLine(call: ToolCallInput): string {
  const w = describeToolCall(call);
  if (w.fallback) return w.fallback.length ? w.fallback.map((f) => `${f.label}: ${f.value}`).join(" · ") : "no arguments";
  const head = [w.lead, w.key].filter(Boolean).join(" ");
  return w.details.length ? `${head} (${w.details.join(", ")})` : head;
}

export function ToolCallWordsList(props: ToolCallWordsListProps): React.ReactElement {
  const calls = props.calls || [];
  return (
    <div className={`af-toolwords${props.className ? ` ${props.className}` : ""}`}>
      {props.heading ? <p className="af-toolwords__heading" id={props.headingId}><strong>{props.heading}</strong></p> : null}
      <ul className="af-toolwords__list" aria-label={props.label ?? "Tool calls"}>
        {calls.map((call, i) => {
          const w = describeToolCall(call);
          const line = toolCallLine(call);
          return (
            <li key={`${call.name}:${i}`} className="af-toolwords__call" data-tool={call.name} title={`${w.verb} ${line}`}>
              <span className="af-toolwords__verb" title={call.name}>{w.verb}</span>{" "}
              <span className="af-toolwords__text">{line}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export type ToolResultWordsProps = {
  /** The tool that produced the result, when known. */
  name?: string | null;
  result: unknown;
  className?: string;
};

/** `ToolResultWords`: a tool result as a sentence and up to three readable items (see
 * `describeToolResult`), never its JSON; hosts put the exact payload behind a disclosure. */
export function ToolResultWords(props: ToolResultWordsProps): React.ReactElement {
  const w = describeToolResult({ name: props.name, result: props.result });
  return (
    <div className={`af-toolresult${w.failed ? " is-failed" : ""}${props.className ? ` ${props.className}` : ""}`} data-tool={props.name || undefined}>
      <p className="af-toolresult__sentence">{w.sentence}</p>
      {w.items.length ? (
        <ul className="af-toolresult__items">{w.items.map((item, i) => <li key={i}>{item}</li>)}</ul>
      ) : null}
    </div>
  );
}
