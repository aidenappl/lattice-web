"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  Worker,
  WorkerToken,
  WorkerMetrics,
  Stack,
  Container,
  DockerVolume,
  DockerNetwork,
} from "@/types";
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
import {
  reqListVolumes,
  reqCreateVolume,
  reqDeleteVolume,
} from "@/services/volumes.service";
import {
  reqListNetworks,
  reqCreateNetwork,
  reqDeleteNetwork,
} from "@/services/networks.service";
import { PageLoader } from "@/components/ui/loading";
import { StatusBadge } from "@/components/ui/badge";
import toast from "react-hot-toast";
import { useAdminSocket, AdminSocketEvent } from "@/hooks/useAdminSocket";

import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faChevronDown,
  faEllipsisVertical,
  faArrowLeft,
  faServer,
  faHardDrive,
  faNetworkWired,
  faKey,
  faChevronRight,
} from "@fortawesome/free-solid-svg-icons";
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
  if (pct > 90) return "bg-failed";
  if (pct > 70) return "bg-[#eab308]";
  return "bg-info";
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

  // Volume & Network state
  const [volumes, setVolumes] = useState<DockerVolume[]>([]);
  const [networks, setNetworks] = useState<DockerNetwork[]>([]);
  const [newVolumeName, setNewVolumeName] = useState("");
  const [newNetworkName, setNewNetworkName] = useState("");

  // Worker action state
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  // Actions dropdown state
  const [actionsOpen, setActionsOpen] = useState(false);

  // Volumes/Networks tab state
  const [infraTab, setInfraTab] = useState<"volumes" | "networks">("volumes");

  const showConfirm = useConfirm();
  const user = useUser();

  const load = async () => {
    const { reqGetVersions } = await import("@/services/admin.service");
    const [
      workerRes,
      metricsRes,
      tokensRes,
      stacksRes,
      containersRes,
      versionsRes,
    ] = await Promise.all([
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

  // Fetch volumes and networks when worker comes online
  useEffect(() => {
    if (worker?.status === "online") {
      reqListVolumes(id);
      reqListNetworks(id);
    }
  }, [worker?.status, id]); // eslint-disable-line react-hooks/exhaustive-deps

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
          prev
            ? {
                ...prev,
                status: "online",
                last_heartbeat_at: now,
                ...(rv ? { runner_version: rv } : {}),
              }
            : prev,
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
        // Refresh volumes/networks after create/remove
        if (
          ["create_volume", "remove_volume"].includes(action) &&
          status === "success"
        ) {
          reqListVolumes(id);
        }
        if (
          ["create_network", "remove_network"].includes(action) &&
          status === "success"
        ) {
          reqListNetworks(id);
        }
      }

      if (event.type === "list_volumes_response") {
        const p = event.payload ?? {};
        if (p.status === "success" && Array.isArray(p.volumes)) {
          setVolumes(p.volumes as DockerVolume[]);
        }
      }

      if (event.type === "list_networks_response") {
        const p = event.payload ?? {};
        if (p.status === "success" && Array.isArray(p.networks)) {
          setNetworks(p.networks as DockerNetwork[]);
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
  const netRxHistory = metrics
    .slice(0, 20)
    .reverse()
    .map((m) => m.network_rx_bytes ?? 0);

  // Arc gauge helper
  const ArcGauge = ({
    percent,
    color,
    size = 88,
  }: {
    percent: number;
    color: string;
    size?: number;
  }) => {
    const r = (size - 10) / 2;
    const circumference = Math.PI * r; // half circle
    const offset =
      circumference - (Math.min(percent, 100) / 100) * circumference;
    return (
      <svg width={size} height={size / 2 + 8} className="overflow-visible">
        <path
          d={`M 5,${size / 2} A ${r},${r} 0 0 1 ${size - 5},${size / 2}`}
          fill="none"
          stroke="var(--surface-active)"
          strokeWidth={6}
          strokeLinecap="round"
        />
        <path
          d={`M 5,${size / 2} A ${r},${r} 0 0 1 ${size - 5},${size / 2}`}
          fill="none"
          stroke={color}
          strokeWidth={6}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className="transition-all duration-500"
        />
      </svg>
    );
  };

  const cpuPercent = latestMetric?.cpu_percent ?? 0;
  const memPercent =
    latestMetric?.memory_used_mb != null && latestMetric?.memory_total_mb
      ? (latestMetric.memory_used_mb / latestMetric.memory_total_mb) * 100
      : 0;
  const diskPercent =
    latestMetric?.disk_used_mb != null && latestMetric?.disk_total_mb
      ? (latestMetric.disk_used_mb / latestMetric.disk_total_mb) * 100
      : 0;

  return (
    <div className="p-6 space-y-6">
      {/* ─── Page Header ─── */}
      <div className="page-header !p-0 !border-0 flex-col sm:flex-row gap-4">
        <div className="flex-1 min-w-0">
          {/* Breadcrumb */}
          <div className="breadcrumb mb-2">
            <Link
              href="/workers"
              className="breadcrumb-link flex items-center gap-1.5"
            >
              <FontAwesomeIcon icon={faArrowLeft} className="h-3 w-3" />
              Workers
            </Link>
            <span className="breadcrumb-sep">/</span>
            <span className="breadcrumb-current">{worker.name}</span>
          </div>
          {/* Title row */}
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="page-title text-xl">{worker.name}</h1>
            <StatusBadge status={worker.status} />
            {latestRunner &&
              worker.runner_version &&
              worker.runner_version !== latestRunner && (
                <span className="badge badge-pending text-[10px]">
                  v{latestRunner} available
                </span>
              )}
          </div>
          {/* Compact system info */}
          <div className="flex items-center gap-4 mt-2 text-xs text-muted flex-wrap">
            {worker.hostname && (
              <span className="font-mono">{worker.hostname}</span>
            )}
            {worker.ip_address && (
              <span className="font-mono">{worker.ip_address}</span>
            )}
            {(worker.os || worker.arch) && (
              <span>
                {worker.os ?? "?"}/{worker.arch ?? "?"}
              </span>
            )}
            {worker.runner_version && (
              <span className="font-mono">runner {worker.runner_version}</span>
            )}
          </div>
        </div>

        {/* Header actions */}
        {!editing && (
          <div className="flex items-center gap-2 flex-shrink-0 relative">
            <Link href={`/workers/${worker.id}/metrics`}>
              <Button variant="secondary" size="sm">
                Full Metrics
              </Button>
            </Link>
            {canEdit(user) && (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setEditing(true)}
              >
                Edit
              </Button>
            )}
            {canEdit(user) && (
              <div className="relative">
                <button
                  className="icon-btn"
                  onClick={() => setActionsOpen(!actionsOpen)}
                >
                  <FontAwesomeIcon
                    icon={faEllipsisVertical}
                    className="h-4 w-4"
                  />
                </button>
                {actionsOpen && (
                  <>
                    <div
                      className="fixed inset-0 z-20"
                      onClick={() => setActionsOpen(false)}
                    />
                    <div className="menu right-0 top-9">
                      {worker.status === "online" && (
                        <>
                          <button
                            className="menu-item w-full text-left"
                            onClick={() => {
                              setActionsOpen(false);
                              handleWorkerAction("start-all");
                            }}
                            disabled={!!actionLoading}
                          >
                            Start All Containers
                          </button>
                          <button
                            className="menu-item w-full text-left"
                            onClick={() => {
                              setActionsOpen(false);
                              handleWorkerAction("stop-all");
                            }}
                            disabled={!!actionLoading}
                          >
                            Stop All Containers
                          </button>
                          {isAdmin(user) && (
                            <button
                              className="menu-item w-full text-left"
                              onClick={() => {
                                setActionsOpen(false);
                                handleWorkerAction("upgrade");
                              }}
                              disabled={!!actionLoading}
                            >
                              Upgrade Runner
                            </button>
                          )}
                          {isAdmin(user) && (
                            <button
                              className="menu-item w-full text-left text-failed"
                              onClick={() => {
                                setActionsOpen(false);
                                handleWorkerAction("reboot");
                              }}
                              disabled={!!actionLoading}
                            >
                              Reboot OS
                            </button>
                          )}
                          <div className="border-t border-border my-1" />
                        </>
                      )}
                      <button
                        className="menu-item w-full text-left text-failed"
                        onClick={() => {
                          setActionsOpen(false);
                          handleDeleteWorker();
                        }}
                        disabled={deleteLoading}
                      >
                        {deleteLoading ? "Deleting..." : "Delete Worker"}
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ─── Edit Form ─── */}
      {editing && canEdit(user) && (
        <div className="card p-5">
          <h2 className="text-sm font-medium text-primary mb-4">Edit Worker</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
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

      {/* ─── Live Metrics (primary section) ─── */}
      {latestMetric && (
        <div className="panel">
          <div className="panel-header">
            <div className="flex items-center gap-2">
              <span>Live Metrics</span>
              {worker.status === "online" && (
                <span className="pulse-dot healthy" />
              )}
            </div>
            <div className="panel-header-right">
              {lastUpdated && (
                <span className="text-xs text-dimmed">
                  updated {timeAgo(lastUpdated.toISOString())}
                </span>
              )}
              <Link
                href={`/workers/${worker.id}/metrics`}
                className="text-xs text-info hover:underline ml-3"
              >
                View Full Metrics
              </Link>
            </div>
          </div>

          {/* Arc gauges row */}
          <div className="px-5 pt-5 pb-3">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-6">
              {/* CPU gauge */}
              <div className="flex flex-col items-center">
                <ArcGauge percent={cpuPercent} color={sparkColor(cpuPercent)} />
                <p className="text-2xl font-semibold -mt-1 text-info font-mono">
                  {latestMetric.cpu_percent?.toFixed(1) ?? "-"}%
                </p>
                <p className="text-[10px] text-muted uppercase tracking-wider mt-1">
                  CPU
                </p>
                {latestMetric.cpu_cores && (
                  <p className="text-[10px] text-dimmed">
                    {latestMetric.cpu_cores} cores
                  </p>
                )}
                {cpuHistory.length >= 2 && (
                  <div className="mt-2">
                    <Sparkline
                      values={cpuHistory}
                      color={sparkColor(cpuPercent)}
                    />
                  </div>
                )}
              </div>

              {/* Memory gauge */}
              <div className="flex flex-col items-center">
                <ArcGauge percent={memPercent} color="#a855f7" />
                <p className="text-2xl font-semibold -mt-1 text-violet font-mono">
                  {memPercent.toFixed(1)}%
                </p>
                <p className="text-[10px] text-muted uppercase tracking-wider mt-1">
                  Memory
                </p>
                <p className="text-[10px] text-dimmed">
                  {latestMetric.memory_used_mb != null &&
                  latestMetric.memory_total_mb != null
                    ? `${Math.round(latestMetric.memory_used_mb)} / ${Math.round(latestMetric.memory_total_mb)} MB`
                    : "-"}
                </p>
                {memHistory.length >= 2 && (
                  <div className="mt-2">
                    <Sparkline values={memHistory} color="#a855f7" />
                  </div>
                )}
              </div>

              {/* Disk gauge */}
              <div className="flex flex-col items-center">
                <ArcGauge
                  percent={diskPercent}
                  color={sparkColor(diskPercent)}
                />
                <p className="text-2xl font-semibold -mt-1 text-pending font-mono">
                  {diskPercent.toFixed(1)}%
                </p>
                <p className="text-[10px] text-muted uppercase tracking-wider mt-1">
                  Disk
                </p>
                <p className="text-[10px] text-dimmed">
                  {latestMetric.disk_used_mb != null &&
                  latestMetric.disk_total_mb != null
                    ? formatDisk(
                        latestMetric.disk_used_mb,
                        latestMetric.disk_total_mb,
                      )
                    : "-"}
                </p>
              </div>

              {/* Network gauge */}
              <div className="flex flex-col items-center">
                <ArcGauge percent={0} color="#22c55e" />
                <p className="text-2xl font-semibold -mt-1 text-healthy font-mono">
                  {latestMetric.network_rx_bytes != null
                    ? formatBytes(latestMetric.network_rx_bytes)
                    : "-"}
                </p>
                <p className="text-[10px] text-muted uppercase tracking-wider mt-1">
                  Network RX
                </p>
                <p className="text-[10px] text-dimmed">
                  {latestMetric.network_tx_bytes != null
                    ? `TX: ${formatBytes(latestMetric.network_tx_bytes)}`
                    : "-"}
                </p>
                {netRxHistory.length >= 2 && (
                  <div className="mt-2">
                    <Sparkline values={netRxHistory} color="#22c55e" />
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Secondary stats strip */}
          <div className="border-t border-border px-5 py-4 grid grid-cols-2 sm:grid-cols-5 gap-4">
            <div>
              <p className="text-[10px] text-muted uppercase tracking-wider">
                Containers
              </p>
              <p className="text-sm text-healthy font-semibold mt-0.5">
                {latestMetric.container_running_count != null
                  ? `${latestMetric.container_running_count} / ${latestMetric.container_count ?? 0}`
                  : `${latestMetric.container_count ?? "-"}`}
              </p>
              <p className="text-[10px] text-dimmed">running / total</p>
            </div>
            <div>
              <p className="text-[10px] text-muted uppercase tracking-wider">
                Uptime
              </p>
              <p className="text-sm text-secondary font-semibold mt-0.5">
                {latestMetric.uptime_seconds != null
                  ? formatUptime(latestMetric.uptime_seconds)
                  : "-"}
              </p>
            </div>
            <div>
              <p className="text-[10px] text-muted uppercase tracking-wider">
                Load Avg
              </p>
              <p className="text-sm text-secondary font-mono mt-0.5">
                {latestMetric.load_avg_1?.toFixed(2) ?? "-"} /{" "}
                {latestMetric.load_avg_5?.toFixed(2) ?? "-"} /{" "}
                {latestMetric.load_avg_15?.toFixed(2) ?? "-"}
              </p>
            </div>
            <div>
              <p className="text-[10px] text-muted uppercase tracking-wider">
                Network I/O
              </p>
              <p className="text-sm text-secondary font-mono mt-0.5">
                {latestMetric.network_rx_bytes != null
                  ? formatBytes(latestMetric.network_rx_bytes)
                  : "-"}{" "}
                rx
              </p>
              <p className="text-[10px] text-secondary font-mono">
                {latestMetric.network_tx_bytes != null
                  ? formatBytes(latestMetric.network_tx_bytes)
                  : "-"}{" "}
                tx
              </p>
            </div>
            <div>
              <p className="text-[10px] text-muted uppercase tracking-wider">
                Processes
              </p>
              <p className="text-sm text-secondary font-semibold mt-0.5">
                {latestMetric.process_count ?? "-"}
              </p>
              {latestMetric.swap_total_mb != null &&
                latestMetric.swap_total_mb > 0 && (
                  <p className="text-[10px] text-dimmed">
                    Swap: {Math.round(latestMetric.swap_used_mb ?? 0)}/
                    {Math.round(latestMetric.swap_total_mb)} MB
                  </p>
                )}
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* ─── Left column: Info + Stacks ─── */}
        <div className="lg:col-span-2 space-y-6">
          {/* Worker Info (compact definition list) */}
          <div className="panel">
            <div className="panel-header">
              <FontAwesomeIcon
                icon={faServer}
                className="h-3.5 w-3.5 text-muted"
              />
              <span>Worker Info</span>
            </div>
            <div className="p-4">
              <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-3 text-sm">
                <div className="flex justify-between sm:block">
                  <dt className="text-[10px] text-muted uppercase tracking-wider font-mono">
                    Hostname
                  </dt>
                  <dd className="text-secondary mt-0.5">
                    {worker.hostname ? (
                      <a
                        href={`http://${worker.hostname}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-info hover:underline font-mono break-all"
                      >
                        {worker.hostname}
                      </a>
                    ) : (
                      <span>Not set</span>
                    )}
                  </dd>
                </div>
                <div className="flex justify-between sm:block">
                  <dt className="text-[10px] text-muted uppercase tracking-wider font-mono">
                    IP Address
                  </dt>
                  <dd className="text-secondary font-mono mt-0.5">
                    {worker.ip_address ?? "Unknown"}
                  </dd>
                </div>
                <div className="flex justify-between sm:block">
                  <dt className="text-[10px] text-muted uppercase tracking-wider font-mono">
                    OS / Arch
                  </dt>
                  <dd className="text-secondary mt-0.5">
                    {worker.os ?? "Unknown"} / {worker.arch ?? "Unknown"}
                  </dd>
                </div>
                <div className="flex justify-between sm:block">
                  <dt className="text-[10px] text-muted uppercase tracking-wider font-mono">
                    Docker
                  </dt>
                  <dd className="text-secondary font-mono mt-0.5">
                    {worker.docker_version ?? "Unknown"}
                  </dd>
                </div>
                <div className="flex justify-between sm:block">
                  <dt className="text-[10px] text-muted uppercase tracking-wider font-mono">
                    Runner
                  </dt>
                  <dd className="text-secondary font-mono mt-0.5">
                    {worker.runner_version ?? "Unknown"}
                  </dd>
                </div>
                <div className="flex justify-between sm:block">
                  <dt className="text-[10px] text-muted uppercase tracking-wider font-mono">
                    Last Heartbeat
                  </dt>
                  <dd className="text-secondary mt-0.5">
                    {worker.last_heartbeat_at
                      ? timeAgo(worker.last_heartbeat_at)
                      : "Never"}
                  </dd>
                </div>
                <div className="flex justify-between sm:block">
                  <dt className="text-[10px] text-muted uppercase tracking-wider font-mono">
                    Labels
                  </dt>
                  <dd className="text-secondary mt-0.5">
                    {worker.labels ?? "None"}
                  </dd>
                </div>
                <div className="flex justify-between sm:block">
                  <dt className="text-[10px] text-muted uppercase tracking-wider font-mono">
                    Created
                  </dt>
                  <dd className="text-secondary mt-0.5">
                    {formatDate(worker.inserted_at)}
                  </dd>
                </div>
              </dl>
            </div>
          </div>

          {/* Stacks & Containers (tree view) */}
          <div className="panel">
            <div className="panel-header">
              <FontAwesomeIcon
                icon={faServer}
                className="h-3.5 w-3.5 text-muted"
              />
              <span>Stacks &amp; Containers</span>
              <span className="badge badge-neutral ml-2">{stacks.length}</span>
            </div>
            <div className="p-4 space-y-1">
              {stacks.length === 0 ? (
                <p className="text-xs text-muted py-6 text-center">
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
                        className="w-full flex items-center justify-between rounded-lg px-3 py-2.5 hover:bg-surface-elevated transition-colors text-left cursor-pointer"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <FontAwesomeIcon
                            icon={faChevronDown}
                            className={`h-2.5 w-2.5 text-dimmed transition-transform ${isExpanded ? "" : "-rotate-90"}`}
                          />
                          <StatusBadge status={stack.status} />
                          <span className="text-sm text-primary font-medium truncate">
                            {stack.name}
                          </span>
                          <span className="badge badge-neutral text-[10px]">
                            {stackContainers.length}
                          </span>
                        </div>
                        <span className="text-[10px] text-dimmed">
                          {stack.deployment_strategy}
                        </span>
                      </button>
                      {isExpanded && (
                        <div className="ml-7 mt-0.5 mb-2 space-y-0.5 border-l border-border pl-3">
                          {stackContainers.length === 0 ? (
                            <p className="text-xs text-dimmed py-1">
                              No containers
                            </p>
                          ) : (
                            stackContainers.map((c) => (
                              <Link
                                key={c.id}
                                href={`/containers/${c.id}`}
                                className="flex items-center justify-between rounded px-2 py-1.5 hover:bg-surface-elevated transition-colors group"
                              >
                                <div className="flex items-center gap-2 min-w-0">
                                  <StatusBadge status={c.status} />
                                  <span className="text-xs text-primary truncate group-hover:text-info transition-colors">
                                    {c.name}
                                  </span>
                                  <span className="text-[10px] text-dimmed font-mono truncate">
                                    {c.image}:{c.tag}
                                  </span>
                                </div>
                                <FontAwesomeIcon
                                  icon={faChevronRight}
                                  className="h-2.5 w-2.5 text-dimmed opacity-0 group-hover:opacity-100 transition-opacity"
                                />
                              </Link>
                            ))
                          )}
                          <Link
                            href={`/stacks/${stack.id}`}
                            className="block text-xs text-info hover:underline px-2 py-1 mt-1"
                          >
                            View stack details
                          </Link>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {/* ─── Sidebar ─── */}
        <div className="space-y-6">
          {/* Volumes & Networks (tabbed) */}
          {worker.status === "online" && (
            <div className="panel">
              <div className="tabs-bar !px-4 !gap-0">
                <button
                  className={`tab-item ${infraTab === "volumes" ? "active" : ""}`}
                  onClick={() => setInfraTab("volumes")}
                >
                  <FontAwesomeIcon icon={faHardDrive} className="h-3 w-3" />
                  Volumes
                  <span className="count">{volumes.length}</span>
                </button>
                <button
                  className={`tab-item ${infraTab === "networks" ? "active" : ""}`}
                  onClick={() => setInfraTab("networks")}
                >
                  <FontAwesomeIcon icon={faNetworkWired} className="h-3 w-3" />
                  Networks
                  <span className="count">{networks.length}</span>
                </button>
              </div>
              <div className="p-4">
                {infraTab === "volumes" && (
                  <>
                    {canEdit(user) && (
                      <div className="flex gap-2 mb-3">
                        <Input
                          placeholder="Volume name"
                          value={newVolumeName}
                          onChange={(e) => setNewVolumeName(e.target.value)}
                          className="flex-1"
                        />
                        <Button
                          size="sm"
                          onClick={async () => {
                            if (!newVolumeName.trim()) return;
                            await reqCreateVolume(id, {
                              name: newVolumeName.trim(),
                            });
                            setNewVolumeName("");
                          }}
                          disabled={!newVolumeName.trim()}
                        >
                          Create
                        </Button>
                      </div>
                    )}
                    <div className="space-y-1.5">
                      {volumes.length === 0 ? (
                        <p className="text-xs text-muted py-4 text-center">
                          No volumes
                        </p>
                      ) : (
                        volumes.map((vol) => (
                          <div
                            key={vol.name}
                            className="flex items-center justify-between rounded-lg bg-surface-elevated px-3 py-2"
                          >
                            <div className="min-w-0">
                              <p className="text-xs text-primary break-all">
                                {vol.name}
                              </p>
                              <p className="text-[10px] text-dimmed">
                                {vol.driver} / {vol.scope}
                              </p>
                            </div>
                            {canEdit(user) && (
                              <Button
                                variant="destructive"
                                size="sm"
                                onClick={async () => {
                                  const ok = await showConfirm({
                                    title: "Delete volume",
                                    message: `Delete volume "${vol.name}"? Any data stored in this volume will be lost.`,
                                    confirmLabel: "Delete",
                                    variant: "danger",
                                  });
                                  if (!ok) return;
                                  await reqDeleteVolume(id, vol.name, true);
                                }}
                              >
                                Delete
                              </Button>
                            )}
                          </div>
                        ))
                      )}
                    </div>
                  </>
                )}
                {infraTab === "networks" && (
                  <>
                    {canEdit(user) && (
                      <div className="flex gap-2 mb-3">
                        <Input
                          placeholder="Network name"
                          value={newNetworkName}
                          onChange={(e) => setNewNetworkName(e.target.value)}
                          className="flex-1"
                        />
                        <Button
                          size="sm"
                          onClick={async () => {
                            if (!newNetworkName.trim()) return;
                            await reqCreateNetwork(id, {
                              name: newNetworkName.trim(),
                            });
                            setNewNetworkName("");
                          }}
                          disabled={!newNetworkName.trim()}
                        >
                          Create
                        </Button>
                      </div>
                    )}
                    <div className="space-y-1.5">
                      {networks.length === 0 ? (
                        <p className="text-xs text-muted py-4 text-center">
                          No networks
                        </p>
                      ) : (
                        networks.map((net) => {
                          const containerCount = net.containers
                            ? Object.keys(net.containers).length
                            : 0;
                          return (
                            <div
                              key={net.id}
                              className="flex items-center justify-between rounded-lg bg-surface-elevated px-3 py-2"
                            >
                              <div className="min-w-0">
                                <p className="text-xs text-primary break-all">
                                  {net.name}
                                </p>
                                <p className="text-[10px] text-dimmed">
                                  {net.driver} / {net.scope}
                                  {containerCount > 0 &&
                                    ` \u00b7 ${containerCount} container${containerCount !== 1 ? "s" : ""}`}
                                  {net.internal && " \u00b7 internal"}
                                </p>
                              </div>
                              {canEdit(user) && (
                                <Button
                                  variant="destructive"
                                  size="sm"
                                  onClick={async () => {
                                    const ok = await showConfirm({
                                      title: "Delete network",
                                      message: `Delete network "${net.name}"? Containers connected to this network will be disconnected.`,
                                      confirmLabel: "Delete",
                                      variant: "danger",
                                    });
                                    if (!ok) return;
                                    await reqDeleteNetwork(id, net.name);
                                  }}
                                >
                                  Delete
                                </Button>
                              )}
                            </div>
                          );
                        })
                      )}
                    </div>
                  </>
                )}
              </div>
            </div>
          )}

          {/* Worker Tokens */}
          <div className="panel">
            <div className="panel-header">
              <FontAwesomeIcon
                icon={faKey}
                className="h-3.5 w-3.5 text-muted"
              />
              <span>Tokens</span>
              <span className="badge badge-neutral ml-2">{tokens.length}</span>
            </div>
            <div className="p-4">
              {canEdit(user) && (
                <div className="flex gap-2 mb-3">
                  <Input
                    placeholder="Token name"
                    value={newTokenName}
                    onChange={(e) => setNewTokenName(e.target.value)}
                    className="flex-1"
                  />
                  <Button
                    size="sm"
                    onClick={handleCreateToken}
                    disabled={!newTokenName.trim()}
                  >
                    Create
                  </Button>
                </div>
              )}

              {createdToken && (
                <div className="mb-3 rounded-lg border border-[#22c55e]/30 bg-healthy/5 p-3">
                  <p className="text-[10px] text-healthy mb-1 font-medium uppercase tracking-wider">
                    Copy now - shown only once
                  </p>
                  <p className="text-xs text-primary font-mono break-all select-all">
                    {createdToken}
                  </p>
                </div>
              )}

              <div className="space-y-1.5">
                {tokens.length === 0 ? (
                  <p className="text-xs text-muted py-4 text-center">
                    No tokens
                  </p>
                ) : (
                  tokens.map((token) => (
                    <div
                      key={token.id}
                      className="flex items-center justify-between rounded-lg bg-surface-elevated px-3 py-2"
                    >
                      <div className="min-w-0">
                        <p className="text-xs text-primary">{token.name}</p>
                        <p className="text-[10px] text-dimmed">
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
    </div>
  );
}
