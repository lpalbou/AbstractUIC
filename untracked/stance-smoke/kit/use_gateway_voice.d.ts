export type TtsPlaybackStatus = "idle" | "loading" | "playing" | "paused";
export type GatewayVoiceOptions = {
    /** Synthesize text to audio bytes (absent = TTS unsupported). */
    tts?: (text: string) => Promise<ArrayBuffer>;
    /**
     * Streaming synthesis (operator item 3, 2026-07-13): yields decodable audio
     * segments (each a complete WAV — the gateway's tts/stream JSONL events
     * carry standalone wav-segments) as synthesis progresses. When present it
     * is PREFERRED over `tts`: long messages start speaking on the first
     * segment instead of waiting for full synthesis. `streamTtsJsonl` is the
     * ready-made transport for the gateway endpoint.
     */
    tts_stream?: (text: string) => AsyncIterable<ArrayBuffer>;
    /** Transcribe a recorded blob to text (absent = PTT unsupported). */
    transcribe?: (blob: Blob, mime: string) => Promise<string>;
    on_error?: (message: string) => void;
    on_transcript?: (text: string) => void;
};
/**
 * Transport helper for the gateway streaming TTS endpoint
 * (`POST /api/gateway/runs/{run_id}/voice/tts/stream`, JSON-Lines): parses
 * events, decodes `audio_b64` wav-segments, ends on the terminal
 * done/cancelled event, throws on error events. Aborts the HTTP request when
 * the consumer stops iterating (pause keeps the stream; stop kills it).
 */
export declare function streamTtsJsonl(opts: {
    path: string;
    body: Record<string, unknown>;
    /** CSRF twin for the app-origin proxy (mutating POST). */
    csrfToken?: string;
    /** Extra headers — the direct-bearer posture passes Authorization here (entity c1242). */
    headers?: Record<string, string>;
}): AsyncGenerator<ArrayBuffer>;
export type GatewayVoice = {
    tts_supported: boolean;
    tts_playback: {
        key: string;
        status: TtsPlaybackStatus;
    };
    toggle_tts: (msg_key: string, text: string) => Promise<void>;
    stop_tts: () => void;
    voice_ptt_supported: boolean;
    voice_ptt_recording: boolean;
    voice_ptt_busy: boolean;
    start_voice_ptt_recording: () => Promise<void>;
    stop_voice_ptt_recording: () => void;
};
export declare function useGatewayVoice(opts: GatewayVoiceOptions): GatewayVoice;
export default useGatewayVoice;
//# sourceMappingURL=use_gateway_voice.d.ts.map