// Drag-and-drop / paste to attach (mission K, 2026-09-23).
// Run after `npm run build`: node scripts/check_file_drop.mjs
//
// The pure rules behind WorkflowChat's drop zone: only OS file drags count,
// the nested dragenter/dragleave counter never flickers or sticks, folders
// are refused out loud, pasted screenshots get readable names, and rich-text
// pastes stay text.
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  DragPresence,
  dragCarriesFiles,
  draggedFileCount,
  dropZoneLabel,
  droppedFiles,
  folderRefusal,
  pastedFileName,
  pastedFiles,
} from "../dist/file_drop.js";
import { WorkflowChat } from "../dist/workflow_chat.js";
import * as api from "../dist/index.js";

const file = (name, type = "text/plain", body = "x") => new File([body], name, { type });
const fileItem = (value) => ({ kind: "file", type: value.type, getAsFile: () => value, webkitGetAsEntry: () => ({ isDirectory: false, name: value.name }) });
const folderItem = (name) => ({ kind: "file", type: "", getAsFile: () => file(name, ""), webkitGetAsEntry: () => ({ isDirectory: true, name }) });
const stringItem = (type) => ({ kind: "string", type, getAsFile: () => null });

// 1. Only file drags are ours: a text selection or a link must not arm the zone.
assert.equal(dragCarriesFiles(["Files"]), true);
assert.equal(dragCarriesFiles(["text/plain", "Files"]), true);
assert.equal(dragCarriesFiles(["text/plain", "text/html"]), false, "a text selection drag is ignored");
assert.equal(dragCarriesFiles(["text/uri-list", "text/plain"]), false, "a link drag is ignored");
assert.equal(dragCarriesFiles(undefined), false);
assert.equal(dragCarriesFiles({ length: 1, 0: "Files" }), true, "DOMStringList-like types are read by index");

// 2. The count comes from items when the engine exposes it, never guessed.
assert.equal(draggedFileCount({ items: [fileItem(file("a")), fileItem(file("b"))] }), 2);
assert.equal(draggedFileCount({ items: [stringItem("text/plain"), fileItem(file("a"))] }), 1);
assert.equal(draggedFileCount({ items: [] }), null, "Safari exposes no items during the drag");
assert.equal(draggedFileCount(null), null);
assert.equal(dropZoneLabel(1), "Drop file to attach");
assert.equal(dropZoneLabel(3), "Drop 3 files to attach");
assert.equal(dropZoneLabel(null), "Drop files to attach");

// 3. Folders are split out and refused with their name; files still attach.
{
  const a = file("notes.md");
  const out = droppedFiles({ items: [fileItem(a), folderItem("src")] });
  assert.deepEqual(out.files.map((f) => f.name), ["notes.md"]);
  assert.deepEqual(out.folders, ["src"]);
  assert.match(folderRefusal(out.folders), /"src" is a folder\. Folders are not supported/);
  assert.match(folderRefusal(["a", "b"]), /^2 folders were dropped\./);
  assert.equal(folderRefusal([]), "");
  // Engines without items fall back to the flat file list.
  assert.deepEqual(droppedFiles({ files: [a] }).files, [a]);
}

// 4. The nested dragenter/dragleave counter: crossing child boundaries keeps
//    the zone up; only the final leave (or a quiet drag) takes it down.
{
  const presence = new DragPresence(1000);
  presence.enter(0); // window → section
  presence.enter(10); // section → composer (enter new, then leave old)
  assert.equal(presence.leave(11), true, "leaving the parent while entering a child is not a leave");
  assert.equal(presence.active(20), true);
  presence.enter(30); // composer → textarea
  assert.equal(presence.leave(31), true);
  assert.equal(presence.leave(40), false, "the last leave ends the drag");
  assert.equal(presence.active(41), false);
  assert.equal(presence.leave(50), false, "extra leaves never go negative");
  assert.equal(presence.depth, 0);
  // A lost dragleave (fast exit) must not strand the zone forever.
  presence.enter(100);
  presence.over(500);
  assert.equal(presence.active(1400), true, "dragover keeps a resting drag alive");
  assert.equal(presence.active(1600), false, "a drag that went quiet is retired");
  presence.reset();
  assert.equal(presence.active(1600), false);
  presence.over(2000);
  assert.equal(presence.active(2001), true, "a dragover after a reset re-arms");
}

// 5. Paste: screenshots and copied files attach; rich-text pastes stay text.
{
  const now = new Date(2026, 8, 23, 14, 5, 9);
  assert.equal(pastedFileName("image.png", "image/png", now), "Pasted image 2026-09-23 at 14.05.09.png");
  assert.equal(pastedFileName("", "image/jpeg", now), "Pasted image 2026-09-23 at 14.05.09.jpg");
  assert.equal(pastedFileName("report.pdf", "application/pdf", now), "report.pdf", "a real file name is kept");
  const shot = file("image.png", "image/png", "png-bytes");
  const renamed = pastedFiles({ types: ["Files"], items: [fileItem(shot)] }, now);
  assert.equal(renamed.length, 1);
  assert.equal(renamed[0].name, "Pasted image 2026-09-23 at 14.05.09.png");
  assert.equal(renamed[0].type, "image/png");
  assert.equal(renamed[0].size, shot.size, "renaming keeps the bytes");
  const finder = file("budget.xlsx", "application/vnd.ms-excel");
  assert.deepEqual(pastedFiles({ types: ["text/plain", "Files"], items: [stringItem("text/plain"), fileItem(finder)] }, now).map((f) => f.name), ["budget.xlsx"]);
  assert.equal(pastedFiles({ types: ["text/html", "Files"], items: [stringItem("text/html"), fileItem(shot)] }, now).length, 1, "an image copied from a page attaches");
  assert.deepEqual(pastedFiles({ types: ["text/plain", "text/html", "Files"], items: [stringItem("text/plain"), stringItem("text/html"), fileItem(shot)] }, now), [], "a Word/Excel selection pastes as text");
  assert.deepEqual(pastedFiles({ types: ["text/plain"], items: [stringItem("text/plain")] }, now), [], "plain text is untouched");
  assert.deepEqual(pastedFiles(null, now), []);
}

// 6. WorkflowChat renders host chips inside the composer and a live region
//    only when the host accepts files; without onFiles nothing changes.
{
  const base = { messages: [], draft: "", onDraftChange() {}, onSend() {} };
  const withFiles = renderToStaticMarkup(
    React.createElement(WorkflowChat, { ...base, onFiles() {}, attachments: React.createElement("span", { className: "host-chip" }, "a.txt") }),
  );
  assert.match(withFiles, /<div class="pc-composer"><div class="pc-workflow-chat__attachments"><span class="host-chip">a\.txt<\/span><\/div><textarea/, "chips sit inside the composer, above the field");
  assert.match(withFiles, /class="pc-sr-only" role="status" aria-live="polite"/);
  assert.doesNotMatch(withFiles, /pc-workflow-chat__dropzone/, "no drop zone before a drag");
  const without = renderToStaticMarkup(React.createElement(WorkflowChat, base));
  assert.doesNotMatch(without, /pc-sr-only|pc-workflow-chat__attachments/);
}

// 7. Public API.
for (const name of ["DragPresence", "dragCarriesFiles", "draggedFileCount", "dropZoneLabel", "droppedFiles", "folderRefusal", "pastedFileName", "pastedFiles"]) {
  assert.equal(typeof api[name], "function", `${name} is exported`);
}

console.log("check_file_drop: ok");
