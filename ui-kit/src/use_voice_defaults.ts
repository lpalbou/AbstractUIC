// useVoiceDefaults — the gateway's default voice routes, read once per
// gateway (ui-primitives 0035; absorbs the Code, Observer and Entity copies,
// audit voice.md §E1). The ONE source of "Gateway default · provider / model"
// (`GET voice/defaults`, routes/gateway.py:19418-19428): pass the result to
// `AfVoiceSection.defaults` so the section does not fetch it a second time.
import { useCallback, useEffect, useRef, useState } from "react";
import type { VoiceDefaults } from "./voice_devices.js";

export type VoiceDefaultsState = {
  /** The answer (null while loading, without a gateway, or when it failed). */
  value: VoiceDefaults | null;
  /** The gateway could not answer: "Gateway default · unknown". */
  failed: boolean;
  /** Ask again (after the administrator changed the defaults). */
  reload: () => void;
};

/**
 * `fetchDefaults` null = no gateway (disconnected): nothing is fetched and the state is empty.
 * The function is read at fetch time; it is called again when `key` changes (another gateway,
 * another account) or when it appears after being null.
 */
export function useVoiceDefaults(fetchDefaults: (() => Promise<VoiceDefaults>) | null | undefined, key: unknown = ""): VoiceDefaultsState {
  const fetcher = useRef(fetchDefaults);
  fetcher.current = fetchDefaults;
  const [state, setState] = useState<{ value: VoiceDefaults | null; failed: boolean }>({ value: null, failed: false });
  const [round, setRound] = useState(0);
  const present = Boolean(fetchDefaults);
  useEffect(() => {
    const fetch = fetcher.current;
    if (!fetch) {
      setState((s) => (s.value === null && !s.failed ? s : { value: null, failed: false }));
      return;
    }
    let alive = true;
    void fetch()
      .then((value) => alive && setState({ value: value || {}, failed: false }))
      .catch(() => alive && setState({ value: null, failed: true }));
    return () => {
      alive = false;
    };
  }, [present, key, round]);
  const reload = useCallback(() => setRound((n) => n + 1), []);
  return { value: state.value, failed: state.failed, reload };
}
