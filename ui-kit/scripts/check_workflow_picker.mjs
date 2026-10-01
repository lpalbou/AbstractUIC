#!/usr/bin/env node
/**
 * WorkflowPicker (workflow_picker.tsx + workflow_picker_core.ts) over a fake
 * gateway answer to `GET /bundles?executable_for=<interface>`.
 *
 * renderToStaticMarkup over the compiled dist (no jsdom), like check_about:
 * - the request path carries executable_for (and nothing that widens it);
 * - the parser keeps exactly what the API returned, groups it Shared / Mine
 *   from `owner`, and FAILS LOUDLY on a gateway that ignored the contract (no
 *   echo, wrong echo, missing owner/shipped, an entrypoint without the
 *   interface) — there is no client-side "all workflows" path;
 * - the open list renders "Gateway default" first, the group headings, the
 *   version as the small detail line, and the empty sentence;
 * - the trigger is a select-only combobox, never a switch/checkbox, and the
 *   whole kit source carries no "Show all workflows" control.
 */
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

const here = dirname(fileURLToPath(import.meta.url));
const kit = await import(join(here, "..", "dist", "index.js"));
const {
  WorkflowPicker,
  WorkflowPickerListbox,
  WORKFLOW_PICKER_DEFAULT,
  WORKFLOW_PICKER_EMPTY,
  WorkflowPickerContractError,
  executableWorkflowsPath,
  parseExecutableWorkflows,
  workflowPickerGroups,
  workflowPickerNextIndex,
  workflowPickerRows,
} = kit;

let failures = 0;
let checks = 0;
function check(name, cond, detail) {
  checks += 1;
  if (cond) return;
  failures += 1;
  console.error(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`);
}
function throwsContract(name, fn, needle) {
  try {
    fn();
    check(name, false, "did not throw");
  } catch (e) {
    check(name, e instanceof WorkflowPickerContractError && (!needle || String(e.message).includes(needle)), String(e?.message || e));
  }
}

const IFACE = "abstractcode.agent.v1";
const ep = (flow, name, interfaces = [IFACE], bid = "b", ver = "1.0.0") => ({ flow_id: flow, name, interfaces, workflow_id: `${bid}@${ver}:${flow}`, description: `${name} does things` });
const item = (bid, ver, owner, shipped, eps) => ({ bundle_id: bid, bundle_version: ver, registry_scope: "private", owner, shipped, available: true, archived: false, entrypoints: eps });
const GW = { kind: "gateway", user_id: null };
const ME = { kind: "user", user_id: "alice" };
const envelope = (items, extra = {}) => ({
  executable_for: IFACE,
  items,
  default_agent_workflows: { [IFACE]: { bundle_id: "basic-agent", bundle_version: "0.0.5", flow_id: "main", registry_scope: "private", name: "Basic agent" } },
  skipped: [],
  ...extra,
});
const fake = envelope([
  item("basic-agent", "0.0.5", GW, true, [ep("main", "Basic agent", [IFACE], "basic-agent", "0.0.5")]),
  item("basic-agent", "0.0.4", GW, true, [ep("main", "Basic agent", [IFACE], "basic-agent", "0.0.4")]),
  item("my-coder", "0.1.0", ME, false, [ep("main", "My coder", [IFACE, "abstractassistant.agent.v1"], "my-coder", "0.1.0")]),
]);

// 1. Request path: the interface, encoded; nothing that lists "all".
check("path", executableWorkflowsPath(IFACE) === "bundles?executable_for=abstractcode.agent.v1", executableWorkflowsPath(IFACE));
check("path all versions", executableWorkflowsPath(IFACE, { allVersions: true }) === "bundles?executable_for=abstractcode.agent.v1&all_versions=true");
check("path encodes", executableWorkflowsPath("a b&c").includes("executable_for=a%20b%26c"));
let threw = false;
try { executableWorkflowsPath(""); } catch { threw = true; }
check("path requires an interface", threw);

// 2. Parser: exactly what the API returned, grouped by owner.
const parsed = parseExecutableWorkflows(fake, IFACE);
check("entries = API entries", parsed.entries.length === 3, String(parsed.entries.length));
check("values are workflow ids", parsed.entries.map((e) => e.value).sort().join(",") === "basic-agent@0.0.4:main,basic-agent@0.0.5:main,my-coder@0.1.0:main");
check("owner gateway → shared", parsed.entries.filter((e) => e.group === "shared").length === 2);
check("owner user → mine", parsed.entries.find((e) => e.bundleId === "my-coder")?.group === "mine");
check("shipped kept", parsed.entries.find((e) => e.bundleId === "basic-agent")?.shipped === true);
check("default parsed", parsed.gatewayDefault.status === "ok" && parsed.gatewayDefault.name === "Basic agent" && parsed.gatewayDefault.bundleVersion === "0.0.5");
const groups = workflowPickerGroups(parsed.entries);
check("groups Shared then Mine", groups.map((g) => g.label).join("|") === "Shared|Mine");
check("newest version first", groups[0].entries[0].bundleVersion === "0.0.5");
check("empty group hidden", workflowPickerGroups(parsed.entries.filter((e) => e.group === "shared")).map((g) => g.id).join() === "shared");

// A bundle WITHOUT the interface never appears: the API filters, and an
// answer that still carries one is a contract break (thrown), never a row.
const leaky = envelope([item("prompt-only", "1.0.0", GW, true, [ep("main", "Prompt only", ["abstractflow.prompt.v1"], "prompt-only")])]);
throwsContract("entrypoint without the interface is refused", () => parseExecutableWorkflows(leaky, IFACE), "does not declare abstractcode.agent.v1");
throwsContract("no executable_for echo (old gateway ignoring the param)", () => parseExecutableWorkflows({ ...fake, executable_for: undefined }, IFACE), "does not filter workflows per app");
throwsContract("echo for another interface", () => parseExecutableWorkflows({ ...fake, executable_for: "abstractassistant.agent.v1" }, IFACE), "not abstractcode.agent.v1");
throwsContract("owner missing", () => parseExecutableWorkflows(envelope([{ ...item("x", "1", GW, true, [ep("main", "X", [IFACE], "x", "1")]), owner: undefined }]), IFACE), "owner missing");
throwsContract("shipped missing", () => parseExecutableWorkflows(envelope([{ ...item("x", "1", GW, true, [ep("main", "X", [IFACE], "x", "1")]), shipped: undefined }]), IFACE), "shipped missing");
throwsContract("items missing", () => parseExecutableWorkflows({ executable_for: IFACE }, IFACE));
throwsContract("not an object", () => parseExecutableWorkflows(null, IFACE));
const noDefault = parseExecutableWorkflows({ ...fake, default_agent_workflows: {}, default_agent_workflows_unavailable: { [IFACE]: { reason: "no agent bundle" } } }, IFACE);
check("default unavailable carries the reason", noDefault.gatewayDefault.status === "unavailable" && noDefault.gatewayDefault.reason === "no agent bundle");

// 3. Rows + the open list.
const rows = workflowPickerRows(parsed);
check("rows: default first", rows[0].value === WORKFLOW_PICKER_DEFAULT && rows[0].name === "Gateway default" && rows[0].detail === "Basic agent @0.0.5");
check("rows: count = default + entries", rows.length === 4);
check("rows: no default when not offered", workflowPickerRows(parsed, false).every((r) => r.entry));
const listbox = (data, value = WORKFLOW_PICKER_DEFAULT, extra = {}) =>
  renderToStaticMarkup(React.createElement(WorkflowPickerListbox, { id: "l", idBase: "p", rows: workflowPickerRows(data, extra.showDefault !== false), value, highlight: 1, ariaLabel: "Workflow", onHighlight: () => {}, onChoose: () => {} }));
const html = listbox(parsed, "my-coder@0.1.0:main");
check("listbox role", html.includes('role="listbox"') && html.includes('aria-label="Workflow"'));
check("group headings", html.includes(">Shared</div>") && html.includes(">Mine</div>") && html.indexOf(">Shared<") < html.indexOf(">Mine<"));
check("version as small detail", html.includes('<span class="af-workflow-picker__detail">@0.0.5</span>'));
check("default option first", html.indexOf('data-value="@default"') < html.indexOf('data-value="basic-agent@0.0.5:main"'));
check("selected option", /aria-selected="true"[^>]*data-value="my-coder@0.1.0:main"/.test(html));
check("highlight", /af-workflow-picker__option--highlighted/.test(html));
check("no checkbox / switch in the list", !/type="checkbox"|role="switch"/.test(html));
check("only API rows rendered", (html.match(/role="option"/g) || []).length === 4);
const empty = parseExecutableWorkflows(envelope([]), IFACE);
const emptyHtml = listbox(empty);
check("empty sentence", emptyHtml.includes(WORKFLOW_PICKER_EMPTY) && WORKFLOW_PICKER_EMPTY === "No workflows available for this app — ask your admin.");
check("empty still offers the default", emptyHtml.includes('data-value="@default"'));

// 4. Trigger: a combobox showing the current choice, never a toggle.
const state = (data, status = "ready", error = "") => ({ status, data, error, reload: () => {} });
const trig = (props) => renderToStaticMarkup(React.createElement(WorkflowPicker, { interfaceId: IFACE, value: WORKFLOW_PICKER_DEFAULT, onChange: () => {}, workflows: state(parsed), ...props }));
const t1 = trig({});
check("trigger named by the field, value described", t1.includes('aria-label="Workflow"') && /aria-describedby="([^"]+-value)"[\s\S]*id="\1"/.test(t1));
check("trigger combobox", t1.includes('role="combobox"') && t1.includes('aria-haspopup="listbox"') && t1.includes('aria-expanded="false"'));
check("trigger shows default + detail", t1.includes(">Gateway default</span>") && t1.includes(">Basic agent @0.0.5</span>"));
check("trigger never a toggle", !/role="switch"|type="checkbox"|Show all/i.test(t1));
const t2 = trig({ value: "basic-agent@0.0.4:main" });
check("trigger shows chosen entry", t2.includes(">Basic agent</span>") && t2.includes(">@0.0.4</span>"));
const t3 = trig({ value: "old@0.0.1:main", currentLabel: { name: "Old agent", detail: "conversation version 0.0.1" } });
check("unlisted current value labelled, not listed", t3.includes(">Old agent</span>") && t3.includes("conversation version 0.0.1"));
const t4 = trig({ unavailableReason: "A run is in progress." });
check("unavailable: aria-disabled + reason", t4.includes('aria-disabled="true"') && t4.includes('title="A run is in progress."'));
const t5 = trig({ workflows: state(null, "error", "403: forbidden") });
check("error is said", t5.includes('role="alert"') && t5.includes("403: forbidden") && t5.includes('aria-disabled="true"'));
const t6 = trig({ workflows: state(empty), showDefault: false });
check("empty without default says the sentence", t6.includes(WORKFLOW_PICKER_EMPTY));
check("data-interface marks the app's interface", t1.includes(`data-interface="${IFACE}"`));

// 5. Keyboard navigation (pure).
check("down from none", workflowPickerNextIndex("ArrowDown", -1, 4) === 0);
check("down clamps", workflowPickerNextIndex("ArrowDown", 3, 4) === 3);
check("up from none", workflowPickerNextIndex("ArrowUp", -1, 4) === 3);
check("home/end", workflowPickerNextIndex("Home", 2, 4) === 0 && workflowPickerNextIndex("End", 0, 4) === 3);
check("other keys", workflowPickerNextIndex("a", 0, 4) === null);

// 6. No "Show all workflows" control anywhere in the kit sources.
const src = join(here, "..", "src");
for (const f of readdirSync(src).filter((n) => /\.(tsx?|css)$/.test(n))) {
  const body = readFileSync(join(src, f), "utf8");
  check(`no show-all control in ${f}`, !/show[ -]?all[ -]?workflows/i.test(body));
}

// 7. CSS block present (44 px on touch, helper-size detail).
const css = readFileSync(join(src, "theme.css"), "utf8");
const block = css.slice(css.indexOf("af-workflow-picker:begin"), css.indexOf("af-workflow-picker:end"));
check("css block", block.length > 100);
check("css 44px touch", /pointer: coarse[\s\S]*af-workflow-picker__option[\s\S]*min-height: var\(--tap-min/.test(block));
check("css detail helper size", /\.af-workflow-picker__detail \{[^}]*--af-helper-size/.test(block));

console.log(`check_workflow_picker: ${checks - failures}/${checks} passed`);
if (failures) process.exit(1);
