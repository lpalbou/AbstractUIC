// AfVoiceSection — the Assistant's Settings → Voice layout for web clients
// (ui-kit 0.6.0; devices, tests and the gateway's routes in 0.7.1), compact rows:
//
//   Engines     Text → speech   Gateway default · supertonic / supertonic-3   [Change]
//               Speech → text   Gateway default · faster-whisper / large-v3   [Change]
//   Output      Output device   [System default ▾]   [Test]
//               Reply volume    ───●── 80 %
//   Microphone  Input device    [System default ▾]   [Test]   ▮▮▮▯▯ (live level)
//               Input level     ───●── 100 %          (where Web Audio allows)
//   Replies     Read aloud      (switch)
//               Voice latency   [Gateway default ▾]
//
// "Gateway default · …" comes from ONE gateway answer, `fetchDefaults`
// (`GET /api/gateway/voice/defaults` = the output.voice / input.voice routes),
// never from the voice catalog: the catalog's engine-side `active_*` fields
// said "openai" on a gateway routed to supertonic and faster-whisper.
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
import {
  SILENT_LEVEL,
  inputGainSupported,
  listVoiceDevices,
  microphoneErrorSentence,
  playOnDevice,
  playTestTone,
  recordSample,
  unlockDeviceLabels,
  voiceDefaultSummary,
  type VoiceDefaults,
  type VoiceDevice,
} from "./voice_devices.js";

/** Client voice preferences: the TTS request fields plus STT route, speaker and read-aloud. */
export type VoiceClientPreferences = VoicePreferences & {
  stt_provider?: string;
  stt_model?: string;
  /** `MediaDeviceInfo.deviceId` of an audio output; "" = system default. */
  output_device?: string;
  /** Speak each new reply automatically. */
  read_aloud?: boolean;
  /** `MediaDeviceInfo.deviceId` of the microphone; "" = system default. */
  input_device?: string;
  /** Input gain for recordings (1 = unchanged). */
  input_gain?: number;
  /** Reply volume 0..1 (absent = 1). */
  reply_volume?: number;
  /** Language spoken to the microphone (ISO 639-1, "" = the engine detects it). */
  stt_language?: string;
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

/**
 * The fields a transcription request carries (`provider`/`model`; empty =
 * gateway default) plus `language` when the user named it — the engine then
 * skips language detection (faster-whisper large-v3 on CPU: ~2.4x faster).
 */
export function voiceSttRequest(prefs: VoiceClientPreferences): { provider?: string; model?: string; language?: string } {
  return {
    ...(prefs.stt_provider ? { provider: prefs.stt_provider } : {}),
    ...(prefs.stt_provider && prefs.stt_model ? { model: prefs.stt_model } : {}),
    ...(prefs.stt_language ? { language: prefs.stt_language } : {}),
  };
}

/** Spoken-language choices for transcription ("" = detected by the engine). */
export const VOICE_LANGUAGE_OPTIONS = [
  { value: "", label: "Detect automatically" },
  { value: "en", label: "English" },
  { value: "fr", label: "French" },
  { value: "de", label: "German" },
  { value: "es", label: "Spanish" },
  { value: "it", label: "Italian" },
  { value: "pt", label: "Portuguese" },
  { value: "nl", label: "Dutch" },
  { value: "zh", label: "Chinese" },
  { value: "ja", label: "Japanese" },
  { value: "ko", label: "Korean" },
];

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
  /** The gateway voice catalog (`GET voice/voices?compact=true[&provider&model]`) — engines, models and voices to pick from. */
  fetchCatalog: (provider?: string, model?: string) => Promise<VoiceCatalog>;
  /**
   * The gateway's default voice routes (`GET voice/defaults`): what
   * "Gateway default · …" names. Required — there is no other source.
   */
  fetchDefaults: () => Promise<VoiceDefaults>;
  /** Defaults the host already holds (the same `voice/defaults` body); given = no fetch. */
  defaults?: VoiceDefaults | null;
  /** Whose override this is ("this app"). */
  overrideOwner?: string;
  /** Why voice cannot be configured now (disconnected…); disables every control. */
  unavailableReason?: string | null;
  /** Devices of a kind (default: `navigator.mediaDevices.enumerateDevices()`). */
  listDevices?: (kind: "audioinput" | "audiooutput") => Promise<{ devices: VoiceDevice[]; labelled: boolean }>;
  /** Speaker selection works here (default: `audioOutputSelectable()`). */
  outputSelectable?: boolean;
  /** Inside a host card (e.g. a "Voice" settings group): sub-sections render flat, never a card in a card. */
  nested?: boolean;
  className?: string;
};

type MicTest = { phase: "idle" | "recording" | "playing"; message: string; tone: "info" | "ok" | "error" };

const percent = (v: number) => `${Math.round(v * 100)} %`;

export function AfVoiceSection(p: AfVoiceSectionProps): React.ReactElement {
  const owner = p.overrideOwner || "this app";
  const disabled = Boolean(p.unavailableReason);
  const fetcher = useRef(p.fetchCatalog);
  fetcher.current = p.fetchCatalog;
  const defaultsFetcher = useRef(p.fetchDefaults);
  defaultsFetcher.current = p.fetchDefaults;
  const [catalog, setCatalog] = useState<VoiceCatalog>({});
  const [fetchedDefaults, setDefaults] = useState<{ value: VoiceDefaults | null; failed: boolean }>({ value: null, failed: false });
  const defaults = p.defaults !== undefined ? { value: p.defaults, failed: false } : fetchedDefaults;
  const hostDefaults = p.defaults !== undefined;
  const [open, setOpen] = useState<"" | "tts" | "stt">("");
  const [outputs, setOutputs] = useState<{ devices: VoiceDevice[]; labelled: boolean }>({ devices: [], labelled: true });
  const [inputs, setInputs] = useState<{ devices: VoiceDevice[]; labelled: boolean }>({ devices: [], labelled: true });
  const [deviceNote, setDeviceNote] = useState("");
  const [speakerNote, setSpeakerNote] = useState<{ text: string; tone: "info" | "ok" | "error" }>({ text: "", tone: "info" });
  const [micTest, setMicTest] = useState<MicTest>({ phase: "idle", message: "", tone: "info" });
  const [level, setLevel] = useState(0);
  const selectable = p.outputSelectable ?? audioOutputSelectable();
  const gainSupported = inputGainSupported();
  const value = p.value;
  const flat = p.nested ? "flat" : "card";
  const update = (patch: Partial<VoiceClientPreferences>) => p.onChange({ ...value, ...patch });
  const volume = value.reply_volume === undefined ? 1 : Math.min(1, Math.max(0, Number(value.reply_volume) || 0));
  const gain = value.input_gain === undefined ? 1 : Math.min(1.5, Math.max(0.5, Number(value.input_gain) || 1));

  useEffect(() => {
    if (disabled) return;
    let alive = true;
    void fetcher
      .current()
      .then((c) => alive && setCatalog(c || {}))
      .catch(() => alive && setCatalog({}));
    if (!hostDefaults)
      void defaultsFetcher
        .current()
        .then((d) => alive && setDefaults({ value: d || {}, failed: false }))
        .catch(() => alive && setDefaults({ value: null, failed: true }));
    return () => {
      alive = false;
    };
  }, [disabled, hostDefaults]);

  const lister = p.listDevices || listVoiceDevices;
  const loadDevices = () => {
    if (selectable) void lister("audiooutput").then(setOutputs).catch(() => setOutputs({ devices: [], labelled: false }));
    void lister("audioinput").then(setInputs).catch(() => setInputs({ devices: [], labelled: false }));
  };
  useEffect(() => {
    if (!disabled) loadDevices();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectable, disabled]);

  const showNames = () => {
    setDeviceNote("");
    void unlockDeviceLabels()
      .then(loadDevices)
      .catch((e) => setDeviceNote(microphoneErrorSentence(e)));
  };

  const testSpeaker = () => {
    setSpeakerNote({ text: "Playing a short chime…", tone: "info" });
    void playTestTone({ deviceId: selectable ? value.output_device || "" : "", volume })
      .then(() => setSpeakerNote({ text: "Chime played. Heard nothing? Pick another output or raise the volume.", tone: "ok" }))
      .catch((e) => setSpeakerNote({ text: `The speaker test failed: ${String(e?.message || e).replace(/\.$/, "")}.`, tone: "error" }));
  };

  const testMicrophone = () => {
    setMicTest({ phase: "recording", message: "Recording 3 seconds — say something.", tone: "info" });
    void recordSample({ deviceId: value.input_device || "", ms: 3000, gain, onLevel: setLevel })
      .then(async ({ blob, peak }) => {
        if (peak < SILENT_LEVEL) {
          setMicTest({ phase: "idle", message: "The microphone recorded silence. Pick another input, or raise its level in the system sound settings.", tone: "error" });
          return;
        }
        setMicTest({ phase: "playing", message: "Playing it back…", tone: "info" });
        await playOnDevice(blob, { deviceId: selectable ? value.output_device || "" : "", volume });
        setMicTest({ phase: "idle", message: `The microphone works (peak level ${percent(peak)}).`, tone: "ok" });
        loadDevices();
      })
      .catch((e) => setMicTest({ phase: "idle", message: microphoneErrorSentence(e), tone: "error" }));
  };

  const ttsDefault = voiceDefaultSummary(defaults.value, "tts", defaults.failed);
  const sttDefault = voiceDefaultSummary(defaults.value, "stt", defaults.failed);
  const notes = [defaults.value?.tts, defaults.value?.stt].map((e) => (e && !e.configured ? e.note : "")).filter(Boolean);
  const latencySupported = Boolean(catalog.controls?.quality_preset?.supported);
  const savedOutput = value.output_device || "";
  const outputOptions = [
    { value: "", label: "System default" },
    ...outputs.devices.map((o) => ({ value: o.id, label: o.label })),
    ...(savedOutput && !outputs.devices.some((o) => o.id === savedOutput) ? [{ value: savedOutput, label: "Saved speaker (not connected)" }] : []),
  ];
  const savedInput = value.input_device || "";
  const inputOptions = [
    { value: "", label: "System default" },
    ...inputs.devices.map((o) => ({ value: o.id, label: o.label })),
    ...(savedInput && !inputs.devices.some((o) => o.id === savedInput) ? [{ value: savedInput, label: "Saved microphone (not connected)" }] : []),
  ];
  const unlabelled = !inputs.labelled || (selectable && !outputs.labelled);
  const busy = micTest.phase !== "idle";

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
            quality={false}
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
        {defaults.failed ? (
          <p className="af-settings-group__help" data-voice-note="defaults" role="status">
            The gateway's default voice routes could not be read. Requests still use them.
          </p>
        ) : null}
        {notes.map((note) => (
          <p key={note} className="af-settings-group__help" data-voice-note="unset">
            {note}
          </p>
        ))}
      </AfSettingsGroup>
      <AfSettingsGroup variant={flat} title="Output">
        <AfSettingRow
          label="Output device"
          setting="output-device"
          help={selectable ? undefined : "Safari does not let a page choose the output device: replies play on the system output (change it in the system sound settings)."}
          trailing={
            <button type="button" className="af-setting-btn" data-action="test-speaker" disabled={disabled} onClick={testSpeaker}>
              Test
            </button>
          }
        >
          <AfSelect
            ariaLabel="Output device"
            placeholder="System default"
            value={selectable ? savedOutput : ""}
            options={outputOptions}
            disabled={disabled || !selectable}
            searchable={false}
            onOpen={loadDevices}
            onChange={(id) => update({ output_device: id })}
          />
        </AfSettingRow>
        {speakerNote.text ? (
          <p className={`af-voice-note af-voice-note--${speakerNote.tone}`} role="status" data-voice-note="speaker">
            {speakerNote.text}
          </p>
        ) : null}
        <AfSettingRow label="Reply volume" setting="reply-volume" htmlFor="af-voice-volume">
          <input
            id="af-voice-volume"
            className="af-voice-range"
            type="range"
            min={0}
            max={100}
            step={5}
            value={Math.round(volume * 100)}
            disabled={disabled}
            aria-valuetext={percent(volume)}
            onChange={(e) => update({ reply_volume: Number(e.currentTarget.value) / 100 })}
          />
          <span className="af-voice-range__value">{percent(volume)}</span>
        </AfSettingRow>
      </AfSettingsGroup>
      <AfSettingsGroup variant={flat} title="Microphone">
        <AfSettingRow
          label="Input device"
          setting="input-device"
          trailing={
            <button type="button" className="af-setting-btn" data-action="test-microphone" disabled={disabled || busy} onClick={testMicrophone}>
              {micTest.phase === "recording" ? "Recording…" : micTest.phase === "playing" ? "Playing…" : "Test"}
            </button>
          }
        >
          <AfSelect
            ariaLabel="Input device"
            placeholder="System default"
            value={savedInput}
            options={inputOptions}
            disabled={disabled}
            searchable={false}
            onOpen={loadDevices}
            onChange={(id) => update({ input_device: id })}
          />
        </AfSettingRow>
        <div className="af-voice-meter" data-voice-meter role="meter" aria-label="Microphone level" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(level * 100)}>
          <span className="af-voice-meter__fill" style={{ width: `${Math.round(level * 100)}%` }} />
        </div>
        {micTest.message ? (
          <p className={`af-voice-note af-voice-note--${micTest.tone}`} role="status" data-voice-note="microphone">
            {micTest.message}
          </p>
        ) : null}
        {unlabelled && !disabled ? (
          <p className="af-voice-note" data-voice-note="labels">
            Device names appear once the microphone is allowed.{" "}
            <button type="button" className="af-setting-btn af-setting-btn--quiet" data-action="show-device-names" onClick={showNames}>
              Show names
            </button>
          </p>
        ) : null}
        {deviceNote ? (
          <p className="af-voice-note af-voice-note--error" role="status">
            {deviceNote}
          </p>
        ) : null}
        <AfSettingRow label="Spoken language" setting="stt-language" help="Naming it skips detection: transcription is faster.">
          <AfSelect
            ariaLabel="Spoken language"
            placeholder="Detect automatically"
            value={value.stt_language || ""}
            options={VOICE_LANGUAGE_OPTIONS}
            disabled={disabled}
            searchable={false}
            onChange={(v) => update({ stt_language: v })}
          />
        </AfSettingRow>
        {gainSupported ? (
          <AfSettingRow label="Input level" setting="input-gain" htmlFor="af-voice-gain" help="Raises a quiet microphone.">
            <input
              id="af-voice-gain"
              className="af-voice-range"
              type="range"
              min={50}
              max={150}
              step={10}
              value={Math.round(gain * 100)}
              disabled={disabled}
              aria-valuetext={percent(gain)}
              onChange={(e) => update({ input_gain: Number(e.currentTarget.value) / 100 })}
            />
            <span className="af-voice-range__value">{percent(gain)}</span>
          </AfSettingRow>
        ) : null}
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
