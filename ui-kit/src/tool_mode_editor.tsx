// ToolModeEditor (ADR 0001, backlog 0033): one tool editor for every app.
// Edits ONE sparse layer (the app's defaults, or this conversation's changes)
// on top of what it inherits. Off / Ask / Auto per tool; per toolset a group
// control with a Mixed state and the bulk-Auto cap explained in words; search;
// risk and state badges; the gateway's reason for a tool it does not offer;
// a "Default: X" chip on a row that overrides the layer below.
//
// Host-driven: the catalog (normalizeToolCatalog), the layer value and the
// inherited modes are injected; the component never fetches and never stores.
// The rules (sparse diffs, nothing offered the gateway did not offer, bulk
// Auto cap) are tool_plan.ts's, not re-derived here.
import React, { useMemo, useState } from "react";
import { AfOverrideRow } from "./af_settings_rows.js";
import { AfTooltip } from "./af_tooltip.js";
import { describeToolMode } from "./tool_policy_editor.js";
import { formatExactTime } from "./relative_time.js";
import { sessionPolicyClampedLines, type SessionToolPolicy } from "./session_tool_policy.js";
import type { ToolLayerStorage } from "./tool_layer_store.js";
import {
  BULK_AUTO_MAX_RANK,
  bulkAutoReaches,
  normalizeToolCatalog,
  toolCatalogWarnings,
  setGroupToolMode,
  setToolMode,
  type ToolCatalogItem,
  type ToolMode,
  type ToolModeLayer,
} from "./tool_plan.js";

export type ToolModeLabels = { off: string; ask: string; auto: string; on: string };
export const TOOL_MODE_LABELS: ToolModeLabels = { off: "Off", ask: "Ask", auto: "Auto", on: "On" };

/** The reset of each layer, in the reference wording (watch ToolsView.swift:55-61). */
export const TOOL_LAYER_RESET: Record<"app" | "session", string> = {
  app: "Use the gateway's",
  session: "Use my defaults",
};
/** Whose override a layer is (AfOverrideRow `overrideOwner`). */
export const TOOL_LAYER_OWNER: Record<"app" | "session", string> = { app: "this app", session: "this conversation" };

/** Why group Auto leaves some tools as they are (the cap, in words). */
export const BULK_AUTO_CAP_SENTENCE = `Auto for a whole group reaches the tools that read or make changes (risk ${BULK_AUTO_MAX_RANK} or lower) and whose destination the assistant does not choose. Set the others to Auto one at a time.`;

export type ToolModeEditorProps = {
  /** From normalizeToolCatalog (the gateway's offer and defaults). */
  catalog: readonly ToolCatalogItem[];
  /** The layer this editor writes. */
  layer: "app" | "session";
  /** This layer's sparse diffs. */
  value: ToolModeLayer;
  /** What each tool resolves to without this layer (inheritedToolModes). Missing = the gateway default. */
  inherited?: Readonly<Record<string, ToolMode>>;
  onChange: (next: ToolModeLayer) => void;
  /** Clears this layer: "Use the gateway's" (app) / "Use my defaults" (session). */
  onReset?: () => void;
  labels?: Partial<ToolModeLabels>;
  /** Off / On only (a flow's or a launch form's tool allowlist): On keeps the inherited approval. */
  allowListOnly?: boolean;
  disabled?: boolean;
  /** The gateway's `tool_mode` (discovery/tools), shown as the ToolPolicyEditor banner. */
  toolMode?: string;
  toolModeLabel?: string;
  toolModeDetail?: string;
  note?: string;
  /** The catalog's warnings in the gateway's words (toolCatalogWarnings: plugin load failures, MCP). */
  warnings?: readonly string[];
  /** Where the host keeps this layer, in words (e.g. TOOL_LAYER_STORE_WHERE). */
  savedWhere?: string;
  /** Where this layer lives (ToolLayerStore.sessionStorage / loadSession): its words replace
   * `savedWhere`, and a browser fallback's note says why the gateway does not keep it. */
  storage?: ToolLayerStorage;
  /** The conversation's policy as the gateway stores it (loadSession / saveSession): its `clamped`
   * entries ("Not covered: … (not_authorized)") and who set it, when. */
  policy?: SessionToolPolicy | null;
  /** Settings pages: frame the editor in an AfOverrideRow with this label ("Tools"). */
  rowLabel?: React.ReactNode;
  rowHelp?: React.ReactNode;
  /** Controlled open state of the frame (default: closed, toggled by Change/Done). */
  open?: boolean;
  onToggle?: () => void;
  className?: string;
};

function breakAtUnderscores(name: string): React.ReactNode {
  const parts = name.split("_");
  return parts.map((part, i) => (i < parts.length - 1 ? <React.Fragment key={i}>{part}_<wbr /></React.Fragment> : <React.Fragment key={i}>{part}</React.Fragment>));
}

type Group = { toolset: string; items: ToolCatalogItem[] };

/** "Set by admin (panel-chat) on Oct 27, 2026, 10:00", from the policy's served set_by / set_at. */
export function policySetLine(policy: SessionToolPolicy | null | undefined): string {
  if (!policy) return "";
  const who = policy.set_by?.user_id || "";
  const client = policy.set_by?.client || "";
  const when = formatExactTime(policy.set_at);
  if (!who && !when) return "";
  return `Set${who ? ` by ${who}` : ""}${client ? ` (${client})` : ""}${when ? ` on ${when}` : ""}`;
}

export function ToolModeEditor(props: ToolModeEditorProps): React.ReactElement {
  const labels: ToolModeLabels = { ...TOOL_MODE_LABELS, ...(props.labels || {}) };
  const disabled = props.disabled === true;
  const allowList = props.allowListOnly === true;
  const value: ToolModeLayer = props.value || {};
  const [query, setQuery] = useState("");
  const [openState, setOpenState] = useState(false);

  const inheritedOf = (item: ToolCatalogItem): ToolMode => (item.offered ? props.inherited?.[item.name] ?? item.gatewayDefault : "off");
  const modeOf = (item: ToolCatalogItem): ToolMode => {
    if (!item.offered) return "off";
    const own = value[item.name];
    return own === "off" || own === "ask" || own === "auto" ? own : inheritedOf(item);
  };
  const inheritedMap = useMemo(() => {
    const out: Record<string, ToolMode> = {};
    for (const item of props.catalog) out[item.name] = inheritedOf(item);
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.catalog, props.inherited]);

  const groups: Group[] = useMemo(() => {
    const q = query.trim().toLowerCase();
    const by = new Map<string, ToolCatalogItem[]>();
    for (const item of props.catalog) {
      if (q && ![item.name, item.description || "", item.toolset].some((s) => s.toLowerCase().includes(q))) continue;
      const list = by.get(item.toolset) || [];
      list.push(item);
      by.set(item.toolset, list);
    }
    return [...by.entries()]
      .sort(([a], [b]) => (a === "other" ? 1 : b === "other" ? -1 : a.localeCompare(b)))
      .map(([toolset, items]) => ({
        toolset,
        items: [...items].sort((a, b) => (a.offered === b.offered ? a.name.localeCompare(b.name) : a.offered ? -1 : 1)),
      }));
  }, [props.catalog, query]);

  const write = (next: ToolModeLayer) => {
    if (!disabled) props.onChange(next);
  };
  // allowListOnly "On": the inherited approval when it is not off, else the gateway's own default.
  const onTarget = (item: ToolCatalogItem): ToolMode => {
    const inh = inheritedOf(item);
    return inh !== "off" ? inh : item.gatewayDefault !== "off" ? item.gatewayDefault : "ask";
  };
  const setRow = (item: ToolCatalogItem, mode: ToolMode) => write(setToolMode(value, item, mode, inheritedOf(item)));
  const setGroup = (items: ToolCatalogItem[], mode: ToolMode | "on") => {
    if (mode === "on") {
      let next = value;
      for (const item of items) if (item.offered && modeOf(item) === "off") next = setToolMode(next, item, onTarget(item), inheritedOf(item));
      write(next);
      return;
    }
    write(setGroupToolMode(value, items, mode, inheritedMap).layer);
  };

  const offered = props.catalog.filter((t) => t.offered);
  const counts = { auto: 0, ask: 0 };
  for (const t of offered) {
    const m = modeOf(t);
    if (m === "auto") counts.auto += 1;
    else if (m === "ask") counts.ask += 1;
  }
  const enabledCount = counts.auto + counts.ask;
  // An effective diff: a canonical mode for an offered tool that differs from what it inherits (the
  // same rule as tool_plan's hasToolChoices, so the frame and the run never disagree).
  const overridesRow = (item: ToolCatalogItem): boolean => {
    if (!item.offered || !Object.prototype.hasOwnProperty.call(value, item.name)) return false;
    const own = value[item.name];
    return (own === "off" || own === "ask" || own === "auto") && own !== inheritedOf(item);
  };
  const changed = props.catalog.filter(overridesRow).map((t) => t.name);
  const banner = describeToolMode(props.toolMode, props.toolModeLabel, props.toolModeDetail);
  const rowModes: Array<ToolMode | "on"> = allowList ? ["off", "on"] : ["off", "ask", "auto"];
  const modeLabel = (m: ToolMode | "on") => labels[m];

  const editor = (
    <div className={`af-tool-modes${props.className ? ` ${props.className}` : ""}`} data-layer={props.layer} data-allowlist={allowList ? "true" : undefined}>
      {banner ? (
        <div className={`af-tool-policy__mode is-${banner.tone}`}>
          <div className="af-tool-policy__mode-badge">Tool mode</div>
          <div className="af-tool-policy__mode-value">{banner.label}</div>
          <div className="af-tool-policy__mode-detail">{banner.detail}</div>
        </div>
      ) : null}
      {props.note ? <div className="af-tool-policy__note">{props.note}</div> : null}
      {props.warnings?.length ? (
        <div className="af-tool-modes__warnings" role="status" data-catalog-warnings="">
          {props.warnings.map((w, i) => (
            <div key={i}>Gateway warning: {w}</div>
          ))}
        </div>
      ) : null}
      <div className="af-tool-modes__top">
        <input
          type="search"
          className="af-tool-modes__search"
          placeholder="Search tools"
          aria-label="Search tools"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <span className="af-tool-modes__count" data-tool-count="">
          {allowList
            ? `${enabledCount} of ${offered.length} tools on`
            : `${enabledCount} of ${offered.length} tools on · ${counts.auto} run without asking · ${counts.ask} ask first`}
        </span>
        {props.onReset && Object.keys(value).length ? (
          <button type="button" className="af-setting-btn af-setting-btn--quiet" data-action="reset-layer" disabled={disabled} onClick={props.onReset}>
            {TOOL_LAYER_RESET[props.layer]}
          </button>
        ) : null}
        {props.storage ? (
          <span className="af-tool-modes__saved" data-storage={props.storage.kind}>
            {props.storage.where}
          </span>
        ) : props.savedWhere ? (
          <span className="af-tool-modes__saved">{props.savedWhere}</span>
        ) : null}
      </div>
      {props.storage?.note ? (
        <div className="af-tool-modes__warnings" role="status" data-storage-note={props.storage.kind}>
          {props.storage.note}
        </div>
      ) : null}
      {props.policy ? (
        <div className="af-tool-modes__policy" data-session-policy={props.policy.revision}>
          {policySetLine(props.policy) ? <div data-policy-set="">{policySetLine(props.policy)}</div> : null}
          {sessionPolicyClampedLines(props.policy).map((line, i) => (
            <div key={i} data-policy-clamped="">
              {line}
            </div>
          ))}
        </div>
      ) : null}
      {!props.catalog.length ? <div className="af-tool-policy__empty">The gateway offers no tools.</div> : null}
      {props.catalog.length && !groups.length ? <div className="af-tool-policy__empty">No tools match the search.</div> : null}
      {groups.map((group) => {
        const live = group.items.filter((t) => t.offered);
        const modes = new Set(live.map((t) => (allowList ? (modeOf(t) === "off" ? "off" : "on") : modeOf(t))));
        const uniform = modes.size === 1 ? [...modes][0] : undefined;
        const capped = !allowList ? live.filter((t) => !bulkAutoReaches(t)) : [];
        return (
          <section key={group.toolset} className="af-tool-modes__group" data-toolset={group.toolset}>
            <div className="af-tool-modes__group-head">
              <span className="af-tool-modes__group-name">{group.toolset}</span>
              {live.length ? (
                <span className="af-tool-modes__group-state" data-group-state={uniform ?? "mixed"}>
                  {uniform ? modeLabel(uniform as ToolMode | "on") : "Mixed"}
                </span>
              ) : null}
              <div className="af-tool-modes__seg" role="group" aria-label={`All ${group.toolset} tools`}>
                {rowModes.map((m) => (
                  <button
                    key={m}
                    type="button"
                    className={`af-tool-modes__seg-btn${uniform === m ? " is-active" : ""}`}
                    aria-pressed={uniform === m}
                    data-group-mode={`${group.toolset}:${m}`}
                    disabled={disabled || !live.length || (m === "auto" && capped.length === live.length)}
                    title={m === "auto" && capped.length ? BULK_AUTO_CAP_SENTENCE : undefined}
                    onClick={() => setGroup(group.items, m)}
                  >
                    {modeLabel(m)}
                  </button>
                ))}
              </div>
            </div>
            {capped.length ? (
              <div className="af-tool-modes__cap" data-bulk-cap={group.toolset}>
                {BULK_AUTO_CAP_SENTENCE} {capped.length === 1 ? "1 tool here stays" : `${capped.length} tools here stay`} as it is: {capped.map((t) => t.name).join(", ")}.
              </div>
            ) : null}
            {group.items.map((item) => {
              const mode = modeOf(item);
              const shown: ToolMode | "on" = allowList && mode !== "off" ? "on" : mode;
              const overrides = overridesRow(item);
              const inh = inheritedOf(item);
              return (
                <div
                  key={item.name}
                  className={`af-tool-mode-row${item.offered ? "" : " is-unavailable"}`}
                  data-tool={item.name}
                  data-mode={mode}
                  data-overridden={overrides ? "true" : "false"}
                >
                  <div className="af-tool-mode-row__meta">
                    <div className="af-tool-row__title">
                      <span className="af-tool-row__name">{breakAtUnderscores(item.name)}</span>
                      {item.riskTier ? (
                        <span className="af-tool-row__badge" data-risk={item.riskRank ?? ""} title={item.riskRank !== undefined ? `Risk ${item.riskRank}` : undefined}>
                          {item.riskTier}
                        </span>
                      ) : null}
                      {overrides ? (
                        <span
                          className="af-tool-mode-row__default"
                          data-default-chip={item.name}
                          title={props.layer === "app" || inh === item.gatewayDefault ? "The gateway's default" : "Your default for this app"}
                        >
                          Default: {allowList ? (inh === "off" ? labels.off : labels.on) : modeLabel(inh)}
                        </span>
                      ) : null}
                    </div>
                    {item.state ? (
                      <div className="af-tool-row__state-line">
                        <AfTooltip content={item.state.tooltip || ""}>
                          <span
                            className={`af-tool-row__state${item.state.tone ? ` is-${item.state.tone}` : ""}`}
                            data-tool-state={item.name}
                            tabIndex={item.state.tooltip ? 0 : undefined}
                            aria-label={item.state.tooltip ? `${item.state.label}. ${item.state.tooltip}` : undefined}
                          >
                            {item.state.label}
                          </span>
                        </AfTooltip>
                      </div>
                    ) : null}
                    {item.description ? <div className="af-tool-row__desc">{item.description}</div> : null}
                    {item.whenToUse ? <div className="af-tool-row__hint">{item.whenToUse}</div> : null}
                    {item.offered && item.defaultUnserved ? (
                      <div className="af-tool-mode-row__why" data-default-unserved={item.name}>
                        The gateway did not say whether this tool asks first; Ask is assumed.
                      </div>
                    ) : null}
                    {!item.offered ? (
                      <div className="af-tool-mode-row__why" data-why-disabled={item.name}>
                        {item.whyDisabled ? `Not offered by the gateway: ${item.whyDisabled}` : "Not offered by the gateway."}
                      </div>
                    ) : null}
                  </div>
                  <div className="af-tool-modes__seg" role="group" aria-label={`Mode for ${item.name}`}>
                    {rowModes.map((m) => (
                      <button
                        key={m}
                        type="button"
                        className={`af-tool-modes__seg-btn${shown === m ? " is-active" : ""}`}
                        aria-pressed={shown === m}
                        data-tool-mode={`${item.name}:${m}`}
                        disabled={disabled || !item.offered}
                        onClick={() => setRow(item, m === "on" ? onTarget(item) : m)}
                      >
                        {modeLabel(m)}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </section>
        );
      })}
    </div>
  );

  if (props.rowLabel === undefined) return editor;
  // Settings frame. The summary never claims "Gateway default" when the layer below differs from the
  // gateway: a session over changed app defaults reads "Your defaults — this app".
  const belowDiffers = props.layer === "session" && offered.some((t) => inheritedOf(t) !== t.gatewayDefault);
  const overrideSummary = changed.length
    ? `${changed.length} tool${changed.length === 1 ? "" : "s"} changed`
    : belowDiffers
      ? "Your defaults"
      : "";
  const owner = changed.length ? TOOL_LAYER_OWNER[props.layer] : TOOL_LAYER_OWNER.app;
  const open = props.open ?? openState;
  return (
    <AfOverrideRow
      label={props.rowLabel}
      help={props.rowHelp}
      defaultSummary={allowList ? `${enabledCount} of ${offered.length} tools on` : `${enabledCount} tools on, ${counts.auto} without asking`}
      overrideSummary={overrideSummary}
      overrideOwner={owner}
      open={open}
      onToggle={props.onToggle ?? (() => setOpenState((v) => !v))}
      disabled={disabled}
      setting={`tools-${props.layer}`}
    >
      {editor}
    </AfOverrideRow>
  );
}

export type ToolModeEditorForPayloadProps = Omit<ToolModeEditorProps, "catalog"> & {
  /** The served `GET discovery/tools` answer as is, or already-normalized items. */
  catalog: readonly ToolCatalogItem[] | unknown;
};

/** ToolModeEditor over the served catalog answer (the console island's entry): normalizes it, shows
 * its `catalog_warnings`, and renders a labeled error in place of a broken answer (never throws). */
export function ToolModeEditorForPayload(props: ToolModeEditorForPayloadProps): React.ReactElement {
  if (Array.isArray(props.catalog)) return <ToolModeEditor {...props} catalog={props.catalog as ToolCatalogItem[]} />;
  let catalog: ToolCatalogItem[];
  try {
    catalog = normalizeToolCatalog(props.catalog);
  } catch (e) {
    return (
      <div className="af-tool-policy__empty" role="alert" data-catalog-error="">
        Tools unavailable: {String((e as Error)?.message || e)}
      </div>
    );
  }
  return <ToolModeEditor {...props} catalog={catalog} warnings={[...toolCatalogWarnings(props.catalog), ...(props.warnings || [])]} />;
}

export default ToolModeEditor;
