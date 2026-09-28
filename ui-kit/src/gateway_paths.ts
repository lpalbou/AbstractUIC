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
