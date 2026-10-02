import type { AutomationTarget, JsonObject } from "./types.js";

/** Retain portable agent settings; a different workflow owns its own input defaults. */
export function retargetAutomationInput(input: JsonObject): JsonObject {
  const keys = ["prompt", "tools", "provider", "model", "temperature", "seed", "max_iterations", "max_in_tokens", "system", "_limits"];
  const out: JsonObject = {};
  for (const key of keys) if (key in input) out[key] = input[key];
  const runtime = input._runtime as JsonObject | undefined;
  if (runtime && typeof runtime === "object") {
    const next: JsonObject = {};
    for (const key of ["allowed_tools", "provider", "model", "thinking", "speculation", "stream"]) if (key in runtime) next[key] = runtime[key];
    if (Object.keys(next).length) out._runtime = next;
  }
  return out;
}

export function automationTargetValue(target: AutomationTarget): string {
  return target.flow_id === "@default" ? "@default" : `${"bundle_ref" in target ? target.bundle_ref : ""}:${target.flow_id}`;
}
