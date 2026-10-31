/** Manual speech for the shared Docs assistant, using the answer's owning run. */
import { useEffect, useRef, useState } from "react";
import { gatewayApiPath, gatewayVoiceOptions, useGatewayVoice, voiceTtsRequest, type VoiceClientPreferences, type VoiceDefaults } from "@abstractframework/ui-kit";
import { gatewayResponseError, type GatewayFetch } from "./workspace_browser.js";
import type { ChatMessage, SpeakState } from "./chat_message_card.js";

const EMPTY: VoiceClientPreferences = {};
export function docsVoiceAvailable(defaults: VoiceDefaults | null, preferences: VoiceClientPreferences = EMPTY): boolean {
  return Boolean(preferences.model || preferences.provider || defaults?.tts?.configured);
}
export async function docsSpeech(fetchGateway: GatewayFetch, message: Pick<ChatMessage,"runId"|"content">, preferences: VoiceClientPreferences, signal?: AbortSignal): Promise<ArrayBuffer> {
  if (!message.runId) throw new Error("This reply has no run available for speech.");
  const run = encodeURIComponent(message.runId);
  const response = await fetchGateway(gatewayApiPath(`runs/${run}/voice/tts`), {
    method: "POST", signal,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({text:message.content,...voiceTtsRequest(preferences)}),
  });
  if (!response.ok) throw await gatewayResponseError(response,"The reply could not be spoken");
  const result = await response.json();
  const ref = result?.audio_artifact;
  const artifact = String(ref?.$artifact || ref?.artifact_id || ref?.id || "");
  if (!artifact) throw new Error("The speech service returned no audio.");
  const audio = await fetchGateway(gatewayApiPath(`runs/${run}/artifacts/${encodeURIComponent(artifact)}/content`), {signal});
  if (!audio.ok) throw await gatewayResponseError(audio,"The speech audio could not be read");
  return audio.arrayBuffer();
}

export function useDocsVoice(props: {fetchGateway:GatewayFetch; connected:boolean; visible:boolean; scope:string; preferences?:VoiceClientPreferences; onError:(message:string)=>void}) {
  const current = useRef(props); current.current = props;
  const selected = useRef<ChatMessage | null>(null);
  const [defaults,setDefaults] = useState<VoiceDefaults | null>(null);
  useEffect(()=>{
    setDefaults(null);
    if (!props.connected) return;
    const controller = new AbortController();
    void current.current.fetchGateway(gatewayApiPath("voice/defaults"),{signal:controller.signal})
      .then(async r=>r.ok ? r.json() : null).then(v=>{if(!controller.signal.aborted)setDefaults(v);})
      .catch(()=>{ /* Unconfigured/unavailable speech leaves the normal text chat usable. */ });
    return ()=>controller.abort();
  },[props.connected,props.scope.split(":")[0]]);
  const preferences=props.preferences || EMPTY;
  const available=props.connected && docsVoiceAvailable(defaults,preferences);
  const voice=useGatewayVoice({
    ...gatewayVoiceOptions(preferences),
    tts_stream: available ? async function* (text,signal) {
      const message=selected.current;
      if (!message) throw new Error("Choose a reply to read aloud.");
      yield await docsSpeech(current.current.fetchGateway,{runId:message.runId,content:text},current.current.preferences || EMPTY,signal);
    } : undefined,
    on_error: message=>current.current.onError(message),
  });
  useEffect(()=>{voice.stop_tts();},[props.scope,props.connected,props.visible,voice.stop_tts]);
  const onSpeakToggle=available ? (message:ChatMessage)=>{
    selected.current=message;
    void voice.toggle_tts(message.id || message.runId || "",message.content);
  } : undefined;
  const getSpeakState=(message:ChatMessage):SpeakState=>voice.tts_playback.key===(message.id || message.runId || "") ? voice.tts_playback.status : "idle";
  return {onSpeakToggle,getSpeakState,stop:voice.stop_tts};
}
