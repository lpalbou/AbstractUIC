#!/usr/bin/env node
/**
 * The shared model-mapping cases (`fixtures/automations/automation_model_cases.json`, canonical
 * here; every port, TS and Python, passes all of them): each `read` case through
 * `automationModelFrom`, each `write` case through `withAutomationModel` (its `output`, or the
 * `error` it throws). The input is never mutated.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { isDeepStrictEqual } from "node:util";

const here = dirname(fileURLToPath(import.meta.url));
const cases = JSON.parse(readFileSync(join(here, "fixtures", "automations", "automation_model_cases.json"), "utf8"));
const { automationModelFrom, withAutomationModel } = await import(join(here, "..", "dist", "index.js"));

let failures = 0;
let checks = 0;
function check(name, cond, detail) {
  checks += 1;
  if (cond) return;
  failures += 1;
  console.error(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`);
}
const clone = (v) => JSON.parse(JSON.stringify(v));

check("the file has read and write cases", Array.isArray(cases.read) && cases.read.length > 0 && Array.isArray(cases.write) && cases.write.length > 0);
check("every write case names an output or an error, never both", cases.write.every((c) => ("output" in c) !== ("error" in c)));
check("some write cases are errors (half a pair)", cases.write.some((c) => "error" in c));

for (const [i, c] of cases.read.entries()) {
  const input = clone(c.input);
  const got = automationModelFrom(input);
  check(`read #${i} ${JSON.stringify(c.input)}`, isDeepStrictEqual(got, c.value), `got ${JSON.stringify(got)}, want ${JSON.stringify(c.value)}`);
  check(`read #${i} leaves its input as it was`, isDeepStrictEqual(input, c.input));
}
for (const [i, c] of cases.write.entries()) {
  const input = clone(c.input);
  let got;
  let error = null;
  try {
    got = withAutomationModel(input, clone(c.value));
  } catch (e) {
    error = String(e instanceof Error ? e.message : e);
  }
  const name = `write #${i} ${JSON.stringify(c.input)} + ${JSON.stringify(c.value)}`;
  if ("error" in c) check(`${name} throws`, error === c.error, `got ${error === null ? JSON.stringify(got) : error}`);
  else check(name, error === null && isDeepStrictEqual(got, c.output), error ?? `got ${JSON.stringify(got)}, want ${JSON.stringify(c.output)}`);
  check(`${name} leaves its input as it was`, isDeepStrictEqual(input, c.input));
}

if (failures) {
  console.error(`check_automation_model_cases: ${failures} of ${checks} checks FAILED`);
  process.exit(1);
}
console.log(`check_automation_model_cases: OK (${checks} checks: ${cases.read.length} read and ${cases.write.length} write cases)`);
