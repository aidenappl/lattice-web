"use client";

import { useEffect, useCallback, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import {
  fetchOverview,
  fetchFleetMetrics,
  fetchAuditLog,
  selectOverview,
  selectFleetHistory,
  selectAuditLog,
  updateOverviewField,
  incrementOverviewField,
  pushFleetHistoryPoint,
} from "@/store/slices/overviewSlice";
import { fetchStacks, selectStackNameMap } from "@/store/slices/stacksSlice";
import { usePoll } from "@/hooks/usePoll";
import { useAdminSocket, AdminSocketEvent } from "@/hooks/useAdminSocket";
import { TopologyBoard } from "@/components/topology/TopologyBoard";
import { DashboardKPIRow } from "@/components/dashboard/DashboardKPIRow";
import { EventStream } from "@/components/dashboard/EventStream";
import { DeploymentTimelineMini } from "@/components/dashboard/DeploymentTimelineMini";
import { FleetResourcePanel } from "@/components/dashboard/FleetResourcePanel";
import { RecentActivityPanel } from "@/components/dashboard/RecentActivityPanel";
import { FailingStacksBanner } from "@/components/dashboard/FailingStacksBanner";
import AnomalyBanner from "@/components/dashboard/AnomalyBanner";
import { ResizableSplit } from "@/components/ui/ResizableSplit";
import type {
  WorkerLatestMetrics,
  FleetMetricsPoint,
} from "@/types";

// ── Helper: extract raw metric values from fleet history for sparklines ─────

function extractHistory(
  points: FleetMetricsPoint[],
  key: "cpu_avg" | "memory_avg" | "network_rx_rate" | "running_count",
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
  const dispatch = useAppDispatch();

  const overview = useAppSelector(selectOverview);
  const fleetHistory = useAppSelector(selectFleetHistory);
  const auditLog = useAppSelector(selectAuditLog);
  const stackNames = useAppSelector(selectStackNameMap);

  useEffect(() => {
    document.title = "Lattice - Dashboard";
  }, []);

  // Initial data load
  useEffect(() => {
    dispatch(fetchOverview());
    dispatch(fetchFleetMetrics("1h"));
    dispatch(fetchAuditLog());
    dispatch(fetchStacks());
  }, [dispatch]);

  // Poll overview every 30s
  const refreshOverview = useCallback(() => {
    dispatch(fetchOverview());
  }, [dispatch]);
  usePoll(refreshOverview, 30000);

  // Per-worker latest metrics for proper fleet aggregation (avoids sawtooth)
  const workerMetricsRef = useRef<Map<number, WorkerLatestMetrics>>(new Map());
  const workerHeartbeatCount = useRef<Map<number, number>>(new Map());
  const lastHistoryPush = useRef<number>(0);

  // Worker health history — tracked independently from fleet metrics
  const [workerHealthHistory, setWorkerHealthHistory] = useState<number[]>([]);
  const workerHealthSeeded = useRef(false);

  // Seed per-worker metrics from overview when it loads
  useEffect(() => {
    if (overview?.worker_metrics && workerMetricsRef.current.size === 0) {
      overview.worker_metrics.forEach((w) => {
        workerMetricsRef.current.set(w.worker_id, {
          cpu: w.cpu ?? 0,
          memoryPct: w.memory ?? 0,
          netRxRate: w.net_rx_rate ?? 0,
          netTxRate: w.net_tx_rate ?? 0,
          containers: w.containers ?? 0,
          running: w.running ?? 0,
        });
      });
    }
    // Seed worker health history with a flat line at the current online count
    if (overview && !workerHealthSeeded.current) {
      workerHealthSeeded.current = true;
      const count = overview.online_workers;
      setWorkerHealthHistory(new Array(20).fill(count));
    }
  }, [overview]);

  // Compute fleet aggregate from all tracked workers
  const computeFleetAggregate = useCallback((): FleetMetricsPoint => {
    const workers = workerMetricsRef.current;
    const count = workers.size || 1;
    let cpuSum = 0,
      memSum = 0,
      netRxRateSum = 0,
      netTxRateSum = 0,
      containerSum = 0,
      runningSum = 0;
    workers.forEach((w) => {
      cpuSum += w.cpu;
      memSum += w.memoryPct;
      netRxRateSum += w.netRxRate;
      netTxRateSum += w.netTxRate;
      containerSum += w.containers;
      runningSum += w.running;
    });
    return {
      timestamp: new Date().toISOString(),
      cpu_avg: cpuSum / count,
      memory_avg: memSum / count,
      network_rx_rate: netRxRateSum,
      network_tx_rate: netTxRateSum,
      container_count: containerSum,
      running_count: runningSum,
      online_workers: workers.size,
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
        const netRxRate = (p.network_rx_rate as number) ?? 0;
        const netTxRate = (p.network_tx_rate as number) ?? 0;
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
          netRxRate,
          netTxRate,
          containers,
          running,
        });

        // Compute fleet aggregate
        const aggregate = computeFleetAggregate();

        // Update overview with fleet averages (always, for KPI numbers)
        dispatch(
          updateOverviewField({
            fleet_cpu_avg: aggregate.cpu_avg,
            fleet_memory_avg: aggregate.memory_avg,
            fleet_container_count: aggregate.container_count,
            fleet_running_count: aggregate.running_count,
          }),
        );

        // Throttle fleet history pushes to once per heartbeat cycle (~15s)
        // This ensures one clean data point per cycle instead of 5 overlapping ones
        const now = Date.now();
        if (now - lastHistoryPush.current >= 14_000) {
          lastHistoryPush.current = now;
          dispatch(pushFleetHistoryPoint(aggregate));
        }
      }

      if (event.type === "worker_connected") {
        dispatch(incrementOverviewField({ field: "online_workers", delta: 1 }));
        if (event.worker_id != null) {
          workerHeartbeatCount.current.set(event.worker_id, 0);
        }
        setWorkerHealthHistory((prev) => {
          const count = workerMetricsRef.current.size + 1;
          return [...prev.slice(-59), count];
        });
      }

      if (event.type === "worker_disconnected") {
        dispatch(incrementOverviewField({ field: "online_workers", delta: -1 }));
        if (event.worker_id != null) {
          workerMetricsRef.current.delete(event.worker_id as number);
          workerHeartbeatCount.current.delete(event.worker_id);
        }
        setWorkerHealthHistory((prev) => {
          const count = workerMetricsRef.current.size;
          return [...prev.slice(-59), count];
        });
      }

      if (event.type === "container_status" && event.payload) {
        const actionStatus = event.payload.status as string | undefined;
        const containerState = event.payload.container_state as string | undefined;
        if (actionStatus === "success" && containerState) {
          if (containerState === "running") {
            dispatch(incrementOverviewField({ field: "running_containers", delta: 1 }));
          } else if (containerState === "stopped") {
            dispatch(incrementOverviewField({ field: "running_containers", delta: -1 }));
          }
        }
      }

      if (event.type === "deployment_progress" && event.payload) {
        const status = event.payload.status as string | undefined;
        if (status === "deploying") {
          dispatch(incrementOverviewField({ field: "deploying_stacks", delta: 1 }));
        } else if (status === "deployed" || status === "failed") {
          dispatch(incrementOverviewField({ field: "deploying_stacks", delta: -1 }));
          if (status === "failed") {
            dispatch(incrementOverviewField({ field: "failed_stacks", delta: 1 }));
          }
        }
      }
    },
    [computeFleetAggregate, dispatch],
  );

  useAdminSocket(handleDashboardEvent);

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
    () => extractHistory(fleetHistory, "network_rx_rate"),
    [fleetHistory],
  );
  const containerHistory = useMemo(
    () => extractHistory(fleetHistory, "running_count"),
    [fleetHistory],
  );

  return (
    <div className="dash-page">
      {/* Health anomaly banner */}
      <AnomalyBanner />

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
        workerHistory={workerHealthHistory}
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
          onRangeChange={(range) => dispatch(fetchFleetMetrics(range))}
        />
        <RecentActivityPanel entries={auditLog} />
      </div>
    </div>
  );
}
