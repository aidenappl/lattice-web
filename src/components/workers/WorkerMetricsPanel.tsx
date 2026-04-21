"use client";

import Link from "next/link";
import type { WorkerMetrics } from "@/types";
import { formatDisk, formatBytes, formatUptime, barColor, sparkColor, timeAgo } from "@/lib/utils";

/* ─── Sparkline ─── */
export function Sparkline({ values, color }: { values: number[]; color: string }) {
  if (values.length < 2) return null;
  const w = 80;
  const h = 28;
  const max = Math.max(...values, 1);
  const step = w / (values.length - 1);
  const pts = values
    .map((v, i) => `${i * step},${h - (v / max) * h}`)
    .join(" ");
  return (
    <svg width={w} height={h} className="overflow-visible opacity-60">
      <polyline
        points={pts}
        fill="none"
        stroke={color}
        strokeWidth={1.5}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}

/* ─── MetricCard ─── */
export function MetricCard({
  label,
  value,
  sub,
  color,
  percent,
}: {
  label: string;
  value: string;
  sub?: string;
  color: string;
  percent?: number;
}) {
  return (
    <div>
      <p className="text-xs text-muted uppercase tracking-wider">{label}</p>
      <p className={`text-lg font-semibold mt-1 ${color}`}>{value}</p>
      {sub && <p className="text-xs text-muted mt-0.5">{sub}</p>}
      {percent != null && (
        <div className="h-1 bg-surface-active rounded-full mt-2 overflow-hidden">
          <div
            className={`h-full rounded-full ${barColor(percent)}`}
            style={{ width: `${Math.min(percent, 100)}%` }}
          />
        </div>
      )}
    </div>
  );
}

/* ─── ArcGauge ─── */
export function ArcGauge({
  percent,
  color,
  size = 88,
}: {
  percent: number;
  color: string;
  size?: number;
}) {
  const r = (size - 10) / 2;
  const circumference = Math.PI * r; // half circle
  const offset =
    circumference - (Math.min(percent, 100) / 100) * circumference;
  return (
    <svg width={size} height={size / 2 + 8} className="overflow-visible">
      <path
        d={`M 5,${size / 2} A ${r},${r} 0 0 1 ${size - 5},${size / 2}`}
        fill="none"
        stroke="var(--surface-active)"
        strokeWidth={6}
        strokeLinecap="round"
      />
      <path
        d={`M 5,${size / 2} A ${r},${r} 0 0 1 ${size - 5},${size / 2}`}
        fill="none"
        stroke={color}
        strokeWidth={6}
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        className="transition-all duration-500"
      />
    </svg>
  );
}

/* ─── Props ─── */
export interface WorkerMetricsPanelProps {
  workerId: number;
  workerStatus: string;
  metrics: WorkerMetrics[];
  lastUpdated: Date | null;
}

/* ─── WorkerMetricsPanel ─── */
export default function WorkerMetricsPanel({
  workerId,
  workerStatus,
  metrics,
  lastUpdated,
}: WorkerMetricsPanelProps) {
  const latestMetric = metrics.length > 0 ? metrics[0] : null;
  if (!latestMetric) return null;

  // Sparkline history (oldest -> newest, up to last 20 heartbeats)
  const cpuHistory = metrics
    .slice(0, 20)
    .reverse()
    .map((m) => m.cpu_percent ?? 0);
  const memHistory = metrics
    .slice(0, 20)
    .reverse()
    .map((m) =>
      m.memory_used_mb != null && m.memory_total_mb
        ? (m.memory_used_mb / m.memory_total_mb) * 100
        : 0,
    );
  const netRxHistory = metrics
    .slice(0, 20)
    .reverse()
    .map((m) => m.network_rx_bytes ?? 0);

  const cpuPercent = latestMetric.cpu_percent ?? 0;
  const memPercent =
    latestMetric.memory_used_mb != null && latestMetric.memory_total_mb
      ? (latestMetric.memory_used_mb / latestMetric.memory_total_mb) * 100
      : 0;
  const diskPercent =
    latestMetric.disk_used_mb != null && latestMetric.disk_total_mb
      ? (latestMetric.disk_used_mb / latestMetric.disk_total_mb) * 100
      : 0;

  return (
    <div className="panel">
      <div className="panel-header">
        <div className="flex items-center gap-2">
          <span>Live Metrics</span>
          {workerStatus === "online" && (
            <span className="pulse-dot healthy" />
          )}
        </div>
        <div className="panel-header-right">
          {lastUpdated && (
            <span className="text-xs text-dimmed">
              updated {timeAgo(lastUpdated.toISOString())}
            </span>
          )}
          <Link
            href={`/workers/${workerId}/metrics`}
            className="text-xs text-info hover:underline ml-3"
          >
            View Full Metrics
          </Link>
        </div>
      </div>

      {/* Arc gauges row */}
      <div className="px-5 pt-5 pb-3">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-6">
          {/* CPU gauge */}
          <div className="flex flex-col items-center">
            <ArcGauge percent={cpuPercent} color={sparkColor(cpuPercent)} />
            <p className="text-2xl font-semibold -mt-1 text-info font-mono">
              {latestMetric.cpu_percent?.toFixed(1) ?? "-"}%
            </p>
            <p className="text-[10px] text-muted uppercase tracking-wider mt-1">
              CPU
            </p>
            {latestMetric.cpu_cores && (
              <p className="text-[10px] text-dimmed">
                {latestMetric.cpu_cores} cores
              </p>
            )}
            {cpuHistory.length >= 2 && (
              <div className="mt-2">
                <Sparkline
                  values={cpuHistory}
                  color={sparkColor(cpuPercent)}
                />
              </div>
            )}
          </div>

          {/* Memory gauge */}
          <div className="flex flex-col items-center">
            <ArcGauge percent={memPercent} color="#a855f7" />
            <p className="text-2xl font-semibold -mt-1 text-violet font-mono">
              {memPercent.toFixed(1)}%
            </p>
            <p className="text-[10px] text-muted uppercase tracking-wider mt-1">
              Memory
            </p>
            <p className="text-[10px] text-dimmed">
              {latestMetric.memory_used_mb != null &&
              latestMetric.memory_total_mb != null
                ? `${Math.round(latestMetric.memory_used_mb)} / ${Math.round(latestMetric.memory_total_mb)} MB`
                : "-"}
            </p>
            {memHistory.length >= 2 && (
              <div className="mt-2">
                <Sparkline values={memHistory} color="#a855f7" />
              </div>
            )}
          </div>

          {/* Disk gauge */}
          <div className="flex flex-col items-center">
            <ArcGauge
              percent={diskPercent}
              color={sparkColor(diskPercent)}
            />
            <p className="text-2xl font-semibold -mt-1 text-pending font-mono">
              {diskPercent.toFixed(1)}%
            </p>
            <p className="text-[10px] text-muted uppercase tracking-wider mt-1">
              Disk
            </p>
            <p className="text-[10px] text-dimmed">
              {latestMetric.disk_used_mb != null &&
              latestMetric.disk_total_mb != null
                ? formatDisk(
                    latestMetric.disk_used_mb,
                    latestMetric.disk_total_mb,
                  )
                : "-"}
            </p>
          </div>

          {/* Network gauge */}
          <div className="flex flex-col items-center">
            <ArcGauge percent={0} color="#22c55e" />
            <p className="text-2xl font-semibold -mt-1 text-healthy font-mono">
              {latestMetric.network_rx_bytes != null
                ? formatBytes(latestMetric.network_rx_bytes)
                : "-"}
            </p>
            <p className="text-[10px] text-muted uppercase tracking-wider mt-1">
              Network RX
            </p>
            <p className="text-[10px] text-dimmed">
              {latestMetric.network_tx_bytes != null
                ? `TX: ${formatBytes(latestMetric.network_tx_bytes)}`
                : "-"}
            </p>
            {netRxHistory.length >= 2 && (
              <div className="mt-2">
                <Sparkline values={netRxHistory} color="#22c55e" />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Secondary stats strip */}
      <div className="border-t border-border px-5 py-4 grid grid-cols-2 sm:grid-cols-5 gap-4">
        <div>
          <p className="text-[10px] text-muted uppercase tracking-wider">
            Containers
          </p>
          <p className="text-sm text-healthy font-semibold mt-0.5">
            {latestMetric.container_running_count != null
              ? `${latestMetric.container_running_count} / ${latestMetric.container_count ?? 0}`
              : `${latestMetric.container_count ?? "-"}`}
          </p>
          <p className="text-[10px] text-dimmed">running / total</p>
        </div>
        <div>
          <p className="text-[10px] text-muted uppercase tracking-wider">
            Uptime
          </p>
          <p className="text-sm text-secondary font-semibold mt-0.5">
            {latestMetric.uptime_seconds != null
              ? formatUptime(latestMetric.uptime_seconds)
              : "-"}
          </p>
        </div>
        <div>
          <p className="text-[10px] text-muted uppercase tracking-wider">
            Load Avg
          </p>
          <p className="text-sm text-secondary font-mono mt-0.5">
            {latestMetric.load_avg_1?.toFixed(2) ?? "-"} /{" "}
            {latestMetric.load_avg_5?.toFixed(2) ?? "-"} /{" "}
            {latestMetric.load_avg_15?.toFixed(2) ?? "-"}
          </p>
        </div>
        <div>
          <p className="text-[10px] text-muted uppercase tracking-wider">
            Network I/O
          </p>
          <p className="text-sm text-secondary font-mono mt-0.5">
            {latestMetric.network_rx_bytes != null
              ? formatBytes(latestMetric.network_rx_bytes)
              : "-"}{" "}
            rx
          </p>
          <p className="text-[10px] text-secondary font-mono">
            {latestMetric.network_tx_bytes != null
              ? formatBytes(latestMetric.network_tx_bytes)
              : "-"}{" "}
            tx
          </p>
        </div>
        <div>
          <p className="text-[10px] text-muted uppercase tracking-wider">
            Processes
          </p>
          <p className="text-sm text-secondary font-semibold mt-0.5">
            {latestMetric.process_count ?? "-"}
          </p>
          {latestMetric.swap_total_mb != null &&
            latestMetric.swap_total_mb > 0 && (
              <p className="text-[10px] text-dimmed">
                Swap: {Math.round(latestMetric.swap_used_mb ?? 0)}/
                {Math.round(latestMetric.swap_total_mb)} MB
              </p>
            )}
        </div>
      </div>
    </div>
  );
}
