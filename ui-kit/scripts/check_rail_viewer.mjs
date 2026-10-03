#!/usr/bin/env node
/**
 * ui-kit 0.6.0 (round 4) checks: AfRailDrawer, AfFileViewer + AfCodeBlock,
 * AfSettingsGroup / AfSettingRow / AfOverrideRow, AfVoiceSection helpers and
 * the deterministic relative-time formatter. Dependency-free: pure helpers
 * are called directly; components render with react-dom/server.
 * Every block is mutation-checked (removing the behaviour turns it red).
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const kit = await import(join(root, "dist", "index.js"));
const h = React.createElement;

let failures = 0;
let checks = 0;
function check(name, cond, detail) {
  checks += 1;
  if (cond) return;
  failures += 1;
  console.error(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`);
}
const eq = (name, got, want) => check(name, got === want, `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);

// ------------------------------------------------------------ relative time
{
  const now = Date.parse("2026-10-03T12:00:00Z");
  const ago = (ms) => new Date(now - ms).toISOString();
  const { formatRelativeTime: rel, formatExactTime, formatShortDate, timeValueMs } = kit;
  eq("rel just now", rel(ago(20_000), now), "just now");
  eq("rel minutes", rel(ago(5 * 60_000), now), "5 min ago");
  eq("rel hours", rel(ago(3 * 3600_000), now), "3 h ago");
  eq("rel yesterday", rel(ago(30 * 3600_000), now), "yesterday");
  eq("rel days", rel(ago(4 * 86400_000), now), "4 days ago");
  const weekOld = rel(ago(9 * 86400_000), now);
  check("rel >= 7 days is a short date without year", /^[A-Z][a-z]{2} \d{1,2}$/.test(weekOld), weekOld);
  eq("rel future hours", rel(new Date(now + 14 * 3600_000).toISOString(), now), "in 14 h");
  eq("rel future due", rel(new Date(now + 10_000).toISOString(), now), "due now");
  eq("rel epoch seconds", rel(Math.floor((now - 120_000) / 1000), now), "2 min ago");
  eq("rel unreadable", rel("not a date", now), "");
  check("rel deterministic (same input, same output)", rel(ago(7200_000), now) === rel(ago(7200_000), now));
  const lastYear = formatShortDate("2025-03-04T10:00:00Z", now);
  check("short date carries the year only for another year", /2025$/.test(lastYear) && !/2026/.test(formatShortDate("2026-03-04T10:00:00Z", now)), lastYear);
  const exact = formatExactTime("2026-10-02T09:07:00Z");
  check("exact time has year and hh:mm, no seconds", /^Oct \d{1,2}, 2026, \d{2}:\d{2}$/.test(exact), exact);
  eq("timeValueMs ms passthrough", timeValueMs(1_700_000_000_000), 1_700_000_000_000);
}

// ------------------------------------------------------------ code highlight
{
  const { highlightCode, codeLanguage, AfCodeBlock } = kit;
  const src = 'const x = 42; // answer\nlet s = "a\\"b";\n/* block\ncomment */ return x;';
  const tokens = highlightCode(src, codeLanguage("main.ts"));
  eq("highlight round-trips the text", tokens.map((t) => t.text).join(""), src);
  check("keyword token", tokens.some((t) => t.kind === "keyword" && t.text === "const"));
  check("number token", tokens.some((t) => t.kind === "number" && t.text === "42"));
  check("line comment token", tokens.some((t) => t.kind === "comment" && t.text === "// answer"));
  check("string with escape", tokens.some((t) => t.kind === "string" && t.text === '"a\\"b"'));
  check("block comment spans lines", tokens.some((t) => t.kind === "comment" && t.text.includes("block\ncomment")));
  const py = highlightCode('def f():\n    """doc"""\n    return None  # done', codeLanguage("x.py"));
  check("python triple string + hash comment", py.some((t) => t.kind === "string" && t.text === '"""doc"""') && py.some((t) => t.kind === "comment" && t.text === "# done"));
  eq("unknown language = one plain token", highlightCode("abc", "").length, 1);
  eq("dockerfile is shell", codeLanguage("Dockerfile"), "shell");
  const html = renderToStaticMarkup(h(AfCodeBlock, { text: "a\nb\n<script>", language: "x.js" }));
  check("code block numbers lines", (html.match(/af-code__line/g) || []).length === 3, html);
  check("code block escapes markup", html.includes("&lt;script&gt;") && !html.includes("<script>"), html);
  check("code block wraps (never scrolls sideways)", /\.af-code\s*\{[^}]*white-space:\s*pre-wrap/.test(readFileSync(join(root, "src", "theme.css"), "utf8")));
}

// ------------------------------------------------------------ file viewer
{
  const { fileViewerKind, fileViewerNeedsText, formatFileSize, AfFileViewer } = kit;
  eq("kind markdown", fileViewerKind("README.md"), "markdown");
  eq("kind json", fileViewerKind("data.json"), "json");
  eq("kind pdf", fileViewerKind("report.pdf"), "pdf");
  eq("kind image", fileViewerKind("chart.png"), "image");
  eq("kind code", fileViewerKind("app.py"), "code");
  eq("kind text", fileViewerKind("notes.txt"), "text");
  eq("kind svg = source, never rendered", fileViewerKind("logo.svg"), "code");
  eq("kind html = source", fileViewerKind("page.html"), "code");
  eq("kind binary", fileViewerKind("archive.zip"), "binary");
  eq("kind from content type", fileViewerKind("noext", "application/pdf"), "pdf");
  check("text kinds need text", fileViewerNeedsText("code") && !fileViewerNeedsText("image") && !fileViewerNeedsText("pdf"));
  eq("size KiB", formatFileSize(12 * 1024), "12 KiB");
  eq("size bytes", formatFileSize(512), "512 B");
  const now = Date.parse("2026-10-03T12:00:00Z");
  let downloads = 0;
  const md = renderToStaticMarkup(
    h(AfFileViewer, {
      name: "plan.md",
      path: "docs/plan.md",
      sizeBytes: 2048,
      modified: new Date(now - 3 * 3600_000).toISOString(),
      nowMs: now,
      status: "ready",
      text: "# Title",
      renderMarkdown: (t) => h("div", { className: "rendered-md" }, t.replace(/^# /, "H1:")),
      onDownload: () => (downloads += 1),
    }),
  );
  check("viewer renders markdown through the host renderer", md.includes("rendered-md") && md.includes("H1:Title"), md);
  check("viewer header: size", md.includes("2.0 KiB"), md);
  check("viewer header: relative date with exact tooltip", /<time[^>]*title="Oct 3, 2026, \d{2}:\d{2}"[^>]*>3 h ago<\/time>/.test(md), md);
  check("viewer: download icon button", md.includes('data-action="download-file"') && md.includes('aria-label="Download plan.md"'), md);
  check("viewer: no Open button", !/>\s*Open\s*</.test(md), md);
  check("viewer: path is the name tooltip", md.includes('title="docs/plan.md"'), md);
  const code = renderToStaticMarkup(h(AfFileViewer, { name: "a.py", nowMs: now, status: "ready", text: "def f(): pass" }));
  check("viewer highlights code", code.includes("af-code__keyword") && code.includes('data-language="python"'), code);
  const json = renderToStaticMarkup(h(AfFileViewer, { name: "a.json", nowMs: now, status: "ready", text: '{"a":1}' }));
  check("viewer pretty-prints JSON", json.includes('&quot;a&quot;</span>: <span class="af-code__number">1</span>') && json.includes('data-line="3"'), json);
  const img = renderToStaticMarkup(h(AfFileViewer, { name: "a.png", nowMs: now, status: "ready", url: "blob:x" }));
  check("viewer shows images", img.includes('<img class="af-file-viewer__image" src="blob:x"'), img);
  const pdf = renderToStaticMarkup(h(AfFileViewer, { name: "a.pdf", nowMs: now, status: "ready", url: "blob:p" }));
  check("viewer embeds PDF", pdf.includes('type="application/pdf"') && pdf.includes('data="blob:p"'), pdf);
  const err = renderToStaticMarkup(h(AfFileViewer, { name: "a.txt", nowMs: now, status: "error", error: "Preview failed (404): gone" }));
  check("viewer error says why", err.includes('role="alert"') && err.includes("Preview failed (404): gone"), err);
}

// ------------------------------------------------------------ rail drawer
{
  const { AfRailDrawer, railDrawerClampWidth, railDrawerKeyWidth, railDrawerNextIndex, railDrawerToggle, AF_RAIL_WIDTH } = kit;
  eq("toggle opens", railDrawerToggle(null, "files"), "files");
  eq("toggle switches", railDrawerToggle("files", "settings"), "settings");
  eq("toggle collapses the open one", railDrawerToggle("files", "files"), null);
  eq("clamp min", railDrawerClampWidth(10), AF_RAIL_WIDTH.min);
  eq("clamp max", railDrawerClampWidth(5000), AF_RAIL_WIDTH.max);
  eq("clamp NaN = default", railDrawerClampWidth(NaN), AF_RAIL_WIDTH.default);
  eq("ArrowLeft widens (panel left of rail)", railDrawerKeyWidth(400, "ArrowLeft", false), 416);
  eq("ArrowRight narrows", railDrawerKeyWidth(400, "ArrowRight", false), 384);
  eq("Shift = big step", railDrawerKeyWidth(400, "ArrowLeft", true), 464);
  eq("Home = min", railDrawerKeyWidth(400, "Home", false), AF_RAIL_WIDTH.min);
  eq("other key = null", railDrawerKeyWidth(400, "a", false), null);
  eq("rail Down wraps", railDrawerNextIndex(3, 2, "ArrowDown"), 0);
  eq("rail Up wraps", railDrawerNextIndex(3, 0, "ArrowUp"), 2);
  const items = [
    { id: "activity", label: "Activity", icon: "activity", badge: 3, content: h("p", null, "ACT") },
    { id: "files", label: "Files", icon: "folder", content: h("p", null, "FILES") },
    { id: "settings", label: "Settings", icon: "cog", content: h("p", null, "SETTINGS") },
  ];
  const open = renderToStaticMarkup(h(AfRailDrawer, { items, active: "files", onActiveChange: () => {}, ariaLabel: "Workspace panels", overlay: false, idBase: "t" }));
  check("rail is a vertical tablist", open.includes('role="tablist"') && open.includes('aria-orientation="vertical"') && open.includes('aria-label="Workspace panels"'), open);
  eq("one tab per item", (open.match(/role="tab"/g) || []).length, 3);
  check("tabs are icon-only with accessible names + tooltips", open.includes('aria-label="Settings"') && open.includes('title="Settings"') && !/af-rail__tab[^>]*>[^<]*Settings</.test(open), open);
  check("open tab selected and its tooltip says Collapse", /aria-selected="true"[^>]*aria-controls="t-panel-files"/.test(open) && open.includes('title="Collapse Files"'), open);
  check("panel content of the open tab is mounted", open.includes("FILES") && !open.includes("SETTINGS"), open);
  check("docked panel has a keyboard separator", open.includes('role="separator"') && open.includes('aria-valuenow="420"') && open.includes('tabindex="0"'), open);
  check("badge renders on the rail", open.includes('class="af-rail__badge"') && open.includes(">3<"), open);
  check("no horizontal tab strip", !open.includes("af-tabs"), open);
  const collapsed = renderToStaticMarkup(h(AfRailDrawer, { items, active: null, onActiveChange: () => {}, ariaLabel: "Workspace panels", overlay: false }));
  check("collapsed = rail only (panel hidden, no separator)", collapsed.includes("af-rail--collapsed") && /af-rail__panel-wrap"[^>]*hidden/.test(collapsed) && !collapsed.includes('role="separator"'), collapsed);
  check("collapsed still shows the rail", (collapsed.match(/role="tab"/g) || []).length === 3);
  const overlay = renderToStaticMarkup(h(AfRailDrawer, { items, active: "settings", onActiveChange: () => {}, ariaLabel: "Panels", overlay: true }));
  check("overlay = dialog panel + backdrop, no resize", overlay.includes('role="dialog"') && overlay.includes("af-rail__backdrop") && !overlay.includes('role="separator"'), overlay);
  const css = readFileSync(join(root, "src", "theme.css"), "utf8");
  check("rail icons are 44px targets", /\.af-rail__tab\s*\{[^}]*width:\s*44px;[^}]*height:\s*44px/.test(css));
  check("resize handle takes touch (touch-action:none)", /\.af-rail__resize\s*\{[^}]*touch-action:\s*none/.test(css));
  check("rail body never scrolls sideways", /\.af-rail__body\s*\{[^}]*overflow-x:\s*hidden/.test(css));
}

// ------------------------------------------------------------ settings rows + voice
{
  const { AfOverrideRow, AfSettingsGroup, AfSettingRow, voiceTtsRequest, voiceSttRequest, voiceTtsOverrideSummary, VOICE_LATENCY_OPTIONS } = kit;
  const def = renderToStaticMarkup(h(AfOverrideRow, { label: "Text → speech", defaultSummary: "supertonic", open: false, onToggle: () => {}, onReset: () => {} }));
  check("override row: gateway default summary", def.includes("Gateway default · supertonic") && def.includes('data-overridden="false"'), def);
  check("override row: no reset while default", !def.includes("Use gateway default"), def);
  check("override row: Change", def.includes(">Change<") && def.includes('aria-expanded="false"'), def);
  const over = renderToStaticMarkup(h(AfOverrideRow, { label: "Text → speech", overrideSummary: "openai · tts-1", overrideOwner: "this app", open: true, onToggle: () => {}, onReset: () => {} }, h("p", null, "EDITOR")));
  check("override row: override summary + owner", over.includes("openai · tts-1 — this app") && over.includes('data-overridden="true"'), over);
  check("override row: reset only while overridden", over.includes("Use gateway default"), over);
  check("override row: editor in place while open", over.includes("EDITOR") && over.includes(">Done<"), over);
  const group = renderToStaticMarkup(h(AfSettingsGroup, { title: "Replies", aside: "Revision 4" }, h(AfSettingRow, { label: "Voice latency", help: "One line" }, h("select"))));
  check("group: titled section + aside", group.includes("<h3") && group.includes("Replies") && group.includes("Revision 4") && group.includes("aria-labelledby"), group);
  check("row: label, help, control", group.includes("af-setting-row__name") && group.includes("One line") && group.includes("<select"), group);
  const prefs = { provider: "openai", model: "", voice: "alloy", read_aloud: true, output_device: "dev1", stt_provider: "whisper", stt_model: "base", speed: 1.25 };
  const tts = voiceTtsRequest(prefs);
  check("TTS request carries only TTS keys", tts.provider === "openai" && tts.voice === "alloy" && tts.speed === 1.25 && !("read_aloud" in tts) && !("output_device" in tts) && !("stt_provider" in tts) && !("model" in tts), JSON.stringify(tts));
  const stt = voiceSttRequest(prefs);
  check("STT request = provider/model only", stt.provider === "whisper" && stt.model === "base" && Object.keys(stt).length === 2, JSON.stringify(stt));
  eq("STT request empty = gateway default", JSON.stringify(voiceSttRequest({})), "{}");
  eq("TTS override summary", voiceTtsOverrideSummary(prefs), "openai · alloy");
  check("latency options = the Assistant's", VOICE_LATENCY_OPTIONS.map((o) => o.value).join(",") === ",standard,low,high" && VOICE_LATENCY_OPTIONS[0].label === "Gateway default");
}

// ------------------------------------------------------------ voice section layout
{
  const { AfVoiceSection } = kit;
  const props = { value: {}, onChange: () => {}, fetchCatalog: async () => ({}), outputSelectable: false };
  const nested = renderToStaticMarkup(h(AfVoiceSection, { ...props, nested: true }));
  eq("nested voice: three flat sub-sections", (nested.match(/af-settings-group af-settings-group--flat/g) || []).length, 3);
  check("nested voice: never a card in a card", !/class="af-settings-group"/.test(nested), nested);
  for (const label of ["Text → speech", "Speech → text", "Output device", "Read aloud", "Voice latency"]) check(`voice row ${label}`, nested.includes(label), label);
  check("voice: everything Gateway default until overridden", (nested.match(/Gateway default/g) || []).length >= 2 && !nested.includes("Use gateway default"), nested);
  check("voice: read aloud is a real switch", /role="switch"[^>]*aria-checked="false"/.test(nested), nested);
  check("voice: unselectable speaker says why", nested.includes("This browser plays on the system output."), nested);
  const cards = renderToStaticMarkup(h(AfVoiceSection, props));
  eq("standalone voice: cards", (cards.match(/class="af-settings-group"/g) || []).length, 3);
}

console.log(`check_rail_viewer: ${checks - failures}/${checks} checks passed`);
if (failures) process.exit(1);
