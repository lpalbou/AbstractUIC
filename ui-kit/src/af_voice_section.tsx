// AfVoiceSection — the Assistant's Settings → Voice layout for web clients
// (ui-kit 0.6.0; devices, tests and the gateway's routes in 0.7.1), compact rows:
//
//   Engines     Text → speech   Gateway default · supertonic / supertonic-3   [Change]
//               Speech → text   Gateway default · faster-whisper / large-v3   [Change]
//   Output      Output device   [System default ▾]   [Test]        (AfVoiceOutput)
//               Reply volume    ───●── 80 %           [Mute]
//   Microphone  Input device    [System default ▾]   [Test]   ▮▮▮▯▯ (AfVoiceInput: live level)
//               Input level     ───●── 100 %          (where Web Audio allows)
//               Spoken language [Detect automatically ▾]
//               Microphone button  [Hold to talk ▾]   (rows.capture)
//               Send what you say automatically (switch)
//   Replies     Read aloud      (switch)
//               Voice latency   [Gateway default ▾]
//
// ui-primitives 0035: the Output and Microphone groups ARE the standalone
// composables `AfVoiceOutput` / `AfVoiceInput`; `rows` hides groups a host does
// not honour, `ttsSlot` puts a host-owned voice in place of the TTS override.
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
import React, { useEffect, useRef, useState, type ReactNode } from "react";
import { AfSelect } from "./af_select.js";
import { AfSwitch } from "./af_switch.js";
import { ProviderModelPicker } from "./provider_model_picker.js";
import { AfOverrideRow, AfSettingRow, AfSettingsGroup } from "./af_settings_rows.js";
import {
  VOICE_LANGUAGE_LABELS,
  VoiceSettings,
  voiceLanguageLabel,
  type VoiceCatalog,
  type VoiceCreation,
  type VoiceLibrary,
  type VoicePreferences,
} from "./voice_settings.js";
import { audioOutputSelectable, type GatewayVoiceOptions, type VoiceCaptureMode } from "./use_gateway_voice.js";
import { clampVolume, voiceDefaultSummary, type VoiceDefaults } from "./voice_devices.js";
import { AfVoiceOutput, type VoiceDeviceLister } from "./af_voice_output.js";
import { AfVoiceInput, clampInputGain } from "./af_voice_input.js";

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
  /** Replies muted; `reply_volume` is kept for when the mute is lifted. */
  reply_muted?: boolean;
  /** The microphone button: "hold" = hold to talk, "toggle" = tap to talk (absent = the host's default). */
  capture_mode?: VoiceCaptureMode;
  /** Send the transcript as soon as it arrives (absent = the host's default). */
  auto_send?: boolean;
};

/**
 * The `useGatewayVoice` options the preferences set (devices, volume, mute, input gain, capture
 * mode); spread them next to the host's transports: `useGatewayVoice({...gatewayVoiceOptions(prefs), tts_stream, transcribe})`.
 */
export function gatewayVoiceOptions(
  prefs: VoiceClientPreferences,
): Pick<GatewayVoiceOptions, "output_device_id" | "volume" | "muted" | "input_device_id" | "input_gain" | "capture_mode"> {
  return {
    output_device_id: prefs.output_device || "",
    volume: clampVolume(prefs.reply_volume),
    muted: prefs.reply_muted === true,
    input_device_id: prefs.input_device || "",
    input_gain: clampInputGain(prefs.input_gain),
    capture_mode: prefs.capture_mode === "toggle" ? "toggle" : "hold",
  };
}

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

/**
 * Spoken-language choices for transcription ("" = detected by the engine): the kit's one label
 * table (`VOICE_LANGUAGE_LABELS`). With `fetchLanguages` the section lists the languages the
 * transcription engine accepts (`GET voice/languages?kind=stt`) instead.
 */
export const VOICE_LANGUAGE_OPTIONS = [
  { value: "", label: "Detect automatically" },
  ...Object.keys(VOICE_LANGUAGE_LABELS).map((code) => ({ value: code, label: voiceLanguageLabel(code) })),
];

/** The microphone button's two ways of recording (ADR 0001 §5 wording). */
export const VOICE_CAPTURE_OPTIONS: { value: VoiceCaptureMode; label: string }[] = [
  { value: "hold", label: "Hold to talk" },
  { value: "toggle", label: "Tap to talk" },
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

/** Which rows `AfVoiceSection` shows (absent = the default). */
export type AfVoiceSectionRows = {
  /** The Text → speech override row (default true). Hide it where the host ignores it (an entity speaks with its own voice). */
  tts?: boolean;
  /** The Speech → text override row (default true). */
  stt?: boolean;
  /** The Output group: `AfVoiceOutput` (default true). */
  output?: boolean;
  /** The Mute toggle in Output (default false: shown only where the host passes `muted` to `useGatewayVoice`). */
  mute?: boolean;
  /** The Microphone group: `AfVoiceInput` + Spoken language (default true). */
  microphone?: boolean;
  /** The Replies group: Read aloud, Voice latency (default true). */
  replies?: boolean;
  /** The capture rows in Microphone, "Microphone button" and "Send what you say automatically" (default false: shown only where the host honours `capture_mode` / `auto_send`). */
  capture?: boolean;
};

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
  listDevices?: VoiceDeviceLister;
  /** Speaker selection works here (default: `audioOutputSelectable()`). */
  outputSelectable?: boolean;
  /** Inside a host card (e.g. a "Voice" settings group): sub-sections render flat, never a card in a card. */
  nested?: boolean;
  /** Voice creation through the gateway (`voice/design`, `voice/clones`); absent = no "Create a voice" panel. Alias of `voiceLibrary`. */
  createVoice?: VoiceCreation;
  /**
   * The gateway's voice library: creation plus `list` / `rename` / `remove` / `share` over
   * `voice/clones[/{id}]` and `voice/clones/{id}/deploy` (routes/voice_library.py:121-218).
   * Supersedes `createVoice` (kept as an alias); `voiceLibrary` wins when both are given.
   */
  voiceLibrary?: VoiceLibrary;
  /** Which rows show (`{tts: false}` where the host ignores the TTS override). */
  rows?: AfVoiceSectionRows;
  /** A host-owned voice (an entity's own voice picker) shown in Engines in place of the Text → speech override row. */
  ttsSlot?: ReactNode;
  /**
   * The languages an engine accepts (`GET voice/languages?kind=&provider=`, routes/voice_library.py:109-118;
   * parse with `voiceLanguagesFromAnswer`). The Spoken language list then names the transcription
   * engine's languages (the override, else the gateway default's); absent or failed = the kit's table.
   */
  fetchLanguages?: (kind: "tts" | "stt" | "cloning", provider?: string) => Promise<string[]>;
  /**
   * A short sample in the chosen voice (host-injected: every gateway TTS route needs a run or an
   * entity). Present = "Play sample" beside the voice select; it plays on the chosen speaker.
   */
  previewVoice?: (prefs: VoiceClientPreferences, text?: string) => Promise<ArrayBuffer>;
  /** What an unset `capture_mode` / `auto_send` means in this host (shown as the selected state). */
  captureDefaults?: { capture_mode?: VoiceCaptureMode; auto_send?: boolean };
  /** The live microphone level 0..1 while the host records (`voice.voice_ptt_level`): the meter moves. */
  level?: number;
  className?: string;
};

export function AfVoiceSection(p: AfVoiceSectionProps): React.ReactElement {
  const owner = p.overrideOwner || "this app";
  const disabled = Boolean(p.unavailableReason);
  const rows = p.rows || {};
  const fetcher = useRef(p.fetchCatalog);
  fetcher.current = p.fetchCatalog;
  const defaultsFetcher = useRef(p.fetchDefaults);
  defaultsFetcher.current = p.fetchDefaults;
  const languagesFetcher = useRef(p.fetchLanguages);
  languagesFetcher.current = p.fetchLanguages;
  const [catalog, setCatalog] = useState<VoiceCatalog>({});
  const [fetchedDefaults, setDefaults] = useState<{ value: VoiceDefaults | null; failed: boolean }>({ value: null, failed: false });
  const defaults = p.defaults !== undefined ? { value: p.defaults, failed: false } : fetchedDefaults;
  const hostDefaults = p.defaults !== undefined;
  const [open, setOpen] = useState<"" | "tts" | "stt">("");
  const [devicesKey, setDevicesKey] = useState(0);
  const [sttLanguages, setSttLanguages] = useState<string[] | null>(null);
  const selectable = p.outputSelectable ?? audioOutputSelectable();
  const value = p.value;
  const flat = p.nested ? "flat" : "card";
  const update = (patch: Partial<VoiceClientPreferences>) => p.onChange({ ...value, ...patch });
  const volume = clampVolume(value.reply_volume);
  const gain = clampInputGain(value.input_gain);
  const showTtsRow = rows.tts !== false && !p.ttsSlot;
  const showSttRow = rows.stt !== false;
  const showEngines = showTtsRow || showSttRow || Boolean(p.ttsSlot);
  const library = p.voiceLibrary || p.createVoice;

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

  // The transcription engine's languages: the override, else the gateway default's route.
  const sttEngine = value.stt_provider || (defaults.value?.stt?.configured ? String(defaults.value.stt.provider || "") : "");
  const hasLanguages = Boolean(p.fetchLanguages);
  useEffect(() => {
    const fetchLanguages = languagesFetcher.current;
    if (disabled || !fetchLanguages || rows.microphone === false) return;
    let alive = true;
    void fetchLanguages("stt", sttEngine || undefined)
      .then((codes) => alive && setSttLanguages(Array.isArray(codes) ? codes.map((c) => String(c).toLowerCase()).filter(Boolean) : []))
      .catch(() => alive && setSttLanguages(null));
    return () => {
      alive = false;
    };
  }, [disabled, hasLanguages, sttEngine, rows.microphone]);

  const ttsDefault = voiceDefaultSummary(defaults.value, "tts", defaults.failed);
  const sttDefault = voiceDefaultSummary(defaults.value, "stt", defaults.failed);
  const notes = [defaults.value?.tts, defaults.value?.stt].map((e) => (e && !e.configured ? e.note : "")).filter(Boolean);
  // The gateway's served hint for a configured route, verbatim (speech input on Apple silicon).
  const hints = [defaults.value?.tts, defaults.value?.stt]
    .map((e) => (e && e.configured ? String(e.hint?.sentence || "").trim() : ""))
    .filter(Boolean);
  const latencySupported = Boolean(catalog.controls?.quality_preset?.supported);
  const playOn = { deviceId: selectable ? value.output_device || "" : "", volume };
  // An engine that names no language (an open, remote one) or an unanswered list: the kit's table.
  const spokenOptions =
    sttLanguages && sttLanguages.length
      ? [{ value: "", label: "Detect automatically" }, ...sttLanguages.map((code) => ({ value: code, label: voiceLanguageLabel(code) }))]
      : VOICE_LANGUAGE_OPTIONS;
  const spoken = value.stt_language || "";
  if (spoken && !spokenOptions.some((o) => o.value === spoken)) spokenOptions.push({ value: spoken, label: `${voiceLanguageLabel(spoken)} (saved)` });
  const captureMode: VoiceCaptureMode = value.capture_mode || p.captureDefaults?.capture_mode || "hold";
  const autoSend = value.auto_send ?? p.captureDefaults?.auto_send ?? false;

  return (
    <div className={`af-voice-section${p.className ? ` ${p.className}` : ""}`}>
      {p.unavailableReason ? (
        <p className="af-settings-group__help" role="status">
          {p.unavailableReason}
        </p>
      ) : null}
      {showEngines ? (
        <AfSettingsGroup variant={flat} title="Engines" help="Which engines speak and listen.">
          {p.ttsSlot ? (
            <div className="af-voice-section__tts-slot" data-voice-slot="tts">
              {p.ttsSlot}
            </div>
          ) : null}
          {showTtsRow ? (
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
                voiceLibrary={library}
                previewVoice={p.previewVoice ? (prefs, text) => p.previewVoice!({ ...value, ...prefs }, text) : undefined}
                previewOn={playOn}
                recordFrom={{ deviceId: value.input_device || "", gain }}
              />
            </AfOverrideRow>
          ) : null}
          {showSttRow ? (
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
          ) : null}
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
          {hints.map((hint) => (
            <p key={hint} className="af-settings-group__help" data-voice-note="hint" role="note">
              {hint}
            </p>
          ))}
        </AfSettingsGroup>
      ) : null}
      {rows.output !== false ? (
        <AfSettingsGroup variant={flat} title="Output">
          <AfVoiceOutput
            value={value}
            onChange={p.onChange}
            listDevices={p.listDevices}
            outputSelectable={selectable}
            showMute={rows.mute === true}
            unavailableReason={p.unavailableReason}
            devicesKey={devicesKey}
          />
        </AfSettingsGroup>
      ) : null}
      {rows.microphone !== false ? (
        <AfSettingsGroup variant={flat} title="Microphone">
          <AfVoiceInput
            value={value}
            onChange={p.onChange}
            level={p.level}
            listDevices={p.listDevices}
            playOn={playOn}
            onDevicesChanged={() => setDevicesKey((n) => n + 1)}
            unavailableReason={p.unavailableReason}
          />
          <AfSettingRow label="Spoken language" setting="stt-language" help="Naming it skips detection: transcription is faster.">
            <AfSelect
              ariaLabel="Spoken language"
              placeholder="Detect automatically"
              value={spoken}
              options={spokenOptions}
              disabled={disabled}
              searchable={false}
              onChange={(v) => update({ stt_language: v })}
            />
          </AfSettingRow>
          {rows.capture === true ? (
            <>
              <AfSettingRow label="Microphone button" setting="capture-mode">
                <AfSelect
                  ariaLabel="Microphone button"
                  value={captureMode}
                  options={VOICE_CAPTURE_OPTIONS}
                  disabled={disabled}
                  searchable={false}
                  onChange={(v) => update({ capture_mode: v === "toggle" ? "toggle" : "hold" })}
                />
              </AfSettingRow>
              <div className="af-setting-row af-setting-row--switch" data-setting="auto-send">
                <AfSwitch
                  label="Send what you say automatically"
                  description="Off: what you say lands in the message box for you to review."
                  variant="row"
                  checked={autoSend}
                  unavailableReason={disabled ? p.unavailableReason : null}
                  reasonVisible={false}
                  onChange={(next) => update({ auto_send: next })}
                />
              </div>
            </>
          ) : null}
        </AfSettingsGroup>
      ) : null}
      {rows.replies !== false ? (
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
      ) : null}
    </div>
  );
}
