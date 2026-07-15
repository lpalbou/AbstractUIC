import { jsx as _jsx } from "react/jsx-runtime";
import { useMemo } from "react";
import { JsonViewer } from "./json_viewer.js";
import { Markdown } from "./markdown.js";
import { tryParseJson } from "./utils.js";
export function ChatMessageContent(props) {
    const text = String(props.text ?? "");
    // Memoized on text: an unmemoized parse gives the viewer a new object
    // identity per parent render, re-folding a tree the user expanded
    // (adversary find 2026-07-12).
    const parsed = useMemo(() => tryParseJson(text), [text]);
    const cls = ["pc-chat-content", props.className].filter(Boolean).join(" ");
    if (parsed !== null) {
        return (_jsx("div", { className: cls, children: _jsx(JsonViewer, { value: parsed, collapseAfterDepth: props.jsonCollapseAfterDepth }) }));
    }
    if (props.renderMarkdown) {
        return _jsx("div", { className: cls, children: props.renderMarkdown(text) });
    }
    return (_jsx("div", { className: cls, children: _jsx(Markdown, { text: text }) }));
}
