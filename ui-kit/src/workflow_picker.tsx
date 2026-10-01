/*
 * WorkflowPicker — the ONE workflow chooser of every client (AbstractCode web,
 * AbstractObserver, AbstractEntity; the Qt Assistant mirrors its rules).
 *
 * It renders exactly what `GET /api/gateway/bundles?executable_for=<interface>`
 * returns (workflow_picker_core.ts): "Gateway default" first, then the groups
 * "Shared" (owned by the gateway) and "Mine" (the signed-in person's own), each
 * entry with its version as a small detail line. No toggles, no "show all":
 * which workflows a person sees is the gateway's availability rule.
 *
 * Markup (select-only combobox, WAI-ARIA APG):
 *
 *   <div class="af-workflow-picker">
 *     <button role="combobox" aria-haspopup="listbox" aria-expanded aria-controls
 *             aria-activedescendant class="af-workflow-picker__trigger">
 *       <span class="af-workflow-picker__name">Gateway default</span>
 *       <span class="af-workflow-picker__detail">Basic agent @0.0.5</span>
 *     </button>
 *     <div role="listbox" class="af-workflow-picker__list">
 *       <div role="option" class="af-workflow-picker__option" aria-selected>…</div>
 *       <div role="group" aria-labelledby="…"><div class="af-workflow-picker__group">Shared</div>…</div>
 *     </div>
 *   </div>
 *
 * Keyboard: Enter / Space / ArrowDown / ArrowUp open; arrows, Home, End move;
 * Enter or Space chooses; Escape closes; Tab closes and moves on. Options are
 * 44 px tall on touch (theme.css `af-workflow-picker` block).
 */
import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { gatewayApiPath, joinBaseUrl } from "./gateway_paths.js";
import {
  WORKFLOW_PICKER_DEFAULT,
  WORKFLOW_PICKER_EMPTY,
  WORKFLOW_PICKER_GROUP_LABELS,
  parseWorkflowListing,
  workflowPickerPath,
  workflowPickerNextIndex,
  workflowPickerRows,
  type ExecutableWorkflows,
  type WorkflowPickerEntry,
  type WorkflowPickerGroupId,
  type WorkflowPickerRow,
} from "./workflow_picker_core.js";

/** A JSON request against the gateway API with the app's own auth (path relative to `api/gateway/`). */
export type WorkflowPickerRequest = (path: string, init: { signal: AbortSignal }) => Promise<unknown>;

export type ExecutableWorkflowsState = {
  status: "idle" | "loading" | "ready" | "error";
  data: ExecutableWorkflows | null;
  error: string;
  reload: () => void;
};

export type UseExecutableWorkflowsOptions = {
  /**
   * The interface this app runs (`GET /bundles?executable_for=<it>`), or null
   * for a launcher (AbstractObserver) that runs workflows of ANY interface
   * (`GET /bundles`, still filtered by the gateway's availability rules; the
   * detail line then names each entry's interfaces).
   */
  interfaceId: string | null;
  /** Any-interface mode: the interface whose gateway default "Gateway default" stands for. */
  defaultInterface?: string;
  /** The app's authenticated JSON request (preferred: it carries the app's sign-in). */
  request?: WorkflowPickerRequest;
  /** Without `request`: a same-origin (or this base URL's) fetch with the browser's credentials. */
  gatewayBaseUrl?: string;
  /** One entry per version (the default lists each bundle's latest). */
  allVersions?: boolean;
  /** False while there is nothing to ask (not signed in): the state stays idle. */
  enabled?: boolean;
  /** Change it to refetch (a new identity, a refresh button). */
  reloadKey?: unknown;
};

async function defaultRequest(baseUrl: string | undefined, path: string, signal: AbortSignal): Promise<unknown> {
  const res = await fetch(joinBaseUrl(baseUrl, gatewayApiPath(path)), {
    credentials: "include",
    headers: { Accept: "application/json" },
    signal,
  });
  const body: any = await res.json().catch(() => null);
  if (!res.ok) {
    const message = body?.detail?.message || body?.message || (typeof body?.detail === "string" ? body.detail : "");
    throw new Error(message || `The gateway answered ${res.status}.`);
  }
  return body;
}

function errorText(reason: unknown): string {
  const r: any = reason;
  return String(r?.detail?.message || r?.message || r || "The workflow list could not be loaded.");
}

/** Fetch the workflows this app can run, as the gateway lists them for the signed-in person. */
export function useExecutableWorkflows(options: UseExecutableWorkflowsOptions): ExecutableWorkflowsState {
  const { interfaceId, defaultInterface, allVersions = false, enabled = true, gatewayBaseUrl, reloadKey } = options;
  const requestRef = useRef(options.request);
  requestRef.current = options.request;
  const [tick, setTick] = useState(0);
  const [state, setState] = useState<Omit<ExecutableWorkflowsState, "reload">>({ status: "idle", data: null, error: "" });
  useEffect(() => {
    if (!enabled) {
      setState({ status: "idle", data: null, error: "" });
      return;
    }
    const abort = new AbortController();
    setState((s) => ({ ...s, status: "loading", error: "" }));
    const path = workflowPickerPath(interfaceId, { allVersions });
    const run = requestRef.current
      ? requestRef.current(path, { signal: abort.signal })
      : defaultRequest(gatewayBaseUrl, path, abort.signal);
    run
      .then((body) => {
        if (abort.signal.aborted) return;
        setState({ status: "ready", data: parseWorkflowListing(body, interfaceId, { defaultInterface }), error: "" });
      })
      .catch((reason) => {
        if (abort.signal.aborted) return;
        setState({ status: "error", data: null, error: errorText(reason) });
      });
    return () => abort.abort();
  }, [interfaceId, defaultInterface, allVersions, enabled, gatewayBaseUrl, reloadKey, tick]);
  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { ...state, reload };
}

export type WorkflowPickerProps = {
  /** The interface this app runs (abstractcode.agent.v1, abstractassistant.agent.v1, …), or null for a launcher (any interface). */
  interfaceId: string | null;
  /** Any-interface mode: the interface whose gateway default "Gateway default" stands for (no default entry without it). */
  defaultInterface?: string;
  /** `@default` (WORKFLOW_PICKER_DEFAULT) or an entry's `value` (bundle@version:flow). */
  value: string;
  onChange: (value: string, entry: WorkflowPickerEntry | null) => void;
  /** The list, when the app already runs useExecutableWorkflows (it needs the entries to start runs). */
  workflows?: ExecutableWorkflowsState;
  /** Otherwise the picker fetches on its own with these. */
  request?: WorkflowPickerRequest;
  gatewayBaseUrl?: string;
  allVersions?: boolean;
  enabled?: boolean;
  /** Why the choice cannot change now ("A run is in progress."): the control stays focusable and says so. */
  unavailableReason?: string | null;
  /** How to show a value the list does not carry (a restored conversation's own workflow). Never an option. */
  currentLabel?: { name: string; detail?: string } | null;
  /** Offer "Gateway default" (default true). */
  showDefault?: boolean;
  ariaLabel?: string;
  id?: string;
  className?: string;
};

type Row = WorkflowPickerRow;

/** Fixed placement under (or above) the trigger, clamped to the viewport with 16 px gutters: never a horizontal page scroll on a phone. */
function placement(trigger: HTMLElement | null): React.CSSProperties {
  if (!trigger || typeof window === "undefined") return {};
  const r = trigger.getBoundingClientRect();
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const width = Math.min(Math.max(r.width, 300), 440, vw - 32);
  const left = Math.max(16, Math.min(r.left, vw - 16 - width));
  const below = vh - r.bottom - 16;
  if (below >= 220 || below >= r.top) return { position: "fixed", left, width, top: r.bottom + 4, maxHeight: Math.max(160, below) };
  return { position: "fixed", left, width, bottom: vh - r.top + 4, maxHeight: Math.max(160, r.top - 16) };
}

function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

export function WorkflowPicker(props: WorkflowPickerProps): React.ReactElement {
  const own = useExecutableWorkflows({
    interfaceId: props.interfaceId,
    defaultInterface: props.defaultInterface,
    request: props.request,
    gatewayBaseUrl: props.gatewayBaseUrl,
    allVersions: props.allVersions,
    enabled: props.workflows ? false : props.enabled !== false,
  });
  const list = props.workflows ?? own;
  const showDefault = props.showDefault !== false && (props.interfaceId !== null || Boolean(props.defaultInterface));
  const baseId = useId().replace(/:/g, "");
  const listId = `${baseId}-list`;
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(-1);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [place, setPlace] = useState<React.CSSProperties>({});

  const rows: Row[] = useMemo(() => workflowPickerRows(list.data, showDefault), [list.data, showDefault]);

  const current = rows.find((r) => r.value === props.value);
  const shown = current
    ? { name: current.name, detail: current.detail }
    : props.currentLabel
      ? { name: props.currentLabel.name, detail: props.currentLabel.detail || "" }
      : list.status === "loading"
        ? { name: "Loading workflows…", detail: "" }
        : { name: props.value === WORKFLOW_PICKER_DEFAULT ? "Gateway default" : "Choose a workflow", detail: "" };
  const reason = String(props.unavailableReason || "").trim();
  const actionable = !reason && list.status === "ready";

  const close = useCallback(() => {
    setOpen(false);
    setHighlight(-1);
  }, []);
  const openList = useCallback(() => {
    if (!actionable) return;
    setPlace(placement(triggerRef.current));
    setOpen(true);
    const i = rows.findIndex((r) => r.value === props.value);
    setHighlight(i >= 0 ? i : 0);
  }, [actionable, rows, props.value]);
  const choose = useCallback(
    (row: Row) => {
      close();
      if (row.value !== props.value) props.onChange(row.value, row.entry);
      triggerRef.current?.focus();
    },
    [close, props],
  );

  useEffect(() => {
    if (!open) return;
    const onDown = (ev: MouseEvent | TouchEvent) => {
      if (rootRef.current && !rootRef.current.contains(ev.target as Node)) close();
    };
    // The list is placed once, when it opens: a resize closes it rather than leaving it adrift.
    const onResize = () => close();
    document.addEventListener("mousedown", onDown);
    document.addEventListener("touchstart", onDown);
    window.addEventListener("resize", onResize);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("touchstart", onDown);
      window.removeEventListener("resize", onResize);
    };
  }, [open, close]);

  useEffect(() => {
    if (!open || highlight < 0) return;
    const el = typeof document !== "undefined" ? document.getElementById(`${baseId}-opt-${highlight}`) : null;
    el?.scrollIntoView?.({ block: "nearest" });
  }, [open, highlight, baseId]);

  const onKeyDown = (ev: React.KeyboardEvent) => {
    if (!open) {
      if (["Enter", " ", "ArrowDown", "ArrowUp"].includes(ev.key)) {
        ev.preventDefault();
        openList();
      }
      return;
    }
    if (ev.key === "Escape") {
      ev.preventDefault();
      close();
      return;
    }
    if (ev.key === "Tab") {
      close();
      return;
    }
    if (ev.key === "Enter" || ev.key === " ") {
      ev.preventDefault();
      if (highlight >= 0 && rows[highlight]) choose(rows[highlight]);
      return;
    }
    const next = workflowPickerNextIndex(ev.key, highlight, rows.length);
    if (next !== null) {
      ev.preventDefault();
      setHighlight(next);
    }
  };

  return (
    <div ref={rootRef} className={cx("af-workflow-picker", props.className)} data-interface={props.interfaceId ?? "any"}>
      <button
        ref={triggerRef}
        id={props.id}
        type="button"
        role="combobox"
        className="af-workflow-picker__trigger"
        aria-label={props.ariaLabel || "Workflow"}
        aria-describedby={`${baseId}-value`}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-activedescendant={open && highlight >= 0 ? `${baseId}-opt-${highlight}` : undefined}
        aria-disabled={actionable ? undefined : true}
        title={reason || undefined}
        onClick={() => (open ? close() : openList())}
        onKeyDown={onKeyDown}
      >
        <span className="af-workflow-picker__value" id={`${baseId}-value`}>
          <span className="af-workflow-picker__name">{shown.name}</span>
          {shown.detail ? <span className="af-workflow-picker__detail">{shown.detail}</span> : null}
        </span>
        <span className="af-workflow-picker__caret" aria-hidden="true" />
      </button>
      {open ? (
        <WorkflowPickerListbox
          id={listId}
          idBase={baseId}
          rows={rows}
          value={props.value}
          highlight={highlight}
          ariaLabel={props.ariaLabel || "Workflow"}
          style={place}
          onHighlight={setHighlight}
          onChoose={choose}
        />
      ) : null}
      {list.status === "error" ? (
        <span className="af-workflow-picker__error" role="alert">
          {list.error}
        </span>
      ) : list.status === "ready" && rows.every((r) => !r.entry) && !showDefault ? (
        <span className="af-workflow-picker__empty" role="status">
          {WORKFLOW_PICKER_EMPTY}
        </span>
      ) : null}
    </div>
  );
}

export type WorkflowPickerListboxProps = {
  id: string;
  /** Prefix of the option/group ids (`<idBase>-opt-<i>`, `<idBase>-g-<group>`). */
  idBase: string;
  rows: WorkflowPickerRow[];
  value: string;
  highlight: number;
  ariaLabel: string;
  style?: React.CSSProperties;
  onHighlight: (index: number) => void;
  onChoose: (row: WorkflowPickerRow) => void;
};

/** The open list (hook-free, so it renders and is checked without a DOM). */
export function WorkflowPickerListbox(props: WorkflowPickerListboxProps): React.ReactElement {
  const option = (row: Row, index: number) => (
    <div
      key={row.key}
      id={`${props.idBase}-opt-${index}`}
      role="option"
      aria-selected={row.value === props.value}
      data-value={row.value}
      title={row.title}
      className={cx(
        "af-workflow-picker__option",
        index === props.highlight && "af-workflow-picker__option--highlighted",
        row.value === props.value && "af-workflow-picker__option--selected",
      )}
      onMouseEnter={() => props.onHighlight(index)}
      onMouseDown={(ev) => ev.preventDefault()}
      onClick={() => props.onChoose(row)}
    >
      <span className="af-workflow-picker__name">{row.name}</span>
      {row.detail ? <span className="af-workflow-picker__detail">{row.detail}</span> : null}
    </div>
  );
  const indexed = props.rows.map((row, index) => ({ row, index }));
  const defaults = indexed.filter((x) => x.row.group === null);
  const groups = (["shared", "mine"] as WorkflowPickerGroupId[])
    .map((g) => ({ g, items: indexed.filter((x) => x.row.group === g) }))
    .filter((x) => x.items.length > 0);
  return (
    <div id={props.id} role="listbox" aria-label={props.ariaLabel} className="af-workflow-picker__list" style={props.style}>
      {defaults.map((x) => option(x.row, x.index))}
      {groups.map(({ g, items }) => (
        <div key={g} role="group" aria-labelledby={`${props.idBase}-g-${g}`} data-group={g}>
          <div id={`${props.idBase}-g-${g}`} className="af-workflow-picker__group" role="presentation">
            {WORKFLOW_PICKER_GROUP_LABELS[g]}
          </div>
          {items.map((x) => option(x.row, x.index))}
        </div>
      ))}
      {groups.length === 0 ? <p className="af-workflow-picker__empty">{WORKFLOW_PICKER_EMPTY}</p> : null}
    </div>
  );
}
