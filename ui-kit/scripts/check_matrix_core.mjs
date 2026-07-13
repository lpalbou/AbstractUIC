#!/usr/bin/env node
/**
 * Dependency-free tests for the framework-free config-object cores:
 *   - phase_capability_matrix_core (validation, cell views, patch bookkeeping)
 *   - critical_action_core (confirm-gate decision)
 *
 * Runs against the COMPILED dist output (the artifact React apps and the
 * served gateway console actually consume), so `npm test` builds first.
 * These are examples/guidelines for the general-purpose logic — the cores
 * must hold for any server payload, not just these fixtures.
 */

import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const matrix_path = join(here, "..", "dist", "phase_capability_matrix_core.js");
const critical_path = join(here, "..", "dist", "critical_action_core.js");

const {
  MATRIX_SCHEMA_VERSION,
  validateMatrixPayload,
  resolveCellView,
  applyCellAction,
  reconcilePatches,
  serializeCellPatches,
} = await import(matrix_path);
const { resolveCriticalActionGate, normalizeCriticalActionFacts } = await import(critical_path);

let failures = 0;
function check(name, cond, detail) {
  if (cond) return;
  failures += 1;
  console.error(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`);
}

function cell(over = {}) {
  return {
    assigned: false,
    resolved_value: true,
    provenance: "default",
    availability: "granted",
    ...over,
  };
}

function payload_fixture() {
  return {
    schema_version: 1,
    phases: [
      { id: "visit", label: "Visit" },
      { id: "own_time", label: "Own time", hint: "brake = enabled + grant" },
      { id: "sleep", label: "Sleep" },
    ],
    sections: [
      {
        id: "tools",
        label: "Tools",
        items: [
          {
            id: "web_search",
            cells: {
              visit: cell(),
              own_time: cell(),
              sleep: cell(),
            },
          },
          {
            id: "write_file",
            cells: {
              visit: cell(),
              own_time: cell(),
              sleep: cell({
                resolved_value: false,
                availability: "structurally_unavailable",
                provenance: "structural",
                reason: "a sleeping mind does not change the environment",
              }),
            },
          },
        ],
      },
      {
        id: "skills",
        label: "Skills",
        items: [
          {
            id: "coredoc",
            cells: {
              visit: cell({
                resolved_value: false,
                availability: "trust_gated",
                trust_state: "requires_review",
                reason: "unverified skill: scripts present",
              }),
              own_time: cell({
                resolved_value: false,
                availability: "trust_gated",
                trust_state: "blocked",
                reason: "do-not-use advisory matched",
              }),
              // sleep deliberately ABSENT: server said nothing.
            },
          },
        ],
      },
    ],
  };
}

// ---------------------------------------------------------------- validation
{
  const ok = validateMatrixPayload(payload_fixture());
  check("v1 payload validates", ok.ok === true, ok.ok ? "" : ok.reason);

  const v2 = validateMatrixPayload({ ...payload_fixture(), schema_version: 2 });
  check("unknown major refuses", v2.ok === false);
  check("refusal names both versions", !v2.ok && v2.reason.includes("2") && v2.reason.includes(String(MATRIX_SCHEMA_VERSION)));

  check("non-object refuses", validateMatrixPayload(null).ok === false);
  check("missing phases refuses", validateMatrixPayload({ schema_version: 1, phases: [], sections: [] }).ok === false);

  const extra = payload_fixture();
  extra.future_field = { anything: true };
  extra.phases[0].future_hint = "x";
  extra.sections[0].items[0].cells.visit.future_cell_field = 1;
  check("additive extra fields tolerated", validateMatrixPayload(extra).ok === true);

  const bad_phase = payload_fixture();
  bad_phase.sections[0].items[0].cells.dream = cell();
  const bp = validateMatrixPayload(bad_phase);
  check("cell for undeclared phase refuses", bp.ok === false);
  check("undeclared-phase refusal names it", !bp.ok && bp.reason.includes("dream"));

  const bad_avail = payload_fixture();
  bad_avail.sections[0].items[0].cells.visit.availability = "maybe";
  check("unknown availability refuses", validateMatrixPayload(bad_avail).ok === false);

  const bad_trust = payload_fixture();
  bad_trust.sections[1].items[0].cells.visit.trust_state = "vibes";
  check("trust_gated without valid trust_state refuses", validateMatrixPayload(bad_trust).ok === false);

  const dup = payload_fixture();
  dup.phases.push({ id: "visit" });
  check("duplicate phase id refuses", validateMatrixPayload(dup).ok === false);

  // adversary finds 2026-07-11:
  const proto = payload_fixture();
  proto.phases.push({ id: "__proto__" });
  check("reserved phase id refuses", validateMatrixPayload(proto).ok === false);

  const null_cells = payload_fixture();
  null_cells.sections[0].items[0].cells = null;
  check("cells present-but-null refuses", validateMatrixPayload(null_cells).ok === false);

  const no_cells = payload_fixture();
  delete no_cells.sections[0].items[0].cells;
  check("cells omitted validates (all-absent row)", validateMatrixPayload(no_cells).ok === true);

  const float_v = validateMatrixPayload({ ...payload_fixture(), schema_version: 1.5 });
  check("float 1.5 accepted as major 1 (floor gate, intended)", float_v.ok === true);
}

// ---------------------------------------------------------------- cell views
{
  const v = validateMatrixPayload(payload_fixture());
  const payload = v.payload;

  const granted = resolveCellView(payload, [], "tools", "web_search", "visit");
  check("granted cell interactive", granted.interactive === true);
  check("granted effective on", granted.effective_value === true);

  const structural = resolveCellView(payload, [], "tools", "write_file", "sleep");
  check("structural cell not interactive", structural.interactive === false);
  check("structural effective off", structural.effective_value === false);
  check("structural reason verbatim", structural.reason === "a sleeping mind does not change the environment");

  const review = resolveCellView(payload, [], "skills", "coredoc", "visit");
  check("requires_review interactive", review.interactive === true);
  check("requires_review flagged as approval act", review.approval_required === true);

  const blocked = resolveCellView(payload, [], "skills", "coredoc", "own_time");
  check("trust blocked not interactive", blocked.interactive === false);

  const absent = resolveCellView(payload, [], "skills", "coredoc", "sleep");
  check("server-absent cell not interactive", absent.interactive === false && absent.cell === null);

  const pending = resolveCellView(payload, [{ section: "tools", item: "web_search", phase: "visit", op: "deny" }], "tools", "web_search", "visit");
  check("pending deny wins over server value", pending.effective_value === false && pending.pending === "deny");

  // The control descriptor is the ONE rendering decision (adversary P1:
  // bare booleans let a consumer build a plain toggle over requires_review).
  check("granted cell control is tristate", granted.control.kind === "tristate");
  check("tristate default active_op is clear (unassigned)", granted.control.active_op === "clear");
  check("structural control is blocked/structural", structural.control.kind === "blocked" && structural.control.blocked_kind === "structural");
  check("requires_review control is approval", review.control.kind === "approval");
  check("trust-blocked control is blocked/trust", blocked.control.kind === "blocked" && blocked.control.blocked_kind === "trust");
  check("absent control is absent", absent.control.kind === "absent");
  const approved = resolveCellView(payload, [{ section: "skills", item: "coredoc", phase: "visit", op: "grant" }], "skills", "coredoc", "visit");
  check("approved review cell becomes tristate (revertable)", approved.control.kind === "tristate" && approved.effective_value === true);
}

// ------------------------------------------- clear display honesty (P1 fix)
// A pending clear on an OPERATOR-resolved cell reverts to a server default
// the client cannot know — the view must say indeterminate (null), never a
// guessed off that could hide a grant.
{
  const p = payload_fixture();
  p.sections[0].items[0].cells.visit = cell({ assigned: true, resolved_value: false, provenance: "operator" });
  const v = validateMatrixPayload(p);
  const clear_patch = [{ section: "tools", item: "web_search", phase: "visit", op: "clear" }];
  const view = resolveCellView(v.payload, clear_patch, "tools", "web_search", "visit");
  check("clear on operator-resolved cell is indeterminate", view.effective_value === null);

  // Structural resolution wins regardless of the operator word, so clearing
  // is KNOWABLE — but structurally blocked cells are not interactive anyway;
  // model the knowable case with provenance=default:
  const view_default = resolveCellView(v.payload, [{ section: "tools", item: "web_search", phase: "own_time", op: "clear" }], "tools", "web_search", "own_time");
  check("clear on default-resolved cell shows the known default", view_default.effective_value === true);
}

// -------------------------------------------- grantable vs executable axes
// (observer c702: sleep tools hold a REAL grant with no executor yet —
//  "standing config" must stay editable, never conflated with structural.)
{
  const p = payload_fixture();
  p.sections[0].items[0].cells.sleep = cell({ executable: false, reason: "standing config — takes effect when the sleep pass gains tool use" });
  const v = validateMatrixPayload(p);
  check("executable:false validates", v.ok === true, v.ok ? "" : v.reason);
  const standing = resolveCellView(v.payload, [], "tools", "web_search", "sleep");
  check("standing config stays interactive", standing.interactive === true);
  check("standing config flagged", standing.standing_config === true);
  const patched = applyCellAction(v.payload, [], { section: "tools", item: "web_search", phase: "sleep", op: "deny" });
  check("standing config accepts edits", patched.length === 1);
  const normal = resolveCellView(v.payload, [], "tools", "web_search", "visit");
  check("absent executable defaults true (no standing flag)", normal.standing_config === false);
  const structural = resolveCellView(v.payload, [], "tools", "write_file", "sleep");
  check("structural never reports standing", structural.standing_config === false);
}

// ---------------------------------------------------------- patch bookkeeping
{
  const v = validateMatrixPayload(payload_fixture());
  const payload = v.payload;

  // deny on a default-granted cell is a real act
  let patches = applyCellAction(payload, [], { section: "tools", item: "web_search", phase: "visit", op: "deny" });
  check("deny queues one patch", patches.length === 1);

  // replace-per-cell: a second op on the same cell replaces, never appends
  patches = applyCellAction(payload, patches, { section: "tools", item: "web_search", phase: "visit", op: "grant" });
  check("second op replaces", patches.length === 1 && patches[0].op === "grant");

  // clear on an UNASSIGNED cell = nothing to send (server has no word either)
  patches = applyCellAction(payload, patches, { section: "tools", item: "web_search", phase: "visit", op: "clear" });
  check("clear on unassigned removes pending", patches.length === 0);

  // grant matching a server DEFAULT is a real act (stores the operator's word)
  patches = applyCellAction(payload, [], { section: "tools", item: "web_search", phase: "visit", op: "grant" });
  check("grant over default is a real act", patches.length === 1);

  // acts on non-interactive cells refuse (list unchanged)
  const before = [...patches];
  patches = applyCellAction(payload, patches, { section: "tools", item: "write_file", phase: "sleep", op: "grant" });
  check("act on structural cell refused", patches.length === before.length);
  patches = applyCellAction(payload, patches, { section: "skills", item: "coredoc", phase: "own_time", op: "grant" });
  check("act on blocked cell refused", patches.length === before.length);
  patches = applyCellAction(payload, patches, { section: "skills", item: "coredoc", phase: "sleep", op: "grant" });
  check("act on absent cell refused", patches.length === before.length);

  // assigned-cell no-op collapse: restating the server's stored word drops
  // the patch — ONLY when the operator's word IS the resolution source.
  const assigned = payload_fixture();
  assigned.sections[0].items[0].cells.visit.assigned = true; // stored grant
  assigned.sections[0].items[0].cells.visit.provenance = "operator";
  const va = validateMatrixPayload(assigned);
  let p2 = applyCellAction(va.payload, [{ section: "tools", item: "web_search", phase: "visit", op: "deny" }], { section: "tools", item: "web_search", phase: "visit", op: "grant" });
  check("restating stored operator word drops pending", p2.length === 0);
  // ...but clear on an assigned cell IS a real act
  p2 = applyCellAction(va.payload, [], { section: "tools", item: "web_search", phase: "visit", op: "clear" });
  check("clear on assigned cell queues", p2.length === 1 && p2[0].op === "clear");

  // adversary P2: assigned cell resolved STRUCTURALLY — resolved_value is the
  // structure's value, not the stored word, so restating still queues.
  const struct_assigned = payload_fixture();
  struct_assigned.sections[0].items[0].cells.visit = cell({ assigned: true, resolved_value: false, provenance: "structural" });
  const vsa = validateMatrixPayload(struct_assigned);
  const p3 = applyCellAction(vsa.payload, [], { section: "tools", item: "web_search", phase: "visit", op: "deny" });
  check("deny on structurally-resolved assigned cell queues", p3.length === 1);

  // wire shape (serialize now takes the payload to filter orphans/dupes)
  const vw = validateMatrixPayload(payload_fixture());
  const doc = serializeCellPatches(vw.payload, [{ section: "tools", item: "web_search", phase: "visit", op: "deny", junk: true }]);
  check("wire doc carries schema_version", doc.schema_version === MATRIX_SCHEMA_VERSION);
  check("wire entries are cell-scoped only", JSON.stringify(Object.keys(doc.patches[0]).sort()) === JSON.stringify(["item", "op", "phase", "section"]));
}

// --------------------------------------- stale patches after payload refresh
// (adversary P1: an orphaned patch was invisible in the grid yet counted as
//  an unsaved change and transmitted on save.)
{
  const v = validateMatrixPayload(payload_fixture());
  const payload = v.payload;
  const stale = [
    { section: "tools", item: "uninstalled_tool", phase: "visit", op: "deny" }, // item gone
    { section: "tools", item: "write_file", phase: "sleep", op: "grant" },      // structural now
    { section: "skills", item: "coredoc", phase: "own_time", op: "grant" },     // trust-blocked
    { section: "tools", item: "web_search", phase: "visit", op: "deny" },       // live
    { section: "tools", item: "web_search", phase: "visit", op: "grant" },      // duplicate (first wins)
  ];
  const reconciled = reconcilePatches(payload, stale);
  check("reconcile drops orphans + non-interactive", reconciled.length === 1);
  check("reconcile keeps the live patch (first wins on dupes)", reconciled[0].item === "web_search" && reconciled[0].op === "deny");
  const doc = serializeCellPatches(payload, stale);
  check("serialize filters orphans/dupes from the wire", doc.patches.length === 1 && doc.patches[0].op === "deny");
}

// ----------------------------------------------------------- critical action
{
  const facts = { facts: [{ label: "Stored vectors", value: "1,204" }], consequence: "Changing the embedding model invalidates every stored embedding." };

  let gate = resolveCriticalActionGate({ facts, allowDegradedProceed: false, confirmPhrase: null, typedText: "", busy: false });
  check("facts present enables confirm", gate.confirmEnabled === true && gate.degraded === false);

  gate = resolveCriticalActionGate({ facts: null, allowDegradedProceed: false, confirmPhrase: null, typedText: "", busy: false });
  check("missing facts disables confirm", gate.confirmEnabled === false);
  check("missing-facts reason labeled #FALLBACK", (gate.disabledReason || "").includes("#FALLBACK"));

  gate = resolveCriticalActionGate({ facts: null, allowDegradedProceed: true, confirmPhrase: null, typedText: "", busy: false });
  check("degraded opt-in enables labeled confirm", gate.confirmEnabled === true && gate.degraded === true && (gate.degradedLabel || "").includes("#FALLBACK"));

  gate = resolveCriticalActionGate({ facts, allowDegradedProceed: false, confirmPhrase: "reembed castor", typedText: "reembed", busy: false });
  check("typed phrase mismatch disables", gate.confirmEnabled === false);
  gate = resolveCriticalActionGate({ facts, allowDegradedProceed: false, confirmPhrase: "reembed castor", typedText: "  reembed castor  ", busy: false });
  check("typed phrase match (trimmed) enables", gate.confirmEnabled === true);

  gate = resolveCriticalActionGate({ facts, allowDegradedProceed: false, confirmPhrase: null, typedText: "", busy: true });
  check("busy disables", gate.confirmEnabled === false);

  // consequence-less facts are NOT real facts (vibes without the sentence)
  gate = resolveCriticalActionGate({ facts: { facts: [], consequence: "  " }, allowDegradedProceed: false, confirmPhrase: null, typedText: "", busy: false });
  check("blank consequence counts as missing facts", gate.confirmEnabled === false);

  // adversary P1: server facts without a rows array crashed the render.
  // Normalization is the render truth: consequence is the floor; rows
  // normalize to a safe array; malformed rows are dropped.
  const no_rows = normalizeCriticalActionFacts({ consequence: "Invalidates every stored embedding." });
  check("facts without rows array normalize (rows=[])", no_rows !== null && Array.isArray(no_rows.facts) && no_rows.facts.length === 0);
  const dirty = normalizeCriticalActionFacts({ consequence: "x", facts: [null, "junk", { label: "Vectors", value: 1204 }, {}] });
  check("malformed rows dropped, values stringified", dirty !== null && dirty.facts.length === 1 && dirty.facts[0].value === "1204");
  check("null normalizes null", normalizeCriticalActionFacts(null) === null);
  check("blank consequence normalizes null", normalizeCriticalActionFacts({ consequence: " ", facts: [] }) === null);
  gate = resolveCriticalActionGate({ facts: { consequence: "Invalidates every stored embedding." }, allowDegradedProceed: false, confirmPhrase: null, typedText: "", busy: false });
  check("consequence-only facts enable confirm (gate matches render)", gate.confirmEnabled === true && gate.degraded === false);
}

if (failures > 0) {
  console.error(`\nmatrix/critical core: ${failures} failure(s)`);
  process.exit(1);
}
console.log("matrix/critical core: OK (validation, cell views, patch bookkeeping, confirm gate)");
