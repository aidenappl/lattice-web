"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import type {
  Worker,
  WorkerMetrics,
  Stack,
  Container,
  ContainerResourceUsage,
  DockerVolume,
  DockerNetwork,
} from "@/types";
import {
  reqDeleteWorker,
  reqRebootWorker,
  reqUpgradeRunner,
  reqStopAllContainers,
  reqStartAllContainers,
  reqForceRemoveContainer,
} from "@/services/workers.service";
import { reqListVolumes } from "@/services/volumes.service";
import { reqListNetworks } from "@/services/networks.service";
import { PageLoader } from "@/components/ui/loading";
import { StatusBadge } from "@/components/ui/badge";
import toast from "react-hot-toast";
import { useAdminSocket, AdminSocketEvent } from "@/hooks/useAdminSocket";
import { usePoll } from "@/hooks/usePoll";

import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faEllipsisVertical,
  faArrowLeft,
} from "@fortawesome/free-solid-svg-icons";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { isAdmin, canEdit } from "@/lib/utils";
import { useUser } from "@/store/hooks";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { useConfirm } from "@/components/ui/confirm-modal";

// Redux
import {
  fetchWorker,
  fetchWorkerMetrics,
  fetchWorkerTokens,
  selectCurrentWorker,
  selectWorkerMetrics,
  selectWorkerTokens,
  selectWorkersLoading,
  updateCurrent,
  pushMetricsSnapshot,
  addToken,
  removeToken,
} from "@/store/slices/workersSlice";
import { fetchStacks, selectStacks } from "@/store/slices/stacksSlice";
import { fetchAllContainers, selectAllContainers } from "@/store/slices/containersSlice";

// Extracted components
import WorkerMetricsPanel from "@/components/workers/WorkerMetricsPanel";
import WorkerInfoPanel from "@/components/workers/WorkerInfoPanel";
import WorkerStacksPanel from "@/components/workers/WorkerStacksPanel";
import WorkerInfraPanel from "@/components/workers/WorkerInfraPanel";
import WorkerTokensPanel from "@/components/workers/WorkerTokensPanel";
import WorkerEditForm from "@/components/workers/WorkerEditForm";
import { WorkerContainerStats } from "@/components/workers/WorkerContainerStats";

export default function WorkerDetailPage() {
  const params = useParams();
  const router = useRouter();
  const dispatch = useAppDispatch();
  const id = Number(params.id);

  // Redux selectors
  const worker = useAppSelector(selectCurrentWorker);
  const metrics = useAppSelector(selectWorkerMetrics);
  const tokens = useAppSelector(selectWorkerTokens);
  const loading = useAppSelector(selectWorkersLoading);
  const allStacks = useAppSelector(selectStacks);
  const containers = useAppSelector(selectAllContainers);

  // Derived: stacks for this worker
  const stacks = allStacks.filter((s: Stack) => s.worker_id === id);

  // Local state
  const [latestRunner, setLatestRunner] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [, setTick] = useState(0);

  // Edit state
  const [editing, setEditing] = useState(false);

  // Container stats from heartbeat
  const [containerStats, setContainerStats] = useState<ContainerResourceUsage[]>([]);

  // Volume & Network state (driven by WebSocket)
  const [volumes, setVolumes] = useState<DockerVolume[]>([]);
  const [networks, setNetworks] = useState<DockerNetwork[]>([]);

  // Orphaned containers from failed deploys
  const [orphanedContainers, setOrphanedContainers] = useState<string[]>([]);

  // Worker action state
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  // Actions dropdown state
  const [actionsOpen, setActionsOpen] = useState(false);

  const showConfirm = useConfirm();
  const user = useUser();

  // Initial data load via Redux thunks
  useEffect(() => {
    const load = async () => {
      const { reqGetVersions } = await import("@/services/admin.service");
      const versionsRes = await reqGetVersions();
      if (versionsRes.success) setLatestRunner(versionsRes.data.runner.latest);
    };
    dispatch(fetchWorker(id));
    dispatch(fetchWorkerMetrics(id));
    dispatch(fetchWorkerTokens(id));
    dispatch(fetchStacks());
    dispatch(fetchAllContainers());
    load();
  }, [id, dispatch]);

  useEffect(() => {
    if (worker) document.title = `Lattice - ${worker.name}`;
  }, [worker]);

  // Fetch volumes and networks when worker comes online
  useEffect(() => {
    if (worker?.status === "online") {
      reqListVolumes(id);
      reqListNetworks(id);
    }
  }, [worker?.status, id]);

  // Tick every second so "updated X ago" stays fresh
  usePoll(
    useCallback(() => setTick((n) => n + 1), []),
    1000,
    true,
  );

  // WebSocket: real-time worker status + metrics
  const handleSocketEvent = useCallback(
    (event: AdminSocketEvent) => {
      if (event.worker_id !== id) return;

      if (event.type === "worker_heartbeat") {
        const p = event.payload ?? {};
        const now = new Date().toISOString();
        const rv = p.runner_version as string | undefined;
        dispatch(
          updateCurrent({
            status: "online",
            last_heartbeat_at: now,
            ...(rv ? { runner_version: rv } : {}),
          }),
        );
        // Build a live metrics snapshot from the payload
        const snapshot: WorkerMetrics = {
          id: Date.now(),
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
        dispatch(pushMetricsSnapshot(snapshot));
        if (p.container_stats) {
          setContainerStats(p.container_stats as ContainerResourceUsage[]);
        }
        setLastUpdated(new Date());
      }

      if (event.type === "worker_connected") {
        dispatch(
          updateCurrent({
            status: "online",
            last_heartbeat_at: new Date().toISOString(),
          }),
        );
        toast.success(`Worker ${worker?.name ?? `#${id}`} came online`);
      }

      if (event.type === "worker_disconnected") {
        dispatch(updateCurrent({ status: "offline" }));
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

      if (event.type === "orphaned_container" && event.worker_id === id) {
        const name = event.payload?.container_name as string;
        if (name) {
          setOrphanedContainers((prev) =>
            prev.includes(name) ? prev : [...prev, name],
          );
        }
      }

      // Remove orphan from list when force_remove succeeds
      if (event.type === "worker_action_status" && event.worker_id === id) {
        const p = event.payload ?? {};
        if (p.action === "force_remove" && p.status === "success" && p.container_name) {
          setOrphanedContainers((prev) =>
            prev.filter((n) => n !== p.container_name),
          );
        }
      }
    },
    [id, worker?.name, dispatch],
  );
  useAdminSocket(handleSocketEvent);

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
    const actionMap: Record<string, (id: number) => Promise<{ success: boolean }>> = {
      reboot: reqRebootWorker,
      upgrade: reqUpgradeRunner,
      "stop-all": reqStopAllContainers,
      "start-all": reqStartAllContainers,
    };
    const fn = actionMap[action];
    if (fn) await fn(id);
    setActionLoading(null);
  };

  const handleForceRemove = async (containerName: string) => {
    const confirmed = await showConfirm({
      title: "Force remove container",
      message: `Are you sure you want to force remove "${containerName}"? This is an orphaned container from a failed deployment.`,
      confirmLabel: "Remove",
      variant: "danger",
    });
    if (!confirmed) return;
    const res = await reqForceRemoveContainer(id, containerName);
    if (res.success) {
      toast.success(`Force remove command sent for ${containerName}`);
    }
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

  const handleEditSaved = (updated: Worker) => {
    dispatch(updateCurrent(updated));
    setEditing(false);
  };

  const handleEditCancel = () => {
    setEditing(false);
  };

  if (loading) return <PageLoader />;
  if (!worker)
    return (
      <div className="text-center text-sm text-muted py-12">
        Worker not found
      </div>
    );

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

      {/* ─── Orphaned Containers Alert ─── */}
      {orphanedContainers.length > 0 && (
        <Alert variant="warning">
          <div>
            <strong>Orphaned containers detected</strong>
            <p className="text-xs text-muted mt-1">
              These containers are leftovers from failed deployments and should
              be removed.
            </p>
            <div className="mt-2 space-y-1">
              {orphanedContainers.map((name) => (
                <div
                  key={name}
                  className="flex items-center justify-between gap-2"
                >
                  <span className="text-xs font-mono truncate">{name}</span>
                  {canEdit(user) && (
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => handleForceRemove(name)}
                    >
                      Remove
                    </Button>
                  )}
                </div>
              ))}
            </div>
          </div>
        </Alert>
      )}

      {/* ─── Edit Form ─── */}
      {editing && canEdit(user) && (
        <WorkerEditForm
          worker={worker}
          onSaved={handleEditSaved}
          onCancel={handleEditCancel}
        />
      )}

      {/* ─── Live Metrics (primary section) ─── */}
      <WorkerMetricsPanel
        workerId={worker.id}
        workerStatus={worker.status}
        metrics={metrics}
        lastUpdated={lastUpdated}
      />

      {/* ─── Container Resource Stats ─── */}
      <WorkerContainerStats stats={containerStats} onForceRemove={handleForceRemove} />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* ─── Left column: Info + Stacks ─── */}
        <div className="lg:col-span-2 space-y-6">
          <WorkerInfoPanel worker={worker} />
          <WorkerStacksPanel stacks={stacks} containers={containers} />
        </div>

        {/* ─── Sidebar ─── */}
        <div className="space-y-6">
          {worker.status === "online" && (
            <WorkerInfraPanel
              workerId={worker.id}
              volumes={volumes}
              networks={networks}
            />
          )}
          <WorkerTokensPanel
            workerId={worker.id}
            tokens={tokens}
            onTokenCreated={(token) => dispatch(addToken(token))}
            onTokenDeleted={(tokenId) => dispatch(removeToken(tokenId))}
          />
        </div>
      </div>
    </div>
  );
}
