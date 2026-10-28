import React, { useEffect, useRef, useState } from "react";
import { AfSelect } from "./af_select.js";
import { ProviderModelPicker } from "./provider_model_picker.js";
import { SILENT_LEVEL, microphoneErrorSentence, playOnDevice, recordSample } from "./voice_devices.js";

export type VoicePreferences = {
  provider?: string;
  model?: string;
  voice?: string;
  profile?: string;
  speed?: number;
  quality_preset?: string;
  instructions?: string;
};
export type VoiceCatalog = Record<string, any>;

/**
 * Creating a voice through the gateway's voice library (AbstractGateway 0.16.0):
 * `design` = `POST voice/design` (a voice from a written description), `clone` =
 * `POST voice/clones` (a voice from a recording). Both answer the stored record with
 * its `voice_id`. Injected by the host; absent = no "Create a voice" panel.
 */
export type VoiceCreation = {
  design?: (request: { description: string; name?: string; language?: string }) => Promise<{ voice_id: string; name?: string; engine?: string }>;
  /**
   * `POST voice/clones` (multipart). `provider` / `model` name the cloning engine (the gateway
   * accepts both, routes/voice_library.py:146-147); absent = the gateway's default cloning engine.
   */
  clone?: (
    file: Blob,
    request: { name?: string; language?: string; reference_text?: string; provider?: string; model?: string },
  ) => Promise<{ voice_id: string; name?: string; engine?: string }>;
};

/**
 * One voice of the gateway's voice library: an item of `GET voice/clones` → `voices`
 * (routes/voice_library.py:121-130; the catalog's voice item: `id`/`voice_id`, `name`/`label`,
 * `provider`/`engine`, `kind: "clone"`, `tags.builtin`, `tags.designed`, `params.meta.scope`).
 */
export type VoiceRecord = {
  voice_id?: string;
  id?: string;
  name?: string;
  label?: string;
  engine?: string;
  provider?: string;
  language?: string;
  kind?: string;
  voice_kind?: string;
  tags?: Record<string, any>;
  params?: Record<string, any>;
  meta?: Record<string, any>;
};

/**
 * The gateway's voice library, injected by the host (ui-primitives 0035): creation
 * (`VoiceCreation`) plus management. Every function is optional; what is absent is not offered.
 * - `list` = `GET voice/clones` (routes/voice_library.py:121-130); the answer `{voices, count}`
 *   or its `voices` array.
 * - `rename` = `PATCH voice/clones/{voice_id}` `{name?, reference_text?}` (:173-178).
 * - `remove` = `DELETE voice/clones/{voice_id}` (:181-186; built-in voices answer 422).
 * - `share` = `POST voice/clones/{voice_id}/deploy` (:203-218; administrators only: inject it
 *   only for an administrator).
 * A refusal (403 shared store, 422 read-only voice) is shown as the gateway's sentence.
 */
export type VoiceLibrary = VoiceCreation & {
  list?: () => Promise<VoiceRecord[] | { voices?: VoiceRecord[] }>;
  rename?: (voiceId: string, patch: { name?: string; reference_text?: string }) => Promise<unknown>;
  remove?: (voiceId: string) => Promise<unknown>;
  share?: (voiceId: string) => Promise<unknown>;
};

/** Where a recording comes from (the chosen microphone and its input level). */
export type VoiceRecordFrom = { deviceId?: string; gain?: number };
/** Where a sample plays (the chosen speaker and the reply volume). */
export type VoicePlayOn = { deviceId?: string; volume?: number };

const GROUP_ORDER = ["Your voices", "Engine voices", "Shared voices"];

/**
 * Which group a catalog voice belongs to: the user's own, the engine's, or the shared library
 * (the built-in voices and the voices the administrator shares). A clone is recognised by its
 * record's `kind` as well as `voice_kind`: the gateway's catalog merge sets `voice_kind: "voice"`
 * on a clone an engine also lists among its voices.
 */
export function voiceGroup(item: any): string {
  const tags = (item && item.tags) || {};
  const scope = item?.params?.meta?.scope;
  if (tags.builtin) return "Shared voices";
  if (item?.kind === "clone" || item?.voice_kind === "clone") return scope === "library" ? "Shared voices" : "Your voices";
  return "Engine voices";
}

/** The languages a catalog voice speaks natively (its `language`, else nothing). */
export function voiceLanguage(item: any): string {
  return String(item?.language || item?.tags?.language_code || "").trim().toLowerCase();
}

/** The language codes of a catalog, for the language filter. */
export function voiceLanguages(entries: any[]): string[] {
  return Array.from(new Set(entries.map(voiceLanguage).filter(Boolean))).sort();
}

/**
 * A voice speaks `language` when it is its native language or one it lists. A voice with neither
 * (no native language, `languages` empty or absent) is unrestricted — AbstractVoice's
 * `languages: []` on remote/OpenAI voices — and speaks every language.
 */
export function voiceSpeaks(item: any, language: string): boolean {
  if (!language) return true;
  const native = voiceLanguage(item);
  if (native === language) return true;
  const langs = Array.isArray(item?.languages) ? item.languages.map((l: any) => String(l).toLowerCase()) : [];
  if (!native && langs.length === 0) return true;
  return langs.includes(language);
}

/**
 * The kit's ONE table of language names (ISO 639-1 → English name): the voice filter, "Create a
 * voice" and the section's Spoken language all read it. The languages an engine accepts come from
 * the gateway (`GET voice/languages`); this table only names them.
 */
export const VOICE_LANGUAGE_LABELS: Readonly<Record<string, string>> = {
  en: "English", fr: "French", de: "German", es: "Spanish", it: "Italian", pt: "Portuguese", ru: "Russian",
  zh: "Chinese", ja: "Japanese", ko: "Korean", nl: "Dutch", pl: "Polish", tr: "Turkish", ar: "Arabic", hi: "Hindi",
};
const LANGUAGE_LABELS = VOICE_LANGUAGE_LABELS;
export const voiceLanguageLabel = (code: string): string => LANGUAGE_LABELS[code] || code;

/**
 * The language codes of a `GET voice/languages` answer (routes/voice_library.py:109-118:
 * `{languages: {kind: {provider: {provider, languages, open, declared}}}}`) for one kind: the
 * named provider's, else every provider's (sorted, deduplicated). An open engine (a remote one
 * that decides its own languages) lists none.
 */
export function voiceLanguagesFromAnswer(answer: any, kind: "tts" | "stt" | "cloning", provider?: string): string[] {
  const byProvider = answer?.languages?.[kind];
  if (!byProvider || typeof byProvider !== "object") return [];
  const entries: any[] = provider ? [byProvider[provider]].filter(Boolean) : Object.values(byProvider);
  const codes = entries.flatMap((e) => (Array.isArray(e?.languages) ? e.languages : [])).map((c: any) => String(c).trim().toLowerCase());
  return Array.from(new Set(codes.filter(Boolean))).sort();
}

/** A library record's id (`voice_id`, else the catalog's `id`). */
export const voiceRecordId = (r: VoiceRecord): string => String(r?.voice_id || r?.id || "");
const names = (value: unknown): string[] =>
  Array.isArray(value)
    ? value
        .map((item) =>
          typeof item === "string" ? item : item?.id || item?.name,
        )
        .filter(Boolean)
    : [];

/**
 * How long a voice choice waits before its sample is synthesized: going through several voices
 * quickly starts one synthesis (for the voice the user stops on), not one per voice — a gateway
 * cannot cancel a synthesis it has started, so each one would run to the end on the engine.
 */
export const VOICE_SAMPLE_DEBOUNCE_MS = 200;

/** Gateway-catalog driven and transport injected, usable in any chat host. */
export function VoiceSettings({
  value,
  onChange,
  fetchCatalog,
  intro,
  delivery = true,
  quality = true,
  showReset = true,
  defaultHint,
  voiceDefaultLabel,
  createVoice,
  voiceLibrary,
  previewVoice,
  previewOn,
  recordFrom,
}: {
  value: VoicePreferences;
  onChange: (value: VoicePreferences) => void;
  fetchCatalog: (provider?: string, model?: string) => Promise<VoiceCatalog>;
  /** The paragraph above the picker; null hides it (default: the Gateway sentence). */
  intro?: React.ReactNode | null;
  /** Speed / quality / delivery-instruction controls (default true). */
  delivery?: boolean;
  /** The Quality select inside the delivery controls (default true; false when the host shows its own latency row). */
  quality?: boolean;
  /** The "Reset to Gateway defaults" button (default true). */
  showReset?: boolean;
  /** Names what "Gateway default" resolves to, e.g. "Gateway default: supertonic · F1." */
  defaultHint?: string;
  /** The voice select's unset choice (default "Gateway / provider default"). */
  voiceDefaultLabel?: string;
  /** Voice creation through the gateway (a description, a recording); absent = no "Create a voice" panel. Alias of `voiceLibrary`'s creation. */
  createVoice?: VoiceCreation;
  /**
   * The gateway's voice library (creation + `list` / `rename` / `remove` / `share`). Supersedes
   * `createVoice` (which stays as an alias); with `list`, a "Manage voices" panel lists the voices.
   */
  voiceLibrary?: VoiceLibrary;
  /**
   * Synthesize a short sample with these preferences (host-injected: every gateway TTS route needs
   * a run or an entity, routes/gateway.py:12753, so the host chooses the owner). Present = choosing
   * a voice plays it at once, and a play/stop toggle sits at the right of the voice select (play
   * restarts from 0, stop stops and rewinds). A newer choice aborts the older sample through
   * `opts.signal` (pass it to the request), so fast choices never queue audio. `text` absent = the
   * host's own sample sentence.
   */
  previewVoice?: (prefs: VoicePreferences, text?: string, opts?: { signal?: AbortSignal }) => Promise<ArrayBuffer>;
  /** The speaker and volume a sample plays on (default: the system output at full volume). */
  previewOn?: VoicePlayOn;
  /** The microphone "Create a voice" records from (default: the system microphone). */
  recordFrom?: VoiceRecordFrom;
}): React.ReactElement {
  const creation: VoiceCreation | undefined = voiceLibrary || createVoice;
  // The voice sample: one at a time. `run` numbers the current sample (a newer one, a stop or an
  // unmount moves it on, so a late answer is dropped unplayed); `synth` / `play` abort the request
  // and the playback; `cache` keeps the last sample's bytes so play replays without a request.
  const [sample, setSample] = useState<{ state: "idle" | "loading" | "playing"; error: string }>({ state: "idle", error: "" });
  const run = useRef(0);
  const synth = useRef<AbortController | null>(null);
  const play = useRef<AbortController | null>(null);
  const cache = useRef<{ key: string; bytes: ArrayBuffer } | null>(null);
  const pending = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fetcher = useRef(fetchCatalog);
  fetcher.current = fetchCatalog;
  const [catalog, setCatalog] = useState<VoiceCatalog>({});
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [language, setLanguage] = useState("");
  const [refresh, setRefresh] = useState(0);
  // The latest preferences, for callbacks that outlive the render they were created in (a voice
  // created while the user kept changing settings merges into what is current, not what was).
  const latest = useRef(value);
  latest.current = value;
  const mounted = useRef(true);
  const stopSample = () => {
    run.current += 1;
    if (pending.current !== null) clearTimeout(pending.current);
    pending.current = null;
    synth.current?.abort();
    synth.current = null;
    play.current?.abort();
    play.current = null;
  };
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      stopSample();
    };
  }, []);
  const sampleKey = (prefs: VoicePreferences) => JSON.stringify([prefs.provider || "", prefs.model || "", prefs.voice || "", prefs.profile || ""]);
  const failed = (err: any) => `The sample did not play: ${String(err?.message || err).replace(/\.$/, "")}.`;
  // Plays from 0 (a fresh source each time); ends idle unless a newer sample took over.
  const playBytes = (bytes: ArrayBuffer, id: number) => {
    const ctl = new AbortController();
    play.current = ctl;
    setSample({ state: "playing", error: "" });
    void playOnDevice(bytes, { deviceId: previewOn?.deviceId || "", volume: previewOn?.volume, signal: ctl.signal })
      .then(() => mounted.current && run.current === id && setSample({ state: "idle", error: "" }))
      .catch((err) => mounted.current && run.current === id && setSample({ state: "idle", error: failed(err) }));
  };
  const startSample = (prefs: VoicePreferences) => {
    if (!previewVoice) return;
    stopSample();
    const id = run.current;
    const ctl = new AbortController();
    synth.current = ctl;
    setSample({ state: "loading", error: "" });
    void previewVoice(prefs, undefined, { signal: ctl.signal })
      .then((bytes) => {
        if (!mounted.current || run.current !== id) return;
        synth.current = null;
        cache.current = { key: sampleKey(prefs), bytes };
        playBytes(bytes, id);
      })
      .catch((err) => {
        if (!mounted.current || run.current !== id) return; // moved past: its failure is not news
        synth.current = null;
        setSample({ state: "idle", error: failed(err) });
      });
  };
  // A voice choice: the cached sample at once, else a sample after the debounce (busy meanwhile).
  const chooseSample = (prefs: VoicePreferences) => {
    if (!previewVoice) return;
    stopSample();
    const id = run.current;
    if (cache.current && cache.current.key === sampleKey(prefs)) {
      playBytes(cache.current.bytes, id);
      return;
    }
    setSample({ state: "loading", error: "" });
    pending.current = setTimeout(() => {
      pending.current = null;
      if (mounted.current && run.current === id) startSample(prefs);
    }, VOICE_SAMPLE_DEBOUNCE_MS);
  };
  // The toggle: stop (or cancel a sample on its way), else play the current voice from 0.
  const toggleSample = () => {
    if (sample.state !== "idle") {
      stopSample();
      setSample({ state: "idle", error: "" });
      return;
    }
    const current = latest.current;
    if (cache.current && cache.current.key === sampleKey(current)) {
      stopSample();
      playBytes(cache.current.bytes, run.current);
      return;
    }
    startSample(current);
  };
  // Another engine lists other voices: the language filter starts over.
  useEffect(() => {
    setLanguage("");
  }, [value.provider]);
  useEffect(() => {
    let alive = true;
    setLoading(true);
    setCatalog({});
    setError("");
    void fetcher
      .current(value.provider, value.model)
      .then((next) => {
        if (!alive) return;
        setCatalog(next);
        setError(next.error ? String(next.error) : "");
      })
      .catch((err) => {
        if (alive) setError(String(err?.message || err));
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [value.provider, value.model, refresh]);
  const entries: any[] = Array.isArray(catalog.items)
    ? catalog.items
    : [
        ...(Array.isArray(catalog.profiles)
          ? catalog.profiles.map((item: any) => ({
              ...item,
              voice_kind: "profile",
            }))
          : []),
        ...(Array.isArray(catalog.voices)
          ? catalog.voices.map((item: any) => ({
              ...item,
              voice_kind: "voice",
            }))
          : []),
      ];
  const itemKey = (item: any) =>
    JSON.stringify([
      item.provider || "",
      item.model || "",
      item.voice_kind === "profile" ? "profile" : "voice",
      item.id,
    ]);
  const onRoute = (item: any) =>
    (!value.provider || !item.provider || item.provider === value.provider) &&
    (!value.model || !item.model || item.model === value.model);
  // One voice served by several models of an engine (Qwen3-TTS lists each preset voice under
  // each of its models) is ONE choice: listed once. With a model chosen it is that model's
  // entry; without one it carries no model, so choosing it keeps the gateway's default model.
  const voiceSig = (item: any) => JSON.stringify([item.provider || "", item.voice_kind === "profile" ? "profile" : "voice", item.id]);
  const modelsOf = new Map<string, Set<string>>();
  for (const item of entries) {
    if (!item?.id) continue;
    const sig = voiceSig(item);
    if (!modelsOf.has(sig)) modelsOf.set(sig, new Set());
    modelsOf.get(sig)!.add(String(item.model || ""));
  }
  const multiModel = (item: any) => (modelsOf.get(voiceSig(item))?.size || 0) > 1;
  const optionKey = (item: any) =>
    multiModel(item) && !value.model
      ? JSON.stringify([item.provider || "", "", item.voice_kind === "profile" ? "profile" : "voice", item.id])
      : itemKey(item);
  // A host that stores one id for both kinds (a capability route's `options.voice`, an entity's
  // voice) names a profile as `voice`: it is still that profile, not an unknown saved id.
  const selected =
    entries.find(
      (item) =>
        item.id === (value.profile || value.voice) &&
        (item.voice_kind === "profile") === Boolean(value.profile) &&
        onRoute(item),
    ) ||
    (!value.profile && value.voice
      ? entries.find((item) => item.id === value.voice && item.voice_kind === "profile" && onRoute(item))
      : undefined);
  const voiceKey = selected
    ? optionKey(selected)
    : value.profile || value.voice
      ? JSON.stringify([
          value.provider || "",
          value.model || "",
          value.profile ? "profile" : "voice",
          value.profile || value.voice,
        ])
      : "";
  const languages = voiceLanguages(entries);
  // The filter shows only with two languages or more; hidden, it must not keep filtering.
  const hasLanguageFilter = languages.length > 1;
  // While the catalog reloads (a model change, a created voice) the list is briefly empty: that is
  // not "one language left", so the filter is kept; it resets only once a loaded catalog has none.
  useEffect(() => {
    if (!hasLanguageFilter && !loading) setLanguage("");
  }, [hasLanguageFilter, loading]);
  const activeLanguage = hasLanguageFilter ? language : "";
  const listed = new Set<string>();
  const options = entries
    .filter(
      (item) =>
        item?.id &&
        (!value.provider || !item.provider || item.provider === value.provider) &&
        // a voice of several models: the chosen model's entry only (any one without a model)
        (!multiModel(item) || !value.model || item.model === value.model || !modelsOf.get(voiceSig(item))!.has(value.model)) &&
        (voiceSpeaks(item, activeLanguage) || optionKey(item) === voiceKey),
    )
    .filter((item) => {
      const key = optionKey(item);
      if (listed.has(key)) return false;
      listed.add(key);
      return true;
    })
    .map((item) => {
      const lang = voiceLanguage(item);
      return {
        value: optionKey(item),
        group: voiceGroup(item),
        label: `${item.label || item.name || item.id}${lang ? ` · ${voiceLanguageLabel(lang)}` : ""}${!value.provider && item.provider ? ` · ${item.provider}` : ""}`,
      };
    })
    .sort((a, b) => GROUP_ORDER.indexOf(a.group) - GROUP_ORDER.indexOf(b.group));
  const selectedDescription = String(selected?.tags?.description || "").trim();
  if (voiceKey && !options.some((item) => item.value === voiceKey))
    options.unshift({
      value: voiceKey,
      group: "",
      label: `${value.profile || value.voice} (saved)`,
    });
  const update = (patch: Partial<VoicePreferences>) =>
    onChange({ ...value, ...patch });
  return (
    <div className="af-voice-settings">
      {intro === undefined ? (
        <p>
          Speech is generated by your authenticated Gateway. Leave routing and
          voice unset to use its defaults.
        </p>
      ) : intro}
      <ProviderModelPicker
        defaultHint={defaultHint}
        value={{ provider: value.provider || "", model: value.model || "" }}
        onChange={(next) => {
          // Another engine or model: the old sample is not this voice any more.
          stopSample();
          setSample({ state: "idle", error: "" });
          onChange({ ...value, ...next, voice: "", profile: "" });
        }}
        fetchProviders={async () => {
          const next = await fetcher.current();
          if (next.error && !names(next.tts_providers || next.providers).length)
            throw new Error(next.error);
          return names(next.tts_providers || next.providers).map((name) => ({
            name,
          }));
        }}
        fetchModels={async (provider) => {
          const next = await fetcher.current(provider);
          const ids = names(
            next.tts_models_by_provider?.[provider] ||
              next.tts_models ||
              next.models,
          );
          // AbstractVoice >= 0.19.2 marks each model's role: a cloning checkpoint (Qwen3-TTS
          // Base, the one a cloned voice is spoken with) is shown as "<id> (clones)".
          const details: any[] = Array.isArray(next.tts_model_details_by_provider?.[provider])
            ? next.tts_model_details_by_provider[provider]
            : [];
          const labelOf = new Map(details.filter((d) => d && d.id).map((d) => [String(d.id), String(d.label || (d.role === "cloning" ? `${d.id} (clones)` : d.id))]));
          return ids.map((id) => ({ id, label: labelOf.get(id) || id }));
        }}
        providerLabel="Speech provider"
        modelLabel="Speech model"
      />
      {hasLanguageFilter ? (
        <label>
          Voices that speak
          <AfSelect
            ariaLabel="Voice language"
            placeholder="Any language"
            value={language}
            searchable={false}
            options={[{ value: "", label: "Any language" }, ...languages.map((code) => ({ value: code, label: voiceLanguageLabel(code) }))]}
            onChange={setLanguage}
          />
        </label>
      ) : null}
      <label>
        Voice / profile
        <span className="af-voice-settings__voice-row">
        <AfSelect
          ariaLabel="AI voice"
          placeholder={voiceDefaultLabel || "Gateway / provider default"}
          value={voiceKey}
          disabled={loading}
          options={[
            { value: "", label: voiceDefaultLabel || "Gateway / provider default" },
            ...options,
          ]}
          onChange={(key) => {
            let patch: Partial<VoicePreferences>;
            if (!key) {
              patch = { voice: "", profile: "" };
            } else {
              const [provider, model, kind, id] = JSON.parse(key);
              // A profile selection is a route selection too. Never combine an id
              // from one engine with the Gateway's default engine or a stale model.
              patch = {
                provider: provider || value.provider || "",
                model:
                  model ||
                  (provider && provider !== value.provider ? "" : value.model) ||
                  "",
                voice: kind === "voice" ? id : "",
                profile: kind === "profile" ? id : "",
              };
            }
            update(patch);
            // Choosing a voice plays it: the user hears each voice as they go.
            chooseSample({ ...value, ...patch });
          }}
        />
        {previewVoice ? (
          <button
            type="button"
            className="af-voice-settings__sample"
            data-action="play-sample"
            data-state={sample.state}
            aria-busy={sample.state === "loading"}
            aria-label={sample.state === "playing" ? "Stop the sample" : sample.state === "loading" ? "Cancel the sample" : "Play a sample of this voice"}
            title={sample.state === "playing" ? "Stop" : sample.state === "loading" ? "Synthesizing… (click to cancel)" : "Play a sample"}
            disabled={loading && sample.state === "idle"}
            onClick={toggleSample}
          >
            <span aria-hidden="true">{sample.state === "playing" ? "■" : "▶"}</span>
          </button>
        ) : null}
        </span>
      </label>
      {sample.error ? (
        <p className="af-voice-note af-voice-note--error" role="status" data-voice-note="sample">
          {sample.error}
        </p>
      ) : null}
      {selectedDescription ? <p className="af-voice-settings__description">{selectedDescription}</p> : null}
      {loading ? <p role="status">Loading available voices…</p> : null}
      {error ? (
        <p role="alert">
          Voice discovery unavailable: {error}. Your saved choice is preserved.
        </p>
      ) : null}
      {!loading && !error && value.provider && entries.length === 0 && String(catalog.unavailable_reason || "").trim() ? (
        // WHY the engine lists no voice, in the gateway's / AbstractVoice's words ("Supertonic is not
        // installed: …", "OpenAI: needs an API key"), never a bare empty list.
        <p className="af-voice-note" role="status" data-voice-note="unavailable">
          {String(catalog.unavailable_reason).trim()}
        </p>
      ) : null}
      {delivery ? (<>
      <label>
        Speaking speed
        <select
          aria-label="Speech speed"
          value={value.speed ?? ""}
          onChange={(event) =>
            update({
              speed: event.target.value
                ? Number(event.target.value)
                : undefined,
            })
          }
        >
          <option value="">Gateway default</option>
          {[0.5, 0.75, 1, 1.25, 1.5, 2].map((speed) => (
            <option key={speed} value={speed}>
              {speed}×
            </option>
          ))}
        </select>
      </label>
      {quality && catalog.controls?.quality_preset?.supported ? (
        <label>
          Quality
          <select
            aria-label="Speech quality"
            value={value.quality_preset || ""}
            onChange={(event) => update({ quality_preset: event.target.value })}
          >
            <option value="">Gateway default</option>
            {names(catalog.controls.quality_preset.values).map((quality) => (
              <option key={quality} value={quality}>
                {quality}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      {catalog.controls?.instructions?.supported ? (
        <label>
          Delivery instructions
          <textarea
            aria-label="Voice delivery instructions"
            rows={3}
            placeholder="For example: calm, clear, and conversational"
            value={value.instructions || ""}
            onChange={(event) => update({ instructions: event.target.value })}
          />
        </label>
      ) : null}
      </>) : null}
      {creation && (creation.design || creation.clone) ? (
        <CreateVoicePanel
          creation={creation}
          defaultLanguage={activeLanguage}
          recordFrom={recordFrom}
          onCreated={(voiceId, engine) => {
            // The new voice is one of the user's own: select it on its engine (merged into the
            // preferences as they are NOW), then reload the list.
            const current = latest.current;
            onChange({ ...current, provider: engine || current.provider || "", model: "", voice: voiceId, profile: "" });
            setRefresh((n) => n + 1);
          }}
        />
      ) : null}
      {voiceLibrary?.list ? (
        <VoiceLibraryPanel
          library={voiceLibrary}
          refreshKey={refresh}
          onChanged={() => setRefresh((n) => n + 1)}
          onRemoved={(voiceId) => {
            // The selected voice is gone: the gateway default applies again.
            const current = latest.current;
            if (current.voice === voiceId) onChange({ ...current, voice: "" });
          }}
        />
      ) : null}
      {showReset ? (
        <button type="button" onClick={() => onChange({})}>
          Reset to Gateway defaults
        </button>
      ) : null}
    </div>
  );
}

/** A recording's language: detected from the recording (by the gateway) unless the user names it. */
const DETECT_LANGUAGE = { value: "", label: "Detect from the recording" };

/** The longest recording "Create a voice" takes from the microphone (a reference is seconds long). */
export const VOICE_RECORDING_MAX_MS = 30_000;

/**
 * "Create a voice": from a description (Qwen3-TTS VoiceDesign on the gateway; it needs a language)
 * or from a recording (its language detected unless named). A recording is a file, or one made here
 * with **Record** from the chosen microphone (`recordFrom`), with a live level meter. One request at
 * a time; a result that arrives after the panel is gone is dropped.
 */
export function CreateVoicePanel({
  creation,
  defaultLanguage,
  onCreated,
  recordFrom,
  cloneRoute,
}: {
  creation: VoiceCreation;
  defaultLanguage?: string;
  onCreated: (voiceId: string, engine?: string) => void;
  /** The microphone **Record** uses (default: the system microphone). */
  recordFrom?: VoiceRecordFrom;
  /** The cloning engine sent with a recording (`provider` / `model`); absent = the gateway's default. */
  cloneRoute?: { provider?: string; model?: string };
}): React.ReactElement {
  const [mode, setMode] = useState<"design" | "clone">(creation.design ? "design" : "clone");
  const [description, setDescription] = useState("");
  const [name, setName] = useState("");
  const [designLanguage, setDesignLanguage] = useState(defaultLanguage || "en");
  const [recordingLanguage, setRecordingLanguage] = useState("");
  const [file, setFile] = useState<Blob | null>(null);
  const [transcript, setTranscript] = useState("");
  const [busy, setBusy] = useState(false);
  const [recording, setRecording] = useState(false);
  const [level, setLevel] = useState(0);
  const [note, setNote] = useState<{ text: string; tone: "info" | "ok" | "error" }>({ text: "", tone: "info" });
  // `busy` state lags a double click by one render; the ref does not.
  const inFlight = useRef(false);
  const alive = useRef(true);
  const recorder = useRef<AbortController | null>(null);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      // The panel is gone: the microphone closes now.
      recorder.current?.abort();
    };
  }, []);
  const languageOptions = Object.keys(LANGUAGE_LABELS).map((code) => ({ value: code, label: voiceLanguageLabel(code) }));
  const language = mode === "design" ? designLanguage : recordingLanguage;
  const record = () => {
    // A second press stops the recording (it is kept).
    if (recorder.current) {
      recorder.current.abort();
      return;
    }
    const stop = new AbortController();
    recorder.current = stop;
    const started = Date.now();
    setRecording(true);
    setNote({ text: "Recording — read a few sentences, then press Stop.", tone: "info" });
    void recordSample({
      deviceId: recordFrom?.deviceId || "",
      gain: recordFrom?.gain,
      ms: VOICE_RECORDING_MAX_MS,
      signal: stop.signal,
      onLevel: (v) => alive.current && setLevel(v),
    })
      .then(({ blob, peak }) => {
        if (!alive.current) return;
        if (peak < SILENT_LEVEL) {
          setNote({ text: "The microphone recorded silence. Pick another input in the voice settings, then record again.", tone: "error" });
          return;
        }
        setFile(blob);
        setNote({ text: `Recording ready (${Math.max(1, Math.round((Date.now() - started) / 1000))} s).`, tone: "ok" });
      })
      .catch((err) => {
        if (!alive.current) return;
        // Stopped before the microphone opened (a permission prompt): nothing was recorded.
        if (err?.name === "AbortError") setNote({ text: "Recording cancelled.", tone: "info" });
        else setNote({ text: microphoneErrorSentence(err), tone: "error" });
      })
      .finally(() => {
        if (recorder.current === stop) recorder.current = null;
        if (!alive.current) return;
        setRecording(false);
        setLevel(0);
      });
  };
  const submit = async () => {
    if (inFlight.current || recorder.current) return;
    inFlight.current = true;
    setBusy(true);
    setNote({ text: mode === "design" ? "Creating the voice from your description…" : "Cloning the voice from your recording…", tone: "info" });
    try {
      const out =
        mode === "design"
          ? await creation.design!({ description: description.trim(), name: name.trim() || undefined, language: designLanguage })
          : await creation.clone!(file as Blob, {
              name: name.trim() || undefined,
              reference_text: transcript.trim() || undefined,
              ...(recordingLanguage ? { language: recordingLanguage } : {}),
              ...(cloneRoute?.provider ? { provider: cloneRoute.provider } : {}),
              ...(cloneRoute?.provider && cloneRoute.model ? { model: cloneRoute.model } : {}),
            });
      if (!alive.current) return;
      setNote({ text: `Voice ready: ${out.name || out.voice_id}. It is selected above.`, tone: "ok" });
      onCreated(out.voice_id, out.engine || (mode === "design" ? "qwen3-tts" : undefined));
    } catch (err: any) {
      if (!alive.current) return;
      setNote({ text: `The voice was not created: ${String(err?.message || err).replace(/\.$/, "")}.`, tone: "error" });
    } finally {
      inFlight.current = false;
      if (alive.current) setBusy(false);
    }
  };
  const ready = mode === "design" ? Boolean(description.trim()) : Boolean(file) && !recording;
  return (
    <fieldset className="af-voice-create" data-voice-create>
      <legend>Create a voice</legend>
      <div className="af-voice-create__modes" role="tablist">
        {creation.design ? (
          <button type="button" role="tab" aria-selected={mode === "design"} data-create-mode="design" disabled={busy || recording} onClick={() => setMode("design")}>
            From a description
          </button>
        ) : null}
        {creation.clone ? (
          <button type="button" role="tab" aria-selected={mode === "clone"} data-create-mode="clone" disabled={busy || recording} onClick={() => setMode("clone")}>
            From a recording
          </button>
        ) : null}
      </div>
      {mode === "design" ? (
        <label>
          Describe the voice
          <textarea
            aria-label="Voice description"
            rows={3}
            placeholder="A calm, warm adult female voice with a slight British accent, speaking slowly."
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </label>
      ) : (
        <>
          <label>
            Recording
            <input
              aria-label="Voice recording"
              type="file"
              accept="audio/*"
              disabled={recording}
              onChange={(e) => {
                const picked = (e.target.files && e.target.files[0]) || null;
                setFile(picked);
                if (picked) setNote({ text: "", tone: "info" });
              }}
            />
          </label>
          <div className="af-voice-create__record">
            <button type="button" data-action="record-sample" disabled={busy} onClick={record}>
              {recording ? "Stop" : "Record"}
            </button>
            {recording ? (
              <div className="af-voice-meter" data-voice-meter role="meter" aria-label="Recording level" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(level * 100)}>
                <span className="af-voice-meter__fill" style={{ width: `${Math.round(level * 100)}%` }} />
              </div>
            ) : null}
          </div>
          <label>
            What the recording says (optional)
            <input aria-label="Recording transcript" value={transcript} onChange={(e) => setTranscript(e.target.value)} />
          </label>
        </>
      )}
      <label>
        Name
        <input aria-label="Voice name" value={name} placeholder="My voice" onChange={(e) => setName(e.target.value)} />
      </label>
      <label>
        Language
        <AfSelect
          ariaLabel="Voice language for creation"
          value={language}
          searchable={false}
          options={mode === "design" ? languageOptions : [DETECT_LANGUAGE, ...languageOptions]}
          onChange={mode === "design" ? setDesignLanguage : setRecordingLanguage}
        />
      </label>
      <button type="button" data-action="create-voice" disabled={busy || !ready} onClick={submit}>
        {busy ? "Creating…" : "Create voice"}
      </button>
      {note.text ? (
        <p className={`af-voice-note af-voice-note--${note.tone}`} role="status" data-voice-note="create">
          {note.text}
        </p>
      ) : null}
    </fieldset>
  );
}

const libraryRecords = (answer: VoiceRecord[] | { voices?: VoiceRecord[] } | null | undefined): VoiceRecord[] =>
  Array.isArray(answer) ? answer : Array.isArray(answer?.voices) ? answer!.voices! : [];
const failure = (err: any): string => String(err?.message || err || "").trim().replace(/\.$/, "");

/**
 * "Manage voices": the voices of the gateway's library that can change (the built-in voices are
 * read-only and not listed), with Rename, Delete (asked twice) and Share (when the host injects
 * `share`: administrators). The gateway decides who may change what; a refusal is its sentence.
 */
export function VoiceLibraryPanel({
  library,
  refreshKey,
  onChanged,
  onRemoved,
}: {
  library: VoiceLibrary;
  /** Reload the list when it changes (a voice was created elsewhere). */
  refreshKey?: number;
  /** A voice was renamed, deleted or shared: the host reloads its catalog. */
  onChanged?: () => void;
  /** A voice was deleted (the host clears it when it is selected). */
  onRemoved?: (voiceId: string) => void;
}): React.ReactElement | null {
  const [records, setRecords] = useState<VoiceRecord[]>([]);
  const [state, setState] = useState<{ loading: boolean; error: string }>({ loading: true, error: "" });
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null);
  const [confirming, setConfirming] = useState("");
  const [busy, setBusy] = useState("");
  const [note, setNote] = useState<{ text: string; tone: "info" | "ok" | "error" }>({ text: "", tone: "info" });
  const [reload, setReload] = useState(0);
  const lib = useRef(library);
  lib.current = library;
  const inFlight = useRef(false);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  useEffect(() => {
    const list = lib.current.list;
    if (!list) return;
    let current = true;
    setState((s) => ({ loading: true, error: s.error }));
    void list()
      .then((answer) => {
        if (!current) return;
        setRecords(libraryRecords(answer).filter((r) => voiceRecordId(r) && !r?.tags?.builtin));
        setState({ loading: false, error: "" });
      })
      .catch((err) => current && setState({ loading: false, error: `The voices could not be listed: ${failure(err)}.` }));
    return () => {
      current = false;
    };
  }, [refreshKey, reload]);
  const act = (id: string, work: () => Promise<unknown>, done: string, after?: () => void) => {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(id);
    setNote({ text: "", tone: "info" });
    void work()
      .then(() => {
        if (!alive.current) return;
        setNote({ text: done, tone: "ok" });
        setEditing(null);
        setConfirming("");
        after?.();
        setReload((n) => n + 1);
        onChanged?.();
      })
      .catch((err) => alive.current && setNote({ text: `${failure(err) || "The gateway refused"}.`, tone: "error" }))
      .finally(() => {
        inFlight.current = false;
        if (alive.current) setBusy("");
      });
  };
  const label = (r: VoiceRecord) => String(r.name || r.label || voiceRecordId(r));
  return (
    <fieldset className="af-voice-library" data-voice-library>
      <legend>Manage voices</legend>
      {state.loading && !records.length ? <p role="status">Loading your voices…</p> : null}
      {state.error ? (
        <p className="af-voice-note af-voice-note--error" role="status" data-voice-note="library">
          {state.error}
        </p>
      ) : null}
      {!state.loading && !state.error && !records.length ? <p className="af-voice-library__empty">No voices of your own yet.</p> : null}
      {records.length ? (
        <ul className="af-voice-library__list">
          {records.map((r) => {
            const id = voiceRecordId(r);
            const shared = voiceGroup(r) === "Shared voices";
            const lang = voiceLanguage(r);
            const engine = String(r.engine || r.provider || "");
            const rowBusy = busy === id;
            return (
              <li key={id} className="af-voice-library__item" data-voice-id={id}>
                {editing?.id === id ? (
                  <span className="af-voice-library__edit">
                    <input
                      aria-label={`New name for ${label(r)}`}
                      value={editing.name}
                      onChange={(e) => setEditing({ id, name: e.target.value })}
                    />
                    <button
                      type="button"
                      data-action="save-voice-name"
                      disabled={rowBusy || !editing.name.trim()}
                      onClick={() => act(id, () => lib.current.rename!(id, { name: editing.name.trim() }), `Renamed to ${editing.name.trim()}.`)}
                    >
                      Save
                    </button>
                    <button type="button" data-action="cancel-voice-name" disabled={rowBusy} onClick={() => setEditing(null)}>
                      Cancel
                    </button>
                  </span>
                ) : (
                  <span className="af-voice-library__name">
                    {label(r)}
                    <span className="af-voice-library__meta">
                      {[shared ? "Shared" : "Yours", lang ? voiceLanguageLabel(lang) : "", engine].filter(Boolean).join(" · ")}
                    </span>
                  </span>
                )}
                {confirming === id ? (
                  <span className="af-voice-library__confirm" role="group" aria-label={`Delete ${label(r)}?`}>
                    Delete {label(r)}?
                    <button type="button" data-action="confirm-delete-voice" disabled={rowBusy} onClick={() => act(id, () => lib.current.remove!(id), `${label(r)} was deleted.`, () => onRemoved?.(id))}>
                      Delete
                    </button>
                    <button type="button" data-action="keep-voice" disabled={rowBusy} onClick={() => setConfirming("")}>
                      Keep
                    </button>
                  </span>
                ) : editing?.id !== id ? (
                  <span className="af-voice-library__actions">
                    {library.rename ? (
                      <button type="button" data-action="rename-voice" disabled={Boolean(busy)} onClick={() => setEditing({ id, name: label(r) })}>
                        Rename
                      </button>
                    ) : null}
                    {library.remove ? (
                      <button type="button" data-action="delete-voice" disabled={Boolean(busy)} onClick={() => setConfirming(id)}>
                        Delete
                      </button>
                    ) : null}
                    {library.share && !shared ? (
                      <button type="button" data-action="share-voice" disabled={Boolean(busy)} onClick={() => act(id, () => lib.current.share!(id), `${label(r)} is shared with everyone.`)}>
                        Share
                      </button>
                    ) : null}
                  </span>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : null}
      {note.text ? (
        <p className={`af-voice-note af-voice-note--${note.tone}`} role="status" data-voice-note="library-action">
          {note.text}
        </p>
      ) : null}
    </fieldset>
  );
}
