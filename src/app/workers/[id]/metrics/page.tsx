"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import type { WorkerMetrics, Worker } from "@/types";
import { reqGetWorkerMetrics, reqGetWorker } from "@/services/workers.service";
import { PageLoader } from "@/components/ui/loading";
import { Button } from "@/components/ui/button";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
} from "recharts";

type TimeRange = "1h" | "6h" | "24h" | "7d";

const ranges: { value: TimeRange; label: string }[] = [
  { value: "1h", label: "1 Hour" },
  { value: "6h", label: "6 Hours" },
  { value: "24h", label: "24 Hours" },
  { value: "7d", label: "7 Days" },
];

function formatTime(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function formatDateTime(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatBytes(bytes: number | null): string {
  if (bytes === null) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024)
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

const chartColors = {
  cpu: "#3b82f6",
  memory: "#8b5cf6",
  disk: "#f59e0b",
  network_rx: "#22c55e",
  network_tx: "#ef4444",
  containers: "#06b6d4",
  load: "#f97316",
  swap: "#ec4899",
};

export default function WorkerMetricsPage() {
  const params = useParams();
  const id = Number(params.id);
  const [worker, setWorker] = useState<Worker | null>(null);
  const [metrics, setMetrics] = useState<WorkerMetrics[]>([]);
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState<TimeRange>("1h");

  const load = useCallback(async () => {
    const [wRes, mRes] = await Promise.all([
      reqGetWorker(id),
      reqGetWorkerMetrics(id, range),
    ]);
    if (wRes.success) setWorker(wRes.data);
    if (mRes.success) setMetrics((mRes.data ?? []).reverse());
    setLoading(false);
  }, [id, range]);

  useEffect(() => {
    load();
    const interval = setInterval(load, 30000);
    return () => clearInterval(interval);
  }, [load]);

  useEffect(() => {
    document.title = worker
      ? `Lattice - ${worker.name} Metrics`
      : "Lattice - Metrics";
  }, [worker]);

  if (loading) return <PageLoader />;

  const tickFormatter = range === "7d" ? formatDateTime : formatTime;

  return (
    <div className="py-6">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-2 text-sm text-secondary mb-2">
          <Link href="/workers" className="hover:text-primary transition-colors">
            Workers
          </Link>
          <span>/</span>
          <Link
            href={`/workers/${id}`}
            className="hover:text-primary transition-colors"
          >
            {worker?.name ?? `Worker ${id}`}
          </Link>
          <span>/</span>
          <span className="text-primary">Metrics</span>
        </div>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <h1 className="page-title text-xl">
            {worker?.name} Metrics
          </h1>
          <div className="flex gap-1 flex-shrink-0">
            {ranges.map((r) => (
              <Button
                key={r.value}
                variant={range === r.value ? "primary" : "secondary"}
                size="sm"
                onClick={() => {
                  setRange(r.value);
                  setLoading(true);
                }}
              >
                {r.label}
              </Button>
            ))}
          </div>
        </div>
      </div>

      {metrics.length === 0 ? (
        <div className="card p-12 text-center">
          <p className="text-sm text-muted">
            No metrics data available for this time range
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {/* CPU Usage */}
          <MetricChart
            title="CPU Usage"
            data={metrics}
            dataKey="cpu_percent"
            color={chartColors.cpu}
            unit="%"
            tickFormatter={tickFormatter}
          />

          {/* Load Average */}
          <div className="card p-5">
            <h3 className="text-sm font-medium text-primary mb-4">
              Load Average
            </h3>
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={metrics}>
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="var(--border-subtle)"
                />
                <XAxis
                  dataKey="recorded_at"
                  tickFormatter={tickFormatter}
                  stroke="var(--muted)"
                  fontSize={11}
                />
                <YAxis stroke="var(--muted)" fontSize={11} />
                <Tooltip
                  contentStyle={{
                    background: "var(--surface)",
                    border: "1px solid var(--border-strong)",
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                  labelFormatter={(label) => formatDateTime(String(label))}
                  formatter={(value, name) => [
                    Number(value).toFixed(2),
                    String(name) === "load_avg_1"
                      ? "1m"
                      : String(name) === "load_avg_5"
                        ? "5m"
                        : "15m",
                  ]}
                />
                <Line
                  type="monotone"
                  dataKey="load_avg_1"
                  stroke={chartColors.load}
                  strokeWidth={2}
                  dot={false}
                  name="load_avg_1"
                />
                <Line
                  type="monotone"
                  dataKey="load_avg_5"
                  stroke={chartColors.cpu}
                  strokeWidth={1.5}
                  dot={false}
                  strokeDasharray="4 2"
                  name="load_avg_5"
                />
                <Line
                  type="monotone"
                  dataKey="load_avg_15"
                  stroke="var(--muted)"
                  strokeWidth={1}
                  dot={false}
                  strokeDasharray="4 4"
                  name="load_avg_15"
                />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Memory Usage */}
          <MetricChart
            title="Memory Usage (MB)"
            data={metrics}
            dataKey="memory_used_mb"
            color={chartColors.memory}
            unit=" MB"
            tickFormatter={tickFormatter}
            secondaryKey="memory_total_mb"
            secondaryLabel="Total"
          />

          {/* Swap Usage */}
          {metrics.some(
            (m) => m.swap_total_mb != null && m.swap_total_mb > 0,
          ) && (
            <MetricChart
              title="Swap Usage (MB)"
              data={metrics}
              dataKey="swap_used_mb"
              color={chartColors.swap}
              unit=" MB"
              tickFormatter={tickFormatter}
              secondaryKey="swap_total_mb"
              secondaryLabel="Total"
            />
          )}

          {/* Disk Usage */}
          <MetricChart
            title="Disk Usage (MB)"
            data={metrics}
            dataKey="disk_used_mb"
            color={chartColors.disk}
            unit=" MB"
            tickFormatter={tickFormatter}
            secondaryKey="disk_total_mb"
            secondaryLabel="Total"
          />

          {/* Network Throughput (bytes/sec) */}
          <div className="card p-5">
            <h3 className="text-sm font-medium text-primary mb-4">
              Network Throughput
            </h3>
            <ResponsiveContainer width="100%" height={250}>
              <LineChart data={metrics}>
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="var(--border-subtle)"
                />
                <XAxis
                  dataKey="recorded_at"
                  tickFormatter={tickFormatter}
                  stroke="var(--muted)"
                  fontSize={11}
                />
                <YAxis
                  stroke="var(--muted)"
                  fontSize={11}
                  tickFormatter={(v: number) => `${formatBytes(v)}/s`}
                />
                <Tooltip
                  contentStyle={{
                    background: "var(--surface)",
                    border: "1px solid var(--border-strong)",
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                  labelFormatter={(label) => formatDateTime(String(label))}
                  formatter={(value, name) => [
                    `${formatBytes(Number(value))}/s`,
                    String(name) === "network_rx_rate" ? "RX" : "TX",
                  ]}
                />
                <Line
                  type="monotone"
                  dataKey="network_rx_rate"
                  stroke={chartColors.network_rx}
                  strokeWidth={2}
                  dot={false}
                  name="network_rx_rate"
                />
                <Line
                  type="monotone"
                  dataKey="network_tx_rate"
                  stroke={chartColors.network_tx}
                  strokeWidth={2}
                  dot={false}
                  name="network_tx_rate"
                />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Containers */}
          <MetricChart
            title="Containers"
            data={metrics}
            dataKey="container_running_count"
            color={chartColors.containers}
            unit=""
            tickFormatter={tickFormatter}
            secondaryKey="container_count"
            secondaryLabel="Total"
            chartType="line"
          />
        </div>
      )}
    </div>
  );
}

function MetricChart({
  title,
  data,
  dataKey,
  color,
  unit,
  tickFormatter,
  secondaryKey,
  secondaryLabel,
  chartType = "area",
}: {
  title: string;
  data: WorkerMetrics[];
  dataKey: keyof WorkerMetrics;
  color: string;
  unit: string;
  tickFormatter: (v: string) => string;
  secondaryKey?: keyof WorkerMetrics;
  secondaryLabel?: string;
  chartType?: "area" | "line";
}) {
  const latest = data[data.length - 1];
  const latestVal = latest?.[dataKey];

  return (
    <div className="card p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-medium text-primary">{title}</h3>
        {latestVal !== null && latestVal !== undefined && (
          <span className="text-sm font-mono text-secondary">
            {typeof latestVal === "number" ? latestVal.toFixed(1) : latestVal}
            {unit}
          </span>
        )}
      </div>
      <ResponsiveContainer width="100%" height={200}>
        {chartType === "area" ? (
          <AreaChart data={data}>
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="var(--border-subtle)"
            />
            <XAxis
              dataKey="recorded_at"
              tickFormatter={tickFormatter}
              stroke="var(--muted)"
              fontSize={11}
            />
            <YAxis stroke="var(--muted)" fontSize={11} />
            <Tooltip
              contentStyle={{
                background: "var(--surface)",
                border: "1px solid var(--border-strong)",
                borderRadius: 8,
                fontSize: 12,
              }}
              labelFormatter={(label) => formatDateTime(String(label))}
              formatter={(value, name) => [
                `${Number(value).toFixed(1)}${unit}`,
                String(name) === String(dataKey)
                  ? title
                  : secondaryLabel ?? String(name),
              ]}
            />
            {secondaryKey && (
              <Area
                type="monotone"
                dataKey={secondaryKey}
                stroke="var(--muted)"
                fill="none"
                strokeDasharray="4 4"
                strokeWidth={1}
                dot={false}
              />
            )}
            <Area
              type="monotone"
              dataKey={dataKey}
              stroke={color}
              fill={color}
              fillOpacity={0.15}
              strokeWidth={2}
              dot={false}
            />
          </AreaChart>
        ) : (
          <LineChart data={data}>
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="var(--border-subtle)"
            />
            <XAxis
              dataKey="recorded_at"
              tickFormatter={tickFormatter}
              stroke="var(--muted)"
              fontSize={11}
            />
            <YAxis stroke="var(--muted)" fontSize={11} allowDecimals={false} />
            <Tooltip
              contentStyle={{
                background: "var(--surface)",
                border: "1px solid var(--border-strong)",
                borderRadius: 8,
                fontSize: 12,
              }}
              labelFormatter={(label) => formatDateTime(String(label))}
              formatter={(value, name) => [
                `${value}${unit}`,
                String(name) === String(dataKey)
                  ? title
                  : secondaryLabel ?? String(name),
              ]}
            />
            {secondaryKey && (
              <Line
                type="monotone"
                dataKey={secondaryKey}
                stroke="var(--muted)"
                strokeDasharray="4 4"
                strokeWidth={1}
                dot={false}
              />
            )}
            <Line
              type="monotone"
              dataKey={dataKey}
              stroke={color}
              strokeWidth={2}
              dot={false}
            />
          </LineChart>
        )}
      </ResponsiveContainer>
    </div>
  );
}
