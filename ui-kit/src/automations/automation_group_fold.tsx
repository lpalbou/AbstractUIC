// One fold of the automation list ("Failed · 2", "Paused · 3"): a header button and, while open,
// the host's rows. Controlled: the host holds `open` (remembered per app with
// `readAutomationGroupOpen` / `writeAutomationGroupOpen`) and draws the rows as its own list.
import React, { useId } from "react";
import { Icon } from "../icon.js";
import { AfFoldToggle } from "../af_fold_toggle.js";
import { automationGroupLabel, type AutomationFoldGroup } from "./automation_groups.js";

export type AutomationGroupFoldProps = {
  group: AutomationFoldGroup;
  /** The group's `count` (`automationGroups`): at zero the fold is absent. */
  count: number;
  open: boolean;
  /** Asked with the new state when the header is pressed. */
  onToggle(open: boolean): void;
  /** The group's rows, drawn by the host (shown only while open). */
  children?: React.ReactNode;
  className?: string;
};

export function AutomationGroupFold(p: AutomationGroupFoldProps): React.ReactElement | null {
  const bodyId = useId();
  if (!(p.count > 0)) return null;
  return (
    <section className={`af-auto-group${p.className ? ` ${p.className}` : ""}`} data-section={p.group} data-open={p.open ? "true" : "false"}>
      <AfFoldToggle
        className="af-auto-group__toggle"
        chevronClassName="af-auto-group__chevron"
        action={`fold-${p.group}`}
        open={p.open}
        controls={bodyId}
        onToggle={() => p.onToggle(!p.open)}
        icon={<Icon name={p.group === "failed" ? "error" : "pause"} size={14} className="af-auto-group__icon" />}
      >
        <span className="af-auto-group__label">{automationGroupLabel(p.group, p.count)}</span>
      </AfFoldToggle>
      {p.open ? (
        <div className="af-auto-group__body" id={bodyId}>
          {p.children}
        </div>
      ) : null}
    </section>
  );
}
