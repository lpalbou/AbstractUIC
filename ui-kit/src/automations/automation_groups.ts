// The automation list's groups (spec A, "hide failed"): the main list, then "Failed · N" and
// "Paused · N", each a fold. Pure: rows in, groups out, in the gateway's order (nothing is sorted or
// decided here). The fold itself is `AutomationGroupFold`; whether it is open is the host's state,
// remembered per app with `readAutomationGroupOpen` / `writeAutomationGroupOpen`.
import { AUTOMATION_EDIT_WORDS } from "./automation_words.js";
import { STATUS_LABELS } from "./panel_core.js";
import type { AutomationsPage, AutomationSummary } from "./types.js";

export type AutomationGroupId = "active" | "failed" | "paused";
/** One group: its rows in the served order and the count its header shows. */
export type AutomationGroup = { rows: AutomationSummary[]; count: number };
export type AutomationGroups = Record<AutomationGroupId, AutomationGroup>;

/** A served count, when it is one (a whole number, at least zero). */
function served(n: unknown): number | null {
  return typeof n === "number" && Number.isSafeInteger(n) && n >= 0 ? n : null;
}

/**
 * The list's groups. A row is in Failed when `section === "failed"` or `status === "failed"`
 * (the automation itself stopped; an active one whose last run failed stays in the main list); in
 * Paused when `section === "paused"` (a gateway that serves no `section` has no Paused group, as
 * before); every other row (archived ones included, when the host shows them) is in `active`, the
 * main list. Failed and Paused count the gateway's `failed_automations_count` /
 * `paused_automations_count` when served, else their rows; a group with no rows counts 0 (its
 * fold is then absent).
 */
export function automationGroups(
  rows: readonly AutomationSummary[],
  page?: Pick<AutomationsPage, "failed_automations_count" | "paused_automations_count"> | null,
): AutomationGroups {
  const active: AutomationSummary[] = [];
  const failed: AutomationSummary[] = [];
  const paused: AutomationSummary[] = [];
  for (const row of rows) {
    if (row.section === "failed" || row.status === "failed") failed.push(row);
    else if (row.section === "paused") paused.push(row);
    else active.push(row);
  }
  const count = (list: AutomationSummary[], n: unknown) => (list.length ? served(n) ?? list.length : 0);
  return {
    active: { rows: active, count: active.length },
    failed: { rows: failed, count: count(failed, page?.failed_automations_count) },
    paused: { rows: paused, count: count(paused, page?.paused_automations_count) },
  };
}

/** A fold's group: the two groups drawn folded under their header. */
export type AutomationFoldGroup = Exclude<AutomationGroupId, "active">;

/** The fold's header: "Failed · 2", "Paused · 3" (`groups.label` of the words file). */
export function automationGroupLabel(group: AutomationFoldGroup, count: number): string {
  const section = group === "failed" ? AUTOMATION_EDIT_WORDS.groups.failed : STATUS_LABELS.paused;
  return AUTOMATION_EDIT_WORDS.groups.label.replace("{section}", section).replace("{count}", String(count));
}

/** Failed opens by default (folding it is the "hide" option); Paused keeps its folded default. */
export const AUTOMATION_GROUP_DEFAULT_OPEN: Readonly<Record<AutomationFoldGroup, boolean>> = { failed: true, paused: false };

type StorageLike = Pick<Storage, "getItem" | "setItem">;

/** The storage key of one app's fold of one group. */
export function automationGroupOpenKey(app: string, group: AutomationFoldGroup): string {
  return `af_automation_group_open:${app}:${group}`;
}

function defaultStorage(): StorageLike | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

/**
 * Whether `app`'s fold of `group` is open: the person's remembered choice, else the group's
 * default (`AUTOMATION_GROUP_DEFAULT_OPEN`). Blocked storage (a private window) reads as the default.
 */
export function readAutomationGroupOpen(app: string, group: AutomationFoldGroup, storage: StorageLike | null = defaultStorage()): boolean {
  try {
    const v = storage?.getItem(automationGroupOpenKey(app, group));
    if (v === "1") return true;
    if (v === "0") return false;
  } catch {
    // blocked storage: the default
  }
  return AUTOMATION_GROUP_DEFAULT_OPEN[group];
}

/** Remembers the person's choice; a storage failure keeps it for this page view only. */
export function writeAutomationGroupOpen(app: string, group: AutomationFoldGroup, open: boolean, storage: StorageLike | null = defaultStorage()): void {
  try {
    storage?.setItem(automationGroupOpenKey(app, group), open ? "1" : "0");
  } catch {
    // blocked or full storage
  }
}
