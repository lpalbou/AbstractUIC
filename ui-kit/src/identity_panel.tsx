/**
 * IdentityPanel: an entity's look and voice, one record changed with one Save (framework ADR 0052:
 * `GET/PUT /entities/{name}/identity`, every change a new revision). Shared by every app that lets
 * someone dress an entity (AbstractEntity's Settings -> Identity first).
 *
 * One flow, top to bottom:
 *   1. Look: the avatar as it will be drawn, its design (the designs the Watch can draw too) and its
 *      colour.
 *   2. Voice: the engine, then a voice the gateway offers for it (choosing one plays a sample when the
 *      host can synthesize one), and "Create a new voice" (from a description or a recording) when
 *      none fits.
 *   3. History of the earlier looks and voices, closed by default.
 *   4. At the bottom: what happened, in plain words, and one Save.
 *
 * The gateway decides: its refusal sentence is shown as it is, never rewritten and never retried
 * (and a Download button when it offers one). A record without a voice is a recorded absence: the
 * gateway's own sentence is shown, never a voice in its place. Everything that talks to the gateway
 * is injected (`client`); the rules are pure functions exported for tests.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityAvatar } from "./activity_avatar.js";
import { AfSelect, type AfSelectOption } from "./af_select.js";
import { avatarDesigns, type AvatarDesign } from "./avatar_renderer.js";
import {
  CreateVoicePanel,
  cloneModelOf,
  useVoiceSample,
  voiceChoicePatch,
  voiceChoices,
  voiceLabel,
  voiceLanguageLabel,
  voiceSampleButton,
  type VoiceCatalog,
  type VoiceCreation,
  type VoicePlayOn,
  type VoicePreferences,
  type VoiceRecordFrom,
} from "./voice_settings.js";

// ------------------------------------------------------------------ the record (ADR 0052)

export type IdentityLook = { style: string; color: string; source?: string; watch_code?: string | null };
export type IdentityVoice = { provider: string; model: string; voice: string; speed?: number | null; quality_preset?: string | null; source?: string };
/** One revision of an identity record as `GET /identity` serves it (`identity`). */
export type IdentityRecord = { rev: number; avatar: IdentityLook; voice: IdentityVoice | null; set_at: string; set_by: string };
/** What Save sends (`PUT /identity`): the whole record. */
export type IdentitySave = {
  avatar: { style: string; color: string };
  voice: { provider: string; model: string; voice: string; speed?: number; quality_preset?: string };
};
/** The download a refusal offers (opaque to the panel; the host starts it). `size_mb` names it. */
export type IdentityDownload = { size_mb?: number | null } & Record<string, unknown>;
/** A refused save: `message` is the gateway's sentence; `download` when it offers one. */
export type IdentityRefusalError = Error & { download?: IdentityDownload | null };

/** The gateway as the panel uses it, injected by the host. */
export type IdentityClient = {
  /** The current record, or revision `rev`. */
  read(rev?: number): Promise<IdentityRecord>;
  /** Save the whole record; resolves with the new record, rejects with the gateway's sentence. */
  save(body: IdentitySave): Promise<IdentityRecord>;
  /** The gateway's voice catalog (`GET voice/voices`), all engines or one engine's (and model's). */
  voiceCatalog(provider?: string, model?: string): Promise<VoiceCatalog>;
  /** Why the record has no voice, in the gateway's words (`GET /entities/{name}/voice` `note`). */
  noVoiceNote?(): Promise<string>;
  /** A short sample in this voice (absent: no play button). */
  previewVoice?(prefs: VoicePreferences, text?: string, opts?: { signal?: AbortSignal }): Promise<ArrayBuffer>;
  /** "Create a new voice" through the gateway's voice library (absent: not offered). */
  createVoice?: VoiceCreation;
  /** Start the download a refusal offered (absent: no Download button). */
  startDownload?(action: IdentityDownload): Promise<unknown>;
  /** The avatar designs (default: the kit's catalog). */
  designs?(): Promise<readonly AvatarDesign[]>;
};

// ------------------------------------------------------------------ the form (pure)

/** What the panel edits: the design, the colour, the voice (provider, model, voice id). */
export type IdentityForm = { style: string; color: string; voice: VoicePreferences };

export function identityFormOf(record: IdentityRecord): IdentityForm {
  const v = record.voice;
  return { style: record.avatar.style, color: record.avatar.color, voice: v ? { provider: v.provider || "", model: v.model || "", voice: v.voice || "" } : {} };
}

/** The voice a form names, or null while it names no engine and voice. */
function chosenVoice(form: IdentityForm): { provider: string; model: string; voice: string } | null {
  const provider = String(form.voice.provider || "").trim();
  const voice = String(form.voice.voice || form.voice.profile || "").trim();
  if (!provider || !voice) return null;
  return { provider, model: String(form.voice.model || "").trim(), voice };
}

/** True when the form differs from the record (Save has something to say). */
export function identityFormChanged(form: IdentityForm, record: IdentityRecord): boolean {
  const v = chosenVoice(form);
  const r = record.voice;
  const sameVoice = v && r ? v.provider === r.provider && v.voice === r.voice && (!v.model || v.model === r.model) : !v && !r;
  return form.style !== record.avatar.style || form.color.toLowerCase() !== record.avatar.color.toLowerCase() || !sameVoice;
}

export type IdentitySaveStep = { body: IdentitySave } | { error: string } | null;

/**
 * What Save sends: the whole record. A voice chosen without its speech model (one voice offered by
 * several models, or a voice just created) takes the model it is bound to (a clone's), else the
 * engine's first listed model (`models`). The record's speed and quality are kept while the voice
 * stays the same. null = no voice chosen yet (an identity always names its voice).
 */
export function identitySaveOf(form: IdentityForm, record: IdentityRecord | null, opts: { models?: readonly string[]; boundModel?: string } = {}): IdentitySaveStep {
  const v = chosenVoice(form);
  if (!v) return null;
  const model = v.model || String(opts.boundModel || "").trim() || String(opts.models?.[0] || "").trim();
  if (!model) return { error: `Not saved: ${v.provider} lists no speech model for this voice.` };
  const voice: IdentitySave["voice"] = { provider: v.provider, model, voice: v.voice };
  const kept = record?.voice;
  if (kept && kept.provider === v.provider && kept.model === model && kept.voice === v.voice) {
    if (kept.speed != null) voice.speed = kept.speed;
    if (kept.quality_preset) voice.quality_preset = kept.quality_preset;
  }
  return { body: { avatar: { style: form.style, color: form.color.toLowerCase() }, voice } };
}

/** The designs an entity may wear: those the Watch can draw too (a `watchCode`), grouped by family.
 * The current design stays listed even when this catalog lacks it. */
export function identityDesignOptions(designs: readonly AvatarDesign[], current: string): AfSelectOption[] {
  const cap = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);
  const out: AfSelectOption[] = designs
    .filter((d) => String(d.watchCode || "").trim())
    .map((d) => ({ value: d.id, label: d.name || d.id, group: cap(d.family || "other") }));
  if (current && !out.some((o) => o.value === current)) out.unshift({ value: current, label: current, group: "Current" });
  return out;
}

/** The engines a catalog offers (`tts_providers`, else `providers`). */
export function identityEngines(catalog: VoiceCatalog | null | undefined): string[] {
  const list: unknown = catalog?.tts_providers || catalog?.providers;
  return Array.isArray(list) ? [...new Set(list.map((p) => String((p as any)?.name ?? p ?? "").trim()).filter(Boolean))] : [];
}

/** An engine's speech models, with a clone checkpoint's role in its label (`{id, label}`). */
export function identityModels(catalog: VoiceCatalog | null | undefined, provider: string): Array<{ id: string; label: string }> {
  const listed: unknown = catalog?.tts_models_by_provider?.[provider] || catalog?.tts_models;
  const details: any[] = [
    ...(Array.isArray(catalog?.tts_model_details_by_provider?.[provider]) ? catalog!.tts_model_details_by_provider[provider] : []),
    ...(Array.isArray(listed) ? listed.filter((d) => d && typeof d === "object") : []),
  ];
  const labelOf = new Map<string, string>();
  for (const d of details) {
    const id = String(d?.id || "").trim();
    if (id && !labelOf.has(id)) labelOf.set(id, String(d.label || (d.role === "cloning" ? `${id} (clones)` : id)));
  }
  const ids = Array.isArray(listed) ? listed.map((m) => String((m as any)?.id ?? m ?? "").trim()).filter(Boolean) : [];
  return [...new Set(ids)].map((id) => ({ id, label: labelOf.get(id) || id }));
}

// ------------------------------------------------------------------ history (pure)

/** The revisions to read, newest first: N ... 1. */
export function identityHistoryRevs(current: number): number[] {
  const out: number[] = [];
  for (let rev = Math.floor(current); rev >= 1; rev--) out.push(rev);
  return out;
}

/** Who set a revision, in plain words: the gateway (the recorded default), the operator, or a name. */
export function identityByWhom(setBy: string): string {
  if (setBy === "default") return "the gateway";
  if (setBy === "operator") return "the operator";
  const i = setBy.indexOf(":");
  return i >= 0 ? setBy.slice(i + 1) : setBy;
}

const sameLook = (a: IdentityRecord, b: IdentityRecord) => a.avatar.style === b.avatar.style && a.avatar.color.toLowerCase() === b.avatar.color.toLowerCase();
const sameVoice = (a: IdentityVoice | null, b: IdentityVoice | null) =>
  !a || !b ? a === b : a.provider === b.provider && a.model === b.model && a.voice === b.voice && (a.speed ?? null) === (b.speed ?? null) && (a.quality_preset ?? null) === (b.quality_preset ?? null);

export type IdentityHistoryRow = { rev: number; at: string; by: string; change: string; record: IdentityRecord };

/** One row per revision, newest first, each saying what changed from the one before. */
export function identityHistoryRows(records: IdentityRecord[]): IdentityHistoryRow[] {
  const byRev = new Map(records.map((r) => [r.rev, r]));
  return [...byRev.values()]
    .sort((a, b) => b.rev - a.rev)
    .map((record) => {
      const before = byRev.get(record.rev - 1);
      let change: string;
      if (!before) change = record.set_by === "default" ? (record.voice ? "Default look and voice" : "Default look, no voice") : "Look and voice chosen";
      else {
        const look = !sameLook(before, record);
        const voice = !sameVoice(before.voice, record.voice);
        change = look && voice ? "New look and voice" : look ? "New look" : voice ? "New voice" : "Saved again, unchanged";
      }
      return { rev: record.rev, at: record.set_at, by: identityByWhom(record.set_by), change, record };
    });
}

export function identityWhenText(iso: string): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return iso;
  return new Date(t).toLocaleString([], { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

/** "nova (openai)": a voice in words, its readable name first. */
export function identityVoiceText(voice: IdentityVoice, catalog?: VoiceCatalog | null): string {
  return `${voiceLabel(voice.voice, catalog || null)} (${voice.provider})`;
}

// ------------------------------------------------------------------ the panel

/** The entity drawn in its look: the kit avatar, its body in the record's colour (the palette reads
 * `--warning` around the canvas; a new colour re-creates the renderer). */
function LookAvatar({ look, size, label }: { look: { style: string; color: string }; size: number; label: string }): React.ReactElement {
  return (
    <span className="af-identity__avatar" style={{ "--warning": look.color } as React.CSSProperties} data-identity-avatar data-style={look.style} data-color={look.color}>
      <ActivityAvatar key={look.color} design={look.style} pose="ready" size={size} active animated label={label} />
    </span>
  );
}

type Status = { text: string; tone: "ok" | "error" | ""; download?: IdentityDownload | null };

export type IdentityPanelProps = {
  /** The entity's name as people read it ("castor"). */
  name: string;
  client: IdentityClient;
  /** Why the viewer may not change it (the gateway's sentence): the panel is read-only and says so. */
  refusal?: string | null;
  onSaved?(record: IdentityRecord): void;
  /** Where samples play and what "Create a new voice" records from. */
  previewOn?: VoicePlayOn;
  recordFrom?: VoiceRecordFrom;
  className?: string;
};

export function IdentityPanel({ name, client, refusal, onSaved, previewOn, recordFrom, className }: IdentityPanelProps): React.ReactElement {
  const clientRef = useRef(client);
  clientRef.current = client;
  const [record, setRecord] = useState<IdentityRecord | null>(null);
  const [form, setForm] = useState<IdentityForm | null>(null);
  const [loadError, setLoadError] = useState("");
  const [noVoice, setNoVoice] = useState("");
  const [designs, setDesigns] = useState<readonly AvatarDesign[]>([]);
  const [designsError, setDesignsError] = useState("");
  const [status, setStatus] = useState<Status | null>(null);
  const [saving, setSaving] = useState(false);
  const [engines, setEngines] = useState<string[] | null>(null);
  const [engineCatalog, setEngineCatalog] = useState<VoiceCatalog | null>(null);
  const [voiceCatalog, setVoiceCatalog] = useState<VoiceCatalog | null>(null);
  const [catalogError, setCatalogError] = useState("");
  const [voicesLoading, setVoicesLoading] = useState(false);
  const [language, setLanguage] = useState("");
  const [creating, setCreating] = useState(false);
  const [reload, setReload] = useState(0);
  const { sample, choose, toggle, reset } = useVoiceSample(client.previewVoice, previewOn);
  const latestForm = useRef(form);
  latestForm.current = form;

  const show = useCallback(
    (next: IdentityRecord) => {
      setRecord(next);
      setForm(identityFormOf(next));
      setNoVoice("");
      if (next.voice === null && clientRef.current.noVoiceNote) {
        clientRef.current
          .noVoiceNote()
          .then((note) => setNoVoice(note || `The gateway did not say why ${name} has no voice.`))
          .catch((e: Error) => setNoVoice(`Why ${name} has no voice could not be read: ${e.message}`));
      }
    },
    [name],
  );

  useEffect(() => {
    let alive = true;
    clientRef.current
      .read()
      .then((r) => alive && show(r))
      .catch((e: Error) => alive && setLoadError(`Could not read ${name}'s look and voice: ${e.message}`));
    (clientRef.current.designs ? clientRef.current.designs() : avatarDesigns())
      .then((list) => alive && setDesigns(list))
      .catch((e: Error) => alive && setDesignsError(`The list of designs could not be loaded: ${e.message}`));
    return () => {
      alive = false;
    };
  }, [name, show]);

  const editable = !refusal && Boolean(form);
  const provider = String(form?.voice.provider || "");
  const model = String(form?.voice.model || "");

  // The engines (once).
  useEffect(() => {
    if (!editable) return;
    let alive = true;
    clientRef.current
      .voiceCatalog()
      .then((c) => {
        if (!alive) return;
        setEngines(identityEngines(c));
        if (c?.error && !identityEngines(c).length) setCatalogError(String(c.error));
      })
      .catch((e: Error) => alive && (setEngines([]), setCatalogError(e.message)));
    return () => {
      alive = false;
    };
  }, [editable]);

  // The engine's models and voices (again after a new voice was created).
  useEffect(() => {
    if (!editable || !provider) {
      setEngineCatalog(null);
      setVoiceCatalog(null);
      return;
    }
    let alive = true;
    setVoicesLoading(true);
    setCatalogError("");
    const read = clientRef.current.voiceCatalog;
    const forEngine = read(provider);
    const forModel = model ? read(provider, model) : forEngine;
    Promise.all([forEngine, forModel])
      .then(([e, m]) => {
        if (!alive) return;
        setEngineCatalog(e);
        setVoiceCatalog(m);
        if (m?.error) setCatalogError(String(m.error));
      })
      .catch((e: Error) => alive && setCatalogError(e.message))
      .finally(() => alive && setVoicesLoading(false));
    return () => {
      alive = false;
    };
  }, [editable, provider, model, reload]);

  useEffect(() => setLanguage(""), [provider]);

  const models = useMemo(() => identityModels(engineCatalog, provider), [engineCatalog, provider]);
  const choices = useMemo(() => voiceChoices(voiceCatalog || {}, form?.voice || {}, language), [voiceCatalog, form?.voice, language]);
  const description = String(choices.selected?.tags?.description || "").trim();
  const boundModel = cloneModelOf(choices.selected);

  const save = async () => {
    if (!form || !record || saving) return;
    const step = identitySaveOf(form, record, { models: models.map((m) => m.id), boundModel });
    if (!step) return;
    if ("error" in step) {
      setStatus({ text: step.error, tone: "error" });
      return;
    }
    setSaving(true);
    setStatus({ text: "Saving…", tone: "" });
    try {
      const saved = await clientRef.current.save(step.body);
      show(saved);
      setStatus({ text: `Saved. ${name} looks and sounds like this for everyone, on every device.`, tone: "ok" });
      onSaved?.(saved);
    } catch (e) {
      // The gateway's sentence as it is; nothing is retried.
      const err = e as IdentityRefusalError;
      setStatus({ text: err.message || String(e), tone: "error", download: err.download || null });
    } finally {
      setSaving(false);
    }
  };

  const download = (action: IdentityDownload) => {
    const start = clientRef.current.startDownload;
    if (!start) return;
    setStatus({ text: "Starting the download…", tone: "" });
    start(action)
      .then(() => setStatus({ text: "Downloading the voice model. Its progress is on the gateway's Models page; save again when it is done.", tone: "" }))
      .catch((e: Error) => setStatus({ text: `The download did not start: ${e.message}`, tone: "error" }));
  };

  const rootClass = `af-identity${className ? ` ${className}` : ""}`;
  if (loadError)
    return (
      <div className={rootClass} data-identity-panel>
        <p className="af-identity__status af-identity__status--error" role="alert" data-identity-load-error>
          {loadError}
        </p>
      </div>
    );
  if (!record || !form)
    return (
      <div className={rootClass} data-identity-panel>
        <p className="af-identity__status" role="status">
          Loading {name}'s look and voice…
        </p>
      </div>
    );

  const designName = designs.find((d) => d.id === form.style)?.name || form.style;
  const step = identitySaveOf(form, record, { models: models.map((m) => m.id), boundModel });
  const changed = identityFormChanged(form, record);
  const setVoice = (patch: Partial<VoicePreferences>) => setForm((f) => (f ? { ...f, voice: { ...f.voice, ...patch } } : f));

  return (
    <div className={rootClass} data-identity-panel>
      <section className="af-identity__card" aria-labelledby="af-identity-look">
        <h3 className="af-identity__title" id="af-identity-look">
          Look
        </h3>
        <div className="af-identity__look">
          <LookAvatar look={{ style: form.style, color: form.color }} size={112} label={`${name}: ${designName}`} />
          <div className="af-identity__fields">
            {editable ? (
              <>
                <label className="af-identity__field">
                  <span>Design</span>
                  <AfSelect ariaLabel="Avatar design" value={form.style} options={identityDesignOptions(designs, form.style)} searchable onChange={(style) => style && setForm((f) => (f ? { ...f, style } : f))} />
                </label>
                <label className="af-identity__field af-identity__field--color">
                  <span>Colour</span>
                  <input type="color" aria-label="Avatar colour" value={form.color} onChange={(e) => {
                      const color = e.target.value.toLowerCase();
                      setForm((f) => (f ? { ...f, color } : f));
                    }} />
                </label>
              </>
            ) : (
              <p className="af-identity__line" data-identity-look-text>
                {designName}
                <span className="af-identity__swatch" style={{ background: form.color }} aria-hidden="true" />
              </p>
            )}
            {designsError ? <p className="af-identity__status af-identity__status--error">{designsError}</p> : null}
          </div>
        </div>
      </section>

      <section className="af-identity__card" aria-labelledby="af-identity-voice">
        <h3 className="af-identity__title" id="af-identity-voice">
          Voice
        </h3>
        {record.voice === null && noVoice ? (
          <p className="af-identity__status af-identity__status--error" role="note" data-identity-no-voice>
            {noVoice}
          </p>
        ) : null}
        {!editable ? (
          <p className="af-identity__line" data-identity-voice-text>
            {record.voice ? `Speaks with ${identityVoiceText(record.voice)}.` : null}
          </p>
        ) : (
          <>
            <label className="af-identity__field">
              <span>Engine</span>
              <AfSelect
                ariaLabel="Voice engine"
                placeholder={engines === null ? "Loading the engines…" : "Choose an engine"}
                value={provider}
                loading={engines === null}
                searchable={false}
                includeValueOption
                options={(engines || []).map((p) => ({ value: p, label: p }))}
                onChange={(next) => {
                  if (next === provider) return;
                  reset();
                  setCreating(false);
                  setVoice({ provider: next, model: "", voice: "", profile: "" });
                }}
              />
            </label>
            {provider && choices.hasLanguageFilter ? (
              <label className="af-identity__field">
                <span>Language</span>
                <AfSelect
                  ariaLabel="Voice language"
                  value={language}
                  searchable={false}
                  options={[{ value: "", label: "Any language" }, ...choices.languages.map((code) => ({ value: code, label: voiceLanguageLabel(code) }))]}
                  onChange={setLanguage}
                />
              </label>
            ) : null}
            {provider ? (
              <label className="af-identity__field">
                <span>Voice</span>
                <span className="af-voice-settings__voice-row">
                  <AfSelect
                    ariaLabel="Voice"
                    placeholder={voicesLoading ? "Loading the voices…" : "Choose a voice"}
                    value={choices.voiceKey}
                    disabled={voicesLoading}
                    options={choices.options}
                    onChange={(key) => {
                      const patch = voiceChoicePatch(key, form.voice);
                      setVoice(patch);
                      // Choosing a voice plays it: hear each voice as you go.
                      choose({ ...form.voice, ...patch });
                    }}
                  />
                  {client.previewVoice ? voiceSampleButton(sample, () => latestForm.current && toggle(latestForm.current.voice), !chosenVoice(form) || (voicesLoading && sample.state === "idle")) : null}
                </span>
              </label>
            ) : null}
            {sample.error ? (
              <p className="af-identity__status af-identity__status--error" role="status">
                {sample.error}
              </p>
            ) : null}
            {description ? <p className="af-identity__hint">{description}</p> : null}
            {boundModel ? <p className="af-identity__hint">A cloned voice: it is always spoken with {boundModel}.</p> : null}
            {provider && models.length > 1 && !boundModel ? (
              <label className="af-identity__field">
                <span>Speech model</span>
                <AfSelect
                  ariaLabel="Speech model"
                  value={model}
                  searchable={false}
                  options={[{ value: "", label: "Automatic" }, ...models.map((m) => ({ value: m.id, label: m.label }))]}
                  onChange={(next) => {
                    reset();
                    setVoice({ model: next });
                  }}
                />
              </label>
            ) : null}
            {catalogError ? (
              <p className="af-identity__status af-identity__status--error" role="alert">
                The voices could not be listed: {catalogError.replace(/\.$/, "")}.
              </p>
            ) : null}
            {!voicesLoading && !catalogError && provider && choices.entries.length === 0 && String(voiceCatalog?.unavailable_reason || "").trim() ? (
              <p className="af-identity__status" role="status">
                {String(voiceCatalog!.unavailable_reason).trim()}
              </p>
            ) : null}
            {client.createVoice && (client.createVoice.design || client.createVoice.clone) ? (
              creating ? (
                <>
                  <CreateVoicePanel
                    creation={client.createVoice}
                    defaultLanguage={language}
                    recordFrom={recordFrom}
                    onCreated={(voiceId, engine) => {
                      // The new voice is selected on its engine; the list is read again.
                      const current = latestForm.current;
                      if (current) setForm({ ...current, voice: { provider: engine || current.voice.provider || "", model: "", voice: voiceId, profile: "" } });
                      setCreating(false);
                      setReload((n) => n + 1);
                      setStatus({ text: "New voice ready and selected. Save to keep it.", tone: "ok" });
                    }}
                  />
                  <button type="button" className="af-setting-btn af-setting-btn--quiet af-identity__create-toggle" data-action="close-create-voice" onClick={() => setCreating(false)}>
                    Close
                  </button>
                </>
              ) : (
                <button type="button" className="af-setting-btn af-identity__create-toggle" data-action="open-create-voice" onClick={() => setCreating(true)}>
                  Create a new voice
                </button>
              )
            ) : null}
          </>
        )}
      </section>

      <IdentityHistory client={client} current={record} designs={designs} />

      {refusal ? (
        <p className="af-identity__status" role="note" data-identity-refusal>
          {refusal}
        </p>
      ) : (
        <div className="af-identity__actions">
          {status ? (
            <p className={`af-identity__status${status.tone ? ` af-identity__status--${status.tone}` : ""}`} role="status" aria-live="polite" data-identity-status>
              {status.text}
            </p>
          ) : !step ? (
            <p className="af-identity__status" data-identity-hint>
              Choose a voice to save.
            </p>
          ) : (
            <p className="af-identity__status" data-identity-scope>
              Saves {name}'s look and voice for everyone who meets it, on every device.
            </p>
          )}
          <div className="af-identity__buttons">
            {status?.download && client.startDownload ? (
              <button type="button" className="af-setting-btn" data-action="identity-download" onClick={() => download(status.download as IdentityDownload)}>
                {status.download.size_mb ? `Download (${status.download.size_mb} MB)` : "Download"}
              </button>
            ) : null}
            <button type="button" className="af-setting-btn af-identity__save" data-action="identity-save" disabled={saving || !step || !changed} onClick={() => void save()}>
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/** Every earlier look and voice, newest first, read when opened. */
function IdentityHistory({ client, current, designs }: { client: IdentityClient; current: IdentityRecord; designs: readonly AvatarDesign[] }): React.ReactElement {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<IdentityHistoryRow[] | null>(null);
  const [error, setError] = useState("");
  const read = useRef(client.read);
  read.current = client.read;
  useEffect(() => {
    if (!open) return;
    let alive = true;
    setRows(null);
    setError("");
    Promise.all(identityHistoryRevs(current.rev).map((rev) => (rev === current.rev ? Promise.resolve(current) : read.current(rev))))
      .then((records) => alive && setRows(identityHistoryRows(records)))
      .catch((e: Error) => alive && setError(`The history could not be read: ${e.message}`));
    return () => {
      alive = false;
    };
  }, [open, current]);
  const designName = (id: string) => designs.find((d) => d.id === id)?.name || id;
  const changes = current.rev;
  return (
    <details className="af-identity__history" onToggle={(e) => setOpen((e.currentTarget as HTMLDetailsElement).open)}>
      <summary>
        History ({changes} {changes === 1 ? "version" : "versions"})
      </summary>
      {error ? <p className="af-identity__status af-identity__status--error">{error}</p> : null}
      {open && !rows && !error ? <p className="af-identity__status">Loading…</p> : null}
      {rows ? (
        <ol className="af-identity__history-list" data-identity-history>
          {rows.map((row) => (
            <li key={row.rev} className="af-identity__history-row" data-rev={row.rev}>
              <span>
                <strong>{row.change}</strong> · {identityWhenText(row.at)} · by {row.by}
              </span>
              <span className="af-identity__history-detail">
                <span className="af-identity__swatch" style={{ background: row.record.avatar.color }} aria-hidden="true" />
                {designName(row.record.avatar.style)}
                {row.record.voice ? ` · ${identityVoiceText(row.record.voice)}` : " · no voice"}
              </span>
            </li>
          ))}
        </ol>
      ) : null}
    </details>
  );
}
