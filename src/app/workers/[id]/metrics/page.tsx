"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { WorkerMetrics } from "@/types";
import { reqGetWorkerMetrics } from "@/services/workers.service";
import { reqGetWorker } from "@/services/workers.service";
import { Worker } from "@/types";
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
    <div>
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
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold text-primary">
            {worker?.name} Metrics
          </h1>
          <div className="flex gap-1">
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
        <div className="rounded-xl border border-border-subtle bg-surface p-12 text-center">
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

          {/* Network I/O */}
          <div className="rounded-xl border border-border-subtle bg-surface p-5">
            <h3 className="text-sm font-medium text-primary mb-4">
              Network I/O
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
                  tickFormatter={(v: number) => formatBytes(v)}
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
                    formatBytes(Number(value)),
                    String(name) === "network_rx_bytes" ? "RX" : "TX",
                  ]}
                />
                <Line
                  type="monotone"
                  dataKey="network_rx_bytes"
                  stroke={chartColors.network_rx}
                  strokeWidth={2}
                  dot={false}
                  name="network_rx_bytes"
                />
                <Line
                  type="monotone"
                  dataKey="network_tx_bytes"
                  stroke={chartColors.network_tx}
                  strokeWidth={2}
                  dot={false}
                  name="network_tx_bytes"
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
    <div className="rounded-xl border border-border-subtle bg-surface p-5">
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
