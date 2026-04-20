"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Worker, WorkerToken, WorkerMetrics, Stack, Container } from "@/types";
import {
  reqGetWorker,
  reqUpdateWorker,
  reqGetWorkerMetrics,
  reqGetWorkerTokens,
  reqCreateWorkerToken,
  reqDeleteWorkerToken,
  reqDeleteWorker,
  reqRebootWorker,
  reqUpgradeRunner,
  reqStopAllContainers,
  reqStartAllContainers,
} from "@/services/workers.service";
import { reqGetStacks, reqGetAllContainers } from "@/services/stacks.service";
import { PageLoader } from "@/components/ui/loading";
import { StatusBadge } from "@/components/ui/badge";
import toast from "react-hot-toast";
import { useAdminSocket, AdminSocketEvent } from "@/hooks/useAdminSocket";

import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faChevronDown } from "@fortawesome/free-solid-svg-icons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatDate, timeAgo, isAdmin, canEdit } from "@/lib/utils";
import { useUser } from "@/store/hooks";
import { useConfirm } from "@/components/ui/confirm-modal";

function formatDisk(usedMB: number, totalMB: number): string {
  if (totalMB >= 1024)
    return `${(usedMB / 1024).toFixed(1)} / ${(totalMB / 1024).toFixed(1)} GB`;
  return `${Math.round(usedMB)} / ${Math.round(totalMB)} MB`;
}

function formatBytes(bytes: number): string {
  if (bytes >= 1073741824) return `${(bytes / 1073741824).toFixed(2)} GB`;
  if (bytes >= 1048576) return `${(bytes / 1048576).toFixed(1)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${bytes} B`;
}

function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function barColor(pct: number): string {
  if (pct > 90) return "bg-[#ef4444]";
  if (pct > 70) return "bg-[#eab308]";
  return "bg-[#3b82f6]";
}

function sparkColor(pct: number): string {
  if (pct > 90) return "#ef4444";
  if (pct > 70) return "#eab308";
  return "#3b82f6";
}

function Sparkline({ values, color }: { values: number[]; color: string }) {
  if (values.length < 2) return null;
  const w = 80;
  const h = 28;
  const max = Math.max(...values, 1);
  const step = w / (values.length - 1);
  const pts = values
    .map((v, i) => `${i * step},${h - (v / max) * h}`)
    .join(" ");
  return (
    <svg width={w} height={h} className="overflow-visible opacity-60">
      <polyline
        points={pts}
        fill="none"
        stroke={color}
        strokeWidth={1.5}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}

function MetricCard({
  label,
  value,
  sub,
  color,
  percent,
}: {
  label: string;
  value: string;
  sub?: string;
  color: string;
  percent?: number;
}) {
  return (
    <div>
      <p className="text-xs text-muted uppercase tracking-wider">{label}</p>
      <p className={`text-lg font-semibold mt-1 ${color}`}>{value}</p>
      {sub && <p className="text-xs text-muted mt-0.5">{sub}</p>}
      {percent != null && (
        <div className="h-1 bg-surface-active rounded-full mt-2 overflow-hidden">
          <div
            className={`h-full rounded-full ${barColor(percent)}`}
            style={{ width: `${Math.min(percent, 100)}%` }}
          />
        </div>
      )}
    </div>
  );
}

export default function WorkerDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = Number(params.id);

  const [worker, setWorker] = useState<Worker | null>(null);
  const [tokens, setTokens] = useState<WorkerToken[]>([]);
  const [metrics, setMetrics] = useState<WorkerMetrics[]>([]);
  const [stacks, setStacks] = useState<Stack[]>([]);
  const [containers, setContainers] = useState<Container[]>([]);
  const [loading, setLoading] = useState(true);
  const [latestRunner, setLatestRunner] = useState<string | null>(null);
  const [expandedStacks, setExpandedStacks] = useState<Set<number>>(new Set());
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [, setTick] = useState(0); // drives the "X ago" re-render every second

  // Edit state
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState("");
  const [editHostname, setEditHostname] = useState("");
  const [editLabels, setEditLabels] = useState("");
  const [saving, setSaving] = useState(false);

  // Token state
  const [newTokenName, setNewTokenName] = useState("");
  const [createdToken, setCreatedToken] = useState<string | null>(null);

  // Worker action state
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const showConfirm = useConfirm();
  const user = useUser();

  const load = async () => {
    const { reqGetVersions } = await import("@/services/admin.service");
    const [workerRes, metricsRes, tokensRes, stacksRes, containersRes, versionsRes] =
      await Promise.all([
        reqGetWorker(id),
        reqGetWorkerMetrics(id),
        reqGetWorkerTokens(id),
        reqGetStacks(),
        reqGetAllContainers(),
        reqGetVersions(),
      ]);
    if (versionsRes.success) setLatestRunner(versionsRes.data.runner.latest);
    if (workerRes.success) {
      setWorker(workerRes.data);
      setEditName(workerRes.data.name);
      setEditHostname(workerRes.data.hostname);
      setEditLabels(workerRes.data.labels ?? "");
    }
    if (metricsRes.success) setMetrics(metricsRes.data ?? []);
    if (tokensRes.success) setTokens(tokensRes.data ?? []);
    const workerStacks = stacksRes.success
      ? (stacksRes.data ?? []).filter((s: Stack) => s.worker_id === id)
      : [];
    setStacks(workerStacks);
    if (containersRes.success) setContainers(containersRes.data ?? []);
    setLoading(false);
  };

  useEffect(() => {
    if (worker) document.title = `Lattice - ${worker.name}`;
  }, [worker]);

  useEffect(() => {
    load();
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  // WebSocket: real-time worker status + metrics
  const handleSocketEvent = useCallback(
    (event: AdminSocketEvent) => {
      if (event.worker_id !== id) return;

      if (event.type === "worker_heartbeat") {
        const p = event.payload ?? {};
        const now = new Date().toISOString();
        // Patch worker's last_heartbeat_at, status, and runner_version
        const rv = p.runner_version as string | undefined;
        setWorker((prev) =>
          prev ? { ...prev, status: "online", last_heartbeat_at: now, ...(rv ? { runner_version: rv } : {}) } : prev,
        );
        // Build a live metrics snapshot from the payload
        const snapshot: WorkerMetrics = {
          id: Date.now(), // synthetic id — not persisted
          worker_id: id,
          cpu_percent: (p.cpu_percent as number | null) ?? null,
          cpu_cores: (p.cpu_cores as number | null) ?? null,
          load_avg_1: (p.load_avg_1 as number | null) ?? null,
          load_avg_5: (p.load_avg_5 as number | null) ?? null,
          load_avg_15: (p.load_avg_15 as number | null) ?? null,
          memory_used_mb: (p.memory_used_mb as number | null) ?? null,
          memory_total_mb: (p.memory_total_mb as number | null) ?? null,
          memory_free_mb: (p.memory_free_mb as number | null) ?? null,
          swap_used_mb: (p.swap_used_mb as number | null) ?? null,
          swap_total_mb: (p.swap_total_mb as number | null) ?? null,
          disk_used_mb: (p.disk_used_mb as number | null) ?? null,
          disk_total_mb: (p.disk_total_mb as number | null) ?? null,
          container_count: (p.container_count as number | null) ?? null,
          container_running_count:
            (p.container_running_count as number | null) ?? null,
          network_rx_bytes: (p.network_rx_bytes as number | null) ?? null,
          network_tx_bytes: (p.network_tx_bytes as number | null) ?? null,
          uptime_seconds: (p.uptime_seconds as number | null) ?? null,
          process_count: (p.process_count as number | null) ?? null,
          recorded_at: now,
        };
        setMetrics((prev) => [snapshot, ...prev.slice(0, 99)]);
        setLastUpdated(new Date());
      }

      if (event.type === "worker_connected") {
        setWorker((prev) =>
          prev
            ? {
                ...prev,
                status: "online",
                last_heartbeat_at: new Date().toISOString(),
              }
            : prev,
        );
        toast.success(`Worker ${worker?.name ?? `#${id}`} came online`);
      }

      if (event.type === "worker_disconnected") {
        setWorker((prev) => (prev ? { ...prev, status: "offline" } : prev));
        toast.error(`Worker ${worker?.name ?? `#${id}`} went offline`);
      }

      if (event.type === "worker_action_status") {
        const p = event.payload ?? {};
        const action = (p.action as string) ?? "action";
        const status = (p.status as string) ?? "";
        const message = (p.message as string) ?? "";
        const label = action.replace(/_/g, " ");
        if (status === "error" || status === "failed") {
          toast.error(`${label}: ${message || "failed"}`);
        } else {
          toast.success(`${label}: ${message || status}`);
        }
      }
    },
    [id, worker?.name],
  );
  useAdminSocket(handleSocketEvent);

  // Tick every second so "updated X ago" stays fresh
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, []);

  const handleSave = async () => {
    setSaving(true);
    const res = await reqUpdateWorker(id, {
      name: editName.trim(),
      hostname: editHostname.trim(),
      labels: editLabels.trim() || undefined,
    });
    if (res.success) {
      setWorker(res.data);
      setEditing(false);
    }
    setSaving(false);
  };

  const handleCancel = () => {
    if (worker) {
      setEditName(worker.name);
      setEditHostname(worker.hostname);
      setEditLabels(worker.labels ?? "");
    }
    setEditing(false);
  };

  const handleCreateToken = async () => {
    if (!newTokenName.trim()) return;
    const res = await reqCreateWorkerToken(id, newTokenName.trim());
    if (res.success) {
      setCreatedToken(res.data.token);
      // Add the token to the list (res.data has all WorkerToken fields + token)
      setTokens((prev) => [
        {
          id: res.data.id,
          worker_id: res.data.worker_id,
          name: res.data.name,
          last_used_at: res.data.last_used_at,
          active: res.data.active,
          inserted_at: res.data.inserted_at,
          updated_at: res.data.updated_at,
        },
        ...prev,
      ]);
      setNewTokenName("");
    }
  };

  const handleDeleteToken = async (tokenId: number) => {
    const token = tokens.find((t) => t.id === tokenId);
    const ok = await showConfirm({
      title: "Delete token",
      message: `Delete token "${token?.name ?? tokenId}"? The worker will no longer be able to authenticate with this token.`,
      confirmLabel: "Delete",
      variant: "danger",
    });
    if (!ok) return;
    const res = await reqDeleteWorkerToken(tokenId);
    if (res.success) {
      setTokens((prev) => prev.filter((t) => t.id !== tokenId));
    }
  };

  const handleWorkerAction = async (action: string) => {
    const confirmMessages: Record<
      string,
      { title: string; message: string; variant: "danger" | "warning" }
    > = {
      reboot: {
        title: "Reboot worker",
        message:
          "Are you sure you want to reboot this worker's OS? The worker will go offline temporarily.",
        variant: "danger",
      },
      upgrade: {
        title: "Upgrade runner",
        message:
          "Are you sure you want to upgrade the lattice-runner on this worker? The runner will restart after upgrade.",
        variant: "warning",
      },
      "stop-all": {
        title: "Stop all containers",
        message: "Are you sure you want to stop all containers on this worker?",
        variant: "warning",
      },
      "start-all": {
        title: "Start all containers",
        message:
          "Are you sure you want to start all stopped containers on this worker?",
        variant: "warning",
      },
    };
    const conf = confirmMessages[action];
    if (conf) {
      const ok = await showConfirm({ ...conf, confirmLabel: "Confirm" });
      if (!ok) return;
    }
    setActionLoading(action);
    const actionMap: Record<string, (id: number) => Promise<any>> = {
      reboot: reqRebootWorker,
      upgrade: reqUpgradeRunner,
      "stop-all": reqStopAllContainers,
      "start-all": reqStartAllContainers,
    };
    const fn = actionMap[action];
    if (fn) await fn(id);
    setActionLoading(null);
  };

  const handleDeleteWorker = async () => {
    const confirmed = await showConfirm({
      title: "Delete worker",
      message:
        "Are you sure you want to delete this worker? This cannot be undone. All tokens for this worker will also be deleted.",
      confirmLabel: "Delete",
      variant: "danger",
    });
    if (!confirmed) return;
    setDeleteLoading(true);
    const res = await reqDeleteWorker(id);
    if (res.success) {
      router.push("/workers");
    }
    setDeleteLoading(false);
  };

  if (loading) return <PageLoader />;
  if (!worker)
    return (
      <div className="text-center text-sm text-muted py-12">
        Worker not found
      </div>
    );

  const latestMetric = metrics.length > 0 ? metrics[0] : null;

  // Sparkline history (oldest → newest, up to last 20 heartbeats)
  const cpuHistory = metrics
    .slice(0, 20)
    .reverse()
    .map((m) => m.cpu_percent ?? 0);
  const memHistory = metrics
    .slice(0, 20)
    .reverse()
    .map((m) =>
      m.memory_used_mb != null && m.memory_total_mb
        ? (m.memory_used_mb / m.memory_total_mb) * 100
        : 0,
    );

  return (
    <div>
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-semibold text-primary">{worker.name}</h1>
          <StatusBadge status={worker.status} />
        </div>
        {!editing && canEdit(user) && (
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => setEditing(true)}>
              Edit Worker
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteWorker}
              disabled={deleteLoading}
            >
              {deleteLoading ? "Deleting..." : "Delete Worker"}
            </Button>
          </div>
        )}
      </div>

      {/* Edit form */}
      {editing && canEdit(user) && (
        <div className="rounded-xl border border-border-subtle bg-surface p-5 mb-6">
          <h2 className="text-sm font-medium text-primary mb-4">Edit Worker</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
            <Input
              id="edit-name"
              label="Name"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
            />
            <Input
              id="edit-hostname"
              label="Hostname"
              value={editHostname}
              onChange={(e) => setEditHostname(e.target.value)}
            />
            <Input
              id="edit-labels"
              label="Labels"
              placeholder="e.g. env=production,region=us-east"
              value={editLabels}
              onChange={(e) => setEditLabels(e.target.value)}
            />
          </div>
          <div className="flex gap-2">
            <Button
              onClick={handleSave}
              disabled={saving || !editName.trim() || !editHostname.trim()}
            >
              {saving ? "Saving..." : "Save Changes"}
            </Button>
            <Button variant="ghost" onClick={handleCancel}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      {/* Worker Actions */}
      {canEdit(user) && worker.status === "online" && (
        <div className="rounded-xl border border-border-subtle bg-surface p-5 mb-6">
          <h2 className="text-sm font-medium text-primary mb-4">
            Worker Actions
          </h2>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => handleWorkerAction("start-all")}
              disabled={!!actionLoading}
              loading={actionLoading === "start-all"}
            >
              Start All Containers
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => handleWorkerAction("stop-all")}
              disabled={!!actionLoading}
              loading={actionLoading === "stop-all"}
            >
              Stop All Containers
            </Button>
            {isAdmin(user) && (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => handleWorkerAction("upgrade")}
                disabled={!!actionLoading}
                loading={actionLoading === "upgrade"}
              >
                Upgrade Runner
              </Button>
            )}
            {isAdmin(user) && (
              <Button
                variant="destructive"
                size="sm"
                onClick={() => handleWorkerAction("reboot")}
                disabled={!!actionLoading}
                loading={actionLoading === "reboot"}
              >
                Reboot OS
              </Button>
            )}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Info + Metrics */}
        <div className="lg:col-span-2 space-y-6">
          <div className="rounded-xl border border-border-subtle bg-surface p-5">
            <h2 className="text-sm font-medium text-primary mb-4">Worker Info</h2>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-muted uppercase tracking-wider">
                  Hostname
                </p>
                {worker.hostname ? (
                  <a
                    href={`http://${worker.hostname}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-[#3b82f6] hover:underline mt-1 font-mono block break-all"
                  >
                    {worker.hostname}
                  </a>
                ) : (
                  <p className="text-sm text-secondary mt-1">Not set</p>
                )}
              </div>
              <div>
                <p className="text-xs text-muted uppercase tracking-wider">
                  IP Address
                </p>
                <p className="text-sm text-secondary mt-1 font-mono">
                  {worker.ip_address ?? "Unknown"}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted uppercase tracking-wider">
                  OS / Arch
                </p>
                <p className="text-sm text-secondary mt-1">
                  {worker.os ?? "Unknown"} / {worker.arch ?? "Unknown"}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted uppercase tracking-wider">
                  Docker Version
                </p>
                <p className="text-sm text-secondary mt-1 font-mono">
                  {worker.docker_version ?? "Unknown"}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted uppercase tracking-wider">
                  Runner Version
                </p>
                <div className="flex items-center gap-2 mt-1">
                  <p className="text-sm text-secondary font-mono">
                    {worker.runner_version ?? "Unknown"}
                  </p>
                  {latestRunner && worker.runner_version && worker.runner_version !== latestRunner && (
                    <span className="rounded-md bg-[#eab308]/10 border border-[#eab308]/30 px-2 py-0.5 text-[10px] font-medium text-[#eab308]">
                      {latestRunner} available
                    </span>
                  )}
                </div>
              </div>
              <div>
                <p className="text-xs text-muted uppercase tracking-wider">
                  Last Heartbeat
                </p>
                <p className="text-sm text-secondary mt-1">
                  {worker.last_heartbeat_at
                    ? timeAgo(worker.last_heartbeat_at)
                    : "Never"}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted uppercase tracking-wider">
                  Labels
                </p>
                <p className="text-sm text-secondary mt-1">
                  {worker.labels ?? "None"}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted uppercase tracking-wider">
                  Created
                </p>
                <p className="text-sm text-secondary mt-1">
                  {formatDate(worker.inserted_at)}
                </p>
              </div>
            </div>
          </div>

          {/* Metrics */}
          {latestMetric && (
            <div className="rounded-xl border border-border-subtle bg-surface p-5">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <h2 className="text-sm font-medium text-primary">
                    Live Metrics
                  </h2>
                  {worker.status === "online" && (
                    <span className="relative flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#22c55e] opacity-75" />
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-[#22c55e]" />
                    </span>
                  )}
                </div>
                {lastUpdated && (
                  <span className="text-xs text-dimmed">
                    updated {timeAgo(lastUpdated.toISOString())}
                  </span>
                )}
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
                <MetricCard
                  label="CPU"
                  value={`${latestMetric.cpu_percent?.toFixed(1) ?? "-"}%`}
                  sub={
                    latestMetric.cpu_cores
                      ? `${latestMetric.cpu_cores} cores`
                      : undefined
                  }
                  color="text-[#3b82f6]"
                  percent={latestMetric.cpu_percent ?? undefined}
                />
                {cpuHistory.length >= 2 && (
                  <div className="flex items-end">
                    <Sparkline
                      values={cpuHistory}
                      color={sparkColor(latestMetric.cpu_percent ?? 0)}
                    />
                  </div>
                )}
                <MetricCard
                  label="Memory"
                  value={
                    latestMetric.memory_used_mb != null &&
                    latestMetric.memory_total_mb != null
                      ? `${Math.round(latestMetric.memory_used_mb)} / ${Math.round(latestMetric.memory_total_mb)} MB`
                      : "-"
                  }
                  color="text-[#a855f7]"
                  percent={
                    latestMetric.memory_used_mb != null &&
                    latestMetric.memory_total_mb
                      ? (latestMetric.memory_used_mb /
                          latestMetric.memory_total_mb) *
                        100
                      : undefined
                  }
                />
                {memHistory.length >= 2 && (
                  <div className="flex items-end">
                    <Sparkline values={memHistory} color="#a855f7" />
                  </div>
                )}
                <MetricCard
                  label="Disk"
                  value={
                    latestMetric.disk_used_mb != null &&
                    latestMetric.disk_total_mb != null
                      ? formatDisk(
                          latestMetric.disk_used_mb,
                          latestMetric.disk_total_mb,
                        )
                      : "-"
                  }
                  color="text-[#eab308]"
                  percent={
                    latestMetric.disk_used_mb != null &&
                    latestMetric.disk_total_mb
                      ? (latestMetric.disk_used_mb /
                          latestMetric.disk_total_mb) *
                        100
                      : undefined
                  }
                />
                <MetricCard
                  label="Containers"
                  value={
                    latestMetric.container_running_count != null
                      ? `${latestMetric.container_running_count} / ${latestMetric.container_count ?? 0}`
                      : `${latestMetric.container_count ?? "-"}`
                  }
                  sub="running / total"
                  color="text-[#22c55e]"
                />
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div>
                  <p className="text-xs text-muted uppercase tracking-wider">
                    Load Average
                  </p>
                  <p className="text-sm text-secondary mt-1 font-mono">
                    {latestMetric.load_avg_1?.toFixed(2) ?? "-"} /{" "}
                    {latestMetric.load_avg_5?.toFixed(2) ?? "-"} /{" "}
                    {latestMetric.load_avg_15?.toFixed(2) ?? "-"}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted uppercase tracking-wider">
                    Swap
                  </p>
                  <p className="text-sm text-secondary mt-1">
                    {latestMetric.swap_total_mb != null &&
                    latestMetric.swap_total_mb > 0
                      ? `${Math.round(latestMetric.swap_used_mb ?? 0)} / ${Math.round(latestMetric.swap_total_mb)} MB`
                      : "None"}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted uppercase tracking-wider">
                    Network
                  </p>
                  <p className="text-sm text-secondary mt-1 font-mono">
                    {latestMetric.network_rx_bytes != null
                      ? formatBytes(latestMetric.network_rx_bytes)
                      : "-"}{" "}
                    rx
                  </p>
                  <p className="text-sm text-secondary font-mono">
                    {latestMetric.network_tx_bytes != null
                      ? formatBytes(latestMetric.network_tx_bytes)
                      : "-"}{" "}
                    tx
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted uppercase tracking-wider">
                    System
                  </p>
                  <p className="text-sm text-secondary mt-1">
                    {latestMetric.uptime_seconds != null
                      ? formatUptime(latestMetric.uptime_seconds)
                      : "-"}{" "}
                    uptime
                  </p>
                  <p className="text-sm text-secondary">
                    {latestMetric.process_count ?? "-"} processes
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Associated Stacks */}
          <div className="rounded-xl border border-border-subtle bg-surface p-5">
            <h2 className="text-sm font-medium text-primary mb-4">
              Associated Stacks
            </h2>
            <div className="space-y-2">
              {stacks.length === 0 ? (
                <p className="text-xs text-muted py-4 text-center">
                  No stacks assigned to this worker
                </p>
              ) : (
                stacks.map((stack) => {
                  const stackContainers = containers.filter(
                    (c) => c.stack_id === stack.id,
                  );
                  const isExpanded = expandedStacks.has(stack.id);
                  return (
                    <div key={stack.id}>
                      <button
                        onClick={() =>
                          setExpandedStacks((prev) => {
                            const next = new Set(prev);
                            if (next.has(stack.id)) next.delete(stack.id);
                            else next.add(stack.id);
                            return next;
                          })
                        }
                        className="w-full flex items-center justify-between rounded-lg bg-surface-elevated px-3 py-2 hover:bg-surface-active transition-colors text-left cursor-pointer"
                      >
                        <div className="flex items-center gap-2">
                          <FontAwesomeIcon
                            icon={faChevronDown}
                            className={`h-3 w-3 text-muted transition-transform ${isExpanded ? "" : "-rotate-90"}`}
                          />
                          <div className="min-w-0">
                            <p className="text-sm text-primary break-all">{stack.name}</p>
                            <p className="text-xs text-muted">
                              {stack.deployment_strategy} &middot;{" "}
                              {stackContainers.length} container
                              {stackContainers.length !== 1 ? "s" : ""}
                            </p>
                          </div>
                        </div>
                        <StatusBadge status={stack.status} />
                      </button>
                      {isExpanded && (
                        <div className="ml-5 mt-1 mb-1 space-y-1 border-l border-border-subtle pl-3">
                          {stackContainers.length === 0 ? (
                            <p className="text-xs text-dimmed py-1">
                              No containers
                            </p>
                          ) : (
                            stackContainers.map((c) => (
                              <Link
                                key={c.id}
                                href={`/containers/${c.id}`}
                                className="flex items-center justify-between rounded px-2 py-1.5 hover:bg-surface-elevated transition-colors"
                              >
                                <div className="flex items-center gap-2 min-w-0">
                                  <span className="text-xs text-primary break-all">
                                    {c.name}
                                  </span>
                                  <span className="text-[10px] text-muted font-mono break-all">
                                    {c.image}:{c.tag}
                                  </span>
                                </div>
                                <StatusBadge status={c.status} />
                              </Link>
                            ))
                          )}
                          <Link
                            href={`/stacks/${stack.id}`}
                            className="block text-xs text-[#3b82f6] hover:underline px-2 py-1"
                          >
                            View stack &rarr;
                          </Link>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Worker Tokens */}
          <div className="rounded-xl border border-border-subtle bg-surface p-5">
            <h2 className="text-sm font-medium text-primary mb-4">
              Worker Tokens
            </h2>

            {/* Create Token */}
            {canEdit(user) && (
              <div className="flex gap-2 mb-4">
                <Input
                  placeholder="Token name"
                  value={newTokenName}
                  onChange={(e) => setNewTokenName(e.target.value)}
                  className="flex-1"
                />
                <Button
                  size="md"
                  onClick={handleCreateToken}
                  disabled={!newTokenName.trim()}
                >
                  Create
                </Button>
              </div>
            )}

            {createdToken && (
              <div className="mb-4 rounded-lg border border-[#22c55e]/30 bg-[#22c55e]/5 p-3">
                <p className="text-xs text-[#22c55e] mb-1 font-medium">
                  Token created — copy it now, it won&apos;t be shown again:
                </p>
                <p className="text-xs text-primary font-mono break-all select-all">
                  {createdToken}
                </p>
              </div>
            )}

            {/* Token List */}
            <div className="space-y-2">
              {tokens.length === 0 ? (
                <p className="text-xs text-muted py-4 text-center">
                  No tokens yet
                </p>
              ) : (
                tokens.map((token) => (
                  <div
                    key={token.id}
                    className="flex items-center justify-between rounded-lg bg-surface-elevated px-3 py-2"
                  >
                    <div>
                      <p className="text-sm text-primary">{token.name}</p>
                      <p className="text-xs text-muted">
                        {token.last_used_at
                          ? `Used ${timeAgo(token.last_used_at)}`
                          : "Never used"}
                      </p>
                    </div>
                    {canEdit(user) && (
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => handleDeleteToken(token.id)}
                      >
                        Delete
                      </Button>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
