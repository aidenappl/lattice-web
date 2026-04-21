"use client";

import { APP_VERSION } from "@/lib/version";
import { Sparkline } from "@/components/ui/sparkline";
import type { OverviewData } from "@/types";

export function DashboardKPIRow({
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

      <div className="kpi kpi-version" style={{ borderRight: "none" }}>
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
