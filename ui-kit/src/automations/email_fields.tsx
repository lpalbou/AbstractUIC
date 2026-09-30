// Email pieces of the automation form (framework backlog 0992 WP6): the
// "Email isn't set up — open My email" notice, the "When an email arrives"
// fields (typed filters, check interval, max batch) and the email options
// ("Email me the result", allowed recipients). Controlled and hook-free, so
// AfScheduleDialog, the Edit form and hosts with their own form (the
// Observer's Launch → Automate) render the same fields with the same words
// (EMAIL_TEXT = automation_controls.json → email).
import React from "react";
import type { MyEmailStatus } from "./types.js";
import {
  EMAIL_DEFAULT_MAX_BATCH,
  EMAIL_MAX_BATCH,
  EMAIL_TEXT,
  emailDefaultEvery,
  emailUsable,
  parseDuration,
  type EmailAttachmentFilter,
  type EmailRecipientsForm,
  type EmailTriggerForm,
} from "./panel_core.js";

export type AfEmailSetupNoticeProps = {
  /** `GET /api/gateway/me/email`; null/undefined = unknown, shown as not set up. */
  status: MyEmailStatus | null | undefined;
  /** Opens the gateway console's My email (the host knows where it is). Without it the words are plain text. */
  onOpenMyEmail?: () => void;
};

/** Nothing when email is usable; otherwise "Email isn't set up — open My email" (plus the administrator's cause when email was turned off for the user). */
export function AfEmailSetupNotice(p: AfEmailSetupNoticeProps): React.ReactElement | null {
  if (emailUsable(p.status)) return null;
  const full = EMAIL_TEXT.not_set_up;
  const link = EMAIL_TEXT.open_my_email;
  const lead = full.endsWith(link) ? full.slice(0, full.length - link.length) : `${full} `;
  const cause = p.status && p.status.admin_disabled && typeof p.status.admin_disabled.cause === "string" ? p.status.admin_disabled.cause : "";
  return (
    <p className="af-auto__hint af-email__notice" role="note" data-email-setup="missing">
      {lead}
      {p.onOpenMyEmail ? (
        <button type="button" className="af-auto__linkbtn" data-action="open-my-email" onClick={p.onOpenMyEmail}>
          {link}
        </button>
      ) : (
        link
      )}
      {cause ? <span className="af-email__cause"> ({cause})</span> : null}
    </p>
  );
}

export type AfEmailTriggerFieldsProps = {
  value: EmailTriggerForm;
  onChange(next: EmailTriggerForm): void;
  disabled?: boolean;
  /** Unique id prefix (useId()). */
  idBase: string;
};

type Unit = "m" | "h" | "d";

/** Filters, check interval (default shown: 1 hour for a model, 60 s otherwise; never under 60 s) and max batch. */
export function AfEmailTriggerFields(p: AfEmailTriggerFieldsProps): React.ReactElement {
  const v = p.value;
  const set = (patch: Partial<EmailTriggerForm>) => p.onChange({ ...v, ...patch });
  const id = (s: string) => `${p.idBase}-email-${s}`;
  const fallback = parseDuration(emailDefaultEvery(v.usesModel));
  // "60s" is shown as 1 minute (the form offers minutes, hours and days).
  const shown = v.every ?? (fallback && fallback.unit === "s" ? { amount: Math.max(1, Math.round(fallback.amount / 60)), unit: "m" as Unit } : { amount: fallback ? fallback.amount : 1, unit: (fallback ? fallback.unit : "h") as Unit });
  const dis = p.disabled === true;
  return (
    <div className="af-email__trigger" data-field="email-trigger">
      <div className="af-auto__row">
        <span>{EMAIL_TEXT.every_label}</span>
        <input
          type="number"
          min={1}
          step={1}
          value={String(shown.amount)}
          disabled={dis}
          aria-label="Check interval amount"
          name="email_every_amount"
          onChange={(e) => set({ every: { amount: Number(e.target.value), unit: shown.unit } })}
        />
        <select value={shown.unit} disabled={dis} aria-label="Check interval unit" name="email_every_unit" onChange={(e) => set({ every: { amount: shown.amount, unit: e.target.value as Unit } })}>
          <option value="m">minutes</option>
          <option value="h">hours</option>
          <option value="d">days</option>
        </select>
      </div>
      <p className="af-auto__hint" data-email-rule="interval">
        {EMAIL_TEXT.interval_rule}
      </p>
      <label className="af-auto__field" htmlFor={id("batch")}>
        <span>{EMAIL_TEXT.max_batch_label}</span>
        <input
          id={id("batch")}
          name="email_max_batch"
          type="number"
          min={1}
          max={EMAIL_MAX_BATCH}
          step={1}
          disabled={dis}
          value={String(v.maxBatch ?? EMAIL_DEFAULT_MAX_BATCH)}
          onChange={(e) => set({ maxBatch: e.target.value.trim() === "" ? null : Number(e.target.value) })}
        />
      </label>
      <p className="af-auto__hint">{EMAIL_TEXT.max_batch_hint}</p>
      <fieldset className="af-auto__field af-email__filters" disabled={dis}>
        <legend>{EMAIL_TEXT.filters_legend}</legend>
        <label className="af-auto__field" htmlFor={id("from")}>
          <span>{EMAIL_TEXT.from_in}</span>
          <input id={id("from")} name="email_from_in" value={v.fromIn} spellCheck={false} placeholder="alice@example.com, billing@example.org" onChange={(e) => set({ fromIn: e.target.value })} />
        </label>
        <label className="af-auto__field" htmlFor={id("domain")}>
          <span>{EMAIL_TEXT.from_domain_in}</span>
          <input id={id("domain")} name="email_from_domain_in" value={v.fromDomainIn} spellCheck={false} placeholder="example.com" onChange={(e) => set({ fromDomainIn: e.target.value })} />
        </label>
        <label className="af-auto__field" htmlFor={id("to")}>
          <span>{EMAIL_TEXT.to_in}</span>
          <input id={id("to")} name="email_to_in" value={v.toIn} spellCheck={false} onChange={(e) => set({ toIn: e.target.value })} />
        </label>
        <label className="af-auto__field" htmlFor={id("subject")}>
          <span>{EMAIL_TEXT.subject_contains}</span>
          <input id={id("subject")} name="email_subject_contains" value={v.subjectContains} maxLength={200} onChange={(e) => set({ subjectContains: e.target.value })} />
        </label>
        <label className="af-auto__field" htmlFor={id("attach")}>
          <span>{EMAIL_TEXT.has_attachment}</span>
          <select id={id("attach")} name="email_has_attachment" value={v.hasAttachment} onChange={(e) => set({ hasAttachment: e.target.value as EmailAttachmentFilter })}>
            <option value="any">{EMAIL_TEXT.has_attachment_any}</option>
            <option value="yes">{EMAIL_TEXT.has_attachment_yes}</option>
            <option value="no">{EMAIL_TEXT.has_attachment_no}</option>
          </select>
        </label>
        <p className="af-auto__hint">{EMAIL_TEXT.list_hint}</p>
      </fieldset>
    </div>
  );
}

export type AfEmailOptionsFieldsProps = {
  notifyEmail: boolean;
  onNotifyEmailChange(on: boolean): void;
  recipients: EmailRecipientsForm;
  onRecipientsChange(next: EmailRecipientsForm): void;
  disabled?: boolean;
  idBase: string;
};

/** "Email me the result" and "May send email without asking to: Only me (default) / Me and these addresses". */
export function AfEmailOptionsFields(p: AfEmailOptionsFieldsProps): React.ReactElement {
  const id = (s: string) => `${p.idBase}-email-${s}`;
  const dis = p.disabled === true;
  return (
    <div className="af-email__options" data-field="email-options">
      <label className="af-email__check">
        <input type="checkbox" name="notify_email" checked={p.notifyEmail} disabled={dis} onChange={(e) => p.onNotifyEmailChange(e.target.checked)} /> {EMAIL_TEXT.notify_label}
      </label>
      <p className="af-auto__hint">{EMAIL_TEXT.notify_hint}</p>
      <fieldset className="af-auto__field" disabled={dis} data-field="email-recipients">
        <legend>{EMAIL_TEXT.recipients_legend}</legend>
        <label>
          <input type="radio" name={id("rcpt")} value="self" checked={p.recipients.mode === "self"} onChange={() => p.onRecipientsChange({ ...p.recipients, mode: "self" })} /> {EMAIL_TEXT.recipients_self}
        </label>
        <label>
          <input type="radio" name={id("rcpt")} value="list" checked={p.recipients.mode === "list"} onChange={() => p.onRecipientsChange({ ...p.recipients, mode: "list" })} /> {EMAIL_TEXT.recipients_list}
        </label>
        {p.recipients.mode === "list" ? (
          <textarea
            name="email_recipient_list"
            aria-label={EMAIL_TEXT.recipients_list}
            rows={2}
            spellCheck={false}
            value={p.recipients.addresses}
            placeholder="colleague@example.com"
            onChange={(e) => p.onRecipientsChange({ mode: "list", addresses: e.target.value })}
          />
        ) : null}
        <p className="af-auto__hint">{EMAIL_TEXT.recipients_hint}</p>
      </fieldset>
    </div>
  );
}
