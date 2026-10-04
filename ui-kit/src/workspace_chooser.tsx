// WorkspaceChooser (ui-kit 0.8.1, round 9 FINAL wording): the ONE folder chooser.
//
//   [Only allowed folders]                       the gateway's posture
//   Shared workspace          Read & write · Always on
//   /data/project             [Read & write | Read-only | Denied]
//   /archive                  [Read & write (unavailable) | Read-only | Denied]
//   Everything else           [Read & write | Read-only]     (posture b only)
//   [/absolute/path] [Read-only | Denied] [Add]              (posture b only)
//   Only allowed folders · Shared workspace (rw) · /data/project (rw) · /archive (ro)
//
// Two modes, same rows and words:
// - "account": the account's own narrowing. Every change is ONE PUT through
//   `onPut` (no Save); the gateway's refusal sentence shows under the row with
//   "Not saved." and the row keeps its previous state.
// - "automation": the automation's (or one run's) stored set
//   (input_data.workspace_allowed_paths, narrowing only) chosen among the
//   account's effective folders; `selection === null` = follows the account.
//
// Prop-driven, no route baked in: the host loads the state (see
// workspaceChooserClient) and performs the writes, so the console can edit
// ANOTHER account and the apps edit `me`. Keyboard: Tab walks the controls,
// Enter in the folder field adds, Escape clears it.
import React, { useState } from "react";
import { AfSwitch } from "./af_switch.js";
import { AfSettingsGroup } from "./af_settings_rows.js";
import { Icon } from "./icon.js";
import { useAfTooltips } from "./af_tooltip.js";
import {
  WORKSPACE_CHOOSER_TEXT as T,
  workspaceAccountView,
  workspaceAddRowBody,
  workspaceDefaultModeBody,
  workspaceModeBody,
  workspaceModeLabel,
  workspacePostureLabel,
  workspaceRefusal,
  workspaceRemoveRowBody,
  workspaceSelectionAfterToggle,
  workspaceSelectionView,
  type WorkspaceAccess,
  type WorkspaceAccountState,
  type WorkspaceChooserRow,
  type WorkspaceChooserView,
  type WorkspaceEffective,
  type WorkspaceMode,
} from "./workspace_chooser_core.js";

type Common = {
  /** A load failure, shown in place of the rows (a sentence). */
  loadError?: string | null;
  /** Why nothing can be changed now (disconnected, run active…); rows stay readable. */
  unavailableReason?: string | null;
  /** Prefix for element ids (several choosers on one page). */
  idPrefix?: string;
  className?: string;
};

export type WorkspaceChooserAccountProps = Common & {
  mode?: "account";
  /** GET/PUT /workspace/policy/{account} answer; null while loading. */
  state: WorkspaceAccountState | null;
  /** Perform ONE PUT with this body; reject with Error(<gateway sentence>) on refusal. */
  onPut: (body: { default_mode?: "ro" | null; folders?: { path: string; mode: "ro" | "deny" }[] }) => Promise<unknown>;
};

export type WorkspaceChooserAutomationProps = Common & {
  mode: "automation";
  /** The account's effective folders (the policy read's `effective`); null while loading. */
  effective: WorkspaceEffective | null;
  /** The stored set; null = nothing stored (follows the account). */
  selection: string[] | null;
  /** Store a set, or null to follow the account again. */
  onSelectionChange: (next: string[] | null) => Promise<unknown> | void;
  /** What the set is for: an automation's runs (default) or one run being launched. */
  subject?: "automation" | "run";
};

export type WorkspaceChooserProps = WorkspaceChooserAccountProps | WorkspaceChooserAutomationProps;

const ALL: WorkspaceMode[] = ["rw", "ro", "deny"];

export function WorkspaceChooser(props: WorkspaceChooserProps): React.ReactElement {
  useAfTooltips();
  const id = props.idPrefix || "af-workspace";
  const [busy, setBusy] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [addMode, setAddMode] = useState<"ro" | "deny">("deny");
  const blocked = String(props.unavailableReason || "").trim();

  const automation = props.mode === "automation";
  let view: WorkspaceChooserView | null = null;
  if (props.mode === "automation") view = props.effective ? workspaceSelectionView(props.effective, props.selection) : null;
  else view = props.state ? workspaceAccountView(props.state) : null;

  async function run(key: string, work: () => Promise<unknown> | void): Promise<boolean> {
    setBusy(key);
    setSaved(null);
    setErrors((e) => {
      const n = { ...e };
      delete n[key];
      return n;
    });
    try {
      const done = work();
      await done;
      // An automation's host saves the revision itself (and says so); only a
      // write that resolved here can say "Saved".
      if (!automation || done instanceof Promise) setSaved(key);
      return true;
    } catch (error) {
      setErrors((e) => ({ ...e, [key]: workspaceRefusal(error) }));
      return false;
    } finally {
      setBusy(null);
    }
  }

  const put = (key: string, body: Parameters<WorkspaceChooserAccountProps["onPut"]>[0]) => {
    if (props.mode === "automation") return Promise.resolve(false);
    const p = props;
    return run(key, () => p.onPut(body));
  };

  const status = (key: string) =>
    errors[key] ? (
      <span className="af-workspace__refusal" role="alert" data-workspace="refusal">
        {errors[key]}
      </span>
    ) : saved === key ? (
      <span className="af-workspace__saved" role="status" data-workspace="saved">
        {T.saved}
      </span>
    ) : null;

  const tag = (mode: WorkspaceMode, attr = "access") => (
    <span className="af-workspace__access-tag" data-workspace={attr} data-access={mode}>
      {workspaceModeLabel(mode)}
    </span>
  );

  // Read & write / Read-only / Denied for one row: the account may lower the
  // admin's mode, never raise it (a higher mode is shown unavailable).
  const segmented = (label: string, current: WorkspaceMode, offered: WorkspaceMode[], allowed: WorkspaceMode[], onPick: (m: WorkspaceMode) => void) => (
    <span className="af-workspace__access" role="group" aria-label={`${T.accessLabel} ${label}`} data-workspace="access" data-access={current}>
      {offered.map((mode) => {
        const unavailable = !allowed.includes(mode) || Boolean(blocked);
        return (
          <button
            key={mode}
            type="button"
            className="af-workspace__access-btn"
            aria-pressed={current === mode ? "true" : "false"}
            aria-disabled={unavailable ? "true" : undefined}
            data-af-tip={!allowed.includes(mode) ? T.accessCeiling : undefined}
            data-action={`workspace-mode-${mode}`}
            onClick={() => (unavailable || busy !== null || mode === current ? undefined : onPick(mode))}
          >
            {workspaceModeLabel(mode)}
          </button>
        );
      })}
    </span>
  );

  const rowControl = (row: WorkspaceChooserRow) => {
    if (props.mode === "automation") return tag(row.adminMode);
    if (!row.choices.length) return tag(row.mode);
    const state = props.state as WorkspaceAccountState;
    const offered = row.origin === "account" ? (["ro", "deny"] as WorkspaceMode[]) : ALL;
    return segmented(row.path, row.mode, offered, row.choices, (m) => void put(row.path, workspaceModeBody(state, row, m)));
  };

  async function addRow() {
    if (props.mode === "automation" || !props.state) return;
    const path = draft.trim();
    if (!path) return;
    if (await put("add", workspaceAddRowBody(props.state, path, addMode))) setDraft("");
  }

  return (
    <AfSettingsGroup
      id={id}
      className={`af-workspace${props.className ? ` ${props.className}` : ""}`}
      title={T.title}
      help={props.mode === "automation" ? (props.subject === "run" ? T.runHelp : T.automationHelp) : T.help}
    >
      {props.loadError ? (
        <p className="af-workspace__refusal" role="alert" data-workspace="load-error">
          {props.loadError}
        </p>
      ) : !view ? (
        <p className="af-workspace__note" data-workspace="loading">
          Loading…
        </p>
      ) : (
        <>
          <div className="af-workspace__posture" data-workspace="posture" data-posture={view.posture}>
            <span className="af-workspace__badge">{workspacePostureLabel(view.posture)}</span>
          </div>
          {blocked ? (
            <p className="af-workspace__note" id={`${id}-blocked`} data-workspace="blocked">
              {blocked}
            </p>
          ) : null}
          {automation && view.follows ? (
            <p className="af-workspace__note" data-workspace="follows">
              {T.automationFollows}
            </p>
          ) : null}
          <ul className="af-workspace__list" aria-label={T.foldersTitle} data-workspace="list">
            <li className="af-workspace__shared" data-setting="workspace-shared">
              <div className="af-workspace__shared-head">
                <span className="af-workspace__shared-name">{T.sharedLabel}</span>
                <span className="af-workspace__tags">
                  {tag("rw", "shared-access")}
                  <span className="af-workspace__always" data-workspace="shared-always">
                    {T.sharedState}
                  </span>
                </span>
              </div>
              <code className="af-workspace__path" title={view.shared.path}>
                {view.shared.path}
              </code>
            </li>
            {view.rows.map((row) => (
              <li className="af-workspace__row af-workspace__folder" key={row.path} data-workspace={row.origin === "account" ? "account-row" : "folder"} data-path={row.path} data-mode={row.mode}>
                {props.mode === "automation" ? (
                  <AfSwitch
                    variant="row"
                    label={row.name}
                    description={<code className="af-workspace__path">{row.path}</code>}
                    ariaLabel={row.path}
                    checked={row.mode !== "deny"}
                    busy={busy === row.path}
                    unavailableReason={blocked || null}
                    describedBy={blocked ? `${id}-blocked` : undefined}
                    action="workspace-select"
                    onChange={(next) => {
                      const p = props;
                      const v = view as WorkspaceChooserView;
                      void run(row.path, () => p.onSelectionChange(workspaceSelectionAfterToggle(v, row.path, next)));
                    }}
                  />
                ) : (
                  <span className="af-workspace__folder-text">
                    <span className="af-workspace__own-name">{row.name}</span>
                    <code className="af-workspace__path">{row.path}</code>
                  </span>
                )}
                <span className="af-workspace__folder-controls">
                  {rowControl(row)}
                  {row.origin === "account" && props.mode !== "automation" ? (
                    <button
                      type="button"
                      className="af-workspace__icon-btn"
                      data-action="workspace-remove-row"
                      aria-label={`${T.remove} ${row.path}`}
                      data-af-tip={`${T.remove} ${row.path}`}
                      disabled={Boolean(blocked) || busy !== null}
                      onClick={() => props.state && void put(row.path, workspaceRemoveRowBody(props.state, row.path))}
                    >
                      <Icon name="x" size={16} />
                    </button>
                  ) : null}
                </span>
                {status(row.path)}
              </li>
            ))}
            {view.everythingElse ? (
              <li className="af-workspace__row af-workspace__folder" data-workspace="everything-else" data-mode={view.everythingElse.mode}>
                <span className="af-workspace__folder-text">
                  <span className="af-workspace__own-name">{T.everythingElse}</span>
                </span>
                <span className="af-workspace__folder-controls">
                  {view.everythingElse.choices.length > 1
                    ? segmented(T.everythingElse, view.everythingElse.mode, ["rw", "ro"], view.everythingElse.choices, (m) => void put("everything-else", workspaceDefaultModeBody(m as WorkspaceAccess)))
                    : tag(view.everythingElse.mode)}
                </span>
                {status("everything-else")}
              </li>
            ) : null}
            {!automation && view.canAdd ? (
              <li className="af-workspace__add" data-workspace="add">
                <input
                  type="text"
                  className="af-workspace__input"
                  aria-label={T.foldersTitle}
                  placeholder={T.addPlaceholder}
                  value={draft}
                  disabled={Boolean(blocked) || busy === "add"}
                  spellCheck={false}
                  autoCapitalize="off"
                  autoCorrect="off"
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      void addRow();
                    } else if (e.key === "Escape") {
                      e.preventDefault();
                      setDraft("");
                      setErrors((x) => {
                        const n = { ...x };
                        delete n.add;
                        return n;
                      });
                    }
                  }}
                />
                {segmented(T.addPlaceholder, addMode, ["ro", "deny"], ["ro", "deny"], (m) => setAddMode(m as "ro" | "deny"))}
                <button type="button" className="af-workspace__add-btn" data-action="workspace-add-row" disabled={Boolean(blocked) || !draft.trim() || busy !== null} onClick={() => void addRow()}>
                  {T.add}
                </button>
                {status("add")}
              </li>
            ) : null}
          </ul>
          {!automation && !view.canAdd ? (
            <p className="af-workspace__note" data-workspace="admin-only-adds">
              {T.adminOnlyAdds}
            </p>
          ) : null}
          <p className="af-workspace__effective" data-workspace="effective">
            {view.summary}
          </p>
          {automation && !view.follows ? (
            <div className="af-workspace__actions">
              <button
                type="button"
                className="af-workspace__link"
                data-action="workspace-follow-account"
                disabled={Boolean(blocked) || busy !== null}
                onClick={() => {
                  if (props.mode === "automation") {
                    const p = props;
                    void run("follow", () => p.onSelectionChange(null));
                  }
                }}
              >
                {T.automationUseAccount}
              </button>
              {status("follow")}
            </div>
          ) : null}
        </>
      )}
    </AfSettingsGroup>
  );
}
