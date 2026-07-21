import {
  HistoryBuffer,
  MonitorGpuWidgetController,
  createMonitorGpuWidget,
  registerMonitorGpuWidget,
  makeGpuMetricsUrl,
  resolveBearerToken,
  buildAuthHeaders,
  extractUtilizationGpuPct,
  fetchHostGpuMetrics,
  type GpuMetricsResult,
  type MonitorGpuWidgetOptions,
} from "@abstractframework/monitor-gpu";

const hb = new HistoryBuffer(10);
hb.push(42);
hb.push(null);
const _vals: Array<number | null> = hb.values();
const _last: number | null = hb.last();
const _url: string = makeGpuMetricsUrl({ baseUrl: "http://x", endpoint: "/y" });
const _hdrs: { Authorization?: string } = buildAuthHeaders({ token: "t" });
const _pct: number | null = extractUtilizationGpuPct({});
async function main(): Promise<void> {
  const t: string = await resolveBearerToken({ getToken: () => "x" });
  const r: GpuMetricsResult = await fetchHostGpuMetrics({ token: t });
  void r.ok;
}
void main;
const _opts: MonitorGpuWidgetOptions = { tickMs: 500, mode: "icon" };
void _opts;
void MonitorGpuWidgetController;
void createMonitorGpuWidget;
void registerMonitorGpuWidget;
void _vals; void _last; void _url; void _hdrs; void _pct;
