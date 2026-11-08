// IterationLimitField (ui-kit 0.9.26, operator 2026-11-08: "a way to configure the number of
// iterations allowed for an agent ... a shared component in abstractuic and provided to all apps").
//
// The per-conversation "Iteration limit" beside "Context token limit": a number input whose
// empty state names what applies instead ("Gateway default (12)" when the gateway stores one,
// "Workflow default" when it does not), min 1, plain validation text, a "Use default" action
// while a value is set, and, when the app passes the last start's receipt, which limit that run
// really got.
//
// Gateway seam (abstractgateway, agents.max_iterations):
// - default: GET /api/gateway/discovery/capabilities -> capabilities.agent_limits.max_iterations
//   {default: int | null, source: "stored" | "default", run_field: "_limits.max_iterations",
//   min: 1, warn_above: 200} (iterationLimitDefaultFrom);
// - per run: the app sends input_data._limits.max_iterations (iterationLimitFromInput);
// - receipt: POST /runs/start answers limits {max_iterations, source: request|gateway_default|builtin}.
import React, { useId } from "react";

/** The per-conversation value as typed: "" = unset (the default applies), else digits. */
export type IterationLimitValue = string;

/** The gateway's iteration default as every client may read it. */
export type IterationLimitDefault = {
  /** The stored gateway default; null = none stored (each workflow's own limit applies). */
  value: number | null;
  source: "stored" | "default";
  /** Past this a warning line shows (never a refusal). */
  warnAbove: number;
};

/** The iteration budget a run start applied (`limits` on the POST /runs/start answer). */
export type IterationLimitApplied = {
  max_iterations: number | null;
  source: "request" | "gateway_default" | "builtin";
};

const WARN_ABOVE = 200;

function record(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

/**
 * Read `agent_limits.max_iterations` from a discovery payload ({capabilities: {...}}) or the
 * capabilities object itself. null = this gateway does not serve it (older gateway).
 */
export function iterationLimitDefaultFrom(payload: unknown): IterationLimitDefault | null {
  const root = record(payload);
  const caps = record(root?.capabilities) ?? root;
  const row = record(record(caps?.agent_limits)?.max_iterations);
  if (!row) return null;
  const raw = row.default;
  const value = typeof raw === "number" && Number.isInteger(raw) && raw >= 1 ? raw : null;
  if (raw !== null && value === null) return null;
  const warn = row.warn_above;
  return {
    value,
    source: row.source === "stored" && value !== null ? "stored" : "default",
    warnAbove: typeof warn === "number" && Number.isInteger(warn) && warn >= 1 ? warn : WARN_ABOVE,
  };
}

/** The value to send as `_limits.max_iterations`; undefined = send nothing (the default applies). */
export function iterationLimitFromInput(value: IterationLimitValue): number | undefined {
  const t = String(value ?? "").trim();
  if (!/^\d+$/.test(t)) return undefined;
  const n = Number(t);
  return n >= 1 ? n : undefined;
}

/** A sentence when the typed value cannot be used; null when it can (or is empty). */
export function iterationLimitProblem(value: IterationLimitValue): string | null {
  const t = String(value ?? "").trim();
  if (!t) return null;
  if (iterationLimitFromInput(t) === undefined) return "Enter a whole number of 1 or more, or leave it empty to use the default.";
  return null;
}

/** What applies when the field is empty. */
export function iterationLimitDefaultLabel(d: IterationLimitDefault | null | undefined): string {
  if (!d) return "Gateway default";
  return d.value !== null ? `Gateway default (${d.value})` : "Workflow default";
}

/** One line about the last start's receipt. */
export function iterationLimitAppliedText(applied: IterationLimitApplied | null | undefined): string {
  if (!applied) return "";
  const n = applied.max_iterations;
  if (applied.source === "request" && n !== null) return `Last run: ${n} iterations (this conversation's limit).`;
  if (applied.source === "gateway_default" && n !== null) return `Last run: ${n} iterations (gateway default).`;
  // builtin: the framework default the gateway reports (AbstractRuntime DEFAULT_MAX_ITERATIONS); older gateways send null.
  if (applied.source === "builtin" && n !== null) return `Last run: ${n} iterations (default).`;
  return "Last run: the workflow's own limit.";
}

export type IterationLimitFieldProps = {
  value: IterationLimitValue;
  onChange: (value: IterationLimitValue) => void;
  disabled?: boolean;
  /** From iterationLimitDefaultFrom(discovery); undefined/null = unknown ("Gateway default"). */
  gatewayDefault?: IterationLimitDefault | null;
  /** The last start's `limits` receipt, when the app has one. */
  applied?: IterationLimitApplied | null;
  label?: React.ReactNode;
  /** Extra class on the wrapper (an app's field class, e.g. "code-field", for the same look as its other fields). */
  className?: string;
  id?: string;
};

export function IterationLimitField(p: IterationLimitFieldProps): React.ReactElement {
  const auto = useId();
  const id = p.id || `af-iteration-limit-${auto.replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const msgId = `${id}-msg`;
  const problem = iterationLimitProblem(p.value);
  const n = iterationLimitFromInput(p.value);
  const warnAbove = p.gatewayDefault?.warnAbove ?? WARN_ABOVE;
  const warning = n !== undefined && n > warnAbove ? `${n} iterations is a lot: one run can take hours and use many model calls.` : "";
  const appliedText = iterationLimitAppliedText(p.applied);
  const set = String(p.value ?? "").trim() !== "";
  const message = problem || warning || appliedText;
  const tone = problem ? "error" : warning ? "warn" : "info";
  return (
    <div className={`af-limit-field${p.className ? ` ${p.className}` : ""}`} data-iteration-limit>
      <label htmlFor={id}>{p.label ?? "Iteration limit"}</label>
      <div className="af-limit-field__row">
        <input
          id={id}
          type="number"
          min={1}
          step={1}
          inputMode="numeric"
          placeholder={iterationLimitDefaultLabel(p.gatewayDefault)}
          value={p.value}
          disabled={p.disabled}
          aria-invalid={problem ? true : undefined}
          aria-describedby={message ? msgId : undefined}
          onChange={(e) => p.onChange(e.target.value)}
        />
        {set ? (
          <button type="button" className="af-limit-field__reset" disabled={p.disabled} onClick={() => p.onChange("")}>
            Use default
          </button>
        ) : null}
      </div>
      {message ? (
        <p id={msgId} className={`af-limit-field__msg af-limit-field__msg--${tone}`} role={problem ? "alert" : undefined}>
          {message}
        </p>
      ) : null}
    </div>
  );
}
