// WorkspaceChooser (ui-kit 0.8.1, round 9): the ONE folder chooser.
//
//   Agents may use: <the gateway's one line>
//   Shared workspace   <path>                       Always on
//   ALLOWED FOLDERS    one switch per folder the gateway lists (state-showing)
//   MY FOLDERS         rows + Add, only while the gateway allows any folder
//
// Two modes, same rows and words:
// - "account": the account's own policy. Every change is ONE PUT through
//   `onPut` (no Save); the gateway's refusal sentence shows under the row
//   with "Not saved." and the row keeps its previous state.
// - "automation": the automation's stored set (a host that saves later
//   returns void and shows its own revision line; a Promise = "Saved" here) (input_data.workspace_allowed_paths),
//   chosen among the account's effective folders; `selection === null` =
//   follows the account. "My folders" are managed in the account settings.
//
// Prop-driven, no route baked in: the host loads the state (see
// workspaceChooserClient) and performs the writes, so the console can edit
// ANOTHER account and the apps edit `me`. Keyboard: Tab walks switches and
// rows, Enter in the folder field adds, Escape clears the field.
import React, { useState } from "react";
import { AfSwitch } from "./af_switch.js";
import { AfSettingsGroup, AfSettingRow } from "./af_settings_rows.js";
import { Icon } from "./icon.js";
import { useAfTooltips } from "./af_tooltip.js";
import {
  WORKSPACE_CHOOSER_TEXT as T,
  workspaceAccountView,
  workspaceAddOwnBody,
  workspaceExtraBody,
  workspaceFolderName,
  workspaceRefusal,
  workspaceRemoveOwnBody,
  workspaceSelectionAfterToggle,
  workspaceSelectionView,
  type WorkspaceAccountState,
  type WorkspaceChooserView,
  type WorkspaceEffective,
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
  onPut: (body: { enabled_folders?: string[]; own_folders?: string[] }) => Promise<unknown>;
};

export type WorkspaceChooserAutomationProps = Common & {
  mode: "automation";
  /** The account's effective folders (GET /workspace/effective/me or the policy read's `effective`); null while loading. */
  effective: WorkspaceEffective | null;
  /** The stored set; null = nothing stored (follows the account). */
  selection: string[] | null;
  /** Store a set, or null to follow the account again. */
  onSelectionChange: (next: string[] | null) => Promise<unknown> | void;
};

export type WorkspaceChooserProps = WorkspaceChooserAccountProps | WorkspaceChooserAutomationProps;

export function WorkspaceChooser(props: WorkspaceChooserProps): React.ReactElement {
  useAfTooltips();
  const id = props.idPrefix || "af-workspace";
  const [busy, setBusy] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const blocked = String(props.unavailableReason || "").trim();

  const automation = props.mode === "automation";
  let view: WorkspaceChooserView | null = null;
  if (automation) view = props.effective ? workspaceSelectionView(props.effective, props.selection) : null;
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

  function toggle(path: string, on: boolean) {
    if (!view) return;
    const v = view;
    if (props.mode === "automation") {
      const p = props;
      void run(path, () => p.onSelectionChange(workspaceSelectionAfterToggle(v, path, on)));
    } else {
      const p = props;
      void run(path, () => p.onPut(workspaceExtraBody(v, path, on)));
    }
  }

  async function addOwn() {
    if (props.mode === "automation" || !props.state) return;
    const path = draft.trim();
    if (!path) return;
    const p = props;
    const state = props.state;
    if (await run("own:add", () => p.onPut(workspaceAddOwnBody(state, path)))) setDraft("");
  }

  function removeOwn(path: string) {
    if (props.mode === "automation" || !props.state) return;
    const p = props;
    const state = props.state;
    void run(`own:${path}`, () => p.onPut(workspaceRemoveOwnBody(state, path)));
  }

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

  return (
    <AfSettingsGroup
      id={id}
      className={`af-workspace${props.className ? ` ${props.className}` : ""}`}
      title={T.title}
      help={automation ? T.automationHelp : T.help}
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
          <p className="af-workspace__effective" data-workspace="effective">
            <strong>{T.effectivePrefix}</strong> {view.summary}
          </p>
          {blocked ? (
            <p className="af-workspace__note" id={`${id}-blocked`} data-workspace="blocked">
              {blocked}
            </p>
          ) : null}
          <AfSettingRow
            label={T.sharedLabel}
            setting="workspace-shared"
            help={
              <>
                <code className="af-workspace__path" title={view.shared.path}>
                  {view.shared.path}
                </code>
                <span>{T.sharedHelp}</span>
              </>
            }
          >
            <span className="af-workspace__always" data-workspace="shared-always">
              {T.sharedState}
            </span>
          </AfSettingRow>

          <AfSettingsGroup variant="flat" title={T.allowedTitle} help={automation ? (view.follows ? T.automationFollows : undefined) : T.allowedHelp} id={`${id}-allowed`}>
            {view.extras.length === 0 ? (
              <p className="af-workspace__note" data-workspace="allowed-empty">
                {T.allowedEmpty}
              </p>
            ) : (
              view.extras.map((row) => (
                <div className="af-workspace__row" key={row.path} data-workspace="extra" data-path={row.path}>
                  <AfSwitch
                    variant="row"
                    label={row.name}
                    description={<code className="af-workspace__path">{row.path}</code>}
                    ariaLabel={row.path}
                    checked={row.on}
                    busy={busy === row.path}
                    unavailableReason={blocked || null}
                    describedBy={blocked ? `${id}-blocked` : undefined}
                    action="workspace-extra"
                    onChange={(next) => toggle(row.path, next)}
                  />
                  {status(row.path)}
                </div>
              ))
            )}
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
          </AfSettingsGroup>

          {automation ? (
            <p className="af-workspace__note" data-workspace="own-hidden">
              {view.own.note}
            </p>
          ) : (
            <AfSettingsGroup variant="flat" title={T.ownTitle} help={view.own.visible ? T.ownHelp : undefined} id={`${id}-own`}>
              {!view.own.visible ? (
                <p className="af-workspace__note" data-workspace="own-hidden">
                  {view.own.note}
                </p>
              ) : (
                <>
                  {view.own.rows.length === 0 ? (
                    <p className="af-workspace__note" data-workspace="own-empty">
                      {T.ownEmpty}
                    </p>
                  ) : (
                    view.own.rows.map((path) => (
                      <div className="af-workspace__row af-workspace__own" key={path} data-workspace="own" data-path={path}>
                        <span className="af-workspace__own-text">
                          <span className="af-workspace__own-name">{workspaceFolderName(path)}</span>
                          <code className="af-workspace__path">{path}</code>
                        </span>
                        <button
                          type="button"
                          className="af-workspace__icon-btn"
                          data-action="workspace-remove-own"
                          aria-label={`${T.remove} ${path}`}
                          data-af-tip={`${T.remove} ${path}`}
                          disabled={Boolean(blocked) || busy !== null}
                          onClick={() => removeOwn(path)}
                        >
                          <Icon name="x" size={16} />
                        </button>
                        {status(`own:${path}`)}
                      </div>
                    ))
                  )}
                  <div className="af-workspace__add" data-workspace="own-add">
                    <input
                      type="text"
                      className="af-workspace__input"
                      aria-label={T.ownTitle}
                      placeholder={T.ownPlaceholder}
                      value={draft}
                      disabled={Boolean(blocked) || busy === "own:add"}
                      spellCheck={false}
                      autoCapitalize="off"
                      autoCorrect="off"
                      onChange={(e) => setDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          void addOwn();
                        } else if (e.key === "Escape") {
                          e.preventDefault();
                          setDraft("");
                          setErrors((x) => {
                            const n = { ...x };
                            delete n["own:add"];
                            return n;
                          });
                        }
                      }}
                    />
                    <button type="button" className="af-workspace__add-btn" data-action="workspace-add-own" disabled={Boolean(blocked) || !draft.trim() || busy !== null} onClick={() => void addOwn()}>
                      {T.add}
                    </button>
                    {status("own:add")}
                  </div>
                </>
              )}
            </AfSettingsGroup>
          )}
        </>
      )}
    </AfSettingsGroup>
  );
}
