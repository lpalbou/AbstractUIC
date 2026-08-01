#!/usr/bin/env node
// Node checks for the AfConductGauge framework-free core (slot (b) of the
// Cognitive Monitor pair). Runs after tsc build (imports the compiled dist
// output). Pins: the absent-not-zero rules per axis, the no-baseline
// downgrade, the v2.1 `short` compact-value channel (the entity operator's
// "EFF/RIG are NEVER shown" finding — motion/alignment encodings need a
// static numeric read), and the isVerifyShaped word-boundary vocabulary the
// ringed stroke tips share with the RIG number.
import assert from "node:assert/strict";
import { conductAxes, isVerifyShaped, runningMedian } from "../dist/cognition_conduct_core.js";

let n = 0;
const ok = (name) => {
  n++;
  console.log(`  ok ${n} — ${name}`);
};

const byId = (axes, id) => axes.find((a) => a.id === id);

// 1) no facts at all: every axis unreadable, reasons rendered, shorts "—"
{
  const axes = conductAxes(null, null, null);
  assert.equal(axes.length, 4);
  for (const a of axes) {
    assert.equal(a.value, null);
    assert.ok(a.reason, `${a.id} must carry a reason when unreadable`);
    assert.equal(a.short, "—");
  }
  ok("no facts: four null axes, reasons present, shorts dashed");
}

// 2) facts without baseline: value text + short survive, arc downgrades
{
  const axes = conductAxes({ think_ms: 4200, memories_recalled: 12, memories_formed: 2 }, null, null);
  const eff = byId(axes, "effort");
  assert.equal(eff.value, null, "no baseline → no filled arc (first-turns rule)");
  assert.equal(eff.text, "4.2s");
  assert.equal(eff.short, "4.2s");
  assert.match(eff.reason, /no session baseline/);
  const att = byId(axes, "attention");
  assert.equal(att.value, null);
  assert.equal(att.short, "12+2");
  ok("no baseline: text/short shown, arc downgraded with the reason");
}

// 3) with baseline: relative values in [0,1]; median-typical turn reads 0.5
{
  const axes = conductAxes(
    { think_ms: 4200, tool_rounds: 3, memories_recalled: 6 },
    [{ name: "web_search" }, { name: "read_file" }, { name: "remember" }],
    { think_ms: 4200, tool_rounds: 3, memories_recalled: 6 },
  );
  assert.equal(byId(axes, "effort").value, 0.5);
  assert.equal(byId(axes, "action").value, 0.5);
  assert.equal(byId(axes, "attention").value, 0.5);
  ok("baseline-relative: v/(2·median), median turn = 0.5");
}

// 4) honest zero vs absent fact: present-but-zero rounds are a ZERO arc
// ("0 rounds"); no tool fact at all is an ABSENT arc with the reason
{
  const zero = byId(conductAxes({ tool_rounds: 0 }, [], { tool_rounds: 2 }), "action");
  assert.equal(zero.value, 0);
  assert.equal(zero.text, "0 rounds");
  assert.equal(zero.short, "0");
  const absent = byId(conductAxes({}, [], null), "action");
  assert.equal(absent.value, null);
  assert.equal(absent.short, "—");
  assert.match(absent.reason, /no tool facts/);
  ok("honest zero renders 0; absent fact renders null with the reason");
}

// 5) ACT short carries the failure tick; RIG counts retries
{
  const tools = [
    { name: "web_search", ok: false },
    { name: "web_search", ok: true },
    { name: "write_file", ok: true },
  ];
  const axes = conductAxes({ tool_rounds: 3 }, tools, { tool_rounds: 3 });
  assert.equal(byId(axes, "action").short, "3·1✕");
  const rig = byId(axes, "rigor");
  assert.equal(rig.short, "2/3");
  assert.equal(rig.marks, 1, "retry-after-failure counted");
  ok("ACT short shows fails; RIG short is the verify share; retries marked");
}

// 6) isVerifyShaped: word-boundary vocabulary (the dm#56 web_search lesson)
{
  for (const name of ["web_search", "read_file", "diary_read", "get", "fetch_url", "check_state"]) {
    assert.ok(isVerifyShaped(name), `${name} must be verify-shaped`);
  }
  for (const name of ["remember", "write_file", "searchy", "getaway", ""]) {
    assert.ok(!isVerifyShaped(name), `${name} must NOT be verify-shaped`);
  }
  assert.ok(!isVerifyShaped(null) && !isVerifyShaped(undefined));
  ok("isVerifyShaped: word-boundary matches, write/act verbs never match");
}

// 7) zero calls: RIG abstains with the labeled reason (never a fake 1.0)
{
  const axes = conductAxes({ tool_rounds: 0 }, [], { tool_rounds: 1 });
  const rig = byId(axes, "rigor");
  assert.equal(rig.value, null);
  assert.match(rig.reason, /zero calls/);
  ok("RIG abstains on zero calls");
}

// 8) runningMedian: window + finite filtering
{
  assert.equal(runningMedian([]), undefined);
  assert.equal(runningMedian([undefined, null, 5]), 5);
  assert.equal(runningMedian([1, 2, 100], 2), 100, "window keeps the LAST values");
  ok("runningMedian: empty → undefined; window respected");
}

console.log(`check_conduct_core: ${n} groups green`);
