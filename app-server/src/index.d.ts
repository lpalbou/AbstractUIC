import type { IncomingMessage, ServerResponse } from "node:http";

export function normalizeGatewayUrl(value: string): string;

export type GatewaySessionProxyOptions = {
  /** Short app id (e.g. "abstractflow"); prefixes cookies + the app CSRF header. */
  appId: string;
  defaultGatewayUrl?: string;
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
