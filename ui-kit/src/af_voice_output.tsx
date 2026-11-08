// AfVoiceOutput — voice OUT as one composable (ui-primitives 0035, ADR 0001 §8):
//
//   Output device   [System default ▾]   [Test]
//   Reply volume    ───●── 80 %           [Mute]
//
// The rows `AfVoiceSection` shows under "Output", usable alone wherever voice
// settings appear (a composer popover, a rail panel). Controlled: the host
// keeps the preferences (`output_device`, `reply_volume`, `reply_muted`) and
// passes them to `useGatewayVoice` (`output_device_id`, `volume`, `muted`;
// `gatewayVoiceOptions()` maps them). `value` may be the whole preference
// object: `onChange` returns it with the patch merged.
//
// The Output device control is always usable (operator 2026-11-07: "we should always be able to
// change that"). Where the browser routes Web Audio to a chosen speaker (Chromium: setSinkId) it
// lists the speakers (their names after one microphone permission) and switches. Everywhere it
// offers "Follow the system output (default)" and "Re-open audio", which rebuilds every audio graph
// of the page on the current system output (`reopenAudioOutput`); Safari, which cannot choose a
// speaker, says it follows the macOS output. The Test chime plays on the chosen speaker at the
// reply volume, also while replies are muted (a test the user asked for).
import React, { useEffect, useId, useRef, useState } from "react";
import { AfSelect } from "./af_select.js";
import { AfSettingRow } from "./af_settings_rows.js";
import { audioOutputSelectable } from "./use_gateway_voice.js";
import { CHIME_FAILED, CHIME_FAILED_SYSTEM, clampVolume, listVoiceDevices, playTestTone, reopenAudioOutput, unlockDeviceLabels, type VoiceDevice } from "./voice_devices.js";

/** The preferences voice OUT reads and writes. */
export type VoiceOutputValue = {
  /** `MediaDeviceInfo.deviceId` of an audio output; "" = system default. */
  output_device?: string;
  /** Reply volume 0..1 (absent = 1). */
  reply_volume?: number;
  /** Replies muted; the volume is kept for when the mute is lifted. */
  reply_muted?: boolean;
};

export type VoiceDeviceLister = (kind: "audioinput" | "audiooutput") => Promise<{ devices: VoiceDevice[]; labelled: boolean }>;

export type AfVoiceOutputLabels = {
  device?: string;
  volume?: string;
  test?: string;
};

export type AfVoiceOutputProps<T extends VoiceOutputValue = VoiceOutputValue> = {
  value: T;
  /** The whole value with the change merged. */
  onChange: (next: T) => void;
  /** Devices of a kind (default: `navigator.mediaDevices.enumerateDevices()`). */
  listDevices?: VoiceDeviceLister;
  /** Speaker selection works here (default: `audioOutputSelectable()`). */
  outputSelectable?: boolean;
  /** The Mute toggle (default true; pass false where the host does not pass `muted` to `useGatewayVoice`). Unmute is always shown while muted. */
  showMute?: boolean;
  /** Re-open audio (default: `reopenAudioOutput`, every long-lived audio graph of the page). */
  reopenAudio?: () => Promise<void>;
  /** Reveal the speakers' names (default: `unlockDeviceLabels`, one microphone permission). */
  unlockLabels?: () => Promise<void>;
  /** Why voice cannot be configured now; disables every control. */
  unavailableReason?: string | null;
  /** Re-read the device list when this changes (the microphone permission was just granted). */
  devicesKey?: unknown;
  /** Relabel a row only when the job differs (ADR 0001 §5). */
  labels?: AfVoiceOutputLabels;
  className?: string;
};

const percent = (v: number) => `${Math.round(v * 100)} %`;

export const SAFARI_OUTPUT_NOTE = "Safari follows the system output chosen in macOS Sound settings.";
/** The same fact for another browser that cannot choose a speaker (Firefox). */
export const SYSTEM_OUTPUT_NOTE = "This browser follows the system output chosen in the system sound settings.";

function systemOutputNote(): string {
  const ua = String((globalThis as any).navigator?.userAgent || "");
  return /Safari\//.test(ua) && !/Chrom(e|ium)\/|Firefox\/|Edg\//.test(ua) ? SAFARI_OUTPUT_NOTE : SYSTEM_OUTPUT_NOTE;
}

/** The Output device entries that act instead of choosing a speaker. */
export const OUTPUT_ACTION_REOPEN = "action:reopen-audio";
export const OUTPUT_ACTION_NAMES = "action:speaker-names";
export const OUTPUT_DEFAULT_LABEL = "Follow the system output (default)";

export function AfVoiceOutput<T extends VoiceOutputValue>(p: AfVoiceOutputProps<T>): React.ReactElement {
  const disabled = Boolean(p.unavailableReason);
  const selectable = p.outputSelectable ?? audioOutputSelectable();
  const volumeId = useId();
  const [outputs, setOutputs] = useState<{ devices: VoiceDevice[]; labelled: boolean }>({ devices: [], labelled: true });
  const [note, setNote] = useState<{ text: string; tone: "info" | "ok" | "error" }>({ text: "", tone: "info" });
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const value = p.value;
  const update = (patch: VoiceOutputValue) => p.onChange({ ...value, ...patch });
  const volume = clampVolume(value.reply_volume);
  const muted = value.reply_muted === true;
  // A muted value always offers Unmute, whatever the host's `showMute`: "Muted" with no way back
  // would strand the user (review 2026-10-27 M2).
  const showMute = p.showMute !== false || muted;
  const lister = p.listDevices || listVoiceDevices;
  const listerRef = useRef(lister);
  listerRef.current = lister;
  const loadDevices = () => {
    if (!selectable) return;
    void listerRef
      .current("audiooutput")
      .then((d) => alive.current && setOutputs(d))
      .catch(() => alive.current && setOutputs({ devices: [], labelled: false }));
  };
  useEffect(() => {
    if (!disabled) loadDevices();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectable, disabled, p.devicesKey]);

  const test = () => {
    setNote({ text: "Playing a short chime…", tone: "info" });
    void playTestTone({ deviceId: selectable ? value.output_device || "" : "", volume })
      .then(() => {
        if (!alive.current) return;
        const heard = selectable
          ? "Chime played. Heard nothing? Pick Re-open audio, another output, or raise the volume."
          : "Chime played. Heard nothing? Pick Re-open audio, or raise the volume.";
        setNote({ text: muted ? `${heard} Replies are muted: unmute them to hear them.` : heard, tone: "ok" });
      })
      .catch((e) => alive.current && setNote({ text: e?.name === "ChimeError" ? (selectable ? CHIME_FAILED : CHIME_FAILED_SYSTEM) : `The speaker test failed: ${String(e?.message || e).replace(/\.$/, "")}.`, tone: "error" }));
  };

  const reopen = () => {
    setNote({ text: "Re-opening audio…", tone: "info" });
    void (p.reopenAudio || reopenAudioOutput)()
      .then(() => alive.current && setNote({ text: "Audio re-opened on the current system output. Press Test to hear it.", tone: "ok" }))
      .catch((e) => alive.current && setNote({ text: `Audio could not be re-opened: ${String(e?.message || e).replace(/\.$/, "")}.`, tone: "error" }));
  };
  const showNames = () => {
    void (p.unlockLabels || unlockDeviceLabels)()
      .then(() => loadDevices())
      .catch((e) => alive.current && setNote({ text: `The speaker names stay hidden: ${String(e?.message || e).replace(/\.$/, "")}.`, tone: "error" }));
  };
  const choose = (id: string) => {
    if (id === OUTPUT_ACTION_REOPEN) return reopen();
    if (id === OUTPUT_ACTION_NAMES) return showNames();
    update({ output_device: id });
  };

  const saved = value.output_device || "";
  const options = [
    { value: "", label: OUTPUT_DEFAULT_LABEL },
    ...(selectable ? outputs.devices.map((o) => ({ value: o.id, label: o.label })) : []),
    ...(selectable && saved && !outputs.devices.some((o) => o.id === saved) ? [{ value: saved, label: "Saved speaker (not connected)" }] : []),
    ...(selectable && !outputs.labelled ? [{ value: OUTPUT_ACTION_NAMES, label: "Show the speakers (asks for the microphone once)" }] : []),
    { value: OUTPUT_ACTION_REOPEN, label: "Re-open audio" },
  ];
  const deviceLabel = p.labels?.device || "Output device";
  const volumeLabel = p.labels?.volume || "Reply volume";
  return (
    <div className={`af-voice-output${p.className ? ` ${p.className}` : ""}`} data-voice-output>
      <AfSettingRow
        label={deviceLabel}
        setting="output-device"
        help={selectable ? undefined : systemOutputNote()}
        trailing={
          <button type="button" className="af-setting-btn" data-action="test-speaker" disabled={disabled} onClick={test}>
            {p.labels?.test || "Test"}
          </button>
        }
      >
        <AfSelect
          ariaLabel={deviceLabel}
          placeholder={OUTPUT_DEFAULT_LABEL}
          value={selectable ? saved : ""}
          options={options}
          disabled={disabled}
          searchable={false}
          onOpen={loadDevices}
          onChange={choose}
        />
      </AfSettingRow>
      {note.text ? (
        <p className={`af-voice-note af-voice-note--${note.tone}`} role="status" data-voice-note="speaker">
          {note.text}
        </p>
      ) : null}
      <AfSettingRow
        label={volumeLabel}
        setting="reply-volume"
        htmlFor={volumeId}
        trailing={
          showMute ? (
            <button
              type="button"
              className="af-setting-btn"
              data-action="mute-replies"
              disabled={disabled}
              onClick={() => update({ reply_muted: !muted })}
            >
              {muted ? "Unmute" : "Mute"}
            </button>
          ) : undefined
        }
      >
        <input
          id={volumeId}
          className="af-voice-range"
          type="range"
          min={0}
          max={100}
          step={5}
          value={Math.round(volume * 100)}
          disabled={disabled}
          aria-valuetext={muted ? `Muted (${percent(volume)})` : percent(volume)}
          onChange={(e) => update({ reply_volume: Number(e.currentTarget.value) / 100 })}
        />
        <span className="af-voice-range__value" data-voice-volume={muted ? "muted" : "on"}>
          {muted ? "Muted" : percent(volume)}
        </span>
      </AfSettingRow>
    </div>
  );
}
