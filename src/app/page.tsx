"use client";

import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  reqGetOverview,
  reqGetFleetMetrics,
  OverviewData,
  WorkerMetricsSummary,
  FleetMetricsPoint,
} from "@/services/admin.service";
import { APP_VERSION } from "@/lib/version";
import { timeAgo } from "@/lib/utils";
import { TopologyBoard } from "@/components/topology/TopologyBoard";
import { Sparkline, Meter } from "@/components/ui/sparkline";
import { useAdminSocket, AdminSocketEvent } from "@/hooks/useAdminSocket";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faTriangleExclamation,
  faChevronRight,
  faArrowDown,
  faFilter,
  faChartLine,
} from "@fortawesome/free-solid-svg-icons";
import type { Deployment } from "@/types";

// ── KPI Row ─────────────────────────────────────────────────────────

function DashboardKPIRow({
  overview,
  cpuHistory,
  memHistory,
  netHistory,
  containerHistory,
}: {
  overview: OverviewData | null;
  cpuHistory: number[];
  memHistory: number[];
  netHistory: number[];
  containerHistory: number[];
}) {
  return (
    <div
      className="card"
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(6, 1fr)",
        marginBottom: 16,
      }}
    >
      <div className="kpi">
        <div className="kpi-label">Fleet Health</div>
        <div className="kpi-value">
          {overview ? `${overview.online_workers}/${overview.total_workers}` : "-"}
          <span className="unit">workers</span>
        </div>
        <div className="kpi-sub">
          {overview && overview.online_workers > 0 ? (
            <>
              <span className="up">●</span>{" "}
              {Math.round(
                (overview.online_workers / Math.max(overview.total_workers, 1)) *
                  100,
              )}
              % online
            </>
          ) : (
            <span className="text-muted">no workers</span>
          )}
        </div>
        <div className="kpi-spark">
          <Sparkline
            data={containerHistory.length > 1 ? containerHistory : [0.5]}
            color="var(--healthy)"
          />
        </div>
      </div>

      <div className="kpi">
        <div className="kpi-label">Running Containers</div>
        <div className="kpi-value">
          {overview?.running_containers ?? "-"}
          <span className="unit">
            / {overview?.total_containers ?? "-"}
          </span>
        </div>
        <div className="kpi-sub">
          <span className="up mono">active</span>
        </div>
        <div className="kpi-spark">
          <Sparkline
            data={containerHistory.length > 1 ? containerHistory : [0.5]}
            color="var(--healthy)"
          />
        </div>
      </div>

      <div className="kpi">
        <div className="kpi-label">Stacks Deployed</div>
        <div className="kpi-value">
          {overview
            ? `${overview.active_stacks}/${overview.total_stacks}`
            : "-"}
        </div>
        <div className="kpi-sub">
          {overview && overview.deploying_stacks > 0 && (
            <>
              <span className="pulse-dot pending" />{" "}
              <span className="mono">{overview.deploying_stacks} deploying</span>
            </>
          )}
          {overview && overview.failed_stacks > 0 && (
            <span className="mono" style={{ color: "var(--failed)" }}>
              {overview.deploying_stacks > 0 ? ", " : ""}
              {overview.failed_stacks} failed
            </span>
          )}
          {overview &&
            overview.deploying_stacks === 0 &&
            overview.failed_stacks === 0 && (
              <span className="mono text-muted">all healthy</span>
            )}
        </div>
        <div className="kpi-spark">
          <Sparkline
            data={netHistory.length > 1 ? netHistory : [0.5]}
            color="var(--info)"
          />
        </div>
      </div>

      <div className="kpi">
        <div className="kpi-label">CPU · Fleet Avg</div>
        <div className="kpi-value">
          {overview ? Math.round(overview.fleet_cpu_avg) : "-"}
          <span className="unit">%</span>
        </div>
        <div className="kpi-sub">
          <span className="mono text-muted">across fleet</span>
        </div>
        <div className="kpi-spark">
          <Sparkline
            data={cpuHistory.length > 1 ? cpuHistory : [0.5]}
            color="var(--pending)"
          />
        </div>
      </div>

      <div className="kpi">
        <div className="kpi-label">Memory · Fleet Avg</div>
        <div className="kpi-value">
          {overview ? Math.round(overview.fleet_memory_avg) : "-"}
          <span className="unit">%</span>
        </div>
        <div className="kpi-sub">
          <span className="mono text-muted">across fleet</span>
        </div>
        <div className="kpi-spark">
          <Sparkline
            data={memHistory.length > 1 ? memHistory : [0.5]}
            color="var(--info)"
          />
        </div>
      </div>

      <div className="kpi" style={{ borderRight: "none" }}>
        <div className="kpi-label">Version</div>
        <div className="kpi-value text-[18px]">
          <span className="mono text-[13px] font-normal text-secondary">
            {APP_VERSION}
          </span>
        </div>
        <div className="kpi-sub">
          <span className="mono text-muted">lattice web</span>
        </div>
      </div>
    </div>
  );
}

// ── Event Stream ────────────────────────────────────────────────────

let eventIdCounter = 0;

type LiveEvent = {
  id: number;
  ts: number;
  level: "info" | "ok" | "warn" | "err";
  source: string;
  msg: string;
};

function EventStream() {
  const [events, setEvents] = useState<LiveEvent[]>([]);

  const handleEvent = useCallback((event: AdminSocketEvent) => {
    const now = Date.now();
    let level: LiveEvent["level"] = "info";
    let source = "system";
    let msg = "";

    switch (event.type) {
      case "worker_heartbeat": {
        const p = event.payload ?? {};
        source = `worker:${event.worker_id ?? "?"}`;
        const cpu = p.cpu_percent ?? "?";
        const mem = p.memory_used_mb ?? "?";
        msg = `heartbeat ok (cpu=${cpu}%, mem=${mem}MB)`;
        level = "ok";
        break;
      }
      case "worker_connected":
        source = `worker:${event.worker_id ?? "?"}`;
        msg = "connected";
        level = "ok";
        break;
      case "worker_disconnected":
        source = `worker:${event.worker_id ?? "?"}`;
        msg = "disconnected";
        level = "err";
        break;
      case "container_status": {
        const p = event.payload ?? {};
        source = (p.container_name as string) ?? "container";
        msg = `${p.action ?? "status"} → ${p.status ?? "unknown"}`;
        level =
          p.status === "running"
            ? "ok"
            : p.status === "stopped" || p.status === "error"
              ? "err"
              : "info";
        break;
      }
      case "container_health_status": {
        const p = event.payload ?? {};
        source = (p.container_name as string) ?? "container";
        msg = `health → ${p.health_status ?? "unknown"}`;
        level = p.health_status === "healthy" ? "ok" : "warn";
        break;
      }
      case "deployment_progress": {
        const p = event.payload ?? {};
        source = `deploy:${p.deployment_id ?? "?"}`;
        msg = (p.message as string) ?? `status → ${p.status ?? "?"}`;
        level = p.status === "failed" ? "err" : p.status === "deployed" ? "ok" : "info";
        break;
      }
      case "worker_crash": {
        source = `worker:${event.worker_id ?? "?"}`;
        msg = "crash detected";
        level = "err";
        break;
      }
      default:
        source = event.type;
        msg = JSON.stringify(event.payload ?? {}).slice(0, 100);
    }

    const id = ++eventIdCounter;
    setEvents((prev) =>
      [{ id, ts: now, level, source, msg }, ...prev].slice(0, 60),
    );
  }, []);

  useAdminSocket(handleEvent);

  return (
    <div
      className="panel"
      style={{ display: "flex", flexDirection: "column", height: "100%" }}
    >
      <div className="panel-header">
        <span className="pulse-dot healthy" />
        <span>Live event stream</span>
        <span className="muted">/ws/admin</span>
        <div className="panel-header-right">
          <span
            className="mono"
            style={{ fontSize: 10, color: "var(--text-muted)" }}
          >
            {events.length} events
          </span>
          <button className="icon-btn" style={{ width: 22, height: 22 }}>
            <FontAwesomeIcon icon={faFilter} style={{ width: 10, height: 10 }} />
          </button>
          <button className="icon-btn" style={{ width: 22, height: 22 }}>
            <FontAwesomeIcon icon={faArrowDown} style={{ width: 10, height: 10 }} />
          </button>
        </div>
      </div>
      <div className="event-stream" style={{ flex: 1, overflow: "hidden" }}>
        {events.length === 0 && (
          <div
            className="text-muted mono"
            style={{ padding: "16px", fontSize: 11 }}
          >
            Waiting for events...
          </div>
        )}
        {events.slice(0, 22).map((ev, i) => (
          <div key={ev.id} className={`event-line${i === 0 ? " new" : ""}`}>
            <span className="event-ts">
              {new Date(ev.ts).toLocaleTimeString("en-US", { hour12: false })}
            </span>
            <span className="event-src">{ev.source}</span>
            <span className="event-msg">
              <span
                className={
                  ev.level === "ok"
                    ? "log-level-ok"
                    : ev.level === "err"
                      ? "log-level-err"
                      : ev.level === "warn"
                        ? "log-level-warn"
                        : "log-level-info"
                }
                style={{ display: "inline-block", width: 36, fontSize: 10 }}
              >
                [{ev.level.toUpperCase()}]
              </span>{" "}
              {ev.msg}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Deployment Timeline Mini ────────────────────────────────────────

function DeploymentTimelineMini({
  deployments,
  stackNames,
}: {
  deployments: Deployment[] | null;
  stackNames: Record<number, string>;
}) {
  const router = useRouter();

  const active = useMemo(
    () =>
      (deployments ?? []).filter(
        (d) => d.status === "deploying" || d.status === "pending",
      ),
    [deployments],
  );

  const recent = useMemo(
    () =>
      (deployments ?? [])
        .filter((d) => d.status !== "deploying" && d.status !== "pending")
        .slice(0, 5),
    [deployments],
  );

  return (
    <div
      className="panel"
      style={{ display: "flex", flexDirection: "column", height: "100%" }}
    >
      <div className="panel-header">
        <span>Deployments</span>
        <span className="muted">· recent</span>
        <div className="panel-header-right">
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => router.push("/deployments")}
          >
            View all{" "}
            <FontAwesomeIcon icon={faChevronRight} style={{ width: 9 }} />
          </button>
        </div>
      </div>

      {/* Active deployments */}
      <div
        style={{
          padding: "12px 16px",
          borderBottom: "1px solid var(--border)",
          flexShrink: 0,
        }}
      >
        {active.map((d) => (
          <div key={d.id} style={{ marginBottom: 10 }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                marginBottom: 6,
              }}
            >
              <span className="pulse-dot pending" />
              <span style={{ fontSize: 12, fontWeight: 500 }}>
                {stackNames[d.stack_id] ?? `Stack #${d.stack_id}`}
              </span>
              <span className="mono text-muted" style={{ fontSize: 11 }}>
                {d.strategy}
              </span>
            </div>
            <div className="progress-bar">
              <div className="progress-bar-fill pending" style={{ width: "50%" }} />
            </div>
            <div
              className="mono text-muted"
              style={{ fontSize: 10, marginTop: 4 }}
            >
              started {d.started_at ? timeAgo(d.started_at) : "just now"}
            </div>
          </div>
        ))}
        {active.length === 0 && (
          <div className="text-muted" style={{ fontSize: 12 }}>
            No active deployments.
          </div>
        )}
      </div>

      {/* Recent deployments */}
      <div style={{ flex: 1, overflowY: "auto" }}>
        {recent.map((d) => {
          const dur =
            d.started_at && d.completed_at
              ? Math.round(
                  (new Date(d.completed_at).getTime() -
                    new Date(d.started_at).getTime()) /
                    1000,
                )
              : 0;
          return (
            <div
              key={d.id}
              onClick={() => router.push(`/deployments/${d.id}`)}
              style={{
                padding: "10px 16px",
                borderBottom: "1px solid var(--border-subtle)",
                display: "flex",
                alignItems: "center",
                gap: 10,
                cursor: "pointer",
              }}
              className="hover:bg-surface"
            >
              <span
                className={`status-dot ${d.status === "deployed" ? "healthy" : d.status === "rolled_back" ? "pending" : "failed"}`}
              />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    fontSize: 12,
                    fontWeight: 500,
                    display: "flex",
                    gap: 6,
                    alignItems: "center",
                  }}
                >
                  <span>
                    {stackNames[d.stack_id] ?? `Stack #${d.stack_id}`}
                  </span>
                  <span
                    className="mono text-muted"
                    style={{
                      fontSize: 10,
                      padding: "1px 5px",
                      background: "var(--surface-alt)",
                      borderRadius: 3,
                    }}
                  >
                    {d.strategy}
                  </span>
                </div>
              </div>
              <div
                style={{
                  textAlign: "right",
                  fontSize: 11,
                  fontFamily: "var(--font-mono)",
                  color: "var(--text-muted)",
                }}
              >
                <div>{d.started_at ? timeAgo(d.started_at) : "-"}</div>
                {dur > 0 && (
                  <div style={{ fontSize: 10, color: "var(--text-dimmed)" }}>
                    {dur}s
                  </div>
                )}
              </div>
            </div>
          );
        })}
        {recent.length === 0 && (
          <div
            className="text-muted mono"
            style={{ padding: 16, fontSize: 11 }}
          >
            No recent deployments.
          </div>
        )}
      </div>
    </div>
  );
}

// ── Fleet Resource Panel ────────────────────────────────────────────

type MetricKey = "cpu" | "mem" | "net" | "req";

function FleetResourcePanel({
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
        return "—";
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
    <div
      className="panel"
      style={{ display: "flex", flexDirection: "column" }}
    >
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
          style={{
            flex: 1,
            display: "flex",
            alignItems: "stretch",
            position: "relative",
          }}
        >
          <Sparkline
            data={chartData.length > 1 ? chartData : [0.5]}
            width={460}
            height={260}
            color={colors[metric]}
            fill
          />
        </div>
      </div>
    </div>
  );
}

// ── Failing Stacks Banner ───────────────────────────────────────────

function FailingStacksBanner({
  count,
  onViewDeployments,
}: {
  count: number;
  onViewDeployments: () => void;
}) {
  if (count === 0) return null;
  return (
    <div
      style={{
        marginBottom: 16,
        padding: "10px 14px",
        background: "var(--failed-bg)",
        border: "1px solid var(--failed-dim)",
        borderRadius: 6,
        display: "flex",
        alignItems: "center",
        gap: 10,
        fontSize: 12,
      }}
    >
      <FontAwesomeIcon
        icon={faTriangleExclamation}
        style={{ width: 14, color: "var(--failed)" }}
      />
      <div style={{ flex: 1 }}>
        <span style={{ fontWeight: 500 }}>
          {count} stack{count > 1 ? "s" : ""} need attention
        </span>
        <span className="text-muted" style={{ marginLeft: 8 }}>
          healthcheck failures — consider rollback.
        </span>
      </div>
      <button className="btn btn-sm btn-secondary" onClick={onViewDeployments}>
        View deployments
      </button>
    </div>
  );
}

// ── Resizable Split ─────────────────────────────────────────────────

function ResizableSplit({
  left,
  right,
  leftMin = 300,
  rightMin = 200,
  defaultRightWidth = 360,
  storageKey,
  height,
  style,
}: {
  left: React.ReactNode;
  right: React.ReactNode;
  leftMin?: number;
  rightMin?: number;
  defaultRightWidth?: number;
  storageKey?: string;
  height: number;
  style?: React.CSSProperties;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [rightWidth, setRightWidth] = useState(() => {
    if (storageKey && typeof localStorage !== "undefined") {
      const saved = localStorage.getItem(storageKey);
      if (saved) return parseInt(saved, 10);
    }
    return defaultRightWidth;
  });
  const dragging = useRef(false);
  const startX = useRef(0);
  const startWidth = useRef(0);
  const latestWidth = useRef(rightWidth);
  latestWidth.current = rightWidth;

  const onMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      dragging.current = true;
      startX.current = e.clientX;
      startWidth.current = latestWidth.current;

      const onMouseMove = (ev: MouseEvent) => {
        if (!dragging.current || !containerRef.current) return;
        const containerWidth = containerRef.current.offsetWidth;
        const delta = startX.current - ev.clientX;
        const newRight = Math.max(
          rightMin,
          Math.min(containerWidth - leftMin - 12, startWidth.current + delta),
        );
        setRightWidth(newRight);
        latestWidth.current = newRight;
      };

      const onMouseUp = () => {
        dragging.current = false;
        document.removeEventListener("mousemove", onMouseMove);
        document.removeEventListener("mouseup", onMouseUp);
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
        if (storageKey) {
          localStorage.setItem(storageKey, String(latestWidth.current));
        }
      };

      document.addEventListener("mousemove", onMouseMove);
      document.addEventListener("mouseup", onMouseUp);
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
    },
    [leftMin, rightMin, storageKey],
  );

  return (
    <div
      ref={containerRef}
      style={{
        display: "flex",
        height,
        gap: 0,
        ...style,
      }}
    >
      <div style={{ flex: 1, minWidth: leftMin, overflow: "hidden" }}>
        {left}
      </div>
      <div
        onMouseDown={onMouseDown}
        style={{
          width: 12,
          cursor: "col-resize",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        <div
          style={{
            width: 3,
            height: 32,
            borderRadius: 2,
            background: "var(--border-strong)",
            opacity: 0.5,
          }}
        />
      </div>
      <div
        style={{
          width: rightWidth,
          flexShrink: 0,
          overflow: "hidden",
        }}
      >
        {right}
      </div>
    </div>
  );
}

// ── Helper: normalize fleet metrics to 0-1 range for sparklines ─────

function normalizeHistory(
  points: FleetMetricsPoint[],
  key: "cpu_avg" | "memory_avg" | "network_rx_total" | "running_count",
): number[] {
  if (points.length === 0) return [];
  const values = points.map((p) => p[key]);
  const max = Math.max(...values, 1);
  return values.map((v) => v / max);
}

// ── Dashboard Page ──────────────────────────────────────────────────

export default function DashboardPage() {
  const router = useRouter();
  const [overview, setOverview] = useState<OverviewData | null>(null);
  const [stackNames, setStackNames] = useState<Record<number, string>>({});
  const [fleetHistory, setFleetHistory] = useState<FleetMetricsPoint[]>([]);

  useEffect(() => {
    document.title = "Lattice - Dashboard";
  }, []);

  // Load overview + fleet metrics
  const loadOverview = useCallback(async () => {
    const res = await reqGetOverview();
    if (res.success) setOverview(res.data);
  }, []);

  const loadFleetHistory = useCallback(async () => {
    const res = await reqGetFleetMetrics("24h");
    if (res.success && res.data) setFleetHistory(res.data);
  }, []);

  useEffect(() => {
    loadOverview();
    loadFleetHistory();
    // Refresh overview every 30s, history every 60s
    const overviewInterval = setInterval(loadOverview, 30000);
    const historyInterval = setInterval(loadFleetHistory, 60000);
    return () => {
      clearInterval(overviewInterval);
      clearInterval(historyInterval);
    };
  }, [loadOverview, loadFleetHistory]);

  // WebSocket: push live metrics into fleet history + update overview counters
  const handleDashboardEvent = useCallback((event: AdminSocketEvent) => {
    if (event.type === "worker_heartbeat" && event.payload) {
      const p = event.payload;
      const cpu = p.cpu_percent as number | undefined;
      const memUsed = p.memory_used_mb as number | undefined;
      const memTotal = p.memory_total_mb as number | undefined;
      const netRx = p.network_rx_bytes as number | undefined;
      const netTx = p.network_tx_bytes as number | undefined;
      const containers = p.container_count as number | undefined;
      const running = p.container_running_count as number | undefined;

      // Push a new point to the fleet history (append, keep last 30 points)
      setFleetHistory((prev) => {
        const memPct =
          memUsed != null && memTotal != null && memTotal > 0
            ? (memUsed / memTotal) * 100
            : prev.length > 0
              ? prev[prev.length - 1].memory_avg
              : 0;
        const newPoint: FleetMetricsPoint = {
          timestamp: new Date().toISOString(),
          cpu_avg: cpu ?? (prev.length > 0 ? prev[prev.length - 1].cpu_avg : 0),
          memory_avg: memPct,
          network_rx_total: netRx ?? 0,
          network_tx_total: netTx ?? 0,
          container_count: containers ?? 0,
          running_count: running ?? 0,
        };
        return [...prev.slice(-29), newPoint];
      });

      // Update overview fleet averages from latest heartbeat
      if (cpu != null || memUsed != null) {
        setOverview((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            fleet_cpu_avg: cpu ?? prev.fleet_cpu_avg,
            fleet_memory_avg:
              memUsed != null && memTotal != null && memTotal > 0
                ? (memUsed / memTotal) * 100
                : prev.fleet_memory_avg,
            fleet_container_count: containers ?? prev.fleet_container_count,
            fleet_running_count: running ?? prev.fleet_running_count,
          };
        });
      }
    }

    if (event.type === "worker_connected") {
      setOverview((prev) => {
        if (!prev) return prev;
        return { ...prev, online_workers: prev.online_workers + 1 };
      });
    }

    if (event.type === "worker_disconnected") {
      setOverview((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          online_workers: Math.max(0, prev.online_workers - 1),
        };
      });
    }

    if (event.type === "container_status" && event.payload) {
      const status = event.payload.status as string | undefined;
      if (status === "running") {
        setOverview((prev) => {
          if (!prev) return prev;
          return { ...prev, running_containers: prev.running_containers + 1 };
        });
      } else if (status === "stopped" || status === "error") {
        setOverview((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            running_containers: Math.max(0, prev.running_containers - 1),
          };
        });
      }
    }

    if (event.type === "deployment_progress" && event.payload) {
      const status = event.payload.status as string | undefined;
      if (status === "deploying") {
        setOverview((prev) => {
          if (!prev) return prev;
          return { ...prev, deploying_stacks: prev.deploying_stacks + 1 };
        });
      } else if (status === "deployed" || status === "failed") {
        setOverview((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            deploying_stacks: Math.max(0, prev.deploying_stacks - 1),
            ...(status === "failed"
              ? { failed_stacks: prev.failed_stacks + 1 }
              : {}),
          };
        });
      }
    }
  }, []);

  useAdminSocket(handleDashboardEvent);

  // Resolve stack names
  useEffect(() => {
    import("@/services/stacks.service").then(({ reqGetStacks }) => {
      reqGetStacks().then((res) => {
        if (res.success && res.data) {
          const map: Record<number, string> = {};
          res.data.forEach((s) => {
            map[s.id] = s.name;
          });
          setStackNames(map);
        }
      });
    });
  }, []);

  // Derive sparkline arrays from fleet history
  const cpuHistory = useMemo(
    () => normalizeHistory(fleetHistory, "cpu_avg"),
    [fleetHistory],
  );
  const memHistory = useMemo(
    () => normalizeHistory(fleetHistory, "memory_avg"),
    [fleetHistory],
  );
  const netHistory = useMemo(
    () => normalizeHistory(fleetHistory, "network_rx_total"),
    [fleetHistory],
  );
  const containerHistory = useMemo(
    () => normalizeHistory(fleetHistory, "running_count"),
    [fleetHistory],
  );

  return (
    <div style={{ padding: 28 }}>
      {/* Failing stacks banner */}
      <FailingStacksBanner
        count={overview?.failed_stacks ?? 0}
        onViewDeployments={() => router.push("/deployments")}
      />

      {/* KPI row */}
      <DashboardKPIRow
        overview={overview}
        cpuHistory={cpuHistory}
        memHistory={memHistory}
        netHistory={netHistory}
        containerHistory={containerHistory}
      />

      {/* Topology + Event Stream (resizable) */}
      <ResizableSplit
        leftMin={400}
        rightMin={260}
        defaultRightWidth={360}
        storageKey="lattice-dash-topo-split"
        height={540}
        style={{ marginBottom: 16 }}
        left={
          <div className="panel" style={{ height: "100%", overflow: "hidden" }}>
            <TopologyBoard />
          </div>
        }
        right={<EventStream />}
      />

      {/* Deployment Timeline + Fleet Resources */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 20,
          height: 340,
        }}
      >
        <DeploymentTimelineMini
          deployments={overview?.recent_deployments ?? null}
          stackNames={stackNames}
        />
        <FleetResourcePanel
          workerMetrics={overview?.worker_metrics ?? null}
          overview={overview}
          cpuHistory={cpuHistory}
          memHistory={memHistory}
          netHistory={netHistory}
          containerHistory={containerHistory}
        />
      </div>
    </div>
  );
}
