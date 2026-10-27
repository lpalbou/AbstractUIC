// useVoicePreferences — the client's voice preferences in this browser
// (ui-primitives 0035; absorbs the Code, Observer and Entity copies, audit
// voice.md §E1). One storage convention: a JSON object under `storageKey` in
// localStorage, shared by every component of the page that uses the same key
// (Settings → Voice, the composer microphone, a read-aloud button) AND by the
// app's other tabs (the `storage` event). The gateway keeps no voice
// preference per account today (account_preferences.py:17-22: a gateway gap).
import { useCallback, useEffect, useState } from "react";
import type { VoiceClientPreferences } from "./af_voice_section.js";

type Listener = (prefs: VoiceClientPreferences) => void;
const listeners = new Map<string, Set<Listener>>();

const storage = (): Storage | null => {
  try {
    return (globalThis as any).localStorage || null;
  } catch {
    return null;
  }
};

const parse = (raw: string | null | undefined): VoiceClientPreferences => {
  try {
    const parsed = raw ? JSON.parse(raw) : null;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as VoiceClientPreferences) : {};
  } catch {
    return {};
  }
};

/** The stored preferences under `storageKey` ({} when none, unreadable or storage refused). */
export function loadVoicePreferences(storageKey: string): VoiceClientPreferences {
  return parse(storage()?.getItem(storageKey));
}

/**
 * Store the preferences under `storageKey` and tell every `useVoicePreferences(storageKey)` of
 * this page. Storage refused (private mode): the choice still applies to the page.
 */
export function saveVoicePreferences(storageKey: string, next: VoiceClientPreferences): void {
  const value = next && typeof next === "object" ? next : {};
  try {
    storage()?.setItem(storageKey, JSON.stringify(value));
  } catch {
    // storage refused: the page keeps it in memory
  }
  for (const fn of Array.from(listeners.get(storageKey) || [])) fn(value);
}

/**
 * `[prefs, setPrefs]` kept under `storageKey` and in sync across the page and the app's tabs.
 * `storageKey` null = not stored (no account yet): in-memory preferences only. A new key loads
 * that key's preferences (another account).
 */
export function useVoicePreferences(storageKey: string | null): [VoiceClientPreferences, (next: VoiceClientPreferences) => void] {
  const [state, setState] = useState<{ key: string | null; prefs: VoiceClientPreferences }>(() => ({
    key: storageKey,
    prefs: storageKey ? loadVoicePreferences(storageKey) : {},
  }));
  // Another key (another account): read its preferences in the same render.
  const current = state.key === storageKey ? state : { key: storageKey, prefs: storageKey ? loadVoicePreferences(storageKey) : {} };
  if (current !== state) setState(current);
  useEffect(() => {
    if (!storageKey) return;
    const onSame: Listener = (prefs) => setState({ key: storageKey, prefs });
    let set = listeners.get(storageKey);
    if (!set) listeners.set(storageKey, (set = new Set()));
    set.add(onSame);
    const onStorage = (e: StorageEvent) => {
      if (e.key !== storageKey) return;
      setState({ key: storageKey, prefs: parse(e.newValue) });
    };
    const w: any = globalThis as any;
    w.addEventListener?.("storage", onStorage);
    return () => {
      set!.delete(onSame);
      if (!set!.size) listeners.delete(storageKey);
      w.removeEventListener?.("storage", onStorage);
    };
  }, [storageKey]);
  const change = useCallback(
    (next: VoiceClientPreferences) => {
      if (storageKey) saveVoicePreferences(storageKey, next);
      else setState({ key: null, prefs: next || {} });
    },
    [storageKey],
  );
  return [current.prefs, change];
}
