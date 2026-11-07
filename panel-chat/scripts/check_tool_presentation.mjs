import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ToolActivity, toolPreview } from "../dist/tool_activity.js";
import { ChatThread } from "../dist/chat_thread.js";
import { ChatMessageCard } from "../dist/chat_message_card.js";

const render = (component, props) =>
  renderToStaticMarkup(React.createElement(component, props));
const tool = {
  id: "root:1",
  runId: "root",
  name: "execute_command",
  status: "completed",
  arguments: {
    command: "npm test",
    working_directory: "/workspace",
    dry_run: false,
    offset: 0,
  },
  output: "<script>alert('bad')</script>",
  startedAt: "2026-09-20T12:00:00Z",
  endedAt: "2026-09-20T12:00:01.250Z",
};
const html = render(ToolActivity, { tool });
assert.match(html, /^<details/);
assert(!/^<details[^>]*\bopen/.test(html), "tool details start collapsed");
assert.match(html, /1.3s/);
assert.match(html, /working_directory/);
assert.match(html, /<code>false<\/code>/);
assert.match(html, /<code>0<\/code>/);
assert.match(html, /&lt;script&gt;/);
assert(!html.includes("<script>"), "tool output must never execute as HTML");
assert.match(
  render(ToolActivity, {
    tool: { ...tool, status: "failed", error: "HTTP Error 403: Forbidden" },
  }),
  /pc-tool-activity--failed/,
);
assert.deepEqual(toolPreview('{"query":"release notes","count":0}'), {
  label: "query",
  value: "release notes",
});
const message = (item = tool) => ({
  id: item.id,
  role: "system",
  content: "Tool output",
  runId: item.runId,
  toolActivity: item,
});
const thread = render(ChatThread, {
  messages: [message(), message({ ...tool, id: "root:2" })],
  messageProps: { showCopy: false },
});
assert.equal((thread.match(/class="pc-tool-group"/g) || []).length, 1);
assert.equal(
  (thread.match(/<details class="pc-tool-activity /g) || []).length,
  2,
);
assert(
  !thread.includes("pc-chat-header"),
  "tool groups do not repeat full message headers",
);
assert(
  !thread.includes("Copy details"),
  "existing showCopy=false host contract survives compact grouping",
);
assert(
  !render(ChatMessageCard, { message: message(), showCopy: false }).includes(
    "Copy details",
  ),
);
const split = render(ChatThread, {
  messages: [
    message(),
    { id: "answer", role: "assistant", content: "Checking next" },
    message({ ...tool, id: "root:2" }),
  ],
});
assert.equal(
  (split.match(/class="pc-tool-group"/g) || []).length,
  2,
  "grouping cannot move tools across an intervening message",
);
assert.equal((split.match(/class="pc-chat-header"/g) || []).length, 1);

// The session-policy sentence is attached to the tool group it covers (never a separate item).
const NOTE = "Allowed by this chat's policy (set by admin at Nov 7, 2026, 19:49)";
const policy = (id, runId = "root", content = NOTE) => ({ id, role: "system", kind: "tool_policy_decision", title: "Tool policy", content, runId });
const countOf = (html, re) => (html.match(re) || []).length;
const after = render(ChatThread, { messages: [message(), message({ ...tool, id: "root:2" }), policy("p1")] });
assert.equal(countOf(after, /class="pc-tool-group"/g), 1);
assert.equal(countOf(after, /class="pc-chat-hint"/g), 0, "the decision is not a separate transcript item");
assert(after.indexOf("pc-tool-group__policy") > after.lastIndexOf("</details>") && after.includes(NOTE.replace(/'/g, "&#x27;")), "note sits below the group rows");
const before = render(ChatThread, { messages: [policy("p1"), message()] });
assert.equal(countOf(before, /class="pc-chat-hint"/g), 0);
assert.equal(countOf(before, /pc-tool-group__policy/g), 1, "decision arriving before its group attaches to it");
const twoGroups = render(ChatThread, { messages: [message(), { id: "a", role: "assistant", content: "x" }, message({ ...tool, id: "root:2" }), policy("p1")] });
assert.equal(countOf(twoGroups, /pc-tool-group__policy/g), 1, "attached to one group only");
assert(twoGroups.indexOf("pc-tool-group__policy") < twoGroups.indexOf(">x<"), "attached to the FIRST covered group");
const lost = render(ChatThread, { messages: [policy("p1", "other"), message()] });
assert.equal(countOf(lost, /class="pc-chat-hint"/g), 1, "a decision with no covered group is never lost");
console.log(
  "tool presentation: compact grouping, escaped full evidence, keyboard-native disclosure and host copy policy OK",
);
