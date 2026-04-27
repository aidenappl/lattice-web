"use client";

import { useState, useMemo } from "react";
import { Sparkline, Meter } from "@/components/ui/sparkline";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faChartLine } from "@fortawesome/free-solid-svg-icons";
import { formatBytes } from "@/lib/utils";
import type { OverviewData, WorkerMetricsSummary, MetricKey } from "@/types";

type TimeRange = "1h" | "6h" | "24h" | "7d";

const RANGE_LABELS: Record<TimeRange, string> = {
  "1h": "1H",
  "6h": "6H",
  "24h": "24H",
  "7d": "7D",
};

const RANGE_TICKS: Record<TimeRange, number> = {
  "1h": 60,
  "6h": 72,
  "24h": 96,
  "7d": 168,
};

export function FleetResourcePanel({
  workerMetrics,
  overview,
  cpuHistory,
  memHistory,
  netHistory,
  containerHistory,
  cpuTimestamps,
  memTimestamps,
  netTimestamps,
  containerTimestamps,
  onRangeChange,
}: {
  workerMetrics: WorkerMetricsSummary[] | null;
  overview: OverviewData | null;
  cpuHistory: number[];
  memHistory: number[];
  netHistory: number[];
  containerHistory: number[];
  cpuTimestamps?: string[];
  memTimestamps?: string[];
  netTimestamps?: string[];
  containerTimestamps?: string[];
  onRangeChange?: (range: TimeRange) => void;
}) {
  const [metric, setMetric] = useState<MetricKey>("cpu");
  const [range, setRange] = useState<TimeRange>("1h");

  const labels: Record<MetricKey, string> = {
    cpu: "CPU %",
    mem: "Memory %",
    net: "Network",
    req: "Containers",
  };
  const colors: Record<MetricKey, string> = {
    cpu: "var(--pending)",
    mem: "var(--info)",
    net: "var(--violet)",
    req: "var(--healthy)",
  };

  const currentValue = useMemo(() => {
    if (!overview) return "-";
    switch (metric) {
      case "cpu":
        return `${Math.round(overview.fleet_cpu_avg)}%`;
      case "mem":
        return `${Math.round(overview.fleet_memory_avg)}%`;
      case "net": {
        const totalRx = (workerMetrics ?? []).reduce((s, w) => s + (w.net_rx_rate ?? 0), 0);
        return totalRx > 0 ? `${formatBytes(totalRx)}/s` : "-";
      }
      case "req":
        return `${overview.fleet_running_count}`;
    }
  }, [metric, overview, workerMetrics]);

  const getWorkerValue = (w: WorkerMetricsSummary): number => {
    switch (metric) {
      case "cpu":
        return w.cpu ?? 0;
      case "mem":
        return w.memory ?? 0;
      case "net":
        return w.net_rx_rate ?? 0;
      case "req":
        return w.running != null && w.containers != null && w.containers > 0
          ? (w.running / w.containers) * 100
          : 0;
    }
  };

  // Sort workers by the selected metric (highest first)
  const sortedWorkers = useMemo(() => {
    if (!workerMetrics) return [];
    return [...workerMetrics].sort((a, b) => getWorkerValue(b) - getWorkerValue(a));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workerMetrics, metric]);

  const historyMap: Record<MetricKey, number[]> = {
    cpu: cpuHistory,
    mem: memHistory,
    net: netHistory,
    req: containerHistory,
  };

  const timestampMap: Record<MetricKey, string[] | undefined> = {
    cpu: cpuTimestamps,
    mem: memTimestamps,
    net: netTimestamps,
    req: containerTimestamps,
  };

  const valueFormatters: Record<MetricKey, (v: number) => string> = {
    cpu: (v) => `${v.toFixed(1)}%`,
    mem: (v) => `${v.toFixed(1)}%`,
    net: (v) => `${formatBytes(v)}/s`,
    req: (v) => `${Math.round(v)} containers`,
  };

  // Window data to the last N ticks for the selected range
  const chartData = useMemo(() => {
    const raw = historyMap[metric];
    const maxTicks = RANGE_TICKS[range];
    if (raw.length <= maxTicks) return raw;
    return raw.slice(-maxTicks);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [metric, range, cpuHistory, memHistory, netHistory, containerHistory]);

  const chartTimestamps = useMemo(() => {
    const raw = timestampMap[metric];
    if (!raw) return undefined;
    const maxTicks = RANGE_TICKS[range];
    if (raw.length <= maxTicks) return raw;
    return raw.slice(-maxTicks);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [metric, range, cpuTimestamps, memTimestamps, netTimestamps, containerTimestamps]);

  const handleRangeChange = (r: TimeRange) => {
    setRange(r);
    onRangeChange?.(r);
  };

  return (
    <div className="panel" style={{ display: "flex", flexDirection: "column" }}>
      <div className="panel-header">
        <FontAwesomeIcon
          icon={faChartLine}
          style={{ width: 12, color: "var(--text-muted)" }}
        />
        <span>Fleet resources</span>
        <span className="muted">· live</span>
        <div className="panel-header-right" style={{ display: "flex", gap: 6 }}>
          {/* Time range selector */}
          <div className="flex gap-0.5 p-0.5 bg-surface-alt rounded border border-border text-[11px]">
            {(["1h", "6h", "24h", "7d"] as TimeRange[]).map((r) => (
              <button
                key={r}
                onClick={() => handleRangeChange(r)}
                className={`px-2 py-1 rounded cursor-pointer font-medium ${
                  range === r
                    ? "bg-background text-primary shadow-sm"
                    : "text-muted hover:text-primary"
                }`}
              >
                {RANGE_LABELS[r]}
              </button>
            ))}
          </div>
          {/* Metric selector */}
          <div className="flex gap-0.5 p-0.5 bg-surface-alt rounded border border-border text-[11px]">
            {(["cpu", "mem", "net", "req"] as MetricKey[]).map((m) => (
              <button
                key={m}
                onClick={() => setMetric(m)}
                className={`px-2.5 py-1 rounded cursor-pointer font-medium ${
                  metric === m
                    ? "bg-background text-primary shadow-sm"
                    : "text-muted hover:text-primary"
                }`}
              >
                {m.toUpperCase()}
              </button>
            ))}
          </div>
        </div>
      </div>
      <div
        style={{
          padding: 16,
          display: "flex",
          gap: 20,
          alignItems: "stretch",
          flex: 1,
          minHeight: 0,
        }}
      >
        {/* Left: value + worker list */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 12,
            minWidth: 180,
            flexShrink: 0,
          }}
        >
          <div>
            <div
              className="mono"
              style={{
                fontSize: 10,
                color: "var(--text-dimmed)",
                letterSpacing: "0.08em",
                textTransform: "uppercase",
              }}
            >
              {labels[metric]} · fleet
            </div>
            <div
              style={{
                fontSize: 28,
                fontWeight: 500,
                fontFamily: "var(--font-display)",
                letterSpacing: "-0.025em",
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {currentValue}
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {sortedWorkers.slice(0, 6).map((w) => (
              <div
                key={w.worker_id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  fontSize: 11,
                }}
              >
                <span className="status-dot healthy" />
                <span
                  className="mono"
                  style={{
                    flex: 1,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    fontSize: 11,
                  }}
                >
                  {w.worker_name}
                </span>
                <Meter
                  value={
                    metric === "net"
                      ? sortedWorkers[0] && getWorkerValue(sortedWorkers[0]) > 0
                        ? (getWorkerValue(w) / getWorkerValue(sortedWorkers[0])) * 100
                        : 0
                      : getWorkerValue(w)
                  }
                  width={40}
                />
              </div>
            ))}
            {(!workerMetrics || workerMetrics.length === 0) && (
              <div className="text-muted mono" style={{ fontSize: 11 }}>
                No worker metrics available.
              </div>
            )}
          </div>
        </div>

        {/* Right: area chart — responsive to container size */}
        <div
          className="dash-chart-area"
          style={{
            flex: 1,
            display: "flex",
            alignItems: "stretch",
            position: "relative",
            minWidth: 0,
            minHeight: 0,
          }}
        >
          <Sparkline
            data={chartData}
            color={colors[metric]}
            fill
            responsive
            maxValue={
              metric === "req"
                ? Math.max(overview?.total_containers ?? 1, 1)
                : undefined
            }
            timestamps={chartTimestamps}
            formatValue={valueFormatters[metric]}
          />
        </div>
      </div>
    </div>
  );
}
