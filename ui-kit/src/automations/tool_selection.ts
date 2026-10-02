import type { JsonObject } from "./types.js";

/** null inherits workflow defaults; [] explicitly disables all tools. */
export function automationToolSelection(input: Record<string, unknown> | undefined): string[] | null {
  const runtime = input?._runtime as JsonObject | undefined;
  const ceiling = Array.isArray(runtime?.allowed_tools) ? runtime.allowed_tools : null;
  const tools = Array.isArray(input?.tools) ? input.tools : ceiling;
  return Array.isArray(tools) ? tools.filter((t): t is string => typeof t === "string" && (!ceiling || ceiling.includes(t))) : null;
}

export function withAutomationTools(input: JsonObject, tools: string[] | null): JsonObject {
  const next = { ...input };
  const runtime = input._runtime && typeof input._runtime === "object" ? { ...input._runtime as JsonObject } : {};
  if (tools === null) {
    delete next.tools;
    delete runtime.allowed_tools;
  } else {
    next.tools = [...tools];
    runtime.allowed_tools = [...tools];
  }
  if (Object.keys(runtime).length) next._runtime = runtime;
  else delete next._runtime;
  return next;
}

