// WorkspaceChooser (ui-kit 0.8.2, round 11): the ONE workspace chooser, four levels.
//
//   Gateway: Allow everything, refuse listed workspaces (rw) · /secrets (refused)   (not at the gateway level)
//   [Deny everything, allow listed workspaces | Allow everything, refuse listed workspaces]
//   [x] Follow the gateway policy  (account)  /  [x] Use my default  (session, run)
//   ALLOWED WORKSPACES
//   /data/project      [Read & write | Read-only | Refused]  (x)
//   /archive           [Read & write (cap: disabled + tooltip) | Read-only | Refused]  (x)
//   REFUSED WORKSPACES
//   /data/project/tmp  [Read & write | Read-only | Refused]  (x)
//   Everything else    [Read & write | Read-only]            (posture b)
//   [Add a workspace path] [Add] [Choose…]
//   <effective line, verbatim from the gateway>
//
// Levels (`level`): "gateway" (the admin's eligible set; a row's mode IS its
// cap), "account" (an account's default), "session" (one conversation,
// stored on the session by the gateway), "run" (a one-off run: nothing is
// PUT; the host keeps the value and passes the gateway's dry-run answer).
// Every change is ONE call of the host's `save(payload)` (the run level:
// `onChange(value)`); a rejection shows the gateway's sentence + "Not saved."
// under the control and nothing changes. No Save button. When `save`
// resolves with a chooser state (workspaceChooserClient.save does), the
// chooser shows it at once; the host may also pass a new `state`.
// Keyboard: Tab walks the controls (a mode above the cap stays focusable,
// aria-disabled, and its tooltip says why); Enter in the path field adds,
// Escape clears it.
import React, { useState } from "react";
import { AfSwitch } from "./af_switch.js";
import { AfSettingsGroup } from "./af_settings_rows.js";
import { Icon } from "./icon.js";
import { useAfTooltips } from "./af_tooltip.js";
import {
  WORKSPACE_CHOOSER_TEXT as T,
  workspaceAddPayload,
  workspaceChooserView,
  workspaceDefaultModePayload,
  workspaceFollowPayload,
  workspaceLevelHelp,
  workspaceModeLabel,
  workspaceModePayload,
  workspacePostureHelp,
  workspacePostureLabel,
  workspacePosturePayload,
  workspaceRefusal,
  workspaceRemovePayload,
  type WorkspaceAccess,
  type WorkspaceChooserRow,
  type WorkspaceChooserState,
  type WorkspaceEffective,
  type WorkspaceMode,
  type WorkspacePayload,
  type WorkspacePosture,
  type WorkspaceRunValue,
} from "./workspace_chooser_core.js";

type Common = {
  /** A load failure, shown in place of the rows (a sentence). */
  loadError?: string | null;
  /** Why nothing can be changed now (disconnected, run active…); rows stay readable. */
  unavailableReason?: string | null;
  /** Desktop apps: a native picker; resolves with a path (added at once) or null (cancelled). Shows "Choose…". */
  choose?: () => Promise<string | null | undefined>;
  /** Rendered under the effective line (e.g. a link to the account default). */
  footer?: React.ReactNode;
  /** Prefix for element ids (several choosers on one page). */
  idPrefix?: string;
  className?: string;
};

export type WorkspaceChooserStoredProps = Common & {
  level: "gateway" | "account" | "session";
  /** The level's GET answer as workspaceAsState builds it; null while loading. */
  state: WorkspaceChooserState | null;
  /** ONE PUT with this body; reject with Error(<gateway sentence>) on refusal; may resolve with the new state. */
  save: (payload: WorkspacePayload) => Promise<unknown>;
};

export type WorkspaceChooserRunProps = Common & {
  level: "run";
  /** The start body's `workspace`; null = "Use my default". */
  value: WorkspaceRunValue | null;
  /** The gateway's dry-run answer for `value` (POST /workspace/effective/me {workspace}); null while loading. */
  effective: WorkspaceEffective | null;
  /** The next value (null = my default). Reject with Error(<gateway sentence>) to refuse it (e.g. the dry run refused it). */
  onChange: (next: WorkspaceRunValue | null) => Promise<unknown> | void;
};

export type WorkspaceChooserProps = WorkspaceChooserStoredProps | WorkspaceChooserRunProps;

const isState = (v: unknown): v is WorkspaceChooserState => !!v && typeof v === "object" && "policy" in (v as object) && "effective" in (v as object);

/** The run level as a stored-level state (value null = following the account default). */
export function workspaceRunState(value: WorkspaceRunValue | null, effective: WorkspaceEffective | null): WorkspaceChooserState | null {
  if (!effective) return null;
  return {
    policy: value
      ? { configured: true, posture: value.posture, default_mode: value.default_mode, folders: value.folders.map((r) => ({ ...r })) }
      : { configured: false, posture: effective.posture, default_mode: effective.default_mode ?? "rw", folders: [] },
    effective,
  };
}

export function WorkspaceChooser(props: WorkspaceChooserProps): React.ReactElement {
  useAfTooltips();
  const id = props.idPrefix || "af-workspace";
  const [busy, setBusy] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [adopted, setAdopted] = useState<{ base: unknown; value: WorkspaceChooserState } | null>(null);
  const blocked = String(props.unavailableReason || "").trim();
  const level = props.level;

  const base: WorkspaceChooserState | null = props.level === "run" ? workspaceRunState(props.value, props.effective) : props.state;
  const baseKey: unknown = props.level === "run" ? props.effective : props.state;
  const state = adopted && adopted.base === baseKey ? adopted.value : base;
  const view = state ? workspaceChooserView(level, state) : null;

  const send = (payload: WorkspacePayload): Promise<unknown> => {
    if (props.level === "run") {
      const p = props;
      const next: WorkspaceRunValue | null = payload.configured === false ? null : { posture: payload.posture, default_mode: payload.default_mode, folders: payload.folders };
      return Promise.resolve(p.onChange(next));
    }
    return props.save(payload);
  };

  async function change(key: string, payload: WorkspacePayload): Promise<boolean> {
    if (busy !== null || blocked) return false;
    setBusy(key);
    setSaved(null);
    setErrors((e) => {
      const n = { ...e };
      delete n[key];
      return n;
    });
    try {
      const out = await send(payload);
      if (isState(out)) setAdopted({ base: baseKey, value: out });
      setSaved(key);
      return true;
    } catch (error) {
      setErrors((e) => ({ ...e, [key]: workspaceRefusal(error) }));
      return false;
    } finally {
      setBusy(null);
    }
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

  const tag = (mode: WorkspaceMode, tip?: string) => (
    <span className="af-workspace__access-tag" data-workspace="access" data-access={mode} data-af-tip={tip} tabIndex={tip ? 0 : undefined}>
      {workspaceModeLabel(mode)}
    </span>
  );

  // A segmented control: an option the gateway does not allow here stays visible and
  // focusable, aria-disabled, with the kit tooltip saying why.
  const segmented = <M extends string>(
    label: string,
    current: M,
    options: { value: M; text: string; reason?: string }[],
    onPick: (m: M) => void,
    attr: string,
  ) => (
    <span className="af-workspace__access" role="group" aria-label={label} data-workspace={attr} data-access={current}>
      {options.map((o) => {
        const unavailable = Boolean(o.reason) || Boolean(blocked);
        return (
          <button
            key={o.value}
            type="button"
            className="af-workspace__access-btn"
            aria-pressed={current === o.value ? "true" : "false"}
            aria-disabled={unavailable ? "true" : undefined}
            data-af-tip={o.reason || undefined}
            data-action={`${attr}-${o.value}`}
            onClick={() => (unavailable || busy !== null || o.value === current ? undefined : onPick(o.value))}
          >
            {o.text}
          </button>
        );
      })}
    </span>
  );

  const rowControls = (row: WorkspaceChooserRow) => {
    if (row.builtin) return tag("deny", T.builtinRefused);
    if (!row.editable || !state) return tag(row.mode);
    const policy = state.policy;
    return (
      <>
        {segmented(
          `${T.accessLabel} ${row.path}`,
          row.mode,
          (["rw", "ro", "deny"] as WorkspaceMode[]).map((m) => ({ value: m, text: workspaceModeLabel(m), reason: row.reasons[m] })),
          (m) => void change(row.path, workspaceModePayload(level, policy, row.path, m)),
          "workspace-mode",
        )}
        <button
          type="button"
          className="af-workspace__icon-btn"
          data-action="workspace-remove"
          aria-label={`${T.remove} ${row.path}`}
          data-af-tip={`${T.remove} ${row.path}`}
          aria-disabled={blocked || busy !== null ? "true" : undefined}
          onClick={() => (blocked || busy !== null ? undefined : void change(row.path, workspaceRemovePayload(level, policy, row.path)))}
        >
          <Icon name="x" size={16} />
        </button>
      </>
    );
  };

  async function addPath(raw: string) {
    if (!state || !view || !view.canAdd) return;
    const path = raw.trim();
    if (!path) return;
    if (await change("add", workspaceAddPayload(level, state.policy, path))) setDraft("");
  }

  async function choosePath() {
    if (!props.choose || busy !== null || blocked) return;
    let picked: string | null | undefined;
    try {
      picked = await props.choose();
    } catch (error) {
      setErrors((e) => ({ ...e, add: workspaceRefusal(error) }));
      return;
    }
    if (picked) await addPath(picked);
  }

  const allowed = view ? view.rows.filter((r) => r.mode !== "deny") : [];
  const refused = view ? view.rows.filter((r) => r.mode === "deny") : [];
  const rowItem = (row: WorkspaceChooserRow) => (
    <li
      className="af-workspace__row"
      key={`${row.builtin ? "builtin:" : ""}${row.path}`}
      data-workspace={row.builtin ? "builtin" : "row"}
      data-path={row.path}
      data-mode={row.mode}
      data-cap={row.cap ?? undefined}
    >
      <code className="af-workspace__path">{row.path}</code>
      <span className="af-workspace__controls">{rowControls(row)}</span>
      {status(row.path)}
    </li>
  );

  const followLabel = level === "account" ? T.followGateway : T.useDefault;
  const followHelp = level === "account" ? T.followGatewayHelp : T.useDefaultHelp;

  return (
    <AfSettingsGroup
      id={id}
      className={`af-workspace af-workspace--${level}${props.className ? ` ${props.className}` : ""}`}
      title={level === "gateway" ? T.gatewayTitle : T.title}
      help={workspaceLevelHelp(level)}
    >
      {props.loadError ? (
        <p className="af-workspace__refusal" role="alert" data-workspace="load-error">
          {props.loadError}
        </p>
      ) : !view || !state ? (
        <p className="af-workspace__note" data-workspace="loading">
          {T.loading}
        </p>
      ) : (
        <div className="af-workspace__body" data-level={level} data-following={view.following ? "true" : "false"}>
          {view.gatewayLine ? (
            <p className="af-workspace__gateway" data-workspace="gateway-line">
              {view.gatewayLine}
            </p>
          ) : null}
          {blocked ? (
            <p className="af-workspace__note" id={`${id}-blocked`} data-workspace="blocked">
              {blocked}
            </p>
          ) : null}
          {level !== "gateway" ? (
            <div className="af-workspace__follow" data-workspace="follow">
              <AfSwitch
                variant="row"
                label={followLabel}
                description={followHelp}
                checked={view.following}
                busy={busy === "follow"}
                unavailableReason={blocked || (view.locked ? T.locked : null)}
                reasonVisible={false}
                describedBy={blocked ? `${id}-blocked` : undefined}
                action={level === "account" ? "workspace-follow-gateway" : "workspace-use-default"}
                onChange={(next) => void change("follow", workspaceFollowPayload(state, next))}
              />
              {status("follow")}
            </div>
          ) : null}
          <div className="af-workspace__posture" data-workspace="posture" data-posture={view.posture}>
            {view.following || view.locked ? (
              <span className="af-workspace__badge">{workspacePostureLabel(view.posture)}</span>
            ) : (
              segmented<WorkspacePosture>(
                T.postureLabel,
                view.posture,
                [
                  { value: "allowed_only", text: T.postureAllowedOnly },
                  { value: "any_except_denied", text: T.postureAnyExceptDenied },
                ],
                (p) => void change("posture", workspacePosturePayload(level, state.policy, p)),
                "workspace-posture",
              )
            )}
            <span className="af-workspace__note" data-workspace="posture-help">
              {workspacePostureHelp(view.posture)}
            </span>
            {status("posture")}
          </div>
          <ul className="af-workspace__list" aria-label={T.title} data-workspace="list">
            {allowed.length ? (
              <li className="af-workspace__caption" data-workspace="caption-allowed">
                {T.allowedTitle}
              </li>
            ) : null}
            {allowed.map(rowItem)}
            {refused.length ? (
              <li className="af-workspace__caption" data-workspace="caption-refused">
                {T.deniedTitle}
              </li>
            ) : null}
            {refused.map(rowItem)}
            {view.everythingElse ? (
              <li className="af-workspace__row" data-workspace="everything-else" data-mode={view.everythingElse.mode}>
                <span className="af-workspace__name">{T.everythingElse}</span>
                <span className="af-workspace__controls">
                  {view.everythingElse.editable
                    ? segmented<WorkspaceAccess>(
                        `${T.accessLabel} ${T.everythingElse}`,
                        view.everythingElse.mode,
                        [
                          { value: "rw", text: T.accessReadWrite },
                          { value: "ro", text: T.accessRead },
                        ],
                        (m) => void change("everything-else", workspaceDefaultModePayload(level, state.policy, m)),
                        "workspace-default",
                      )
                    : tag(view.everythingElse.mode)}
                </span>
                {status("everything-else")}
              </li>
            ) : null}
            {view.canAdd ? (
              <li className="af-workspace__add" data-workspace="add">
                <input
                  type="text"
                  className="af-workspace__input"
                  aria-label={T.addPlaceholder}
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
                      void addPath(draft);
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
                <button type="button" className="af-workspace__add-btn" data-action="workspace-add" disabled={Boolean(blocked) || !draft.trim() || busy !== null} onClick={() => void addPath(draft)}>
                  {T.add}
                </button>
                {props.choose ? (
                  <button type="button" className="af-workspace__add-btn" data-action="workspace-choose" disabled={Boolean(blocked) || busy !== null} onClick={() => void choosePath()}>
                    {T.choose}
                  </button>
                ) : null}
                {status("add")}
              </li>
            ) : null}
          </ul>
          {view.posture === "allowed_only" && !allowed.length ? (
            <p className="af-workspace__note" data-workspace="empty">
              {T.emptyAllowed}
            </p>
          ) : null}
          {level === "session" || level === "run" ? (
            <p className="af-workspace__note" data-workspace="private">
              {T.privateNote}
            </p>
          ) : null}
          <p className="af-workspace__effective" data-workspace="effective">
            {view.summary}
          </p>
          {props.footer ? <div className="af-workspace__footer">{props.footer}</div> : null}
        </div>
      )}
    </AfSettingsGroup>
  );
}
