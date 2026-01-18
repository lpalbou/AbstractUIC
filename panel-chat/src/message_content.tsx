import React from "react";

import "./panel_chat.css";

import { JsonViewer } from "./json_viewer";
import { Markdown } from "./markdown";
import { tryParseJson } from "./utils";

export function ChatMessageContent(props: {
  text: string;
  className?: string;
  renderMarkdown?: (markdown: string) => React.ReactElement;
  jsonCollapseAfterDepth?: number;
}): React.ReactElement {
  const text = String(props.text ?? "");
  const parsed = tryParseJson(text);
  const cls = ["pc-chat-content", props.className].filter(Boolean).join(" ");

  if (parsed !== null) {
    return (
      <div className={cls}>
        <JsonViewer value={parsed} collapseAfterDepth={props.jsonCollapseAfterDepth} />
      </div>
    );
  }

  if (props.renderMarkdown) {
    return <div className={cls}>{props.renderMarkdown(text)}</div>;
  }

  return (
    <div className={cls}>
      <Markdown text={text} />
    </div>
  );
}

