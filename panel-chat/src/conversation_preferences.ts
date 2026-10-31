import { useEffect, useRef, useState } from "react";
import { DEFAULT_CONVERSATION_CUES, type ConversationCue, type ConversationCuePreferences } from "./conversation_model.js";

type Mode = "chat" | "avatar";
function read(scope: string): { mode: Mode; preferences: ConversationCuePreferences; error: string | null } {
  try {
    const raw = typeof localStorage === "undefined" ? null : localStorage.getItem(`abstract.conversation:${scope}`);
    if (!raw) return { mode: "chat", preferences: DEFAULT_CONVERSATION_CUES, error: null };
    const saved = JSON.parse(raw);
    const preferences = Object.fromEntries((["approval", "question", "completion"] as const).map((kind) => [kind, { visual: saved.preferences?.[kind]?.visual !== false, audio: saved.preferences?.[kind]?.audio === true, haptic: saved.preferences?.[kind]?.haptic === true }])) as ConversationCuePreferences;
    return { mode: saved.mode === "avatar" ? "avatar" : "chat", preferences, error: null };
  } catch (error) { return { mode: "chat", preferences: DEFAULT_CONVERSATION_CUES, error: `Conversation preferences could not be loaded: ${String(error)}` }; }
}

/** Host/user-scoped local preferences; callers must include their owner identity in scope. */
export function useAvatarConversationPreferences(scope: string) {
  const [saved, setSaved] = useState(() => ({ scope, ...read(scope) }));
  const current = saved.scope === scope ? saved : { scope, ...read(scope) };
  const stateRef = useRef(current);
  stateRef.current = current;
  useEffect(() => { if (saved.scope !== scope) setSaved({ scope, ...read(scope) }); }, [scope, saved.scope]);
  const write = (change: { mode?: Mode; preferences?: ConversationCuePreferences }) => {
    const next = { ...stateRef.current, ...change, scope, error: null as string | null };
    try { if (typeof localStorage !== "undefined") localStorage.setItem(`abstract.conversation:${scope}`, JSON.stringify({ mode: next.mode, preferences: next.preferences })); }
    catch (error) { next.error = `Conversation preferences could not be saved: ${String(error)}`; }
    stateRef.current = next;
    setSaved(next);
  };
  return { mode: current.mode, setMode: (mode: Mode) => write({ mode }), preferences: current.preferences, setPreferences: (preferences: ConversationCuePreferences) => write({ preferences }), error: current.error };
}

/** Optional local earcon. Call only for a fresh onCue and after audio was enabled by a user. */
export async function playConversationCue(cue: ConversationCue): Promise<void> {
  if (!cue.channels.audio) return;
  if (typeof window === "undefined" || !window.AudioContext) throw new Error("Audio cues are unavailable in this browser.");
  const context = new window.AudioContext();
  try {
    await context.resume();
    if (context.state !== "running") throw new Error("Enable audio with a browser interaction before playing conversation cues.");
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.frequency.value = cue.kind === "approval" ? 440 : cue.kind === "question" ? 600 : 800;
    gain.gain.setValueAtTime(0.035, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.18);
    oscillator.connect(gain); gain.connect(context.destination);
    oscillator.start(); oscillator.stop(context.currentTime + 0.2);
    await new Promise<void>((resolve) => { oscillator.onended = () => resolve(); });
  } finally { await context.close(); }
}
