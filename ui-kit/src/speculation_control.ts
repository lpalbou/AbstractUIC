/** Application MTP intent. Omitted inherits; false explicitly disables it. */
export type SpeculationValue = false | {
  mode: "native_mtp";
  num_draft_tokens: number;
  require_acceleration: true;
};

export type SpeculationCapability = {
  supported: boolean;
  ready: boolean | null;
  reason: string | null;
  supported_depths: number[];
  default: unknown;
  requires_reload: boolean | null;
};

export function normalizeSpeculationValue(value: unknown): SpeculationValue | undefined {
  if (value === false || (value && typeof value === "object" && (value as any).mode === "off")) return false;
  if (!value || typeof value !== "object") return undefined;
  const item = value as Record<string, unknown>;
  if (item.mode !== "native_mtp" || !Number.isInteger(item.num_draft_tokens) || Number(item.num_draft_tokens) < 1) return undefined;
  return { mode: "native_mtp", num_draft_tokens: Number(item.num_draft_tokens), require_acceleration: true };
}

export function speculationCapability(payload: unknown): SpeculationCapability | null {
  const value = (payload as any)?.execution?.speculation;
  if (!value || typeof value.supported !== "boolean") return null;
  return {
    supported: value.supported,
    ready: typeof value.ready === "boolean" ? value.ready : null,
    reason: typeof value.reason === "string" ? value.reason : null,
    supported_depths: value.supported && Array.isArray(value.supported_depths)
      ? [...new Set<number>(value.supported_depths.filter((n: unknown) => typeof n === "number" && Number.isInteger(n) && n > 0))]
      : [],
    default: Object.prototype.hasOwnProperty.call(value, 'effective_default') ? value.effective_default : value.default,
    requires_reload: typeof value.requires_reload === "boolean" ? value.requires_reload : null,
  };
}

export function speculationSelection(value: unknown): string {
  const normalized = normalizeSpeculationValue(value);
  return normalized === false ? "off" : normalized ? String(normalized.num_draft_tokens) : "";
}

export function speculationFromSelection(value: string): SpeculationValue | undefined {
  if (value === "off") return false;
  if (!/^\d+$/.test(value) || Number(value) < 1) return undefined;
  return { mode: "native_mtp", num_draft_tokens: Number(value), require_acceleration: true };
}
