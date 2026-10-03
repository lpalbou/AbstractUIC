// AfVoiceSection — the Assistant's Settings → Voice layout for web clients
// (ui-kit 0.6.0), compact rows:
//
//   Engines   Text → speech   Gateway default · supertonic   [Change]
//             Speech → text   Gateway default · whisper      [Change]
//   Output    Output device   [System default ▾]
//   Replies   Read aloud      (switch)
//             Voice latency   [Gateway default ▾]
//
// Everything is "Gateway default" until the user overrides it here; an
// override is a client preference (the host stores it; the gateway's own
// defaults are never written). Speech settings ride on each request
// (`voiceTtsRequest` / `voiceSttRequest` pick the keys a request carries).
import React, { useEffect, useRef, useState } from "react";
import { AfSelect } from "./af_select.js";
import { AfSwitch } from "./af_switch.js";
import { ProviderModelPicker } from "./provider_model_picker.js";
import { AfOverrideRow, AfSettingRow, AfSettingsGroup } from "./af_settings_rows.js";
import { VoiceSettings, type VoiceCatalog, type VoicePreferences } from "./voice_settings.js";
import { audioOutputSelectable } from "./use_gateway_voice.js";

/** Client voice preferences: the TTS request fields plus STT route, speaker and read-aloud. */
export type VoiceClientPreferences = VoicePreferences & {
  stt_provider?: string;
  stt_model?: string;
  /** `MediaDeviceInfo.deviceId` of an audio output; "" = system default. */
  output_device?: string;
  /** Speak each new reply automatically. */
  read_aloud?: boolean;
};

const TTS_KEYS = ["provider", "model", "voice", "profile", "speed", "quality_preset", "instructions"] as const;

/** The fields a TTS request carries (empty values dropped). */
export function voiceTtsRequest(prefs: VoiceClientPreferences): Record<string, string | number> {
  const out: Record<string, string | number> = {};
  for (const key of TTS_KEYS) {
    const v = prefs[key];
    if (v !== undefined && v !== "" && v !== null) out[key] = v as string | number;
  }
  return out;
}

/** The fields a transcription request carries (`provider`/`model`; empty = gateway default). */
export function voiceSttRequest(prefs: VoiceClientPreferences): { provider?: string; model?: string } {
  return {
    ...(prefs.stt_provider ? { provider: prefs.stt_provider } : {}),
    ...(prefs.stt_provider && prefs.stt_model ? { model: prefs.stt_model } : {}),
  };
}

/** "provider · model · voice" of the TTS override, or "" when the gateway default applies. */
export function voiceTtsOverrideSummary(p: VoiceClientPreferences): string {
  return [p.provider, p.model, p.profile || p.voice].filter(Boolean).join(" · ");
}
export function voiceSttOverrideSummary(p: VoiceClientPreferences): string {
  return [p.stt_provider, p.stt_model].filter(Boolean).join(" · ");
}

/** The Assistant's latency choices (`quality_preset`). */
export const VOICE_LATENCY_OPTIONS = [
  { value: "", label: "Gateway default" },
  { value: "standard", label: "Balanced" },
  { value: "low", label: "Faster (lower quality)" },
  { value: "high", label: "Higher quality (slower)" },
];

const names = (value: unknown): string[] =>
  Array.isArray(value) ? value.map((item) => (typeof item === "string" ? item : item?.id || item?.name)).filter(Boolean) : [];

export type AfVoiceSectionProps = {
  value: VoiceClientPreferences;
  onChange: (next: VoiceClientPreferences) => void;
  /** The gateway voice catalog (`GET voice/voices?compact=true[&provider&model]`). */
  fetchCatalog: (provider?: string, model?: string) => Promise<VoiceCatalog>;
  /** Whose override this is ("this app"). */
  overrideOwner?: string;
  /** Why voice cannot be configured now (disconnected…); disables every control. */
  unavailableReason?: string | null;
  /** Speakers (default: `navigator.mediaDevices.enumerateDevices()` audio outputs). */
  listOutputDevices?: () => Promise<Array<{ id: string; label: string }>>;
  /** Speaker selection works here (default: `audioOutputSelectable()`). */
  outputSelectable?: boolean;
  /** Inside a host card (e.g. a "Voice" settings group): sub-sections render flat, never a card in a card. */
  nested?: boolean;
  className?: string;
};

async function browserOutputs(): Promise<Array<{ id: string; label: string }>> {
  const md: any = (globalThis as any).navigator?.mediaDevices;
  if (!md || typeof md.enumerateDevices !== "function") return [];
  const list: any[] = await md.enumerateDevices();
  return list
    .filter((d) => d.kind === "audiooutput" && d.deviceId && d.deviceId !== "default")
    .map((d, i) => ({ id: String(d.deviceId), label: String(d.label || `Speaker ${i + 1}`) }));
}

export function AfVoiceSection(p: AfVoiceSectionProps): React.ReactElement {
  const owner = p.overrideOwner || "this app";
  const disabled = Boolean(p.unavailableReason);
  const fetcher = useRef(p.fetchCatalog);
  fetcher.current = p.fetchCatalog;
  const [catalog, setCatalog] = useState<VoiceCatalog>({});
  const [open, setOpen] = useState<"" | "tts" | "stt">("");
  const [outputs, setOutputs] = useState<Array<{ id: string; label: string }>>([]);
  const selectable = p.outputSelectable ?? audioOutputSelectable();
  const value = p.value;
  const flat = p.nested ? "flat" : "card";
  const update = (patch: Partial<VoiceClientPreferences>) => p.onChange({ ...value, ...patch });

  useEffect(() => {
    if (disabled) return;
    let alive = true;
    void fetcher
      .current()
      .then((c) => alive && setCatalog(c || {}))
      .catch(() => alive && setCatalog({}));
    return () => {
      alive = false;
    };
  }, [disabled]);

  const loadOutputs = () => {
    void (p.listOutputDevices || browserOutputs)()
      .then(setOutputs)
      .catch(() => setOutputs([]));
  };
  useEffect(() => {
    if (selectable && !disabled) loadOutputs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectable, disabled]);

  const ttsDefault = String(catalog.active_tts_provider || "") || names(catalog.tts_providers)[0] || "";
  const sttDefault = String(catalog.active_stt_provider || "") || names(catalog.stt_providers)[0] || "";
  const latencySupported = Boolean(catalog.controls?.quality_preset?.supported);
  const savedOutput = value.output_device || "";
  const outputOptions = [
    { value: "", label: "System default" },
    ...outputs.map((o) => ({ value: o.id, label: o.label })),
    ...(savedOutput && !outputs.some((o) => o.id === savedOutput) ? [{ value: savedOutput, label: "Saved speaker (not connected)" }] : []),
  ];

  return (
    <div className={`af-voice-section${p.className ? ` ${p.className}` : ""}`}>
      {p.unavailableReason ? (
        <p className="af-settings-group__help" role="status">
          {p.unavailableReason}
        </p>
      ) : null}
      <AfSettingsGroup variant={flat} title="Engines" help="Which engines speak and listen.">
        <AfOverrideRow
          label="Text → speech"
          setting="tts"
          defaultSummary={ttsDefault}
          overrideSummary={voiceTtsOverrideSummary(value)}
          overrideOwner={owner}
          open={open === "tts"}
          onToggle={() => setOpen(open === "tts" ? "" : "tts")}
          onReset={() => update({ provider: "", model: "", voice: "", profile: "" })}
          disabled={disabled}
        >
          <VoiceSettings
            value={value}
            onChange={(next) => p.onChange({ ...value, ...next })}
            fetchCatalog={p.fetchCatalog}
            intro={null}
            delivery={false}
            showReset={false}
            voiceDefaultLabel="Gateway default"
          />
        </AfOverrideRow>
        <AfOverrideRow
          label="Speech → text"
          setting="stt"
          defaultSummary={sttDefault}
          overrideSummary={voiceSttOverrideSummary(value)}
          overrideOwner={owner}
          open={open === "stt"}
          onToggle={() => setOpen(open === "stt" ? "" : "stt")}
          onReset={() => update({ stt_provider: "", stt_model: "" })}
          disabled={disabled}
        >
          <ProviderModelPicker
            value={{ provider: value.stt_provider || "", model: value.stt_model || "" }}
            onChange={(next) => update({ stt_provider: next.provider, stt_model: next.model })}
            fetchProviders={async () => {
              const c = await fetcher.current();
              return names(c.stt_providers).map((name) => ({ name }));
            }}
            fetchModels={async (provider) => {
              const c = await fetcher.current(provider);
              return names(c.stt_models_by_provider?.[provider] || c.stt_models);
            }}
            inheritLabel="Gateway default"
            providerLabel="Transcription provider"
            modelLabel="Transcription model"
          />
        </AfOverrideRow>
      </AfSettingsGroup>
      <AfSettingsGroup variant={flat} title="Output">
        <AfSettingRow label="Output device" setting="output-device" help={selectable ? undefined : "This browser plays on the system output."}>
          <AfSelect
            ariaLabel="Output device"
            placeholder="System default"
            value={selectable ? savedOutput : ""}
            options={outputOptions}
            disabled={disabled || !selectable}
            searchable={false}
            onOpen={loadOutputs}
            onChange={(id) => update({ output_device: id })}
          />
        </AfSettingRow>
      </AfSettingsGroup>
      <AfSettingsGroup variant={flat} title="Replies">
        <div className="af-setting-row af-setting-row--switch" data-setting="read-aloud">
          <AfSwitch
            label="Read aloud"
            description="Speak each new reply."
            variant="row"
            checked={value.read_aloud === true}
            unavailableReason={disabled ? p.unavailableReason : null}
            reasonVisible={false}
            onChange={(next) => update({ read_aloud: next })}
          />
        </div>
        <AfSettingRow
          label="Voice latency"
          setting="latency"
          help={latencySupported ? "Trades quality for a faster first word." : "This gateway's voice engine has no latency control."}
        >
          <AfSelect
            ariaLabel="Voice latency"
            placeholder="Gateway default"
            value={latencySupported ? value.quality_preset || "" : ""}
            options={VOICE_LATENCY_OPTIONS}
            disabled={disabled || !latencySupported}
            searchable={false}
            onChange={(v) => update({ quality_preset: v })}
          />
        </AfSettingRow>
      </AfSettingsGroup>
    </div>
  );
}
