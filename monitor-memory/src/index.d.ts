export type MonitorMemoryMode = "full" | "icon";

export function makeMemoryMetricsUrl(args?: { baseUrl?: string; endpoint?: string }): string;

export function resolveBearerToken(args?: {
  token?: string;
  getToken?: () => string | Promise<string>;
}): Promise<string>;

export function buildAuthHeaders(args?: { token?: string }): { Authorization?: string };

/** The accelerator caveat shipped with every device part. */
export const ACCELERATOR_NOTE: "memory-mapped GGUF weights are not counted here";

/**
 * Human-readable byte size: BINARY math with BINARY labels
 * (`B`/`KiB`/`MiB`/`GiB`/`TiB`, one decimal place). Byte-identical to the
 * gateway console, console-tui, abstractcode-tui and abstractflow, so the same
 * payload reads the same on every surface. Returns "" for non-finite or
 * negative input.
 */
export function formatBytes(value: number | null | undefined): string;

/**
 * Builds the scoped accelerator label, e.g.
 * `Accelerator heap · metal (all processes)`. An empty/unknown backend renders
 * as the literal `device`.
 */
export function acceleratorLabel(
  backend: string | null | undefined,
  scope: MemoryUsageScope | string | null | undefined
): string;

/**
 * Which reading the accelerator figure is: "all_processes" = accelerator-heap
 * memory driver-allocated across every process (device.host_in_use_bytes),
 * "process" = the process-local allocation (device.allocated_bytes), which can
 * read 0 while the accelerator is full. Neither is the machine's memory use.
 */
export type MemoryUsageScope = "all_processes" | "process";

export type MemoryUsagePart = {
  /** Backend name for device memory (e.g. "metal", "cuda", "mps"); empty for RAM. */
  backend?: string;
  /** Scope of the device figure. Absent for RAM. */
  scope?: MemoryUsageScope;
  /**
   * Ready-to-render scoped label for the device figure, e.g.
   * `Accelerator heap · metal (all processes)` or
   * `Accelerator heap · metal (this process only)`. Absent for RAM.
   */
  label?: string;
  /**
   * The caveat to show with the device figure (tooltip/sub-line):
   * `memory-mapped GGUF weights are not counted here`. Absent for RAM.
   */
  note?: string;
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
