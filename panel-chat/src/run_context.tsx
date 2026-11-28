/**
 * "Context" of one automation run: what the run was given, opened from the automation panel's
 * Context button (`AutomationPanel.onOpenContext`; `AutomationPanelWithMarkdown.readRunContext`
 * wires it) in the kit's modal (a phone gets the full-screen sheet). Any host of the panel opens
 * the same view (spec H: moved here from AbstractObserver).
 *
 * Where each fact lives (AbstractRuntime `automations/controller.py` prepares an occurrence's inputs
 * at admission; AbstractGateway serves them):
 * - the run is the occurrence's own `run_id` (the controller's child run);
 * - `GET runs/{id}/input_data` → `input_data`: the flow's entry pins of that run — `context.messages`
 *   (the earlier runs carried in, each stamped `metadata.kind === "session_turn"` with its own
 *   `run_id` and `ts`; the oldest kept one carries `metadata.replay_truncated` + `history_window`
 *   when the history window left older turns out), `context.task`, `system`, `provider`, `model`,
 *   `tools`;
 * - `GET runs/{id}` → `session_history`: the window's receipt (`replayed_messages`,
 *   `replayed_tokens`, `max_tokens`, …), absent for a run that starts fresh;
 * - this run's trigger message as the agent received it: the occurrence's `user_turn`.
 *
 * Every fact is READ from typed fields, never parsed out of a message's text: a carried message is
 * labelled by its run only when its metadata names the run and the host knows that run's number.
 * The earlier messages are the shared chat card; the raw inputs the chat's `JsonViewer`.
 */
import React, { useEffect, useState } from "react";

import { AUTOMATION_EDIT_WORDS, AfModal } from "@abstractframework/ui-kit";

import { ChatMessageCard, type ChatMessage } from "./chat_message_card.js";
import { JsonViewer } from "./json_viewer.js";
import { ChatMessageContent } from "./message_content.js";
import { WorkingDots } from "./working_dots.js";

const W = AUTOMATION_EDIT_WORDS.context;

/** One earlier message carried in: who said it (the task the run received, or its answer). */
export type CarriedMessage = {
  who: "task" | "answer";
  first_line: string;
  text: string;
  run_id: string | null;
  /** The message's own time (`metadata.ts`), when it carries one. */
  ts: string | null;
  /** The history window left older messages out before this one (`metadata.history_window`). */
  left_out: { messages: number; tokens: number; budget: number } | null;
};

export type RunContextSummary =
  | { kind: "builds_on"; messages: number; tokens: number; budget: number }
  | { kind: "builds_on_no_numbers" }
  | { kind: "starts_fresh" };

export type RunContextData = {
  summary: RunContextSummary;
  /** The receipt counts a different number of carried messages than the inputs list: said, never hidden. */
  count_differs: { counted: number; listed: number } | null;
  /** Instructions beyond the task, when the inputs carry them. */
  instructions: Array<{ kind: "system" | "context_task"; text: string }>;
  /** Oldest first. */
  earlier: CarriedMessage[];
  /** This run's message as the agent received it (the occurrence's `user_turn`); "" when it has none. */
  trigger: string;
  /** The model (`provider / model`) and the tools it was allowed, each only when the inputs carry it. */
  details: { model: string | null; tools: string[] | null };
  /** The `input_data` response, for the folded "Raw inputs". */
  raw: unknown;
};

const obj = (v: unknown): Record<string, unknown> | null => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null);
const text = (v: unknown): string => (typeof v === "string" ? v : "");
const whole = (v: unknown): number | null => (typeof v === "number" && Number.isInteger(v) && v >= 0 ? v : null);

/** A message's text: a string, or the text parts of a content-part list. */
function message_text(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) return content.map((p) => (obj(p)?.type === "text" ? text(obj(p)?.text) : "")).filter(Boolean).join("\n");
  return "";
}

function first_line(s: string): string {
  for (const line of s.split("\n")) if (line.trim()) return line.trim();
  return "";
}

/** The history window's receipt a carried message holds (`replay_truncated` + `history_window`), or null. */
function left_out_of(meta: Record<string, unknown> | null): CarriedMessage["left_out"] {
  if (!meta || meta.replay_truncated !== true) return null;
  const w = obj(meta.history_window);
  const messages = whole(w?.dropped_messages);
  const tokens = whole(w?.dropped_tokens);
  const budget = whole(w?.max_tokens);
  return messages !== null && messages > 0 && tokens !== null && budget !== null ? { messages, tokens, budget } : null;
}

/**
 * The view's data from the two answers: `input` (`GET runs/{id}/input_data`), `run` (`GET runs/{id}`)
 * and the occurrence's `user_turn`.
 */
export function runContextView(input: unknown, run: unknown, user_turn: string): RunContextData {
  const inputs = obj(obj(input)?.input_data) ?? {};
  const ctx = obj(inputs.context);
  const messages = Array.isArray(ctx?.messages) ? ctx!.messages : [];
  const earlier: CarriedMessage[] = [];
  for (const m of messages) {
    const mo = obj(m);
    const meta = obj(mo?.metadata);
    if (!mo || meta?.kind !== "session_turn") continue;
    const body = message_text(mo.content);
    earlier.push({
      who: mo.role === "user" ? "task" : "answer",
      first_line: first_line(body),
      text: body,
      run_id: typeof meta.run_id === "string" ? meta.run_id : null,
      ts: typeof meta.ts === "string" && meta.ts ? meta.ts : null,
      left_out: left_out_of(meta),
    });
  }
  const receipt = obj(obj(run)?.session_history);
  const counted = receipt ? whole(receipt.replayed_messages) : null;
  const tokens = receipt ? whole(receipt.replayed_tokens) : null;
  const budget = receipt ? whole(receipt.max_tokens) : null;
  const summary: RunContextSummary =
    counted !== null && tokens !== null && budget !== null
      ? { kind: "builds_on", messages: counted, tokens, budget }
      : receipt || earlier.length
        ? { kind: "builds_on_no_numbers" }
        : { kind: "starts_fresh" };
  const instructions: RunContextData["instructions"] = [];
  if (text(inputs.system).trim()) instructions.push({ kind: "system", text: text(inputs.system) });
  if (text(ctx?.task).trim()) instructions.push({ kind: "context_task", text: text(ctx?.task) });
  const provider = text(inputs.provider).trim();
  const model = text(inputs.model).trim();
  const tools = Array.isArray(inputs.tools)
    ? inputs.tools.map((t) => (typeof t === "string" ? t : text(obj(t)?.name))).filter((t) => t.trim())
    : null;
  return {
    summary,
    count_differs: counted !== null && counted !== earlier.length ? { counted, listed: earlier.length } : null,
    instructions,
    earlier,
    trigger: user_turn,
    details: { model: model ? (provider ? `${provider} / ${model}` : model) : null, tools },
    raw: input,
  };
}

const fill = (s: string, values: Record<string, string | number>): string => s.replace(/\{(\w+)\}/g, (_m, k: string) => String(values[k] ?? ""));
const num = (n: number): string => n.toLocaleString("en-US");

export function runContextSummarySentence(s: RunContextSummary): string {
  if (s.kind === "builds_on") return fill(W.builds_on, { messages: num(s.messages), tokens: num(s.tokens), budget: num(s.budget) });
  return s.kind === "starts_fresh" ? W.starts_fresh : W.builds_on_no_numbers;
}

export type RunContextState = { status: "loading" } | { status: "failed"; reason: string } | { status: "ready"; data: RunContextData };

/** An earlier message as the shared chat card: who said it, and its run when the host knows its number. */
export function carriedMessage(m: CarriedMessage, i: number, runIndex?: (runId: string) => number | undefined): ChatMessage {
  const index = m.run_id && runIndex ? runIndex(m.run_id) : undefined;
  const who = m.who === "task" ? W.from_task : W.from_answer;
  return {
    id: `ctx:${i}`,
    role: m.who === "task" ? "user" : "assistant",
    content: m.text,
    title: typeof index === "number" ? `${who} · ${fill(W.run_label, { index })}` : who,
    ...(m.ts ? { ts: m.ts } : {}),
    ...(m.run_id ? { runId: m.run_id } : {}),
  };
}

/** The dialog's body in one state (pure; the checks render each). */
export function RunContextBody(props: { state: RunContextState; runIndex?: (runId: string) => number | undefined }): React.ReactElement {
  const st = props.state;
  if (st.status === "loading")
    return (
      <p className="pc-run-ctx__loading" role="status">
        <WorkingDots label={W.loading} /> <span>{W.loading}</span>
      </p>
    );
  if (st.status === "failed")
    return (
      <p className="pc-run-ctx__error" role="alert">
        {fill(W.failed, { reason: st.reason })}
      </p>
    );
  const d = st.data;
  const has_details = d.details.model !== null || d.details.tools !== null;
  return (
    <div className="pc-run-ctx" data-section="run-context">
      <p className="pc-run-ctx__summary" data-fact="summary" data-kind={d.summary.kind}>
        {runContextSummarySentence(d.summary)}
      </p>
      {d.count_differs ? (
        <p className="pc-run-ctx__warn" role="note" data-fact="count-differs">
          {fill(W.count_differs, { counted: num(d.count_differs.counted), listed: num(d.count_differs.listed) })}
        </p>
      ) : null}
      {d.instructions.length ? (
        <details className="pc-run-ctx__fold" data-part="instructions">
          <summary>{W.instructions}</summary>
          {d.instructions.map((i) => (
            <div key={i.kind} className="pc-run-ctx__block" data-instruction={i.kind}>
              <div className="pc-run-ctx__label">{i.kind === "system" ? W.system : W.context_task}</div>
              <div className="pc-run-ctx__text">
                <ChatMessageContent text={i.text} images="link" />
              </div>
            </div>
          ))}
        </details>
      ) : null}
      {d.earlier.length ? (
        <section className="pc-run-ctx__part" data-part="earlier" aria-label={W.earlier}>
          <div className="pc-run-ctx__heading">
            {W.earlier} <span className="pc-run-ctx__count">· {num(d.earlier.length)}</span>
          </div>
          <ol className="pc-run-ctx__messages">
            {d.earlier.map((m, i) => (
              <li key={i} data-who={m.who} {...(m.run_id ? { "data-run-id": m.run_id } : {})}>
                {m.left_out ? (
                  <p className="pc-run-ctx__fold-marker" role="note" data-fact="left-out">
                    {fill(W.left_out, { messages: num(m.left_out.messages), tokens: num(m.left_out.tokens), budget: num(m.left_out.budget) })}
                  </p>
                ) : null}
                <ChatMessageCard message={carriedMessage(m, i, props.runIndex)} images="link" />
              </li>
            ))}
          </ol>
        </section>
      ) : null}
      {d.trigger.trim() ? (
        <section className="pc-run-ctx__part" data-part="trigger" aria-label={W.trigger}>
          <div className="pc-run-ctx__heading">{W.trigger}</div>
          <div className="pc-run-ctx__text pc-run-ctx__trigger">
            <ChatMessageContent text={d.trigger} images="link" />
          </div>
        </section>
      ) : null}
      {has_details ? (
        <details className="pc-run-ctx__fold" data-part="details">
          <summary>{W.details}</summary>
          <dl className="pc-run-ctx__facts">
            {d.details.model !== null ? (
              <>
                <dt>{W.model}</dt>
                <dd data-fact="model">{d.details.model}</dd>
              </>
            ) : null}
            {d.details.tools !== null ? (
              <>
                <dt>{W.tools}</dt>
                <dd data-fact="tools">{d.details.tools.length ? d.details.tools.join(", ") : W.no_tools}</dd>
              </>
            ) : null}
          </dl>
        </details>
      ) : null}
      <details className="pc-run-ctx__fold" data-part="raw">
        <summary>{W.raw}</summary>
        <JsonViewer value={d.raw} className="pc-run-ctx__raw" />
      </details>
    </div>
  );
}

/** The run whose context is open: the occurrence's own run id, its index and its `user_turn`. */
export type RunContextTarget = { run_id: string; index: number; user_turn: string };

export type RunContextReader = {
  input_data(run_id: string): Promise<unknown>;
  run(run_id: string): Promise<unknown>;
};

/** The Context dialog: reads both routes when it opens (never during a render). */
export function RunContextDialog(props: {
  target: RunContextTarget | null;
  read: RunContextReader;
  onClose(): void;
  /** The number (#N) of a run of this automation, when the host knows it: carried messages are labelled by it. */
  runIndex?: (runId: string) => number | undefined;
}): React.ReactElement | null {
  const { target, read } = props;
  const [state, set_state] = useState<RunContextState>({ status: "loading" });
  const run_id = target?.run_id ?? "";
  const user_turn = target?.user_turn ?? "";
  useEffect(() => {
    if (!run_id) return;
    let alive = true;
    set_state({ status: "loading" });
    Promise.all([read.input_data(run_id), read.run(run_id)]).then(
      ([input, run]) => {
        if (alive) set_state({ status: "ready", data: runContextView(input, run, user_turn) });
      },
      (e: unknown) => {
        if (alive) set_state({ status: "failed", reason: e instanceof Error ? e.message : String(e) });
      },
    );
    return () => {
      alive = false;
    };
  }, [run_id, user_turn, read]);
  if (!target) return null;
  return (
    <AfModal open onClose={props.onClose} title={fill(W.title, { index: target.index })} className="pc-run-ctx__dialog">
      <RunContextBody state={state} {...(props.runIndex ? { runIndex: props.runIndex } : {})} />
    </AfModal>
  );
}
