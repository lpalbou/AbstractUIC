// Same-origin API paths — ONE place, and RELATIVE ("api/…", never rooted at
// "/"). Apps are served under a base path (the gateway's /apps/<id>/, a
// reverse-proxy prefix), so a same-origin request must resolve under the
// page's own base: from https://host/apps/observer/ the path
// "api/gateway/runs" reaches https://host/apps/observer/api/gateway/runs,
// which that app's server proxies to the gateway. A host whose API lives
// elsewhere passes an explicit path or base URL (every component and client
// that makes a request has that override).
//
// Relative paths assume the page URL is its base folder (ends with "/"),
// as the app servers' mounts guarantee.

/** Prefix of the gateway's API routes, as the app-origin proxy exposes them. */
export const GATEWAY_API_PATH = "api/gateway";

/** The app server's gateway connection route (session status, sign-in, sign-out). */
export const GATEWAY_CONNECTION_PATH = "api/connection/gateway";

/** `gatewayApiPath("runs/x/workspace")` → "api/gateway/runs/x/workspace" (relative). */
export function gatewayApiPath(route: string): string {
  const r = String(route || "");
  if (r.startsWith("/")) throw new Error(`gatewayApiPath takes a route relative to the gateway API, got ${JSON.stringify(r)}.`);
  return r ? `${GATEWAY_API_PATH}/${r}` : GATEWAY_API_PATH;
}

/**
 * Join a base URL and a relative path. An empty base keeps the path relative
 * to the page; "http://host:8080" or "https://host/prefix/" prefix it.
 */
export function joinBaseUrl(baseUrl: string | undefined, path: string): string {
  const p = String(path || "");
  if (p.startsWith("/")) throw new Error(`joinBaseUrl takes a relative path, got ${JSON.stringify(p)}.`);
  let b = String(baseUrl ?? "");
  while (b.endsWith("/")) b = b.slice(0, -1);
  return b ? `${b}/${p}` : p;
}

/**
 * A URL the gateway itself sends in its data (a run's ledger URL, an
 * artifact's content URL — rooted at the GATEWAY's origin, i.e. the API path
 * with a leading slash) mapped to the relative path the app requests through
 * its own proxy / base URL ("api/gateway/runs/{id}/ledger"). Never render the server string as an
 * href: under /apps/<id>/ it would bypass the app's credentials, and a
 * standalone app's proxy. Anything that is not a gateway API path throws.
 */
export function gatewayResourcePath(serverUrl: string): string {
  const u = String(serverUrl || "");
  const root = `/${GATEWAY_API_PATH}/`;
  if (!u.startsWith(root) || u.length === root.length)
    throw new Error(`Not a gateway API path: ${JSON.stringify(u)} (expected ${JSON.stringify(root)}…).`);
  // The path must stay under the API: no "." / ".." segment (plain or
  // percent-encoded, %2e/%2E), no encoded slash or backslash (%2f, %5c) and
  // no backslash, any of which a browser or proxy may normalise into a step
  // out of the base (".." would reach the app's own routes, or the gateway
  // console on a shared origin).
  const pathPart = u.slice(root.length).split(/[?#]/, 1)[0];
  if (/\\|%2f|%5c/i.test(pathPart))
    throw new Error(`Not a gateway API path: ${JSON.stringify(u)} (encoded slash or backslash).`);
  for (const segment of pathPart.split("/")) {
    const plain = segment.replace(/%2e/gi, ".");
    if (plain === "." || plain === "..")
      throw new Error(`Not a gateway API path: ${JSON.stringify(u)} (a "." or ".." segment).`);
  }
  return u.slice(1);
}

// --- ui-primitives (voice) ---
// The gateway's voice routes, relative to the gateway API (feed them to
// `gatewayApiPath`): one place instead of every app writing its own strings
// (audit voice.md §A6). Read in routes/gateway.py and routes/voice_library.py.
const seg = (value: string, what: string): string => {
  const v = String(value || "");
  if (!v) throw new Error(`A voice route needs a ${what}.`);
  return encodeURIComponent(v);
};

export const GATEWAY_VOICE_ROUTES = {
  /** GET: the default voice routes (routes/gateway.py:19418-19428). */
  defaults: "voice/defaults",
  /** GET `?compact=true&provider&model&language`: the voice catalog (routes/gateway.py:19431-19523). */
  voices: "voice/voices",
  /** GET `?kind=tts|stt|cloning&provider`: the languages each engine accepts (routes/voice_library.py:109-118). */
  languages: "voice/languages",
  /** GET `?provider&model&language` (list), POST multipart (clone): the voice library (routes/voice_library.py:121-170). */
  clones: "voice/clones",
  /** POST `{description, name?, language?, text?}`: a voice from a description (routes/voice_library.py:189-200). */
  design: "voice/design",
  /** GET: which engine supports which feature (routes/voice_library.py:221-227). */
  compatibility: "voice/compatibility",
} as const;

/** GET / PATCH / DELETE one library voice: "voice/clones/{voice_id}" (routes/voice_library.py:133-186). */
export function voiceClonePath(voiceId: string): string {
  return `voice/clones/${seg(voiceId, "voice id")}`;
}

/** POST (administrators): share a voice with everyone (routes/voice_library.py:203-218). */
export function voiceCloneDeployPath(voiceId: string): string {
  return `${voiceClonePath(voiceId)}/deploy`;
}

/** POST: speech for a run, whole ("runs/{id}/voice/tts", routes/gateway.py:12753) or streamed as JSON lines (:12950). */
export function runVoiceTtsPath(runId: string, stream = false): string {
  return `runs/${seg(runId, "run id")}/voice/tts${stream ? "/stream" : ""}`;
}

/** POST: transcribe an uploaded recording for a run (routes/gateway.py:13322). */
export function runTranscribePath(runId: string): string {
  return `runs/${seg(runId, "run id")}/audio/transcribe`;
}

/** GET / PUT an entity's own voice; with `tts`, speech in that voice (routes/entities.py:5293, :5341, :5451, :5470). */
export function entityVoicePath(entity: string, tts: "" | "tts" | "tts/stream" = ""): string {
  return `entities/${seg(entity, "entity name")}/voice${tts ? `/${tts}` : ""}`;
}
