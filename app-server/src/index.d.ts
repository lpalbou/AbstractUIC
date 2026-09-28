import type { IncomingMessage, ServerResponse } from "node:http";

export function normalizeGatewayUrl(value: string): string;

export type GatewaySessionProxyOptions = {
  /** Short app id (e.g. "abstractflow"); prefixes cookies + the app CSRF header. */
  appId: string;
  /** A URL, or a resolver re-read when a connection fails. Default: ABSTRACTGATEWAY_URL (legacy) > pointer > 8080. */
  defaultGatewayUrl?: string | { current(): string; refresh(): boolean };
  connectionPath?: string;
  proxyPrefix?: string;
  allowRemoteConfigEnvVars?: string[];
  allowUrlCookieEnvVars?: string[];
  trustProxyEnvVars?: string[];
  gatewayTimeoutMs?: number;
};

export type GatewaySessionProxy = {
  /** Returns true when the request was handled (connection endpoint or proxied API call). */
  handle(req: IncomingMessage, res: ServerResponse, pathname?: string): boolean;
  handleConnectionApi(req: IncomingMessage, res: ServerResponse): Promise<void>;
  proxyApiRequest(req: IncomingMessage, res: ServerResponse): void;
  browserSession(req: IncomingMessage): { gatewayUrl: string; sessionId: string; csrfToken: string };
  defaultGatewayUrl: string;
  connectionPath: string;
  cookieNames: { url: string; session: string; csrf: string };
  csrfHeaderNames: string[];
};

export function createGatewaySessionProxy(options: GatewaySessionProxyOptions): GatewaySessionProxy;

// ---- Serving under the gateway's /apps/<id>/ (mount.js) -------------------

export const APP_IDENTITY_HEADER: "X-AbstractFramework-App";
export const FORWARDED_PREFIX_HEADER: "X-Forwarded-Prefix";

/** A request to refuse (status 400): malformed forwarded header or unknown client address. */
export class MountRequestError extends Error {
  status: number;
  constructor(message: string, status?: number);
}

export type RequestContext = Readonly<{
  /** The browser's address (X-Forwarded-For from a loopback peer, else the socket peer). */
  clientAddress: string;
  /** The browser is on this machine: a loopback clientAddress AND hostIsLoopback (never a DNS-rebinding page). */
  clientIsLoopback: boolean;
  /** The raw Host (and X-Forwarded-Host from a loopback peer) name loopback: localhost, *.localhost, ::1, 127.x literal. */
  hostIsLoopback: boolean;
  /** "" or the validated X-Forwarded-Prefix, e.g. "/apps/flow" (no trailing slash). */
  basePath: string;
  proto: "http" | "https";
  host: string;
  /** A loopback peer sent X-Forwarded-* headers. */
  forwarded: boolean;
}>;

export function isLoopbackAddress(addr: string): boolean;
/** `localhost`, `*.localhost`, `::1` or a 127.x IP literal (never a DNS name). */
export function isLoopbackHostname(host: string): boolean;
export function socketPeerAddress(req: IncomingMessage): string;
export function validateBasePath(raw: string | undefined | null): string;
/** Memoized per request. Throws MountRequestError. */
export function requestContext(req: IncomingMessage): RequestContext;
export function identityHeaderValue(appId: string): string;
export function setIdentityHeader(res: ServerResponse, appId: string): void;
export function appPath(basePath: string, path?: string): string;
export function cookiePath(basePath: string): string;
export function serializeCookie(
  name: string,
  value: string,
  options?: { basePath?: string; path?: string; httpOnly?: boolean; secure?: boolean; maxAge?: number; sameSite?: "Lax" | "Strict" | "None" }
): string;
/** First value wins (the most specific cookie Path is sent first). */
export function parseCookies(reqOrHeader: IncomingMessage | string): Record<string, string>;
export function injectShell(html: string, options?: { basePath?: string; config?: Record<string, unknown> }): string;
export function createMountedHandler(
  options: { appId: string },
  handler: (req: IncomingMessage, res: ServerResponse, ctx: RequestContext) => void
): (req: IncomingMessage, res: ServerResponse) => void;
export function rejectUpgrade(socket: import("node:net").Socket | import("node:stream").Duplex, status: number, message?: string): void;

// ---- Launch flags (flags.js) -----------------------------------------------

export class FlagError extends Error {}

export type AppFlagSpec = { type: "boolean" | "string"; help?: string; metavar?: string };

export type AppFlagsOptions = {
  appName?: string;
  command?: string;
  /** Legacy env prefix: "<PREFIX>_GATEWAY_URL". */
  envPrefix?: string;
  defaultPort: number;
  defaultHost?: string;
  extra?: Record<string, AppFlagSpec>;
  env?: Record<string, string | undefined>;
  savedUrl?: string;
  home?: string;
  warn?: (message: string) => void;
};

export type AppFlags = {
  help: boolean;
  usage: string;
  port: number;
  host: string;
  gatewayUrl: string;
  gatewayUrlSource: GatewayUrlSource;
  extra: Record<string, string | boolean | undefined>;
};

export function parseAppFlags(argv: readonly string[], options: AppFlagsOptions): AppFlags;
export function parseAppFlagsOrExit(argv: readonly string[], options: AppFlagsOptions): AppFlags;
export function appUsage(options: AppFlagsOptions): string;

// ---- Local gateway pointer (gateway_pointer.js, backlog 0943) -------------

export const POINTER_SCHEMA: 1;
export const BUILTIN_GATEWAY_URL: "http://127.0.0.1:8080";
export type GatewayUrlSource = "flag" | `env:${string}` | "saved" | "pointer" | "default";

export type GatewayPointer =
  | { ok: true; url: string; port: number; data_dir: string | null; written_by: string | null; updated_at: string | null; path: string }
  | { ok: false; reason: string; path: string; warning?: string };

export function gatewayPointerPath(home?: string): string;
export function readGatewayPointer(options?: { home?: string; path?: string; getuid?: () => number; platform?: string }): GatewayPointer;
export function resolveGatewayUrl(options?: {
  flag?: string;
  env?: Array<[string, string | undefined]>;
  savedUrl?: string;
  home?: string;
  warn?: (message: string) => void;
}): { url: string; source: GatewayUrlSource };

export type GatewayUrlResolver = { current(): string; source(): GatewayUrlSource; refresh(): boolean };
export function createGatewayUrlResolver(options?: Parameters<typeof resolveGatewayUrl>[0]): GatewayUrlResolver;
