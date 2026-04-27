"use client";

import { useState, useCallback } from "react";
import { APP_VERSION } from "@/lib/version";
import { Sparkline } from "@/components/ui/sparkline";
import type { OverviewData } from "@/types";

type HoverInfo = { value: number; timestamp: string | null } | null;

function formatShortTime(ts: string): string {
  const d = new Date(ts);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function DashboardKPIRow({
  overview,
  cpuHistory,
  memHistory,
  netHistory,
  containerHistory,
  workerHistory,
  cpuTimestamps,
  memTimestamps,
  containerTimestamps,
}: {
  overview: OverviewData | null;
  cpuHistory: number[];
  memHistory: number[];
  netHistory: number[];
  containerHistory: number[];
  workerHistory: number[];
  cpuTimestamps?: string[];
  memTimestamps?: string[];
  containerTimestamps?: string[];
}) {
  const [cpuHover, setCpuHover] = useState<HoverInfo>(null);
  const [memHover, setMemHover] = useState<HoverInfo>(null);
  const [containerHover, setContainerHover] = useState<HoverInfo>(null);
  const [workerHover, setWorkerHover] = useState<HoverInfo>(null);
  const [stackHover, setStackHover] = useState<HoverInfo>(null);

  const makeHandler = useCallback(
    (setter: (v: HoverInfo) => void) =>
      (info: { index: number; value: number; timestamp: string | null } | null) => {
        setter(info ? { value: info.value, timestamp: info.timestamp } : null);
      },
    [],
  );

  return (
    <div className="card dash-kpi-row">
      <div className="kpi">
        <div className="kpi-label">Fleet Health</div>
        <div className="kpi-value">
          {workerHover
            ? Math.round(workerHover.value)
            : overview
              ? `${overview.online_workers}/${overview.total_workers}`
              : "-"}
          <span className="unit">workers</span>
        </div>
        <div className="kpi-sub">
          {workerHover?.timestamp ? (
            <span className="mono text-muted">{formatShortTime(workerHover.timestamp)}</span>
          ) : overview && overview.online_workers > 0 ? (
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
          <Sparkline
            data={workerHistory}
            color="var(--healthy)"
            formatValue={(v) => `${Math.round(v)} workers`}
            onHover={makeHandler(setWorkerHover)}
          />
        </div>
      </div>

      <div className="kpi">
        <div className="kpi-label">Running Containers</div>
        <div className="kpi-value">
          {containerHover
            ? Math.round(containerHover.value)
            : overview?.running_containers ?? "-"}
          <span className="unit">
            {containerHover ? "running" : `/ ${overview?.total_containers ?? "-"}`}
          </span>
        </div>
        <div className="kpi-sub">
          {containerHover?.timestamp ? (
            <span className="mono text-muted">{formatShortTime(containerHover.timestamp)}</span>
          ) : (
            <span className="up mono">active</span>
          )}
        </div>
        <div className="kpi-spark">
          <Sparkline
            data={containerHistory}
            color="var(--healthy)"
            timestamps={containerTimestamps}
            formatValue={(v) => `${Math.round(v)} running`}
            onHover={makeHandler(setContainerHover)}
          />
        </div>
      </div>

      <div className="kpi">
        <div className="kpi-label">Stacks Deployed</div>
        <div className="kpi-value">
          {stackHover
            ? Math.round(stackHover.value)
            : overview
              ? `${overview.active_stacks}/${overview.total_stacks}`
              : "-"}
          {stackHover && <span className="unit">containers</span>}
        </div>
        <div className="kpi-sub">
          {stackHover?.timestamp ? (
            <span className="mono text-muted">{formatShortTime(stackHover.timestamp)}</span>
          ) : (
            <>
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
            </>
          )}
        </div>
        <div className="kpi-spark">
          <Sparkline
            data={containerHistory}
            color="var(--info)"
            timestamps={containerTimestamps}
            formatValue={(v) => `${Math.round(v)} containers`}
            onHover={makeHandler(setStackHover)}
          />
        </div>
      </div>

      <div className="kpi">
        <div className="kpi-label">CPU · Fleet Avg</div>
        <div className="kpi-value">
          {cpuHover ? cpuHover.value.toFixed(1) : overview ? Math.round(overview.fleet_cpu_avg) : "-"}
          <span className="unit">%</span>
        </div>
        <div className="kpi-sub">
          {cpuHover?.timestamp ? (
            <span className="mono text-muted">{formatShortTime(cpuHover.timestamp)}</span>
          ) : (
            <span className="mono text-muted">across fleet</span>
          )}
        </div>
        <div className="kpi-spark">
          <Sparkline
            data={cpuHistory}
            color="var(--pending)"
            timestamps={cpuTimestamps}
            formatValue={(v) => `${v.toFixed(1)}%`}
            onHover={makeHandler(setCpuHover)}
          />
        </div>
      </div>

      <div className="kpi">
        <div className="kpi-label">Memory · Fleet Avg</div>
        <div className="kpi-value">
          {memHover ? memHover.value.toFixed(1) : overview ? Math.round(overview.fleet_memory_avg) : "-"}
          <span className="unit">%</span>
        </div>
        <div className="kpi-sub">
          {memHover?.timestamp ? (
            <span className="mono text-muted">{formatShortTime(memHover.timestamp)}</span>
          ) : (
            <span className="mono text-muted">across fleet</span>
          )}
        </div>
        <div className="kpi-spark">
          <Sparkline
            data={memHistory}
            color="var(--info)"
            timestamps={memTimestamps}
            formatValue={(v) => `${v.toFixed(1)}%`}
            onHover={makeHandler(setMemHover)}
          />
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
