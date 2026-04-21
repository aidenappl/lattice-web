"use client";

import { useState, useMemo } from "react";
import { Sparkline, Meter } from "@/components/ui/sparkline";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faChartLine } from "@fortawesome/free-solid-svg-icons";
import type { OverviewData, WorkerMetricsSummary, MetricKey } from "@/types";

export function FleetResourcePanel({
  workerMetrics,
  overview,
  cpuHistory,
  memHistory,
  netHistory,
  containerHistory,
}: {
  workerMetrics: WorkerMetricsSummary[] | null;
  overview: OverviewData | null;
  cpuHistory: number[];
  memHistory: number[];
  netHistory: number[];
  containerHistory: number[];
}) {
  const [metric, setMetric] = useState<MetricKey>("cpu");

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
      case "net":
        return "\u2014";
      case "req":
        return `${overview.fleet_running_count}`;
    }
  }, [metric, overview]);

  const getWorkerValue = (w: WorkerMetricsSummary): number => {
    switch (metric) {
      case "cpu":
        return w.cpu ?? 0;
      case "mem":
        return w.memory ?? 0;
      case "net":
        return 0;
      case "req":
        return w.running != null && w.containers != null && w.containers > 0
          ? (w.running / w.containers) * 100
          : 0;
    }
  };

  const historyMap: Record<MetricKey, number[]> = {
    cpu: cpuHistory,
    mem: memHistory,
    net: netHistory,
    req: containerHistory,
  };
  const chartData = historyMap[metric];

  return (
    <div className="panel" style={{ display: "flex", flexDirection: "column" }}>
      <div className="panel-header">
        <FontAwesomeIcon
          icon={faChartLine}
          style={{ width: 12, color: "var(--text-muted)" }}
        />
        <span>Fleet resources</span>
        <span className="muted">· live</span>
        <div className="panel-header-right">
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
        }}
      >
        {/* Left: value + worker list */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 12,
            minWidth: 180,
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
            {(workerMetrics ?? []).slice(0, 6).map((w) => (
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
                <Meter value={getWorkerValue(w)} width={40} />
              </div>
            ))}
            {(!workerMetrics || workerMetrics.length === 0) && (
              <div className="text-muted mono" style={{ fontSize: 11 }}>
                No worker metrics available.
              </div>
            )}
          </div>
        </div>

        {/* Right: area chart */}
        <div
          className="dash-chart-area"
          style={{
            flex: 1,
            display: "flex",
            alignItems: "stretch",
            position: "relative",
          }}
        >
          <Sparkline
            data={chartData}
            width={460}
            height={260}
            color={colors[metric]}
            fill
            maxValue={
              metric === "cpu" || metric === "mem"
                ? 100
                : metric === "req"
                  ? Math.max(overview?.total_containers ?? 1, 1)
                  : undefined
            }
          />
        </div>
      </div>
    </div>
  );
}
