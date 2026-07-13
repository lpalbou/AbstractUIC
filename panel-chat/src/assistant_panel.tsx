// AssistantPanel — the shared app-assistant chat surface
// (plans/unified-top-bar.md, operator directive 2026-07-13: "every app
// should have a simple assistant, based on application docs, to help
// users").
//
// Lives in panel-chat (NOT ui-kit): panel-chat already imports ui-kit, so a
// ui-kit chat panel would cycle the dependency graph (design adversary A).
//
// Transport is INJECTED — the panel never fetches. `ask` may return a plain
// Promise<string> or an AsyncIterable of text deltas (streaming); an
// AbortSignal is provided for cancellation. Behavior contract:
// - transport errors render as labeled #FALLBACK message cards in-thread
//   (statement 15), never crash the panel;
// - a `blockedNotice` (e.g. "Connect to the gateway to use the assistant")
//   renders as a labeled state and disables the composer (statement 14) —
//   the panel never auto-closes;
// - conversation state lives HERE (the host drawer keeps the panel mounted
//   when closed, so history survives close/reopen — statement 10).
import React, { useMemo, useRef, useState } from "react";
import { ChatThread } from "./chat_thread.js";
import { ChatComposer } from "./chat_composer.js";
import type { ChatMessage } from "./chat_message_card.js";

export type AssistantAskContext = {
  signal: AbortSignal;
  history: ChatMessage[];
};

export type AssistantAsk = (question: string, ctx: AssistantAskContext) => Promise<string> | AsyncIterable<string>;

export type AssistantPanelProps = {
  /** The injected transport. */
  ask: AssistantAsk;
  /** Assistant display name (message header). Default "Assistant". */
  assistantName?: string;
  /** Empty-state copy. Default explains the docs grounding. */
  emptyState?: React.ReactNode;
  /** Suggested first questions rendered in the empty state. */
  suggestions?: string[];
  /** When set, the composer is disabled and this notice renders in-thread
   * (e.g. "Connect to the gateway to use the assistant"). */
  blockedNotice?: string;
  placeholder?: string;
  className?: string;
  /** Controlled history (optional). Uncontrolled by default. */
  messages?: ChatMessage[];
  onMessagesChange?: (next: ChatMessage[]) => void;
};

function isAsyncIterable(x: unknown): x is AsyncIterable<string> {
  return Boolean(x && typeof (x as any)[Symbol.asyncIterator] === "function");
}

export function AssistantPanel(props: AssistantPanelProps): React.ReactElement {
  const [localMessages, setLocalMessages] = useState<ChatMessage[]>([]);
  const messages = props.messages ?? localMessages;
  const setMessages = (next: ChatMessage[]) => {
    if (props.onMessagesChange) props.onMessagesChange(next);
    if (props.messages === undefined) setLocalMessages(next);
  };
  // Async work reads/writes through a ref so a streaming update never
  // clobbers a newer history (the kit's stale-closure lesson).
  const messagesRef = useRef(messages);
  messagesRef.current = messages;

  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const assistantName = props.assistantName || "Assistant";
  const blocked = Boolean(props.blockedNotice);

  const send = async (text: string) => {
    const question = String(text || "").trim();
    if (!question || busy || blocked) return;
    setDraft("");
    const history = messagesRef.current;
    const withUser: ChatMessage[] = [...history, { role: "user", content: question, ts: new Date().toISOString() }];
    setMessages(withUser);
    setBusy(true);

    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const result = props.ask(question, { signal: controller.signal, history });
      if (isAsyncIterable(result)) {
        // Streaming: one assistant message grows in place.
        let acc = "";
        const base: ChatMessage[] = [...withUser, { role: "assistant", title: assistantName, content: "", ts: new Date().toISOString() }];
        setMessages(base);
        for await (const delta of result) {
          if (controller.signal.aborted) break;
          acc += String(delta ?? "");
          setMessages([...withUser, { role: "assistant", title: assistantName, content: acc, ts: new Date().toISOString() }]);
        }
        if (!acc.trim() && !controller.signal.aborted) {
          setMessages([
            ...withUser,
            { role: "assistant", title: assistantName, content: "#FALLBACK the assistant returned no answer.", level: "warn", ts: new Date().toISOString() },
          ]);
        }
      } else {
        const answer = String((await result) ?? "").trim();
        setMessages([
          ...withUser,
          answer
            ? { role: "assistant", title: assistantName, content: answer, ts: new Date().toISOString() }
            : { role: "assistant", title: assistantName, content: "#FALLBACK the assistant returned no answer.", level: "warn", ts: new Date().toISOString() },
        ]);
      }
    } catch (e: any) {
      if (!controller.signal.aborted) {
        setMessages([
          ...messagesRef.current,
          {
            role: "assistant",
            title: assistantName,
            content: `#FALLBACK assistant request failed: ${String(e?.message || e || "unknown error")}`,
            level: "error",
            ts: new Date().toISOString(),
          },
        ]);
      }
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
      setBusy(false);
    }
  };

  const emptyState = useMemo(() => {
    if (messages.length > 0) return null;
    return (
      <div className="pc-assistant__empty">
        <div className="pc-assistant__empty-text">
          {props.emptyState || "Ask about this app — answers are grounded in its documentation."}
        </div>
        {props.suggestions && props.suggestions.length > 0 ? (
          <div className="pc-assistant__suggestions">
            {props.suggestions.map((s) => (
              <button key={s} type="button" className="pc-assistant__suggestion" onClick={() => void send(s)} disabled={busy || blocked}>
                {s}
              </button>
            ))}
          </div>
        ) : null}
      </div>
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages.length, props.emptyState, props.suggestions, busy, blocked]);

  return (
    <div className={`pc-assistant${props.className ? ` ${props.className}` : ""}`}>
      <div className="pc-assistant__thread">
        {emptyState}
        <ChatThread messages={messages} autoScroll />
        {blocked ? <div className="pc-assistant__blocked">{props.blockedNotice}</div> : null}
      </div>
      <div className="pc-assistant__composer">
        <ChatComposer
          value={draft}
          onChange={setDraft}
          onSubmit={() => void send(draft)}
          placeholder={props.placeholder || "Ask about this app…"}
          disabled={blocked}
          busy={busy}
          rows={2}
          actions={
            busy ? (
              <button
                type="button"
                className="pc-btn"
                onClick={() => {
                  abortRef.current?.abort();
                }}
              >
                Stop
              </button>
            ) : null
          }
        />
      </div>
    </div>
  );
}

export default AssistantPanel;
