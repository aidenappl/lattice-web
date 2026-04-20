"use client";

import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  reqGetOverview,
  reqGetFleetMetrics,
  reqGetAuditLog,
  OverviewData,
  WorkerMetricsSummary,
  FleetMetricsPoint,
  AuditLogEntry,
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

// Per-worker latest metrics for fleet aggregation
type WorkerLatestMetrics = {
  cpu: number;
  memoryPct: number;
  netRx: number;
  netTx: number;
  containers: number;
  running: number;
};

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
    <div className="card dash-kpi-row">
      <div className="kpi">
        <div className="kpi-label">Fleet Health</div>
        <div className="kpi-value">
          {overview
            ? `${overview.online_workers}/${overview.total_workers}`
            : "-"}
          <span className="unit">workers</span>
        </div>
        <div className="kpi-sub">
          {overview && overview.online_workers > 0 ? (
            <>
              <span className="up">●</span>{" "}
              {Math.round(
                (overview.online_workers /
                  Math.max(overview.total_workers, 1)) *
                  100,
              )}
              % online
            </>
          ) : (
            <span className="text-muted">no workers</span>
          )}
        </div>
        <div className="kpi-spark">
          <Sparkline data={cpuHistory} color="var(--healthy)" />
        </div>
      </div>

      <div className="kpi">
        <div className="kpi-label">Running Containers</div>
        <div className="kpi-value">
          {overview?.running_containers ?? "-"}
          <span className="unit">/ {overview?.total_containers ?? "-"}</span>
        </div>
        <div className="kpi-sub">
          <span className="up mono">active</span>
        </div>
        <div className="kpi-spark">
          <Sparkline data={containerHistory} color="var(--healthy)" />
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
              <span className="mono">
                {overview.deploying_stacks} deploying
              </span>
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
          <Sparkline data={containerHistory} color="var(--info)" />
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
          <Sparkline data={cpuHistory} color="var(--pending)" />
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
          <Sparkline data={memHistory} color="var(--info)" />
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
        level =
          p.status === "failed"
            ? "err"
            : p.status === "deployed"
              ? "ok"
              : "info";
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
        <div className="panel-header-right">
          <span
            className="mono"
            style={{ fontSize: 10, color: "var(--text-muted)" }}
          >
            {events.length} events
          </span>
          <button className="icon-btn" style={{ width: 22, height: 22 }}>
            <FontAwesomeIcon
              icon={faFilter}
              style={{ width: 10, height: 10 }}
            />
          </button>
          <button className="icon-btn" style={{ width: 22, height: 22 }}>
            <FontAwesomeIcon
              icon={faArrowDown}
              style={{ width: 10, height: 10 }}
            />
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
              <div
                className="progress-bar-fill pending"
                style={{ width: "50%" }}
              />
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

// ── Recent Activity Panel ────────────────────────────────────────────

const activityColors: Record<string, string> = {
  create: "healthy",
  update: "info",
  delete: "failed",
  deploy: "violet",
  login: "pending",
  approve: "healthy",
  rollback: "pending",
  start: "healthy",
  stop: "failed",
  restart: "info",
};

function activityDotClass(action: string): string {
  const key = Object.keys(activityColors).find((k) =>
    action.toLowerCase().includes(k),
  );
  return key ? activityColors[key] : "muted";
}

function RecentActivityPanel({ entries }: { entries: AuditLogEntry[] }) {
  const router = useRouter();
  const recent = entries.slice(0, 15);

  return (
    <div
      className="panel"
      style={{ display: "flex", flexDirection: "column", height: "100%" }}
    >
      <div className="panel-header">
        <span>Activity</span>
        <span className="muted">· recent</span>
        <div className="panel-header-right">
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => router.push("/audit-log")}
          >
            View all{" "}
            <FontAwesomeIcon icon={faChevronRight} style={{ width: 9 }} />
          </button>
        </div>
      </div>
      <div style={{ flex: 1, overflowY: "auto" }}>
        {recent.map((e) => (
          <div
            key={e.id}
            style={{
              padding: "8px 16px",
              borderBottom: "1px solid var(--border-subtle)",
              display: "flex",
              alignItems: "center",
              gap: 10,
            }}
          >
            <span className={`status-dot ${activityDotClass(e.action)}`} />
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
                <span className="truncate">{e.action}</span>
                <span
                  className="mono text-muted"
                  style={{
                    fontSize: 10,
                    padding: "1px 5px",
                    background: "var(--surface-alt)",
                    borderRadius: 3,
                  }}
                >
                  {e.resource_type}
                </span>
              </div>
              {e.details && (
                <div
                  className="text-muted truncate"
                  style={{ fontSize: 10, marginTop: 1 }}
                >
                  {e.details}
                </div>
              )}
            </div>
            <div
              className="mono text-muted"
              style={{ fontSize: 11, textAlign: "right", flexShrink: 0 }}
            >
              {timeAgo(e.inserted_at)}
            </div>
          </div>
        ))}
        {recent.length === 0 && (
          <div
            className="text-muted mono"
            style={{ padding: 16, fontSize: 11 }}
          >
            No recent activity.
          </div>
        )}
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

// ── Helper: extract raw metric values from fleet history for sparklines ─────

function extractHistory(
  points: FleetMetricsPoint[],
  key: "cpu_avg" | "memory_avg" | "network_rx_total" | "running_count",
): number[] {
  if (points.length === 0) return [];
  const raw = points.map((p) => p[key]);
  // Trim leading zeros — these are empty buckets before data started flowing.
  // This prevents "spike up from zero" visual on graphs where the value is
  // actually stable (e.g., container count = 16 for the entire session).
  let firstNonZero = 0;
  for (let i = 0; i < raw.length; i++) {
    if (raw[i] !== 0) {
      firstNonZero = i;
      break;
    }
    if (i === raw.length - 1) firstNonZero = i; // all zeros, show last point
  }
  return raw.slice(firstNonZero);
}

// ── Dashboard Page ──────────────────────────────────────────────────

export default function DashboardPage() {
  const router = useRouter();
  const [overview, setOverview] = useState<OverviewData | null>(null);
  const [stackNames, setStackNames] = useState<Record<number, string>>({});
  const [fleetHistory, setFleetHistory] = useState<FleetMetricsPoint[]>([]);
  const [auditLog, setAuditLog] = useState<AuditLogEntry[]>([]);

  useEffect(() => {
    document.title = "Lattice - Dashboard";
  }, []);

  // Load overview + fleet metrics
  const loadOverview = useCallback(async () => {
    const res = await reqGetOverview();
    if (res.success) {
      setOverview(res.data);
      // Seed per-worker metrics ref from overview if not already populated
      if (res.data.worker_metrics && workerMetricsRef.current.size === 0) {
        res.data.worker_metrics.forEach((w) => {
          workerMetricsRef.current.set(w.worker_id, {
            cpu: w.cpu ?? 0,
            memoryPct: w.memory ?? 0,
            netRx: w.net_rx ?? 0,
            netTx: w.net_tx ?? 0,
            containers: w.containers ?? 0,
            running: w.running ?? 0,
          });
        });
      }
    }
  }, []);

  const loadFleetHistory = useCallback(async () => {
    const res = await reqGetFleetMetrics("1h");
    if (res.success && res.data) setFleetHistory(res.data);
  }, []);

  useEffect(() => {
    loadOverview();
    loadFleetHistory();
    reqGetAuditLog().then((res) => {
      if (res.success) setAuditLog(res.data ?? []);
    });
    // Refresh overview every 30s; fleet history is extended in real-time via WS
    const overviewInterval = setInterval(loadOverview, 30000);
    return () => {
      clearInterval(overviewInterval);
    };
  }, [loadOverview, loadFleetHistory]);

  // Per-worker latest metrics for proper fleet aggregation (avoids sawtooth)
  const workerMetricsRef = useRef<Map<number, WorkerLatestMetrics>>(new Map());
  const workerHeartbeatCount = useRef<Map<number, number>>(new Map());

  // Compute fleet aggregate from all tracked workers
  const computeFleetAggregate = useCallback((): FleetMetricsPoint => {
    const workers = workerMetricsRef.current;
    const count = workers.size || 1;
    let cpuSum = 0,
      memSum = 0,
      netRxSum = 0,
      netTxSum = 0,
      containerSum = 0,
      runningSum = 0;
    workers.forEach((w) => {
      cpuSum += w.cpu;
      memSum += w.memoryPct;
      netRxSum += w.netRx;
      netTxSum += w.netTx;
      containerSum += w.containers;
      runningSum += w.running;
    });
    return {
      timestamp: new Date().toISOString(),
      cpu_avg: cpuSum / count,
      memory_avg: memSum / count,
      network_rx_total: netRxSum,
      network_tx_total: netTxSum,
      container_count: containerSum,
      running_count: runningSum,
    };
  }, []);

  // WebSocket: aggregate per-worker metrics into fleet history + update overview
  const handleDashboardEvent = useCallback(
    (event: AdminSocketEvent) => {
      if (event.type === "worker_heartbeat" && event.payload) {
        const p = event.payload;
        const workerId = event.worker_id as number | undefined;
        if (workerId == null) return;

        // Track heartbeat count per worker — skip the first one after connect
        // because the runner's CPU delta calculation reports 0% on the first beat
        const beatCount = (workerHeartbeatCount.current.get(workerId) ?? 0) + 1;
        workerHeartbeatCount.current.set(workerId, beatCount);
        if (beatCount === 1) {
          // First heartbeat is calibration — don't use it for fleet metrics
          // but still count containers since those are accurate immediately
          const containers = (p.container_count as number) ?? 0;
          const running = (p.container_running_count as number) ?? 0;
          const existing = workerMetricsRef.current.get(workerId);
          if (existing) {
            workerMetricsRef.current.set(workerId, {
              ...existing,
              containers,
              running,
            });
          }
          return;
        }

        const cpu = (p.cpu_percent as number) ?? 0;
        const memUsed = p.memory_used_mb as number | undefined;
        const memTotal = p.memory_total_mb as number | undefined;
        const netRx = (p.network_rx_bytes as number) ?? 0;
        const netTx = (p.network_tx_bytes as number) ?? 0;
        const containers = (p.container_count as number) ?? 0;
        const running = (p.container_running_count as number) ?? 0;

        const memPct =
          memUsed != null && memTotal != null && memTotal > 0
            ? (memUsed / memTotal) * 100
            : 0;

        // Update this worker's latest metrics
        workerMetricsRef.current.set(workerId, {
          cpu,
          memoryPct: memPct,
          netRx,
          netTx,
          containers,
          running,
        });

        // Compute fleet aggregate
        const aggregate = computeFleetAggregate();

        // Update overview with fleet averages
        setOverview((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            fleet_cpu_avg: aggregate.cpu_avg,
            fleet_memory_avg: aggregate.memory_avg,
            fleet_container_count: aggregate.container_count,
            fleet_running_count: aggregate.running_count,
          };
        });

        // Push to fleet history on every heartbeat for near-real-time updates
        // Cap at 300 points to prevent unbounded growth
        setFleetHistory((prev) => [...prev.slice(-299), aggregate]);
      }

      if (event.type === "worker_connected") {
        setOverview((prev) => {
          if (!prev) return prev;
          return { ...prev, online_workers: prev.online_workers + 1 };
        });
        // Reset heartbeat count so we skip the first calibration beat
        if (event.worker_id != null) {
          workerHeartbeatCount.current.set(event.worker_id, 0);
        }
      }

      if (event.type === "worker_disconnected") {
        setOverview((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            online_workers: Math.max(0, prev.online_workers - 1),
          };
        });
        // Remove disconnected worker from metrics map and reset beat count
        if (event.worker_id != null) {
          workerMetricsRef.current.delete(event.worker_id as number);
          workerHeartbeatCount.current.delete(event.worker_id);
        }
      }

      if (event.type === "container_status" && event.payload) {
        const actionStatus = event.payload.status as string | undefined;
        const containerState = event.payload.container_state as
          | string
          | undefined;
        if (actionStatus === "success" && containerState) {
          if (containerState === "running") {
            setOverview((prev) => {
              if (!prev) return prev;
              return {
                ...prev,
                running_containers: prev.running_containers + 1,
              };
            });
          } else if (containerState === "stopped") {
            setOverview((prev) => {
              if (!prev) return prev;
              return {
                ...prev,
                running_containers: Math.max(0, prev.running_containers - 1),
              };
            });
          }
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
    },
    [computeFleetAggregate],
  );

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

  // Derive sparkline arrays from fleet history (raw values — Sparkline auto-scales)
  const cpuHistory = useMemo(
    () => extractHistory(fleetHistory, "cpu_avg"),
    [fleetHistory],
  );
  const memHistory = useMemo(
    () => extractHistory(fleetHistory, "memory_avg"),
    [fleetHistory],
  );
  const netHistory = useMemo(
    () => extractHistory(fleetHistory, "network_rx_total"),
    [fleetHistory],
  );
  const containerHistory = useMemo(
    () => extractHistory(fleetHistory, "running_count"),
    [fleetHistory],
  );

  return (
    <div className="dash-page">
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
      <div className="dash-topology-split">
        <ResizableSplit
          leftMin={400}
          rightMin={260}
          defaultRightWidth={360}
          storageKey="lattice-dash-topo-split"
          height={540}
          left={
            <div
              className="panel"
              style={{ height: "100%", overflow: "hidden" }}
            >
              <TopologyBoard />
            </div>
          }
          right={<EventStream />}
        />
      </div>

      {/* Mobile: stacked topology + events */}
      <div className="dash-topology-stacked">
        <div className="panel" style={{ height: 360, overflow: "hidden" }}>
          <TopologyBoard />
        </div>
        <div style={{ height: 300 }}>
          <EventStream />
        </div>
      </div>

      {/* Deployment Timeline + Fleet Resources + Activity */}
      <div className="dash-bottom-grid">
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
        <RecentActivityPanel entries={auditLog} />
      </div>
    </div>
  );
}
