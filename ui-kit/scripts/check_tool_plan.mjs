#!/usr/bin/env node
/**
 * tool_plan.ts (ui-primitives tools-models, backlog 0033): the pure tool-selection helper.
 *
 * The five rules, each with assertions that go red when the rule is removed:
 *   R1 a layer never offers a tool the gateway did not offer;
 *   R2 layers are sparse, so a newly served tool follows the gateway default;
 *   R3 a diff equal to the inherited mode is deleted;
 *   R4 `tool_policy` is always sent once any layer holds a choice;
 *   R5 with no choice in any layer, `tool_policy` is omitted (and a stale key removed).
 * Plus the edges: the served `approval_default` (not `default_approval`) decides the gateway
 * default, `available` is honoured if served, "approve" needs its dialect, the bulk-Auto cap,
 * the ceiling, `refined`, and the watch's Approve-all trust rule.
 * Run after `npm run build`.
 */
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const kit = await import(join(here, "..", "dist", "index.js"));
let failures = 0;
let checks = 0;
function check(name, cond, detail) {
  checks += 1;
  if (cond) return;
  failures += 1;
  console.error(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`);
}
const j = (v) => JSON.stringify(v);

const {
  normalizeToolMode, toolModeInDialect, normalizeToolCatalog, resolveToolModes, inheritedToolModes, setToolMode,
  setGroupToolMode, BULK_AUTO_MAX_RANK, bulkAutoReaches, hasToolChoices, planRunTools, withRunTools,
  toWorkflowApprovalPolicy, trustAfterApproveAll, approvalCovered, toolPolicySelectionToLayer,
} = kit;

// ---------------------------------------------------------------- vocabulary edges
check("canonical modes pass", ["off", "ask", "auto"].every((m) => normalizeToolMode(m) === m));
check("approve is ask in the entity dialect", normalizeToolMode("approve", "entity") === "ask");
check("approve is auto in the desktop dialect", normalizeToolMode("approve", "desktop") === "auto");
check("bare approve is refused, never guessed", normalizeToolMode("approve") === undefined);
check("desktop disabled is off", normalizeToolMode("disabled", "desktop") === "off" && normalizeToolMode("disabled") === undefined);
check("junk is refused", normalizeToolMode("yes") === undefined && normalizeToolMode(3) === undefined);
check("entity wire writes ask as approve", toolModeInDialect("ask", "entity") === "approve" && toolModeInDialect("auto", "entity") === "auto");
check("desktop wire writes auto as approve", toolModeInDialect("auto", "desktop") === "approve" && toolModeInDialect("off", "desktop") === "disabled");

// ---------------------------------------------------------------- catalog (the served shape)
// Rows as GET discovery/tools serves them (routes/gateway.py:15568-15668).
const served = {
  tool_mode: "approval",
  command_sandbox: { state: "sandboxed", sentence: "Every command a run starts is confined." },
  items: [
    { name: "read_file", toolset: "files", enabled: true, approval_default: "auto", risk_tier: "observe", risk_rank: 1 },
    { name: "write_file", toolset: "files", enabled: true, approval_default: "ask", risk_tier: "act", risk_rank: 2 },
    // The served field wins over the v1 alias.
    { name: "list_files", toolset: "files", enabled: true, approval_default: "auto", default_approval: "ask", risk_tier: "observe", risk_rank: 1 },
    { name: "fetch_url", toolset: "web", enabled: true, approval_default: "auto", risk_tier: "act", risk_rank: 2, model_controlled_destination: true },
    { name: "send_email", toolset: "comms.email", enabled: true, approval_default: "ask", risk_tier: "outreach", risk_rank: 3, risk_refiner: "self_send@v1" },
    { name: "execute_command", toolset: "shell", enabled: true, approval_default: "ask", risk_tier: "destroy", risk_rank: 4, sandbox: "Sandboxed to this run's workspaces", sandboxed: true },
    // Disabled rows are served clamped to ask (tool_catalog.py:349-355).
    { name: "send_telegram_message", toolset: "comms.telegram", enabled: false, approval_default: "ask", why_disabled: "Set TELEGRAM_BOT_TOKEN." },
    // `available` is not served today; if it is, it is honoured.
    { name: "camera_capture_photo", toolset: "camera", enabled: true, available: false, approval_default: "ask", risk_rank: 2 },
    { name: "web_search", toolset: "", approval_default: "auto", risk_rank: 1 },
    { name: "web_search", toolset: "dupe" },
    { name: "  " },
    // Only the v1 alias: read as a fallback in its own dialect.
    { name: "legacy_tool", toolset: "legacy", default_approval: "approve", risk_rank: 1 },
  ],
};
const cat = normalizeToolCatalog(served);
const by = Object.fromEntries(cat.map((t) => [t.name, t]));
check("throws on a missing items[]", (() => { try { normalizeToolCatalog({ error: "boom" }); return false; } catch (e) { return /no items: boom/.test(e.message); } })());
check("throws on a non-object", (() => { try { normalizeToolCatalog(null); return false; } catch { return true; } })());
check("deduped, blank names dropped", cat.length === 10, j(cat.map((t) => t.name)));
check("approval_default auto → gateway default auto", by.read_file.gatewayDefault === "auto");
check("approval_default ask → ask", by.write_file.gatewayDefault === "ask");
check("served approval_default wins over default_approval", by.list_files.gatewayDefault === "auto");
check("v1 alias read only when the served field is absent", by.legacy_tool.gatewayDefault === "auto");
check("disabled → not offered, off, its reason kept", !by.send_telegram_message.offered && by.send_telegram_message.gatewayDefault === "off" && by.send_telegram_message.whyDisabled === "Set TELEGRAM_BOT_TOKEN.");
check("available:false → not offered", !by.camera_capture_photo.offered && by.camera_capture_photo.gatewayDefault === "off");
check("blank toolset → other", by.web_search.toolset === "other");
check("risk + destination + refiner facts", by.fetch_url.modelControlledDestination === true && by.send_email.refined === true && by.send_email.riskTier === "outreach" && by.read_file.riskRank === 1);
check("sandbox badge from the served words", by.execute_command.state?.label === "Sandboxed to this run's workspaces" && by.execute_command.state?.tooltip === "Every command a run starts is confined." && by.execute_command.state?.tone === "ok");
check("no badge without served sandbox fields", by.read_file.state === undefined);

// ---------------------------------------------------------------- R1: never offers what the gateway did not offer
{
  const layers = { app: { send_telegram_message: "auto", camera_capture_photo: "ask" }, session: { send_telegram_message: "auto" } };
  const r = resolveToolModes(cat, layers);
  check("R1 resolve: not offered stays off under any layer", r.send_telegram_message.mode === "off" && r.camera_capture_photo.mode === "off", j(r.send_telegram_message));
  const plan = planRunTools(cat, layers);
  check("R1 plan: not offered never sent", !plan.tools.includes("send_telegram_message") && !plan.tools.includes("camera_capture_photo") && !plan.tool_policy.auto_approve_tools.includes("send_telegram_message"), j(plan));
  const written = setToolMode({}, by.send_telegram_message, "auto", "off");
  check("R1 setToolMode never writes a not-offered tool", !("send_telegram_message" in written), j(written));
}

// ---------------------------------------------------------------- R2: sparse layers follow the gateway
{
  // The person changed one tool; the gateway later serves a new tool with its own default.
  const app = setToolMode({}, by.write_file, "auto", "ask");
  check("R2 a layer holds only the diff", j(app) === j({ write_file: "auto" }), j(app));
  const grown = normalizeToolCatalog({ items: [...served.items, { name: "new_tool", toolset: "files", enabled: true, approval_default: "auto", risk_rank: 1 }] });
  const r = resolveToolModes(grown, { app });
  check("R2 a newly served tool follows the gateway default", r.new_tool.mode === "auto" && r.new_tool.source === "gateway", j(r.new_tool));
  const plan = planRunTools(grown, { app });
  check("R2 and is sent with it", plan.tools.includes("new_tool") && plan.tool_policy.auto_approve_tools.includes("new_tool"), j(plan.tools));
  // Layering order: session over app over gateway.
  const both = resolveToolModes(cat, { app: { read_file: "ask" }, session: { read_file: "off" } });
  check("session over app over gateway, with inherited", both.read_file.mode === "off" && both.read_file.source === "session" && both.read_file.inherited === "ask", j(both.read_file));
  const inh = inheritedToolModes(cat, { app: { read_file: "ask" }, session: { read_file: "off" } }, "session");
  check("the session editor inherits the app's resolved modes", inh.read_file === "ask" && inh.write_file === "ask" && inh.send_telegram_message === "off", j(inh));
  check("the app editor inherits the gateway's", inheritedToolModes(cat, { app: { read_file: "ask" } }, "app").read_file === "auto");
}

// ---------------------------------------------------------------- R3: a diff equal to the inherited is deleted
{
  let s = setToolMode({}, by.read_file, "off", "auto");
  check("R3 a different mode is stored", s.read_file === "off");
  s = setToolMode(s, by.read_file, "auto", "auto");
  check("R3 back to the inherited mode deletes the diff", !("read_file" in s) && Object.keys(s).length === 0, j(s));
  const g = setGroupToolMode({ read_file: "off" }, [by.read_file, by.list_files], "auto", { read_file: "auto", list_files: "auto" });
  check("R3 group writes stay sparse", j(g.layer) === "{}", j(g.layer));
  // Unknown names (a tool not yet loaded) are carried through, never pruned by an unrelated write.
  const kept = setToolMode({ not_loaded_yet: "off" }, by.write_file, "auto", "ask");
  check("unrelated diffs are kept", kept.not_loaded_yet === "off" && kept.write_file === "auto");
}

// ---------------------------------------------------------------- R4 / R5: tool_policy presence
{
  const none = planRunTools(cat, {});
  check("R5 no layers → tool_policy omitted", !("tool_policy" in none), j(none));
  check("R5 empty layers are no layers", !("tool_policy" in planRunTools(cat, { app: {}, session: null })) && !hasToolChoices({ app: {}, session: {} }));
  check("R5 tools still sent without choices", j(none.tools) === j(["execute_command", "fetch_url", "legacy_tool", "list_files", "read_file", "send_email", "web_search", "write_file"]), j(none.tools));
  const stale = withRunTools({ prompt: "hi", _runtime: { tool_policy: { auto_approve_tools: ["x"] }, stream: true } }, none);
  check("R5 withRunTools removes a stale tool_policy key (its presence suppresses the grant)", !("tool_policy" in stale._runtime) && stale._runtime.stream === true && stale.prompt === "hi", j(stale));
  const one = planRunTools(cat, { session: { read_file: "ask" } });
  check("R4 one choice → tool_policy sent", Boolean(one.tool_policy), j(one));
  check("R4 it carries every enabled tool, split", j(one.tool_policy.auto_approve_tools) === j(["fetch_url", "legacy_tool", "list_files", "web_search"]) && j(one.tool_policy.require_approval_tools) === j(["execute_command", "read_file", "write_file"]), j(one.tool_policy));
  // A choice that makes the plan equal to the gateway defaults still sends the policy (explicit act).
  const reset = planRunTools(cat, { app: { read_file: "off" }, session: { read_file: "auto" } });
  check("R4 an explicit choice equal to the defaults is still sent", Boolean(reset.tool_policy));
  const input = withRunTools({ _runtime: { thinking: "low" } }, one);
  check("R4 withRunTools writes tools + _runtime.{allowed_tools, tool_policy}", j(input.tools) === j(one.tools) && j(input._runtime.allowed_tools) === j(one.tools) && j(input._runtime.tool_policy) === j(one.tool_policy) && input._runtime.thinking === "low", j(input));
  const src = { _runtime: { a: 1 } };
  withRunTools(src, one);
  check("withRunTools never mutates its input", j(src) === j({ _runtime: { a: 1 } }));
}

// ---------------------------------------------------------------- plan details
{
  const plan = planRunTools(cat, { app: { send_email: "ask" } });
  check("refined stays offered but out of the always-ask list", plan.tools.includes("send_email") && !plan.tool_policy.require_approval_tools.includes("send_email"), j(plan.tool_policy));
  const off = planRunTools(cat, { app: { write_file: "off" } });
  check("off is never sent", !off.tools.includes("write_file") && !off.tool_policy.require_approval_tools.includes("write_file"));
  const ceiling = planRunTools(cat, { app: { write_file: "auto" } }, { ceiling: ["read_file", "write_file", "send_telegram_message"] });
  check("the workflow ceiling is a ceiling (never widens)", j(ceiling.tools) === j(["read_file", "write_file"]), j(ceiling.tools));
  check("allowed_tools mirrors tools", j(plan.allowed_tools) === j(plan.tools));
  const policy = toWorkflowApprovalPolicy(planRunTools(cat, { app: { write_file: "auto" } }));
  check("panel-chat approval policy shape", j(Object.keys(policy).sort()) === j(["autoApproveTools", "enabledTools"]) && policy.autoApproveTools.includes("write_file") && policy.enabledTools.includes("execute_command") && !policy.autoApproveTools.includes("execute_command"), j(policy));
  check("approval split present without a tool_policy", j(planRunTools(cat, {}).approval.auto) === j(["fetch_url", "legacy_tool", "list_files", "read_file", "web_search"]));
}

// ---------------------------------------------------------------- bulk Auto cap
check("cap is rank 2", BULK_AUTO_MAX_RANK === 2);
check("bulk Auto reaches rank ≤ 2", bulkAutoReaches(by.read_file) && bulkAutoReaches(by.write_file));
check("bulk Auto skips rank > 2", !bulkAutoReaches(by.send_email) && !bulkAutoReaches(by.execute_command));
check("bulk Auto skips a model-chosen destination", !bulkAutoReaches(by.fetch_url));
check("bulk Auto skips not offered", !bulkAutoReaches(by.camera_capture_photo));
check("unknown rank counts as 4", !bulkAutoReaches({ ...by.read_file, riskRank: undefined }));
{
  const g = setGroupToolMode({}, cat, "auto", Object.fromEntries(cat.map((t) => [t.name, t.gatewayDefault])));
  check("group Auto writes only reachable tools", j(g.layer) === j({ write_file: "auto" }), j(g.layer));
  check("group Auto reports what it left", j(g.skipped.sort()) === j(["execute_command", "fetch_url", "send_email"]), j(g.skipped));
  const o = setGroupToolMode({}, cat, "off", Object.fromEntries(cat.map((t) => [t.name, t.gatewayDefault])));
  check("group Off reaches every offered tool", Object.keys(o.layer).length === 8 && !("send_telegram_message" in o.layer), j(o.layer));
}

// ---------------------------------------------------------------- Approve all (watch rule)
{
  const modes = resolveToolModes(cat, { app: { read_file: "ask", list_files: "ask", fetch_url: "ask" } });
  const t1 = trustAfterApproveAll(cat, modes, ["read_file"], []);
  check("trust: rank ≤ 2 on Ask, never a model-chosen destination", j(t1) === j(["list_files", "read_file", "write_file"]), j(t1));
  const t2 = trustAfterApproveAll(cat, modes, ["execute_command"], ["x_prev"]);
  check("trust: up to the call's own rank, prev kept, never outreach", j(t2) === j(["execute_command", "list_files", "read_file", "write_file", "x_prev"]), j(t2));
  const t3 = trustAfterApproveAll(cat, modes, ["send_email"], []);
  check("trust: an outreach call is never trusted", !t3.includes("send_email"), j(t3));
  const t4 = trustAfterApproveAll(cat, { ...modes, write_file: "off" }, ["write_file"], []);
  check("trust: an off tool is never trusted", !t4.includes("write_file"), j(t4));
  check("covered: auto or trusted ask", approvalCovered(modes, ["read_file"], ["read_file", "web_search"]));
  check("not covered: an untrusted ask", !approvalCovered(modes, ["read_file"], ["write_file"]));
  check("not covered: an empty call", !approvalCovered(modes, ["read_file"], []));
}

// ---------------------------------------------------------------- v1 adapter
{
  const layer = toolPolicySelectionToLayer({ mode: "custom", selected: ["read_file", "write_file"], approval: { write_file: "approve", read_file: "approve" } }, cat);
  check("v1 adapter: unselected → off, approve → auto, equal-to-default dropped", layer.write_file === "auto" && layer.list_files === "off" && !("read_file" in layer) && !("send_telegram_message" in layer), j(layer));
  check("v1 adapter: mode all with no pins is no layer", j(toolPolicySelectionToLayer({ mode: "all", selected: [], approval: {} }, cat)) === "{}");
}

if (failures) {
  console.error(`check_tool_plan: ${failures}/${checks} FAILED`);
  process.exit(1);
}
console.log(`check_tool_plan: OK (${checks} checks)`);
