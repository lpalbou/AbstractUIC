// An automation's runs as a CHAT (operator 2026-11-27: "FOR ALL PURPOSES, AN AUTOMATION MUST READ
// LIKE A CHAT; the trigger is the equivalent of the user message; the response is the AI
// response"). The shared `WorkflowChat` thread, as it is: per run a user message (the task; stamped
// when it fired) and an assistant message (the answer; stamped when it finished), with the card's
// own speaker, copy, markdown and file chips. Run states are the card's own states: in progress =
// the card's working state with the live line in its footer; failed = the card's error level with
// the served reason; waiting = the thread's question / approval panel. An unseen result is an
// unread message: the thread opens at the first one (else at the newest run's task) and marks it
// "New" in its footer. Per-message extras ride in the card's footer, small: "Run #N · on schedule"
// and Context under the task; where the result went, and the message that was sent when it differs
// from the answer, under the answer. Earlier runs load from the thread's "load earlier" control or
// the person's scroll to the top. A composer only when the host passes `onTalk`. Nothing above the
// thread but the host's own header.
//
// The model is the Assistant web's automation page (abstractassistant `AutomationPage.tsx`,
// `lib/automations.ts` `runMessages`); every host mounts THIS.
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  AUTOMATION_EDIT_WORDS,
  AutomationLiveLine,
  STATUS_LABELS,
  SeenAckTracker,
  ToolCallWordsList,
  VisibleContentMarker,
  automationLiveWords,
  automationOpening,
  automationRunTask,
  consumedAttentionCursor,
  eventPayloadFromWords,
  notifyShown,
  occurrenceStartWords,
  occurrenceViews,
  unseenRuns,
  waitToolCalls,
  type AfGatewayFetch,
  type AutomationSummary,
  type CurrentOccurrence,
  type OccurrenceRow,
  type OccurrenceWait,
} from "@abstractframework/ui-kit";

import type { ChatMessage, ChatMessageCardProps } from "./chat_message_card.js";
import { ChatMessageContent } from "./message_content.js";
import { boundedArtifactFetch, type MessageArtifact } from "./message_artifacts.js";
import { runInputFiles } from "./automation_markdown.js";
import { RunContextDialog, type RunContextReader, type RunContextTarget } from "./run_context.js";
import { WORKFLOW_INTERACTION_LABELS, type WorkflowInteraction } from "./workflow_interaction.js";
import { WorkflowChat } from "./workflow_chat.js";
import type { GatewayFetch } from "./workspace_browser.js";

const T = AUTOMATION_EDIT_WORDS.thread;
const fill = (s: string, values: Record<string, string | number>): string => s.replace(/\{(\w+)\}/g, (_m, k: string) => String(values[k] ?? ""));

/** The id of a run's user message (its task) and of its answer (or its failure card). */
export const automationTaskMessageId = (runId: string): string => `run:${runId}:asked`;
export const automationAnswerMessageId = (runId: string): string => `run:${runId}`;
/** A run's quiet one-line state ("It was stopped before it answered."): the card's hint line. */
export const AUTOMATION_NOTE_KIND = "automation_note";

/** A run that has not answered yet: admitted (queued), running, retrying after a failed attempt. */
const IN_FLIGHT = new Set(["admitted", "running", "backoff"]);

/** The files a run was handed, by run (`runInputFiles`): only "ready" ones are shown. */
export type AutomationRunInputs = ReadonlyMap<string, MessageArtifact[]>;

/**
 * The runs as the thread's messages, oldest first (pure: the checks map every case). Per run: the
 * task (`automationRunTask`; a run with no task says what its trigger is, as served) stamped
 * `fired_at`; then, by its state, the answer (stamped `finished_at`), the card's working state (a
 * run in progress: `current` is the summary's `current_occurrence`), the failure card (error level,
 * the answer text when there is one, else the served reason), a quiet hint line (stopped, finished
 * without a written answer), or nothing for the run the thread's question panel asks about (`asked`;
 * another run waiting on the person is the card's working state, "waiting for you"). The messages
 * carry no `runId`: the shared chat's own attachment recovery (by run) never applies to them; this
 * thread reads its runs' files itself.
 */
export function automationChatMessages(rows: readonly OccurrenceRow[], opts: { current?: CurrentOccurrence | null; inputs?: AutomationRunInputs; asked?: string | null } = {}): ChatMessage[] {
  const out: ChatMessage[] = [];
  const current = opts.current ?? null;
  for (const v of occurrenceViews([...rows])) {
    const r = v.row;
    const handed = opts.inputs?.get(r.run_id) ?? null;
    const task = automationRunTask(r).text;
    out.push({
      id: automationTaskMessageId(r.run_id),
      role: "user",
      title: T.task_title,
      content: task.trim() ? task : r.trigger.summary,
      ts: r.fired_at,
      ...(handed && handed.length ? { artifactRefs: handed } : {}),
    });
    const id = automationAnswerMessageId(r.run_id);
    const ts = r.finished_at || undefined;
    const answer = typeof r.answer === "string" ? r.answer : "";
    const inFlight = !answer.trim() && (current?.run_id === r.run_id || v.tone === "running" || IN_FLIGHT.has(r.status));
    // The run's files (its `artifacts`), less the ones it was handed (the task's card shows those).
    const handedIds = new Set((handed ?? []).map((f) => f.id));
    const files: MessageArtifact[] = handed === null && opts.inputs ? [] : r.artifacts
      .filter((a) => !handedIds.has(a.artifact_id))
      .map((a) => ({ id: a.artifact_id, runId: r.run_id, ...(a.name && a.name !== a.artifact_id ? { name: a.name } : {}) }));
    const withFiles = files.length ? { artifactRefs: files } : {};
    if (v.tone === "failed") {
      out.push({ id, role: "system", level: "error", title: STATUS_LABELS.failed, content: answer.trim() ? answer : r.failure?.message?.trim() || T.failed, ...(ts ? { ts } : {}), ...withFiles });
    } else if (v.tone === "waiting" && r.waits.length && !answer.trim() && opts.asked === r.run_id) {
      continue;
    } else if (inFlight || (v.tone === "waiting" && !answer.trim())) {
      out.push({ id, role: "assistant", title: T.answer_title, content: "", live: { callId: `${r.run_id}:live`, reasoning: "", label: v.tone === "waiting" ? T.waiting : AUTOMATION_EDIT_WORDS.run.working } });
    } else if (answer.trim()) {
      out.push({ id, role: "assistant", title: T.answer_title, content: answer, ...(ts ? { ts } : {}), ...withFiles });
    } else {
      out.push({ id, role: "system", kind: AUTOMATION_NOTE_KIND, content: r.status === "cancelled" ? T.stopped : T.no_answer, ...(ts ? { ts } : {}), ...withFiles });
    }
  }
  return out;
}

/** The wait the thread asks about: the newest run waiting on the person, its oldest open wait (one
 * question at a time; answering it shows the next), or null. */
export function automationAskedWait(rows: readonly OccurrenceRow[]): OccurrenceWait | null {
  const views = occurrenceViews([...rows]).filter((v) => v.row.waits.length);
  return views[views.length - 1]?.row.waits[0] ?? null;
}

/** The thread's question / approval for `automationAskedWait`, or null. */
export function automationWaitInteraction(
  rows: readonly OccurrenceRow[],
  answer: (wait: OccurrenceWait, payload: Record<string, unknown>) => Promise<unknown>,
): WorkflowInteraction | null {
  const w = automationAskedWait(rows);
  const row = w ? rows.find((r) => r.run_id === w.run_id) : undefined;
  if (!row || !w) return null;
  const id = `${w.run_id}:${w.wait_key}`;
  const title = fill(T.run_line, { index: row.index });
  if (w.kind === "tool_approval") {
    const calls = waitToolCalls(w) ?? [];
    return {
      kind: "tool-approval",
      id,
      title,
      toolName: calls.map((c) => c.name).join(", ") || w.reason,
      ...(calls.length ? { detail: <ToolCallWordsList calls={calls} /> } : {}),
      scopeNote: WORKFLOW_INTERACTION_LABELS.allowThisRequestNote,
      onApprove: () => answer(w, { approved: true }),
      onDeny: () => answer(w, { approved: false }),
    };
  }
  if (w.kind === "event") {
    return {
      kind: "event-wait",
      id,
      title,
      prompt: w.prompt || w.reason,
      onSend: (text: string) => {
        const parsed = eventPayloadFromWords(text);
        if (!parsed.ok) throw new Error(parsed.error);
        return answer(w, { payload: parsed.payload });
      },
    };
  }
  return {
    kind: "ask-user",
    id,
    title,
    prompt: w.prompt || w.reason,
    ...(w.choices?.length ? { choices: w.choices.map((c) => ({ id: c, label: c })) } : {}),
    onSubmit: (text: string) => answer(w, { response: text }),
  };
}

export type AutomationChatProps = {
  summary: AutomationSummary;
  /** The loaded runs, any order. */
  occurrences: OccurrenceRow[];
  /** The runs are being read for the first time (the empty thread says so). */
  loading?: boolean;
  /** Loads the next older page of runs (the thread's "load earlier" control and the scroll to the top). */
  onLoadEarlier?: () => void;
  loadingEarlier?: boolean;
  /** The host's header inside the chat (the Assistant web's). A host that draws its header as its
   * own card above the thread (Observer's `AutomationHeaderCard`) leaves it out. */
  header?: React.ReactNode;
  /** Credentialed gateway request: the cards' file chips and each run's handed files read through it. */
  fetchGateway?: GatewayFetch;
  /** The chat's own message props from the host (the voice output's `onSpeakToggle` + `getSpeakState`). */
  messageProps?: Omit<ChatMessageCardProps, "message">;
  /** "Talk about its latest run": the composer, only when given (`index` = the newest run that can be talked about). */
  onTalk?: (text: string, index: number) => Promise<unknown>;
  composerTrailingActions?: React.ReactNode;
  /** What a run was given: the task's footer gains Context, opening `RunContextDialog`. */
  readRunContext?: RunContextReader;
  /** Where a run's result went, ONE line under its answer; null when nothing was sent (Observer: `GET runs/{id}/after`). */
  renderSent?: (row: OccurrenceRow) => React.ReactNode;
  /** Answers a run's question / approval (`ask_user` → `{response}`, `tool_approval` → `{approved}`, `event` → `{payload}`). */
  onAnswerWait?: (runId: string, waitKey: string, payload: Record<string, unknown>) => Promise<unknown>;
  /** The cursor of the last unseen result the person has seen (on screen, the window focused). */
  onSeen?: (cursor: string) => Promise<void>;
  nowMs?: number;
  /** The host's notes under the thread (an error, "a run is waiting"). */
  footer?: React.ReactNode;
  className?: string;
};

/** One automation's runs as the shared chat thread. */
export function AutomationChat(props: AutomationChatProps): React.ReactElement {
  const { summary, occurrences: rows } = props;
  const id = summary.automation_id;
  const artifactFetch = useMemo<AfGatewayFetch | undefined>(() => (props.fetchGateway ? boundedArtifactFetch(props.fetchGateway) : undefined), [props.fetchGateway]);

  // The files each loaded run was handed (its `input_data`), read once per run; the reads of one
  // page land together (one render, not one per run). A read that fails shows NOTHING on the
  // message (operator 2026-11-28: a run the gateway no longer has is not an error a person can act
  // on; never raw error text on a message): that run's task simply has no file chips.
  const [inputs, setInputs] = useState<Map<string, MessageArtifact[]>>(() => new Map());
  const runKey = rows.map((r) => r.run_id).join(",");
  useEffect(() => {
    if (!artifactFetch) return;
    let alive = true;
    const todo = rows.filter((r) => !inputs.has(r.run_id)).map((r) => r.run_id);
    if (!todo.length) return;
    void Promise.allSettled(todo.map((runId) => runInputFiles(artifactFetch, runId))).then((got) => {
      if (!alive) return;
      setInputs((m) => {
        const next = new Map(m);
        got.forEach((g, i) => next.set(todo[i], g.status === "fulfilled" ? g.value : []));
        return next;
      });
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [artifactFetch, runKey]);

  const current = summary.current_occurrence ?? null;
  const answerWait = props.onAnswerWait;
  const interaction = answerWait ? automationWaitInteraction(rows, (w, payload) => answerWait(w.run_id, w.wait_key, payload)) : null;
  const asked = interaction ? automationAskedWait(rows)?.run_id ?? null : null;
  const messages = useMemo(() => automationChatMessages(rows, { current, asked, ...(artifactFetch ? { inputs } : {}) }), [rows, current, inputs, artifactFetch, asked]);
  const byRun = useMemo(() => new Map(rows.map((r) => [r.run_id, r] as const)), [rows]);
  // Each message's run (its task's or its answer's), by the message's id.
  const byMessage = useMemo(() => new Map(rows.flatMap((r) => [[automationTaskMessageId(r.run_id), r], [automationAnswerMessageId(r.run_id), r]] as const)), [rows]);
  const unseen = unseenRuns(summary);

  // Seen: an unseen result counts once its "New" footer was on screen; /seen advances only through
  // the consumed oldest-first prefix (the kit's rule, as the panel did).
  const consumedRef = useRef({ id, cursors: new Set<string>() });
  const [, consumedChanged] = useState(0);
  if (consumedRef.current.id !== id) consumedRef.current = { id, cursors: new Set() };
  const markConsumed = (cursor: string) => {
    if (consumedRef.current.id !== id || consumedRef.current.cursors.has(cursor)) return;
    consumedRef.current.cursors.add(cursor);
    consumedChanged((n) => n + 1);
  };
  const ack = consumedAttentionCursor(summary, consumedRef.current.cursors);
  const onSeenRef = useRef(props.onSeen);
  onSeenRef.current = props.onSeen;
  const seenRef = useRef<SeenAckTracker | null>(null);
  if (!seenRef.current) seenRef.current = new SeenAckTracker();
  useEffect(() => {
    const tracker = seenRef.current as SeenAckTracker;
    const key = ack ? `${id}|${ack}` : null;
    if (!ack || !onSeenRef.current || !tracker.next(key, summary)) return;
    const token = summary;
    onSeenRef.current(ack).then(
      () => tracker.succeeded(key as string),
      () => tracker.failed(key as string, token),
    );
  });

  // Where it opens: decided once per automation, from its first loaded runs.
  const opening = useRef<{ key: string; messageId: string } | null>(null);
  if (opening.current?.key !== id) opening.current = null;
  if (!opening.current && rows.length) {
    const at = automationOpening(summary, rows);
    if (at) opening.current = { key: id, messageId: at.at === "unseen" ? automationAnswerMessageId(at.runId) : automationTaskMessageId(at.runId) };
  }

  const [contextOf, setContextOf] = useState<RunContextTarget | null>(null);
  const [draft, setDraft] = useState("");
  const discussable = occurrenceViews([...rows]).filter((v) => v.canDiscuss && !IN_FLIGHT.has(v.row.status)).map((v) => v.row.index);
  const talkIndex = discussable.length ? Math.max(...discussable) : null;

  const renderFooter = (m: ChatMessage): React.ReactNode => {
    const row = m.id ? byMessage.get(m.id) : undefined;
    if (!row) return props.messageProps?.renderFooter?.(m) ?? null;
    if (m.id === automationTaskMessageId(row.run_id)) {
      const started = occurrenceStartWords(row);
      return (
        <div className="pc-auto-foot" data-foot="task" data-run-id={row.run_id} data-run-index={row.index}>
          <span className="pc-auto-foot__run">
            {fill(T.run_line, { index: row.index })}
            {started ? ` · ${started}` : ""}
          </span>
          {props.readRunContext ? (
            <button
              type="button"
              className="pc-auto-foot__action"
              data-action="open-context"
              title={AUTOMATION_EDIT_WORDS.context.button_hint}
              aria-label={`${AUTOMATION_EDIT_WORDS.context.button} · ${fill(T.run_line, { index: row.index })}`}
              onClick={() => setContextOf({ run_id: row.run_id, index: row.index, user_turn: row.user_turn })}
            >
              {AUTOMATION_EDIT_WORDS.context.button}
            </button>
          ) : null}
        </div>
      );
    }
    const live = current?.run_id === row.run_id && automationLiveWords(current) ? <AutomationLiveLine current={current} {...(props.nowMs !== undefined ? { nowMs: props.nowMs } : {})} /> : null;
    const cursor = unseen.get(row.index);
    const fresh = cursor ? (
      <span className="pc-auto-foot__new" data-unseen={row.index}>
        {T.new}
        <VisibleContentMarker key={`${id}:${cursor}`} ownerKey={id} contentKey={cursor} enabled onConsume={() => markConsumed(cursor)} />
      </span>
    ) : null;
    const sent = props.renderSent && !live ? props.renderSent(row) : null;
    const notify = row.notify && notifyShown(row) ? (
      <details className="pc-auto-foot__sent-message" data-notify="true">
        <summary>{AUTOMATION_EDIT_WORDS.run.notify_sent}</summary>
        <div className="pc-auto-foot__sent-body">
          {row.notify.title ? <strong>{row.notify.title}</strong> : null}
          {row.notify.body ? <ChatMessageContent text={row.notify.body} images="link" /> : null}
        </div>
      </details>
    ) : null;
    const host = props.messageProps?.renderFooter?.(m) ?? null;
    // A failed run's failure sentence is its message when it has no answer; with an answer the
    // answer IS the message and the sentence is never appended (the gateway's generic "finished
    // without success" would contradict the words above it).
    if (!live && !fresh && !sent && !notify && !host) return null;
    return (
      <>
        {live}
        {fresh ? (
          <div className="pc-auto-foot" data-foot="answer" data-run-id={row.run_id}>
            {fresh}
          </div>
        ) : null}
        {/* The host's line; empty (nothing sent, still reading, a read that failed) takes no room. */}
        {sent ? <div className="pc-auto-foot pc-auto-foot--sent">{sent}</div> : null}
        {notify}
        {host}
      </>
    );
  };

  const hostVariant = props.messageProps?.variant;
  const messageProps: Omit<ChatMessageCardProps, "message"> = {
    ...props.messageProps,
    images: "link",
    renderFooter,
    variant: (m) => (m.kind === AUTOMATION_NOTE_KIND ? "hint" : hostVariant?.(m)),
  };
  const more = Math.max(0, (summary.occurrence_count ?? 0) - rows.length);
  const talk = props.onTalk;

  return (
    <>
      <WorkflowChat
        className={["pc-automation-chat", props.className].filter(Boolean).join(" ")}
        messages={messages}
        {...(opening.current ? { openAt: opening.current } : {})}
        {...(more > 0 && props.onLoadEarlier
          ? { earlier: { label: fill(T.earlier, { count: more }), loadingLabel: T.earlier_loading, loading: Boolean(props.loadingEarlier), onLoad: props.onLoadEarlier } }
          : {})}
        {...(artifactFetch ? { artifactFetch } : {})}
        header={props.header}
        footer={props.footer}
        interaction={interaction}
        emptyState={<div className="pc-automation-chat__empty">{props.loading ? T.loading : T.not_run_yet}</div>}
        messageProps={messageProps}
        draft={draft}
        onDraftChange={setDraft}
        composer={Boolean(talk)}
        // `disabled` would also lock the question panel: only an automation that never ran refuses a message.
        disabled={Boolean(talk) && talkIndex === null && !interaction}
        placeholder={talkIndex === null ? T.not_run_yet : T.talk_placeholder}
        composerTrailingActions={props.composerTrailingActions}
        onSend={async (text) => {
          if (!talk || talkIndex === null) throw new Error(T.not_run_yet);
          await talk(text, talkIndex);
          setDraft("");
        }}
      />
      {props.readRunContext ? (
        <RunContextDialog target={contextOf} read={props.readRunContext} onClose={() => setContextOf(null)} runIndex={(runId) => byRun.get(runId)?.index} />
      ) : null}
    </>
  );
}

export default AutomationChat;
