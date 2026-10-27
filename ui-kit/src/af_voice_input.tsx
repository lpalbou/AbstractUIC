// AfVoiceInput — voice IN as one composable (ui-primitives 0035, ADR 0001 §8):
//
//   Input device   [System default ▾]   [Test]
//   ▮▮▮▯▯ (live level: during Test, and during real recording via `level`)
//   Input level    ───●── 100 %          (where Web Audio allows)
//
// The rows `AfVoiceSection` shows under "Microphone", usable alone (a composer
// popover, a dictation panel). Controlled: the host keeps `input_device` and
// `input_gain` and passes them to `useGatewayVoice` (`input_device_id`,
// `input_gain`). `value` may be the whole preference object: `onChange` returns
// it with the patch merged.
//
// The meter shows the Test's level while the Test records, else the host's live
// level (`levelSource={voice}` from `useGatewayVoice`: the meter then moves while
// the user really speaks, and only the meter re-renders). Test records 3 s from the chosen
// microphone and plays it back on `playOn` (the chosen speaker, reply volume).
// Device names appear once the microphone is allowed ("Show names").
import React, { useEffect, useId, useRef, useState } from "react";
import { AfSelect } from "./af_select.js";
import { AfSettingRow } from "./af_settings_rows.js";
import type { VoiceDeviceLister } from "./af_voice_output.js";
import { AfVoiceLevelMeter, type VoiceLevelSource } from "./af_voice_level_meter.js";
import {
  SILENT_LEVEL,
  inputGainSupported,
  listVoiceDevices,
  microphoneErrorSentence,
  playOnDevice,
  recordSample,
  unlockDeviceLabels,
  type VoiceDevice,
} from "./voice_devices.js";

/** The preferences voice IN reads and writes. */
export type VoiceInputValue = {
  /** `MediaDeviceInfo.deviceId` of the microphone; "" = system default. */
  input_device?: string;
  /** Input gain for recordings, 0.5..1.5 (1 = unchanged). */
  input_gain?: number;
};

export type AfVoiceInputLabels = {
  device?: string;
  gain?: string;
  test?: string;
};

export type AfVoiceInputProps<T extends VoiceInputValue = VoiceInputValue> = {
  value: T;
  /** The whole value with the change merged. */
  onChange: (next: T) => void;
  /**
   * The host's live recording level: pass the `voice` from `useGatewayVoice` (its
   * `subscribe_level`); only the meter re-renders while the user speaks.
   */
  levelSource?: VoiceLevelSource | null;
  /** A level 0..1 the host already holds; wins over `levelSource`. */
  level?: number;
  /** Devices of a kind (default: `navigator.mediaDevices.enumerateDevices()`). */
  listDevices?: VoiceDeviceLister;
  /** Where the Test plays the recording back (default: the system output at full volume). */
  playOn?: { deviceId?: string; volume?: number };
  /** Device names were unlocked or the Test ran: the host re-reads its other device lists. */
  onDevicesChanged?: () => void;
  /** Why voice cannot be configured now; disables every control. */
  unavailableReason?: string | null;
  /** Relabel a row only when the job differs (ADR 0001 §5). */
  labels?: AfVoiceInputLabels;
  className?: string;
};

type MicTest = { phase: "idle" | "recording" | "playing"; message: string; tone: "info" | "ok" | "error" };

const percent = (v: number) => `${Math.round(v * 100)} %`;

/** Input gain preference 0.5..1.5 (absent or invalid = 1). */
export function clampInputGain(v: unknown): number {
  const n = Number(v);
  if (v === undefined || v === null || v === "" || !Number.isFinite(n) || n <= 0) return 1;
  return Math.min(1.5, Math.max(0.5, n));
}

export function AfVoiceInput<T extends VoiceInputValue>(p: AfVoiceInputProps<T>): React.ReactElement {
  const disabled = Boolean(p.unavailableReason);
  const gainId = useId();
  const [inputs, setInputs] = useState<{ devices: VoiceDevice[]; labelled: boolean }>({ devices: [], labelled: true });
  const [deviceNote, setDeviceNote] = useState("");
  const [micTest, setMicTest] = useState<MicTest>({ phase: "idle", message: "", tone: "info" });
  const [testLevel, setTestLevel] = useState(0);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const gainSupported = inputGainSupported();
  const value = p.value;
  const update = (patch: VoiceInputValue) => p.onChange({ ...value, ...patch });
  const gain = clampInputGain(value.input_gain);
  const lister = p.listDevices || listVoiceDevices;
  const listerRef = useRef(lister);
  listerRef.current = lister;
  const loadDevices = () => {
    void listerRef
      .current("audioinput")
      .then((d) => alive.current && setInputs(d))
      .catch(() => alive.current && setInputs({ devices: [], labelled: false }));
  };
  useEffect(() => {
    if (!disabled) loadDevices();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [disabled]);

  const showNames = () => {
    setDeviceNote("");
    void unlockDeviceLabels()
      .then(() => {
        loadDevices();
        p.onDevicesChanged?.();
      })
      .catch((e) => alive.current && setDeviceNote(microphoneErrorSentence(e)));
  };

  const test = () => {
    setMicTest({ phase: "recording", message: "Recording 3 seconds — say something.", tone: "info" });
    void recordSample({ deviceId: value.input_device || "", ms: 3000, gain, onLevel: (v) => alive.current && setTestLevel(v) })
      .then(async ({ blob, peak }) => {
        if (!alive.current) return;
        if (peak < SILENT_LEVEL) {
          setMicTest({ phase: "idle", message: "The microphone recorded silence. Pick another input, or raise its level in the system sound settings.", tone: "error" });
          return;
        }
        setMicTest({ phase: "playing", message: "Playing it back…", tone: "info" });
        await playOnDevice(blob, { deviceId: p.playOn?.deviceId || "", volume: p.playOn?.volume });
        if (!alive.current) return;
        setMicTest({ phase: "idle", message: `The microphone works (peak level ${percent(peak)}).`, tone: "ok" });
        loadDevices();
        p.onDevicesChanged?.();
      })
      .catch((e) => alive.current && setMicTest({ phase: "idle", message: microphoneErrorSentence(e), tone: "error" }));
  };

  const saved = value.input_device || "";
  const options = [
    { value: "", label: "System default" },
    ...inputs.devices.map((o) => ({ value: o.id, label: o.label })),
    ...(saved && !inputs.devices.some((o) => o.id === saved) ? [{ value: saved, label: "Saved microphone (not connected)" }] : []),
  ];
  const busy = micTest.phase !== "idle";
  const testing = micTest.phase === "recording";
  const deviceLabel = p.labels?.device || "Input device";
  const gainLabel = p.labels?.gain || "Input level";
  return (
    <div className={`af-voice-input${p.className ? ` ${p.className}` : ""}`} data-voice-input>
      <AfSettingRow
        label={deviceLabel}
        setting="input-device"
        trailing={
          <button type="button" className="af-setting-btn" data-action="test-microphone" disabled={disabled || busy} onClick={test}>
            {micTest.phase === "recording" ? "Recording…" : micTest.phase === "playing" ? "Playing…" : p.labels?.test || "Test"}
          </button>
        }
      >
        <AfSelect
          ariaLabel={deviceLabel}
          placeholder="System default"
          value={saved}
          options={options}
          disabled={disabled}
          searchable={false}
          onOpen={loadDevices}
          onChange={(id) => update({ input_device: id })}
        />
      </AfSettingRow>
      {/* The Test's own level while it records; otherwise the host's live recording level. */}
      <AfVoiceLevelMeter source={testing ? null : p.levelSource} level={testing ? testLevel : p.level} origin={testing ? "test" : "live"} />
      {micTest.message ? (
        <p className={`af-voice-note af-voice-note--${micTest.tone}`} role="status" data-voice-note="microphone">
          {micTest.message}
        </p>
      ) : null}
      {!inputs.labelled && !disabled ? (
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
      {gainSupported ? (
        <AfSettingRow label={gainLabel} setting="input-gain" htmlFor={gainId} help="Raises a quiet microphone.">
          <input
            id={gainId}
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
    </div>
  );
}
