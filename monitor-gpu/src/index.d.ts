export type MonitorGpuMode = "full" | "icon";

/** Bounded numeric history (null = missed sample). Values clamp to [1, 1000]. */
export class HistoryBuffer {
  constructor(maxSize?: number | string);

  get maxSize(): number;
  get size(): number;

  setMaxSize(maxSize: number | string): void;
  clear(): void;
  push(value: number | null | undefined): void;
  values(): Array<number | null>;
  last(): number | null;
}

export function makeGpuMetricsUrl(args: { baseUrl?: string; endpoint?: string }): string;

export function resolveBearerToken(args: {
  token?: string;
  getToken?: () => string | Promise<string>;
}): Promise<string>;

export function buildAuthHeaders(args: { token?: string }): { Authorization?: string };

/** Reads utilization_gpu_pct directly or averages per-GPU entries; null when absent. */
export function extractUtilizationGpuPct(payload: unknown): number | null;

export type GpuMetricsResult = {
  ok: boolean;
  status: number;
  error: "fetch_unavailable" | "network_error" | "http_error" | null;
  detail?: string;
  payload: unknown;
};

export function fetchHostGpuMetrics(args?: {
  baseUrl?: string;
  endpoint?: string;
  token?: string;
  getToken?: () => string | Promise<string>;
  signal?: AbortSignal;
  fetchImpl?: typeof fetch;
}): Promise<GpuMetricsResult>;

export type MonitorGpuWidgetOptions = {
  tickMs?: number | string;
  historySize?: number | string;
  endpoint?: string;
  baseUrl?: string;
  mode?: MonitorGpuMode | string;
  token?: string;
  getToken?: () => string | Promise<string>;
};

export class MonitorGpuWidgetController {
  constructor(target: HTMLElement, options?: MonitorGpuWidgetOptions);

  get options(): { tickMs: number; historySize: number; endpoint: string; baseUrl: string; mode: MonitorGpuMode };
  setOptions(next: Partial<MonitorGpuWidgetOptions>): void;

  start(): void;
  stop(): void;
  destroy(): void;

  push(value: number | null): void;

  get token(): string | undefined;
  set token(token: string | undefined);

  get getToken(): (() => string | Promise<string>) | undefined;
  set getToken(getToken: (() => string | Promise<string>) | undefined);
}

export function createMonitorGpuWidget(target: HTMLElement, options?: MonitorGpuWidgetOptions): MonitorGpuWidgetController;

export function registerMonitorGpuWidget(tagName?: string): void;

export interface MonitorGpuElement extends HTMLElement {
  tickMs: number;
  historySize: number;
  endpoint: string;
  baseUrl: string;
  mode: MonitorGpuMode;

  token: string | undefined;
  getToken: (() => string | Promise<string>) | undefined;
}

declare global {
  interface HTMLElementTagNameMap {
    "monitor-gpu": MonitorGpuElement;
  }
}
