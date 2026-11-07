// Reasoning effort and MTP follow the SELECTED model (operator rule 2026-11-07):
// - MTP is offered and sent only when the gateway's capability card for that model says it is
//   supported, at a depth the card lists. No card, an unsupported card or an unlisted depth sends
//   no depth. An explicit "Off" is always kept: it is never an MTP selection, and dropping it would
//   let a gateway default with MTP on run against the user's choice.
// - Changing the model or provider resets reasoning and MTP to the gateway default (nothing sent).
// - A saved reasoning level or MTP depth the current model cannot use is never sent.
// Served facts only: no model-name heuristics. Every app gets this by reusing the kit controls
// (ProviderModelPicker, SpeculationSelect) and, at send time, `resolveSendableModelOptions`.
import { normalizeSpeculationValue, speculationCapability, type SpeculationValue } from "./speculation_control.js";

export type ModelOptions = { reasoning?: string; speculation?: SpeculationValue };

/** What the gateway serves about a model's reasoning: its levels, and `thinking_support` (undefined = not said). */
export type ReasoningFacts = { levels: string[]; support?: boolean };

export function reasoningFacts(payload: unknown): ReasoningFacts {
  const root = payload && typeof payload === "object" ? (payload as Record<string, any>) : {};
  const caps = root.capabilities && typeof root.capabilities === "object" ? root.capabilities : root;
  const values = caps.reasoning_levels || caps.thinking_levels;
  const levels: string[] = Array.isArray(values)
    ? [...new Set(values.filter((v: unknown): v is string => typeof v === "string" && Boolean(v.trim())))]
    : [];
  if (!levels.length && caps.thinking_support === true && caps.thinking_control?.prompt_disable_token) levels.push("off", "auto");
  return { levels, support: typeof caps.thinking_support === "boolean" ? caps.thinking_support : undefined };
}

/** The MTP value the model can use, or undefined (= send nothing). */
export function usableSpeculation(value: unknown, payload: unknown): SpeculationValue | undefined {
  const normalized = normalizeSpeculationValue(value);
  if (normalized === undefined) return undefined;
  if (normalized === false) return false;
  const caps = speculationCapability(payload);
  if (!caps?.supported) return undefined;
  return caps.supported_depths.includes(normalized.num_draft_tokens) ? normalized : undefined;
}

/** The reasoning level the model can use, or "" (= send nothing). Unknown facts keep the level. */
export function usableReasoning(value: unknown, payload: unknown): string {
  const level = typeof value === "string" ? value.trim() : "";
  if (!level) return "";
  const facts = reasoningFacts(payload);
  if (facts.support === false) return "";
  if (facts.levels.length && !facts.levels.includes(level)) return "";
  return level;
}

/** Only the options the model's capability card allows; unset keys are omitted. */
export function sendableModelOptions(options: ModelOptions | null | undefined, payload: unknown): ModelOptions {
  const reasoning = usableReasoning(options?.reasoning, payload);
  const speculation = usableSpeculation(options?.speculation, payload);
  return { ...(reasoning ? { reasoning } : {}), ...(speculation !== undefined ? { speculation } : {}) };
}

/**
 * Send-time guard: reads the capability card of the model the request will use (the host's
 * `fetchCapabilities`, e.g. `() => transport.fetchModelCapabilities(model, provider)`) only when a
 * reasoning level or an MTP value is set, and returns what that model can use. A card that cannot
 * be read sends no MTP depth (an explicit Off is kept; reasoning is kept: unknown is not unsupported).
 */
export async function resolveSendableModelOptions(
  options: ModelOptions | null | undefined,
  fetchCapabilities?: () => Promise<unknown>,
): Promise<ModelOptions> {
  const reasoning = typeof options?.reasoning === "string" ? options.reasoning.trim() : "";
  const speculation = normalizeSpeculationValue(options?.speculation);
  if (!reasoning && speculation === undefined) return {};
  let payload: unknown;
  if (fetchCapabilities) {
    try {
      payload = await fetchCapabilities();
      if ((payload as any)?.error) payload = undefined;
    } catch {
      payload = undefined;
    }
  }
  return sendableModelOptions({ reasoning, speculation }, payload);
}

/**
 * The value with a held reasoning level or MTP depth that the served card rules out cleared back to
 * the gateway default (same object when nothing changes). Unknown facts keep the value; an explicit
 * MTP Off is kept; an MTP depth is cleared only on a served speculation card.
 */
export function clearUnusableModelOptions<T extends ModelOptions>(value: T, payload: unknown): T {
  let next = value;
  const reasoning = typeof value.reasoning === "string" ? value.reasoning.trim() : "";
  if (reasoning && !usableReasoning(reasoning, payload)) next = { ...next, reasoning: "" };
  const held = normalizeSpeculationValue(value.speculation);
  if (held && speculationCapability(payload) && usableSpeculation(held, payload) === undefined)
    next = { ...next, speculation: undefined };
  return next;
}

/** The reset every model/provider dropdown applies: reasoning and MTP back to the gateway default. */
export function resetModelOptions<T extends object>(value: T): T & { reasoning: ""; speculation: undefined } {
  return { ...value, reasoning: "", speculation: undefined };
}
