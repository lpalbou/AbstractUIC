// Compact settings rows (ui-kit 0.6.0): the Assistant's Settings layout
// (Card + add_row) for web clients. A group = a titled card; a row = label
// (+ one-line help) on the left, the control on the right; rows wrap to one
// column in a narrow panel. No Save buttons: controls apply on change.
//
// AfOverrideRow is the "Gateway default unless overridden" pattern used by
// every client: the summary names what applies ("Gateway default · x" or the
// override), "Change" reveals the editor in place, "Use gateway default"
// appears only while an override is set.
import React, { useId } from "react";

export type AfSettingsGroupProps = {
  title: string;
  /** One line under the title (what the group is for). */
  help?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  id?: string;
  /** Extra content at the right of the title (e.g. "Revision 4"). */
  aside?: React.ReactNode;
};

export function AfSettingsGroup(p: AfSettingsGroupProps): React.ReactElement {
  const auto = useId();
  const titleId = `${p.id || auto}-title`;
  return (
    <section className={`af-settings-group${p.className ? ` ${p.className}` : ""}`} aria-labelledby={titleId} id={p.id}>
      <div className="af-settings-group__head">
        <h3 className="af-settings-group__title" id={titleId}>
          {p.title}
        </h3>
        {p.aside ? <span className="af-settings-group__aside">{p.aside}</span> : null}
      </div>
      {p.help ? <p className="af-settings-group__help">{p.help}</p> : null}
      <div className="af-settings-group__rows">{p.children}</div>
    </section>
  );
}

export type AfSettingRowProps = {
  label: React.ReactNode;
  /** One line under the label, only where it prevents a mistake. */
  help?: React.ReactNode;
  /** The control (select, switch, summary…). */
  children?: React.ReactNode;
  /** Buttons after the control ("Change", "Test"). */
  trailing?: React.ReactNode;
  /** Label + control stacked (wide editors: pickers, text areas). */
  stack?: boolean;
  /** Id of the control the label names (renders a <label for>). */
  htmlFor?: string;
  className?: string;
  /** Data attribute for tests and styling (`data-setting`). */
  setting?: string;
};

export function AfSettingRow(p: AfSettingRowProps): React.ReactElement {
  const Label = p.htmlFor ? "label" : "span";
  return (
    <div className={`af-setting-row${p.stack ? " af-setting-row--stack" : ""}${p.className ? ` ${p.className}` : ""}`} data-setting={p.setting}>
      <div className="af-setting-row__label">
        <Label className="af-setting-row__name" {...(p.htmlFor ? { htmlFor: p.htmlFor } : {})}>
          {p.label}
        </Label>
        {p.help ? <span className="af-setting-row__help">{p.help}</span> : null}
      </div>
      {p.children !== undefined || p.trailing ? (
        <div className="af-setting-row__control">
          {p.children}
          {p.trailing ? <span className="af-setting-row__trailing">{p.trailing}</span> : null}
        </div>
      ) : null}
    </div>
  );
}

export type AfOverrideRowProps = {
  label: React.ReactNode;
  help?: React.ReactNode;
  /** What "Gateway default" resolves to, when known ("supertonic · F1"). */
  defaultSummary?: string;
  /** The override's summary; "" / undefined = no override (the gateway default applies). */
  overrideSummary?: string;
  /** Whose override it is ("this app", "this conversation", "this automation"). */
  overrideOwner?: string;
  open: boolean;
  onToggle: () => void;
  /** Clear the override. Absent = no reset button. */
  onReset?: () => void;
  disabled?: boolean;
  /** The editor shown under the row while `open`. */
  children?: React.ReactNode;
  setting?: string;
};

/** "Gateway default" summary + Change + (while overridden) Use gateway default. */
export function AfOverrideRow(p: AfOverrideRowProps): React.ReactElement {
  const overridden = Boolean(p.overrideSummary);
  const editorId = useId();
  const summary = overridden
    ? `${p.overrideSummary}${p.overrideOwner ? ` — ${p.overrideOwner}` : ""}`
    : `Gateway default${p.defaultSummary ? ` · ${p.defaultSummary}` : ""}`;
  return (
    <div className="af-override" data-setting={p.setting} data-overridden={overridden ? "true" : "false"}>
      <AfSettingRow
        label={p.label}
        help={p.help}
        trailing={
          <>
            <button type="button" className="af-setting-btn" data-action="change" aria-expanded={p.open} aria-controls={editorId} disabled={p.disabled} onClick={p.onToggle}>
              {p.open ? "Done" : "Change"}
            </button>
            {overridden && p.onReset ? (
              <button type="button" className="af-setting-btn af-setting-btn--quiet" data-action="use-default" disabled={p.disabled} onClick={p.onReset}>
                Use gateway default
              </button>
            ) : null}
          </>
        }
      >
        <span className="af-override__summary" title={summary}>
          {summary}
        </span>
      </AfSettingRow>
      <div className="af-override__editor" id={editorId} hidden={!p.open}>
        {p.open ? p.children : null}
      </div>
    </div>
  );
}
