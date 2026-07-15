import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
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
import { useMemo, useRef, useState } from "react";
import { ChatThread } from "./chat_thread.js";
import { ChatComposer } from "./chat_composer.js";
function isAsyncIterable(x) {
    return Boolean(x && typeof x[Symbol.asyncIterator] === "function");
}
export function AssistantPanel(props) {
    const [localMessages, setLocalMessages] = useState([]);
    const messages = props.messages ?? localMessages;
    const setMessages = (next) => {
        if (props.onMessagesChange)
            props.onMessagesChange(next);
        if (props.messages === undefined)
            setLocalMessages(next);
    };
    // Async work reads/writes through a ref so a streaming update never
    // clobbers a newer history (the kit's stale-closure lesson).
    const messagesRef = useRef(messages);
    messagesRef.current = messages;
    const [draft, setDraft] = useState("");
    const [busy, setBusy] = useState(false);
    const abortRef = useRef(null);
    const assistantName = props.assistantName || "Assistant";
    const blocked = Boolean(props.blockedNotice);
    const send = async (text) => {
        const question = String(text || "").trim();
        if (!question || busy || blocked)
            return;
        setDraft("");
        const history = messagesRef.current;
        const withUser = [...history, { role: "user", content: question, ts: new Date().toISOString() }];
        setMessages(withUser);
        setBusy(true);
        const controller = new AbortController();
        abortRef.current = controller;
        try {
            const result = props.ask(question, { signal: controller.signal, history });
            if (isAsyncIterable(result)) {
                // Streaming: one assistant message grows in place.
                let acc = "";
                const base = [...withUser, { role: "assistant", title: assistantName, content: "", ts: new Date().toISOString() }];
                setMessages(base);
                for await (const delta of result) {
                    if (controller.signal.aborted)
                        break;
                    acc += String(delta ?? "");
                    setMessages([...withUser, { role: "assistant", title: assistantName, content: acc, ts: new Date().toISOString() }]);
                }
                if (!acc.trim() && !controller.signal.aborted) {
                    setMessages([
                        ...withUser,
                        { role: "assistant", title: assistantName, content: "#FALLBACK the assistant returned no answer.", level: "warn", ts: new Date().toISOString() },
                    ]);
                }
            }
            else {
                const answer = String((await result) ?? "").trim();
                setMessages([
                    ...withUser,
                    answer
                        ? { role: "assistant", title: assistantName, content: answer, ts: new Date().toISOString() }
                        : { role: "assistant", title: assistantName, content: "#FALLBACK the assistant returned no answer.", level: "warn", ts: new Date().toISOString() },
                ]);
            }
        }
        catch (e) {
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
        }
        finally {
            if (abortRef.current === controller)
                abortRef.current = null;
            setBusy(false);
        }
    };
    const emptyState = useMemo(() => {
        if (messages.length > 0)
            return null;
        return (_jsxs("div", { className: "pc-assistant__empty", children: [_jsx("div", { className: "pc-assistant__empty-text", children: props.emptyState || "Ask about this app — answers are grounded in its documentation." }), props.suggestions && props.suggestions.length > 0 ? (_jsx("div", { className: "pc-assistant__suggestions", children: props.suggestions.map((s) => (_jsx("button", { type: "button", className: "pc-assistant__suggestion", onClick: () => void send(s), disabled: busy || blocked, children: s }, s))) })) : null] }));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [messages.length, props.emptyState, props.suggestions, busy, blocked]);
    return (_jsxs("div", { className: `pc-assistant${props.className ? ` ${props.className}` : ""}`, children: [_jsxs("div", { className: "pc-assistant__thread", children: [emptyState, _jsx(ChatThread, { messages: messages, autoScroll: true }), blocked ? _jsx("div", { className: "pc-assistant__blocked", children: props.blockedNotice }) : null] }), _jsx("div", { className: "pc-assistant__composer", children: _jsx(ChatComposer, { value: draft, onChange: setDraft, onSubmit: () => void send(draft), placeholder: props.placeholder || "Ask about this app…", disabled: blocked, busy: busy, rows: 2, actions: busy ? (_jsx("button", { type: "button", className: "pc-btn", onClick: () => {
                            abortRef.current?.abort();
                        }, children: "Stop" })) : null }) })] }));
}
export default AssistantPanel;
