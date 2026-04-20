"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  reqGetOverview,
  OverviewData,
  WorkerMetricsSummary,
} from "@/services/admin.service";
import { APP_VERSION } from "@/lib/version";
import { timeAgo } from "@/lib/utils";
import { TopologyBoard } from "@/components/topology/TopologyBoard";
import { Sparkline, Meter, generateSparkData } from "@/components/ui/sparkline";
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

// ── Sparkline data seeds (consistent across renders) ────────────────
const SPARK_SEEDS = {
  cpu: generateSparkData(24, 1, 0.45, 0.15),
  mem: generateSparkData(24, 2, 0.6, 0.1),
  net: generateSparkData(24, 3, 0.3, 0.2),
  req: generateSparkData(24, 4, 0.5, 0.18),
};

// ── KPI Row ─────────────────────────────────────────────────────────

function DashboardKPIRow({ overview }: { overview: OverviewData | null }) {
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
          <Sparkline data={SPARK_SEEDS.req} color="var(--healthy)" live />
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
          <Sparkline data={SPARK_SEEDS.cpu} color="var(--healthy)" live />
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
          <Sparkline data={SPARK_SEEDS.net} color="var(--info)" live />
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
          <Sparkline data={SPARK_SEEDS.cpu} color="var(--pending)" live />
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
          <Sparkline data={SPARK_SEEDS.mem} color="var(--info)" live />
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

type LiveEvent = {
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

    setEvents((prev) =>
      [{ ts: now, level, source, msg }, ...prev].slice(0, 60),
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
          <div key={`${ev.ts}-${i}`} className="event-line">
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
}: {
  workerMetrics: WorkerMetricsSummary[] | null;
  overview: OverviewData | null;
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
            data={SPARK_SEEDS[metric === "req" ? "req" : metric]}
            width={460}
            height={260}
            color={colors[metric]}
            fill
            live
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

// ── Dashboard Page ──────────────────────────────────────────────────

export default function DashboardPage() {
  const router = useRouter();
  const [overview, setOverview] = useState<OverviewData | null>(null);
  const [stackNames, setStackNames] = useState<Record<number, string>>({});

  useEffect(() => {
    document.title = "Lattice - Dashboard";
  }, []);

  useEffect(() => {
    const load = async () => {
      const [overviewRes] = await Promise.all([reqGetOverview()]);
      if (overviewRes.success) {
        setOverview(overviewRes.data);
      }
    };
    load();
    // Refresh every 30s
    const interval = setInterval(load, 30000);
    return () => clearInterval(interval);
  }, []);

  // Resolve stack names from stacks API
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

  return (
    <div style={{ padding: 28 }}>
      {/* Failing stacks banner */}
      <FailingStacksBanner
        count={overview?.failed_stacks ?? 0}
        onViewDeployments={() => router.push("/deployments")}
      />

      {/* KPI row */}
      <DashboardKPIRow overview={overview} />

      {/* Topology + Event Stream */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 360px",
          gap: 20,
          marginBottom: 16,
        }}
      >
        <div className="panel" style={{ height: 540, overflow: "hidden" }}>
          <div className="panel-header">
            <span>Topology</span>
            <span className="muted">· live system map</span>
          </div>
          <div style={{ height: "calc(100% - 41px)" }}>
            <TopologyBoard />
          </div>
        </div>
        <EventStream />
      </div>

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
        />
      </div>
    </div>
  );
}
