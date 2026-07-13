import React, { useMemo } from "react";

import { JsonViewer } from "./json_viewer.js";
import { Markdown } from "./markdown.js";
import { tryParseJson } from "./utils.js";

export function ChatMessageContent(props: {
  text: string;
  className?: string;
  renderMarkdown?: (markdown: string) => React.ReactElement;
  jsonCollapseAfterDepth?: number;
}): React.ReactElement {
  const text = String(props.text ?? "");
  // Memoized on text: an unmemoized parse gives the viewer a new object
  // identity per parent render, re-folding a tree the user expanded
  // (adversary find 2026-07-12).
  const parsed = useMemo(() => tryParseJson(text), [text]);
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
