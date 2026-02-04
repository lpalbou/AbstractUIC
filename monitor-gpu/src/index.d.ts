export type MonitorGpuMode = "full" | "icon";

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
