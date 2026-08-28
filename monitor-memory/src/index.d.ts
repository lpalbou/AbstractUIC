export type MonitorMemoryMode = "full" | "icon";

export function makeMemoryMetricsUrl(args?: { baseUrl?: string; endpoint?: string }): string;

export function resolveBearerToken(args?: {
  token?: string;
  getToken?: () => string | Promise<string>;
}): Promise<string>;

export function buildAuthHeaders(args?: { token?: string }): { Authorization?: string };

export type MemoryUsagePart = {
  /** Backend name for device memory (e.g. "cuda", "mps"); empty for RAM. */
  backend?: string;
  usedBytes: number | null;
  totalBytes: number | null;
  pct: number;
};

export type MemoryUsage = {
  ram: MemoryUsagePart | null;
  device: MemoryUsagePart | null;
};

/**
 * Reads RAM + device memory usage from a host memory metrics payload
 * (either the memory object itself or a payload nesting it under `memory`).
 * Returns null when no usable numbers are present.
 */
export function extractMemoryUsage(payload: unknown): MemoryUsage | null;

export type MemoryMetricsResult = {
  ok: boolean;
  status: number;
  error: "fetch_unavailable" | "network_error" | "http_error" | null;
  detail?: string;
  payload: unknown;
};

export function fetchHostMemoryMetrics(args?: {
  baseUrl?: string;
  endpoint?: string;
  token?: string;
  getToken?: () => string | Promise<string>;
  signal?: AbortSignal;
  fetchImpl?: typeof fetch;
}): Promise<MemoryMetricsResult>;

export type MonitorMemoryWidgetOptions = {
  tickMs?: number | string;
  endpoint?: string;
  baseUrl?: string;
  mode?: MonitorMemoryMode | string;
  token?: string;
  getToken?: () => string | Promise<string>;
};

export class MonitorMemoryWidgetController {
  constructor(target: HTMLElement | ShadowRoot, options?: MonitorMemoryWidgetOptions);

  get options(): { tickMs: number; endpoint: string; baseUrl: string; mode: MonitorMemoryMode };
  /** True once the endpoint answered 404 or `supported:false`; polling stays stopped. */
  get unsupported(): boolean;
  setOptions(next: Partial<MonitorMemoryWidgetOptions>): void;

  start(): void;
  stop(): void;
  destroy(): void;

  push(usage: MemoryUsage | null): void;

  get token(): string | undefined;
  set token(token: string | undefined);

  get getToken(): (() => string | Promise<string>) | undefined;
  set getToken(getToken: (() => string | Promise<string>) | undefined);
}

export function createMonitorMemoryWidget(
  target: HTMLElement | ShadowRoot,
  options?: MonitorMemoryWidgetOptions
): MonitorMemoryWidgetController;

export function registerMonitorMemoryWidget(tagName?: string): void;

export interface MonitorMemoryElement extends HTMLElement {
  tickMs: number;
  endpoint: string;
  baseUrl: string;
  mode: MonitorMemoryMode;

  token: string | undefined;
  getToken: (() => string | Promise<string>) | undefined;
}

declare global {
  interface HTMLElementTagNameMap {
    "monitor-memory": MonitorMemoryElement;
  }
}
