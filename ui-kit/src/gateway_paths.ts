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

// --- ui-primitives (tools-models) ---
// The gateway routes the tool and model pickers read (relative to the gateway API; build the
// request path with gatewayApiPath). Read in the live gateway source, routes/gateway.py:
/** `GET discovery/tools` → `{items:[{name, toolset, enabled, approval_default, risk_rank, …}], tool_mode}` (:15568). */
export const GATEWAY_TOOLS_ROUTE = "discovery/tools";
/** `GET discovery/providers?include_models=` → `{items:[{id, label, …}], default_provider, default_model}` (:20322). */
export const GATEWAY_PROVIDERS_ROUTE = "discovery/providers";
/** `GET discovery/models/capabilities?model_name&provider` → `{capabilities, execution:{speculation}}` (:20671). */
export const GATEWAY_MODEL_CAPABILITIES_ROUTE = "discovery/models/capabilities";
/** `GET config/capability-defaults` → `{routes:[{key, provider, model, reasoning, options, source}]}` (:27748). */
export const GATEWAY_CAPABILITY_DEFAULTS_ROUTE = "config/capability-defaults";
/** `GET discovery/capabilities` → `{capabilities:{contracts:{common:{runs:{start:{thinking_control}}}}}}` (:19285). */
export const GATEWAY_CAPABILITIES_ROUTE = "discovery/capabilities";
/** `GET discovery/providers/{provider}/models` (:20475); the provider is one encoded path segment. */
export function gatewayProviderModelsRoute(provider: string): string {
  const p = String(provider || "").trim();
  if (!p) throw new Error("gatewayProviderModelsRoute needs a provider.");
  return `${GATEWAY_PROVIDERS_ROUTE}/${encodeURIComponent(p)}/models`;
}
