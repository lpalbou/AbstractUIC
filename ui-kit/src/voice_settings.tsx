import React, { useEffect, useRef, useState } from "react";
import { AfSelect } from "./af_select.js";
import { ProviderModelPicker } from "./provider_model_picker.js";

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
  clone?: (file: Blob, request: { name?: string; language?: string; reference_text?: string }) => Promise<{ voice_id: string; name?: string; engine?: string }>;
};

const GROUP_ORDER = ["Your voices", "Engine voices", "Built-in voices"];

/** Which group a catalog voice belongs to: the user's own, the engine's, or the shared built-in library. */
export function voiceGroup(item: any): string {
  const tags = (item && item.tags) || {};
  const scope = item?.params?.meta?.scope;
  if (tags.builtin) return "Built-in voices";
  if (item?.voice_kind === "clone" || item?.kind === "clone") return scope === "library" ? "Built-in voices" : "Your voices";
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

/** A voice speaks `language` when it is its native language or one it lists. */
export function voiceSpeaks(item: any, language: string): boolean {
  if (!language) return true;
  if (voiceLanguage(item) === language) return true;
  const langs = Array.isArray(item?.languages) ? item.languages.map((l: any) => String(l).toLowerCase()) : [];
  return langs.includes(language);
}

const LANGUAGE_LABELS: Record<string, string> = {
  en: "English", fr: "French", de: "German", es: "Spanish", it: "Italian", pt: "Portuguese", ru: "Russian",
  zh: "Chinese", ja: "Japanese", ko: "Korean", nl: "Dutch", pl: "Polish", tr: "Turkish", ar: "Arabic", hi: "Hindi",
};
export const voiceLanguageLabel = (code: string): string => LANGUAGE_LABELS[code] || code;
const names = (value: unknown): string[] =>
  Array.isArray(value)
    ? value
        .map((item) =>
          typeof item === "string" ? item : item?.id || item?.name,
        )
        .filter(Boolean)
    : [];

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
  /** Voice creation through the gateway (a description, a recording); absent = no "Create a voice" panel. */
  createVoice?: VoiceCreation;
}): React.ReactElement {
  const fetcher = useRef(fetchCatalog);
  fetcher.current = fetchCatalog;
  const [catalog, setCatalog] = useState<VoiceCatalog>({});
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [language, setLanguage] = useState("");
  const [refresh, setRefresh] = useState(0);
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
  const selected = entries.find(
    (item) =>
      item.id === (value.profile || value.voice) &&
      (item.voice_kind === "profile") === Boolean(value.profile) &&
      (!value.provider || !item.provider || item.provider === value.provider) &&
      (!value.model || !item.model || item.model === value.model),
  );
  const voiceKey = selected
    ? itemKey(selected)
    : value.profile || value.voice
      ? JSON.stringify([
          value.provider || "",
          value.model || "",
          value.profile ? "profile" : "voice",
          value.profile || value.voice,
        ])
      : "";
  const languages = voiceLanguages(entries);
  const options = entries
    .filter(
      (item) =>
        item?.id &&
        (!value.provider || !item.provider || item.provider === value.provider) &&
        (voiceSpeaks(item, language) || itemKey(item) === voiceKey),
    )
    .map((item) => {
      const lang = voiceLanguage(item);
      return {
        value: itemKey(item),
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
        onChange={(next) =>
          onChange({ ...value, ...next, voice: "", profile: "" })
        }
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
          return names(
            next.tts_models_by_provider?.[provider] ||
              next.tts_models ||
              next.models,
          );
        }}
        providerLabel="Speech provider"
        modelLabel="Speech model"
      />
      {languages.length > 1 ? (
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
            if (!key) {
              update({ voice: "", profile: "" });
              return;
            }
            const [provider, model, kind, id] = JSON.parse(key);
            // A profile selection is a route selection too. Never combine an id
            // from one engine with the Gateway's default engine or a stale model.
            update({
              provider: provider || value.provider || "",
              model:
                model ||
                (provider && provider !== value.provider ? "" : value.model) ||
                "",
              voice: kind === "voice" ? id : "",
              profile: kind === "profile" ? id : "",
            });
          }}
        />
      </label>
      {selectedDescription ? <p className="af-voice-settings__description">{selectedDescription}</p> : null}
      {loading ? <p role="status">Loading available voices…</p> : null}
      {error ? (
        <p role="alert">
          Voice discovery unavailable: {error}. Your saved choice is preserved.
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
      {createVoice && (createVoice.design || createVoice.clone) ? (
        <CreateVoicePanel
          creation={createVoice}
          defaultLanguage={language}
          onCreated={(voiceId, engine) => {
            // The new voice is one of the user's own: select it on its engine, then reload the list.
            onChange({ ...value, provider: engine || value.provider || "", model: "", voice: voiceId, profile: "" });
            setRefresh((n) => n + 1);
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

/** "Create a voice": from a description (Qwen3-TTS VoiceDesign on the gateway) or from a recording. */
export function CreateVoicePanel({
  creation,
  defaultLanguage,
  onCreated,
}: {
  creation: VoiceCreation;
  defaultLanguage?: string;
  onCreated: (voiceId: string, engine?: string) => void;
}): React.ReactElement {
  const [mode, setMode] = useState<"design" | "clone">(creation.design ? "design" : "clone");
  const [description, setDescription] = useState("");
  const [name, setName] = useState("");
  const [language, setLanguage] = useState(defaultLanguage || "en");
  const [file, setFile] = useState<File | null>(null);
  const [transcript, setTranscript] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ text: string; tone: "info" | "ok" | "error" }>({ text: "", tone: "info" });
  const languageOptions = Object.keys(LANGUAGE_LABELS).map((code) => ({ value: code, label: voiceLanguageLabel(code) }));
  const submit = async () => {
    setBusy(true);
    setNote({ text: mode === "design" ? "Creating the voice from your description…" : "Cloning the voice from your recording…", tone: "info" });
    try {
      const out =
        mode === "design"
          ? await creation.design!({ description: description.trim(), name: name.trim() || undefined, language })
          : await creation.clone!(file as Blob, { name: name.trim() || undefined, language, reference_text: transcript.trim() || undefined });
      setNote({ text: `Voice ready: ${out.name || out.voice_id}. It is selected above.`, tone: "ok" });
      onCreated(out.voice_id, out.engine || (mode === "design" ? "qwen3-tts" : undefined));
    } catch (err: any) {
      setNote({ text: `The voice was not created: ${String(err?.message || err).replace(/\.$/, "")}.`, tone: "error" });
    } finally {
      setBusy(false);
    }
  };
  const ready = mode === "design" ? Boolean(description.trim()) : Boolean(file);
  return (
    <fieldset className="af-voice-create" data-voice-create>
      <legend>Create a voice</legend>
      <div className="af-voice-create__modes" role="tablist">
        {creation.design ? (
          <button type="button" role="tab" aria-selected={mode === "design"} data-create-mode="design" onClick={() => setMode("design")}>
            From a description
          </button>
        ) : null}
        {creation.clone ? (
          <button type="button" role="tab" aria-selected={mode === "clone"} data-create-mode="clone" onClick={() => setMode("clone")}>
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
            <input aria-label="Voice recording" type="file" accept="audio/*" onChange={(e) => setFile((e.target.files && e.target.files[0]) || null)} />
          </label>
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
        <AfSelect ariaLabel="Voice language for creation" value={language} searchable={false} options={languageOptions} onChange={setLanguage} />
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
