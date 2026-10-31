import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup as render } from "react-dom/server";
import { TextLinks } from "../dist/text_links.js";
import { Markdown } from "../dist/markdown.js";
import { ToolActivity } from "../dist/tool_activity.js";
import { ChatMessageCard } from "../dist/chat_message_card.js";
import {
  submittedArtifacts,
  outputArtifacts,
} from "../dist/message_artifacts.js";
const html = (C, p) => render(React.createElement(C, p));
const links = html(TextLinks, {
  text: "See https://example.com/a_(b). Or www.example.org/path?x=1&y=2; javascript:alert(1) <script>bad</script>",
});
assert.match(links, /href="https:\/\/example.com\/a_\(b\)"/);
assert.match(links, /href="https:\/\/www.example.org\/path\?x=1&amp;y=2"/);
assert.equal((links.match(/target="_blank"/g) || []).length, 2);
assert.doesNotMatch(links, /<script|href="javascript/);
const markdown = html(Markdown, {
  text: "A [named link](https://example.org), https://example.com, and `https://example.net`.",
});
assert.equal((markdown.match(/<a /g) || []).length, 3);
assert.doesNotMatch(
  html(Markdown, { text: "[bad](javascript:alert(1))" }),
  /href=/,
);
const base = {
  id: "t",
  runId: "r",
  name: "web_search",
  status: "completed",
  arguments: { url: "https://example.com/a" },
  output: JSON.stringify({
    success: true,
    results: [{ url: "https://example.org/result", title: "A result" }],
  }),
};
for (const name of ["web_search", "skim_websearch", "fetch_url"]) {
  const rendered = html(ToolActivity, { tool: { ...base, name } });
  assert.match(rendered, /pc-json-viewer/);
  assert.match(rendered, /Copy JSON/);
  assert.match(rendered, /href="https:\/\/example.org\/result"/);
}
assert.match(
  html(ToolActivity, {
    tool: { ...base, output: "Plain text https://example.net/docs" },
  }),
  /href="https:\/\/example.net\/docs"/,
);
assert.deepEqual(
  submittedArtifacts(
    {
      input_data: {
        context: {
          attachments: [
            { $artifact: "file", filename: "notes.txt", run_id: "memory" },
          ],
        },
        _runtime: { $artifact: "internal" },
      },
    },
    "r",
  ),
  [{ id: "file", name: "notes.txt", runId: "memory" }],
);
assert.deepEqual(
  outputArtifacts(
    {
      attachments: [{ $artifact: "ai", filename: "report.pdf" }],
      scratchpad: { $artifact: "private" },
    },
    "r",
  ),
  [{ id: "ai", name: "report.pdf", runId: "r" }],
);
for (const role of ["user", "assistant"])
  assert.match(
    html(ChatMessageCard, {
      message: {
        role,
        runId: "r",
        content: "Attached.",
        artifactRefs: [{ id: "file", runId: "r", name: "report.json" }],
      },
    }),
    /Attached files/,
  );
console.log(
  "message_files_links: PASS (roles, provenance, JSON strings, safe clickable URLs)",
);

const highlighted = html(Markdown, {
  text: "See https://example.com/docs now",
  highlight: "docs",
});
assert.match(highlighted, /href="https:\/\/example.com\/docs"/);
assert.doesNotMatch(highlighted, /href="https:\/\/example.com\/"/);

const mixed = html(ToolActivity, {
  tool: {
    ...base,
    output: JSON.stringify({
      snippet: "Read https://example.com/docs now",
      url: "www.example.org",
      multiline: "Read https://example.net/guide\nThen continue.",
    }),
  },
});
assert.match(mixed, /href="https:\/\/example.com\/docs"/);
assert.match(mixed, /href="https:\/\/www.example.org"/);
assert.match(mixed, /href="https:\/\/example.net\/guide"/);

import { projectReplayView } from "../dist/replay_view_projection.js";
import { displayArtifactPath } from "../dist/artifact_provenance.js";
import {
  boundedPreviewBlob,
  artifactPreviewKind,
} from "../dist/artifact_preview.js";
const projected = projectReplayView({
  root_run_id: "r",
  messages: [
    {
      id: "answer",
      role: "assistant",
      kind: "answer",
      text: "Your JSON",
      run_id: "r",
    },
    {
      id: "r:final",
      role: "assistant",
      kind: "final",
      text: "Your JSON",
      run_id: "r",
      repeats: "answer",
      artifact_ids: ["json", "scratch", "session", "unknown"],
    },
  ],
  artifacts: [
    { id: "json", run_id: "child", path: "output.attachments[0]" },
    { id: "scratch", run_id: "r", path: "output.scratchpad.node_traces.steps" },
    { id: "session", run_id: "r", path: "output.session.artifacts[0]" },
  ],
  runs: [],
});
assert.equal(projected.messages.length, 1);
assert.deepEqual(projected.messages[0].artifactRefs, [
  { id: "json", runId: "child" },
]);
assert.equal(projected.messages[0].artifactReferencesUnresolved, true);
assert.doesNotMatch(
  html(ChatMessageCard, {
    message: {
      role: "assistant",
      runId: "r",
      content: "Hello",
      artifactIds: ["session", "scratch"],
    },
  }),
  /Attached files|Attachment session/,
);
assert.equal(displayArtifactPath("output.artifacts[0]"), true);
assert.equal(displayArtifactPath("output.transcript.attachments[0]"), false);
assert.equal(
  displayArtifactPath("output._provider_request.image_artifact"),
  false,
);
assert.equal(artifactPreviewKind("innocent.pdf", "text/html"), "text");
assert.equal(artifactPreviewKind("picture.png", "image/svg+xml"), "text");
let cancelled = false;
await assert.rejects(
  () =>
    boundedPreviewBlob(
      new Response(
        new ReadableStream({
          start(c) {
            c.enqueue(new Uint8Array(6));
          },
          cancel() {
            cancelled = true;
          },
        }),
      ),
      4,
    ),
  /too large/,
);
assert.equal(cancelled, true);

assert.equal(artifactPreviewKind("photo.png","application/json"),"json");
assert.equal(artifactPreviewKind("photo.png","text/plain"),"text");

assert.deepEqual(outputArtifacts({result:{artifact_ref:{$artifact:"json",filename:"report.json"}}},"r"),[{id:"json",runId:"r",name:"report.json"}]);

assert.deepEqual(outputArtifacts({media:[{$artifact:"sound",filename:"answer.wav"}]},"r"),[{id:"sound",runId:"r",name:"answer.wav"}]);
