#!/usr/bin/env node
/**
 * ui-primitives "shell" (backlog 0036, ADR 0001 §6): the docs assistant and an app assistant as
 * AfDrawerSystem panels (panel-chat depends on ui-kit, never the reverse).
 * - docsAssistantPanel(source, fetchGateway, opts) = an opaque {id, label, icon, content} panel,
 *   drawer mode (the top bar's book button opens it), kept alive ("always").
 * - Its content is the SAME conversation as DocsAssistantDrawer: the header actions (Past
 *   conversations, New conversation) and the body share one state (driven through the kit's
 *   hook harness: pressing Past conversations in the header shows the history in the body).
 * - Inside a drawer system the header actions go to the panel header (portal slot); outside
 *   one they render in place. DocsAssistantDrawer still renders in its own AfDrawer.
 * - assistantDrawerPanel(opts) wraps AssistantPanel the same way (sparkle, kept alive).
 * Run after `npm run build`.
 */
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

const here = dirname(fileURLToPath(import.meta.url));
const api = await import(join(here, "..", "dist", "index.js"));
const kit = await import("@abstractframework/ui-kit");
const { mountHook, find } = await import(join(here, "..", "..", "ui-kit", "scripts", "hook_harness.mjs"));
const { docsAssistantPanel, DocsAssistantPanelContent, DocsAssistantDrawer, DocsHistoryList, assistantDrawerPanel, AssistantPanel } = api;
let failures = 0;
let checks = 0;
const check = (name, cond, detail) => {
  checks += 1;
  if (!cond) {
    failures += 1;
    console.error(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`);
  }
};
const h = React.createElement;
for (const [name, fn] of Object.entries({ docsAssistantPanel, DocsAssistantPanelContent, DocsAssistantDrawer, assistantDrawerPanel })) check(`export ${name}`, typeof fn === "function", typeof fn);

const source = { app: "flow", name: "AbstractFlow" };
const fetched = [];
const fetchGateway = async (path) => (fetched.push(path), { ok: true, status: 200, json: async () => ({ items: [] }), text: async () => "{}" });

// The panel item.
const panel = docsAssistantPanel(source, fetchGateway, { connected: true, suggestions: ["How do I run a flow?"] });
check("panel: opaque item shape", panel.id === "docs" && panel.label === "Docs assistant" && panel.icon === "book", JSON.stringify({ ...panel, content: undefined }));
check("panel: drawer mode (no rail tab), right side, kept alive", panel.mode === "drawer" && panel.side === "right" && panel.keepAlive === "always" && panel.defaultWidth === 420);
check("panel: content is the docs conversation", panel.content.type === DocsAssistantPanelContent && panel.content.props.source === source && panel.content.props.fetchGateway === fetchGateway && panel.content.props.connected === true);
const custom = docsAssistantPanel(source, fetchGateway, { connected: false, id: "help", mode: "rail", side: "left", label: "Help" });
check("panel: id / mode / side / label overridable", custom.id === "help" && custom.mode === "rail" && custom.side === "left" && custom.label === "Help" && !("id" in custom.content.props) && !("mode" in custom.content.props));

// Outside a system: header actions in place.
const alone = renderToStaticMarkup(h(DocsAssistantPanelContent, { source, fetchGateway, connected: true }));
check("content alone: header actions render in place", alone.includes('aria-label="Past conversations"') && alone.includes('aria-label="New conversation"'), alone);
check("content alone: the grounding footer", alone.includes("Grounded on AbstractFlow"), alone);
const blocked = renderToStaticMarkup(h(DocsAssistantPanelContent, { source, fetchGateway, connected: false }));
check("content: signed out = the labeled blocked notice", blocked.includes("Connect to the gateway to use the docs assistant."), blocked);

// Inside the drawer system: the header actions leave the body (they portal into the panel header once mounted).
const inSystem = renderToStaticMarkup(h(kit.AfDrawerSystem, { panels: [panel], active: "docs", onActiveChange: () => {}, ariaLabel: "Panels", overlay: false }));
check("system: the panel renders without a rail tab", inSystem.includes('aria-label="Docs assistant"') && !inSystem.includes('role="tablist"') && inSystem.includes("Grounded on AbstractFlow"), inSystem);
check("system: header actions are not duplicated in the body", !inSystem.includes('aria-label="Past conversations"'), inSystem);
check("system: the panel header has the actions slot", inSystem.includes('class="af-rail__head-slot"'), inSystem);

// One state behind the header actions and the body.
{
  const t = mountHook(DocsAssistantPanelContent, { source, fetchGateway, connected: true });
  const slot = find(t.current, (n) => n.type === kit.AfPanelHeaderActions);
  check("state: header actions go through AfPanelHeaderActions", Boolean(slot));
  const past = find(slot.props.children, (n) => n.props["aria-label"] === "Past conversations");
  check("state: no history before Past conversations", !find(t.current, (n) => n.type === DocsHistoryList));
  past.props.onClick();
  await t.settle();
  check("state: Past conversations (header) opens the history (body)", Boolean(find(t.current, (n) => n.type === DocsHistoryList)));
  check("state: the history was loaded through the host fetch", fetched.some((p) => p.startsWith("api/gateway/runs")), JSON.stringify(fetched));
  const pressed = find(find(t.current, (n) => n.type === kit.AfPanelHeaderActions).props.children, (n) => n.props["aria-label"] === "Past conversations");
  check("state: the header shows it pressed", pressed.props["aria-pressed"] === true);
}

// The drawer keeps working.
const drawer = renderToStaticMarkup(h(DocsAssistantDrawer, { open: true, onClose: () => {}, source, fetchGateway, connected: true, topOffset: "auto" }));
check("drawer: still an AfDrawer with its header actions", drawer.includes("af-drawer") && drawer.includes('aria-label="Docs assistant"') && drawer.includes('aria-label="Past conversations"') && drawer.includes("top:var(--af-topbar-h, 0px)"), drawer);

// The drawer keeps its pre-0036 focus behaviour unless the host opts in (no soft keyboard on open).
{
  const d = mountHook(DocsAssistantDrawer, { open: false, onClose: () => {}, source, fetchGateway, connected: true });
  check("drawer: does not move focus by default", find(d.current, (n) => n.type === kit.AfDrawer)?.props.manageFocus === false);
  const d2 = mountHook(DocsAssistantDrawer, { open: false, onClose: () => {}, source, fetchGateway, connected: true, manageFocus: true });
  check("drawer: manageFocus opts in", find(d2.current, (n) => n.type === kit.AfDrawer)?.props.manageFocus === true);
}

// An app assistant panel.
const ask = async () => "ok";
const adv = assistantDrawerPanel({ ask, assistantName: "Continuum advisor", blockedNotice: undefined });
check("assistant panel: item", adv.id === "assistant" && adv.label === "Continuum advisor" && adv.icon === "sparkle" && adv.mode === "drawer" && adv.keepAlive === "always", JSON.stringify({ ...adv, content: undefined }));
check("assistant panel: content = AssistantPanel with the transport", adv.content.type === AssistantPanel && adv.content.props.ask === ask && !("icon" in adv.content.props));
check("assistant panel: renders", renderToStaticMarkup(adv.content).includes("pc-assistant"));

console.log(`check_docs_panel: ${checks - failures}/${checks} checks passed`);
if (failures) process.exit(1);
