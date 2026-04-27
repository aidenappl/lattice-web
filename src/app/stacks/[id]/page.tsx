"use client";

import { useEffect, useState, useRef, useCallback, useMemo } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faArrowLeft,
  faCubes,
} from "@fortawesome/free-solid-svg-icons";
import toast from "react-hot-toast";
import {
  Stack,
  Container,
  Deployment,
  DeploymentLog,
  Worker,
} from "@/types";
import {
  reqGetStack,
  reqGetContainers,
  reqDeployStack,
  reqDeleteContainer,
  reqUpdateStack,
  reqDeleteStack,
  reqUpdateCompose,
  reqSyncCompose,
  reqCreateContainer,
  reqStartContainer,
  reqStopContainer,
  reqRestartContainer,
  reqRemoveContainer,
  reqRecreateContainer,
  reqUnpauseContainer,
} from "@/services/stacks.service";
import {
  reqGetDeployments,
  reqGetDeploymentLogs,
} from "@/services/deployments.service";
import { reqGetWorkers } from "@/services/workers.service";
import { PageLoader } from "@/components/ui/loading";
import { StatusBadge } from "@/components/ui/badge";
import { canEdit, timeAgo, workerStaleReason } from "@/lib/utils";
import { useUser } from "@/store/hooks";
import { useAdminSocket, AdminSocketEvent } from "@/hooks/useAdminSocket";
import { useWorkerLiveness } from "@/hooks/useWorkerLiveness";
import { useContainerLogs } from "@/hooks/useContainerLogs";
import { usePoll } from "@/hooks/usePoll";
import { WorkerOfflineBanner } from "@/components/ui/worker-offline-banner";
import { useConfirm } from "@/components/ui/confirm-modal";
import WorkerBadge from "@/components/ui/worker-badge";

import { StackEditForm } from "@/components/stacks/StackEditForm";
import { StackContainersList } from "@/components/stacks/StackContainersList";
import { StackComposeTab } from "@/components/stacks/StackComposeTab";
import { StackEnvTab } from "@/components/stacks/StackEnvTab";
import { StackLogsTab } from "@/components/stacks/StackLogsTab";
import { StackDeployments } from "@/components/stacks/StackDeployments";
import StackDeployTokensPanel from "@/components/stacks/StackDeployTokensPanel";
import { StackDependencyGraph } from "@/components/stacks/StackDependencyGraph";
import { StackHeaderActions } from "@/components/stacks/StackHeaderActions";
import { useDeploymentProgress } from "@/hooks/useDeploymentProgress";

export default function StackDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = Number(params.id);
  const user = useUser();

  const [stack, setStack] = useState<Stack | null>(null);
  const [containers, setContainers] = useState<Container[]>([]);
  const [deployments, setDeployments] = useState<Deployment[]>([]);
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [loading, setLoading] = useState(true);
  const [deploying, setDeploying] = useState(false);

  // Worker liveness
  const workerLiveness = useWorkerLiveness(workers);
  const showConfirm = useConfirm();
  const deployProgress = useDeploymentProgress();

  // Container actions state
  const [actionLoading, setActionLoading] = useState<Record<string, boolean>>(
    {},
  );

  // Container logs via hook
  const {
    logs,
    logsLoading,
    logLimit,
    setLogLimit,
    streamFilter,
    setStreamFilter,
    loadLogs,
    handleDownloadVisible,
    handleDownloadLastRun,
    handleDownloadAll,
    handleLogSocketEvent,
  } = useContainerLogs();

  // Selected container for logs
  const [selectedContainer, setSelectedContainer] = useState<number | null>(
    null,
  );

  // Refs to allow WS handler to access current state without stale closures
  const selectedContainerNameRef = useRef<string>("");
  const selectedContainerRef = useRef<number | null>(null);

  // Stack env vars
  const [stackEnvVars, setStackEnvVars] = useState("");
  const [savingEnvVars, setSavingEnvVars] = useState(false);

  const parsedEnvVars = useMemo<Record<string, string>>(() => {
    try {
      const obj = stackEnvVars ? JSON.parse(stackEnvVars) : {};
      return typeof obj === "object" && !Array.isArray(obj) && obj !== null
        ? obj
        : {};
    } catch {
      return {};
    }
  }, [stackEnvVars]);

  // Compose editor
  const [composeYaml, setComposeYaml] = useState("");
  const [savingCompose, setSavingCompose] = useState(false);
  const [syncingCompose, setSyncingCompose] = useState(false);
  const [composeError, setComposeError] = useState("");

  // Deployment logs
  const [selectedDeployment, setSelectedDeployment] = useState<number | null>(
    null,
  );
  const [deploymentLogs, setDeploymentLogs] = useState<DeploymentLog[]>([]);
  const [deploymentLogsLoading, setDeploymentLogsLoading] = useState(false);

  // Delete stack
  const [deleting, setDeleting] = useState(false);

  // Tab state
  type StackTab = "containers" | "compose" | "env" | "logs";
  const [activeTab, setActiveTab] = useState<StackTab>("containers");

  // Mounted ref to prevent state updates after unmount
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  // Deploy button state
  const [hasPendingChanges, setHasPendingChanges] = useState(false);

  // Stack settings edit state
  const [editingStack, setEditingStack] = useState(false);

  useEffect(() => {
    if (stack) document.title = `Lattice - ${stack.name}`;
  }, [stack]);

  useEffect(() => {
    const load = async () => {
      const [stackRes, containersRes, deploymentsRes, workersRes] =
        await Promise.all([
          reqGetStack(id),
          reqGetContainers(id),
          reqGetDeployments(),
          reqGetWorkers(),
        ]);
      if (!mountedRef.current) return;
      if (stackRes.success) {
        setStack(stackRes.data);
        setStackEnvVars(stackRes.data.env_vars ?? "");
        setComposeYaml(stackRes.data.compose_yaml ?? "");
      }
      const loadedContainers = containersRes.success
        ? (containersRes.data ?? [])
        : [];
      if (containersRes.success) setContainers(loadedContainers);

      if (deploymentsRes.success) {
        const filtered = (deploymentsRes.data ?? []).filter(
          (d) => d.stack_id === id,
        );
        setDeployments(filtered);

        const latestDeploy = [...filtered].sort(
          (a, b) =>
            new Date(b.inserted_at).getTime() -
            new Date(a.inserted_at).getTime(),
        )[0];
        if (!latestDeploy) {
          setHasPendingChanges(loadedContainers.length > 0);
        } else {
          const deployTime = new Date(latestDeploy.inserted_at).getTime();
          setHasPendingChanges(
            loadedContainers.some(
              (c) => new Date(c.updated_at).getTime() > deployTime,
            ),
          );
        }
      }
      if (workersRes.success) setWorkers(workersRes.data ?? []);
      setLoading(false);
    };
    load();
  }, [id]);

  // Auto-select first container for logs when containers load
  useEffect(() => {
    if (containers.length > 0 && selectedContainer === null) {
      setSelectedContainer(containers[0].id);
    }
  }, [containers, selectedContainer]);

  // Poll while stack is deploying to pick up terminal status (3s)
  usePoll(
    async () => {
      const [stackRes, deploymentsRes, containersRes] = await Promise.all([
        reqGetStack(id),
        reqGetDeployments(),
        reqGetContainers(id),
      ]);
      if (stackRes.success) {
        setStack(stackRes.data);
        setStackEnvVars(stackRes.data.env_vars ?? "");
      }
      if (deploymentsRes.success) {
        const filtered = (deploymentsRes.data ?? []).filter(
          (d) => d.stack_id === id,
        );
        setDeployments(filtered);
        if (selectedDeployment) {
          const logsRes = await reqGetDeploymentLogs(selectedDeployment);
          if (logsRes.success) setDeploymentLogs(logsRes.data ?? []);
        }
      }
      if (containersRes.success) setContainers(containersRes.data ?? []);
    },
    3000,
    stack?.status === "deploying",
  );

  const refreshContainers = useCallback(async () => {
    const res = await reqGetContainers(id);
    if (res.success) setContainers(res.data ?? []);
  }, [id]);

  // Periodic lightweight container status refresh (every 8s)
  usePoll(refreshContainers, 8000);

  // WebSocket: refresh containers on any sync/status event for this stack's containers
  const containerNamesRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    containerNamesRef.current = new Set(containers.map((c) => c.name));
  }, [containers]);

  // Keep refs up-to-date for use inside stable WS callback
  useEffect(() => {
    const c = containers.find((cc) => cc.id === selectedContainer);
    selectedContainerNameRef.current = c?.name ?? "";
    selectedContainerRef.current = selectedContainer;
  }, [selectedContainer, containers]);

  const handleSocketEvent = useCallback(
    (event: AdminSocketEvent) => {
      const payload = event.payload ?? {};
      const eventName = (payload["container_name"] as string) ?? "";

      if (
        event.type === "container_status" ||
        event.type === "container_sync" ||
        event.type === "container_health_status"
      ) {
        if (containerNamesRef.current.has(eventName)) {
          if (process.env.NODE_ENV === "development") console.log(
            `[StackPage] WS ${event.type} for "${eventName}" — refreshing containers`,
          );
          refreshContainers();
          // Reload logs when the selected container's status changes
          if (eventName === selectedContainerNameRef.current) {
            setTimeout(() => {
              const sel = selectedContainerRef.current;
              if (sel) loadLogs(sel);
            }, 500);
          }
        }
      }

      // Live-stream log lines for the currently selected container
      if (
        (event.type === "container_logs" || event.type === "lifecycle_log") &&
        eventName &&
        eventName === selectedContainerNameRef.current
      ) {
        handleLogSocketEvent(event, eventName);
      }

      // Deployment progress — refresh stack and deployments on terminal statuses
      if (event.type === "deployment_progress" || event.type === "deployment_status") {
        const depStatus = (payload["status"] as string) ?? "";
        if (depStatus === "deployed" || depStatus === "failed" || depStatus === "rolled_back") {
          refreshContainers();
          reqGetStack(id).then((r) => { if (r.success) setStack(r.data); });
          reqGetDeployments().then((r) => {
            if (r.success) setDeployments((r.data ?? []).filter((d) => d.stack_id === id));
          });
        }
      }

      // Worker lifecycle events — reload logs after a short delay
      if (
        event.type === "worker_shutdown" ||
        event.type === "worker_crash" ||
        event.type === "worker_disconnected"
      ) {
        refreshContainers();
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [id, refreshContainers, handleLogSocketEvent, loadLogs],
  );
  useAdminSocket(handleSocketEvent);

  const handleDeploy = async (containerIds?: number[]) => {
    setDeploying(true);
    const res = await reqDeployStack(id, containerIds);
    if (res.success) {
      setHasPendingChanges(false);
      const stackRes = await reqGetStack(id);
      if (stackRes.success) setStack(stackRes.data);
      const deploymentsRes = await reqGetDeployments();
      if (deploymentsRes.success) {
        setDeployments(
          (deploymentsRes.data ?? []).filter((d) => d.stack_id === id),
        );
      }
    } else {
      toast.error(res.error_message || "Deploy failed");
    }
    setDeploying(false);
  };

  const handleCancelDeploy = async () => {
    const res = await reqUpdateStack(id, { status: "active" });
    if (res.success) {
      setStack(res.data);
      toast.success("Deploy cancelled");
    } else {
      toast.error(res.error_message || "Failed to cancel deploy");
    }
  };

  const handleDeleteStack = async () => {
    const confirmed = await showConfirm({
      title: "Delete stack",
      message:
        "Are you sure you want to delete this stack? This cannot be undone.",
      confirmLabel: "Delete",
      variant: "danger",
    });
    if (!confirmed) return;
    setDeleting(true);
    const res = await reqDeleteStack(id);
    if (res.success) {
      router.push("/stacks");
    }
    setDeleting(false);
  };

  // Note: Container/stack cache invalidation happens via WebSocket events
  // which trigger scheduleRefresh on the list pages automatically.

  const handleCreateContainer = async (data: {
    name: string;
    image: string;
    tag: string;
  }) => {
    const res = await reqCreateContainer(id, {
      name: data.name,
      image: data.image,
      tag: data.tag,
    } as Partial<Container>);
    if (res.success) {
      setContainers((prev) => [...prev, res.data]);
      setHasPendingChanges(true);
    }
  };

  const handleSaveStack = async (data: {
    name: string;
    description: string;
    worker_id: string;
    strategy: string;
    auto_deploy: boolean;
    placement_constraints: string;
  }) => {
    const res = await reqUpdateStack(id, {
      name: data.name,
      description: data.description,
      worker_id: data.worker_id ? Number(data.worker_id) : 0,
      deployment_strategy: data.strategy,
      auto_deploy: data.auto_deploy,
      placement_constraints: data.placement_constraints || undefined,
    });
    if (res.success) {
      setStack(res.data);
      setEditingStack(false);
    }
  };

  const loadDeploymentLogs = async (deploymentId: number) => {
    setSelectedDeployment(deploymentId);
    setDeploymentLogsLoading(true);
    const res = await reqGetDeploymentLogs(deploymentId);
    if (res.success) {
      setDeploymentLogs(res.data ?? []);
    }
    setDeploymentLogsLoading(false);
  };

  useEffect(() => {
    if (selectedContainer) {
      loadLogs(selectedContainer, streamFilter);
    }
  }, [selectedContainer, streamFilter, logLimit, loadLogs]);

  const handleDeleteContainer = async (containerId: number) => {
    const confirmed = await showConfirm({
      title: "Delete container",
      message: "This container will be permanently removed from this stack.",
      confirmLabel: "Delete",
      variant: "danger",
    });
    if (!confirmed) return;
    const res = await reqDeleteContainer(containerId);
    if (res.success) {
      setHasPendingChanges(true);
      await refreshContainers();
    }
  };

  const handleContainerAction = async (containerId: number, action: string) => {
    const container = containers.find((c) => c.id === containerId);
    const name = container?.name ?? String(containerId);
    const label = action.charAt(0).toUpperCase() + action.slice(1);

    const confirmMap: Record<
      string,
      { title: string; message: string; variant: "danger" | "warning" }
    > = {
      stop: {
        title: "Stop container",
        message: `Stop "${name}"?`,
        variant: "warning",
      },
      recreate: {
        title: "Recreate container",
        message: `Recreate "${name}"? It will be removed and created fresh.`,
        variant: "warning",
      },
      remove: {
        title: "Remove container",
        message: `Remove "${name}" from Docker? This cannot be undone.`,
        variant: "danger",
      },
    };
    const conf = confirmMap[action];
    if (conf) {
      const ok = await showConfirm({ ...conf, confirmLabel: label });
      if (!ok) return;
    }

    const key = `${containerId}-${action}`;
    setActionLoading((prev) => ({ ...prev, [key]: true }));

    const actionFns: Record<
      string,
      (id: number) => Promise<{ success: boolean; error_message?: string }>
    > = {
      start: reqStartContainer,
      stop: reqStopContainer,
      restart: reqRestartContainer,
      remove: reqRemoveContainer,
      recreate: reqRecreateContainer,
      unpause: reqUnpauseContainer,
    };

    const fn = actionFns[action];
    if (!fn) {
      if (process.env.NODE_ENV === "development") console.warn(`[StackPage] unknown action "${action}"`);
      setActionLoading((prev) => ({ ...prev, [key]: false }));
      return;
    }

    const toastId = toast.loading(`Sending ${label.toLowerCase()} to ${name}…`);
    if (process.env.NODE_ENV === "development") console.log(
      `[StackPage] sending action "${action}" to container ${containerId} (${name})`,
    );

    const res = await fn(containerId);
    if (res.success) {
      toast.success(`${label} command sent to ${name}`, { id: toastId });
      if (process.env.NODE_ENV === "development") console.log(`[StackPage] action "${action}" ok for ${name}`);
    } else {
      const msg = res.error_message ?? "Unknown error";
      toast.error(`${label} failed: ${msg}`, { id: toastId });
      if (process.env.NODE_ENV === "development") console.error(`[StackPage] action "${action}" failed for ${name}:`, msg);
    }

    setTimeout(async () => {
      await refreshContainers();
      const stackRes = await reqGetStack(id);
      if (stackRes.success) setStack(stackRes.data);
      setActionLoading((prev) => ({ ...prev, [key]: false }));
    }, 2000);
  };

  const handleSaveEnvVars = async () => {
    setSavingEnvVars(true);
    const res = await reqUpdateStack(id, {
      env_vars: stackEnvVars || undefined,
    });
    if (res.success) {
      setStack(res.data);
      setHasPendingChanges(true);
    }
    setSavingEnvVars(false);
  };

  const handleSaveCompose = async () => {
    setSavingCompose(true);
    setComposeError("");
    const res = await reqUpdateCompose(id, { compose_yaml: composeYaml });
    setSavingCompose(false);
    if (res.success) {
      setStack(res.data.stack);
      // Refresh containers and capture the new list for accurate count
      const cRes = await reqGetContainers(id);
      const newContainers = cRes.success ? (cRes.data ?? []) : [];
      if (cRes.success) setContainers(newContainers);
      const totalContainers = newContainers.length;
      const changedIds = res.data.changed_container_ids ?? [];
      if (changedIds.length === 0) {
        toast.success("Compose saved — no container changes detected");
      } else {
        const allChanged = changedIds.length >= totalContainers;
        const deploy = await showConfirm({
          title: "Compose saved",
          message: allChanged
            ? "Deploy now to apply the updated definition to your containers?"
            : `${changedIds.length} of ${totalContainers} container${totalContainers !== 1 ? "s" : ""} changed. Deploy only the changed containers?`,
          confirmLabel: allChanged
            ? "Deploy"
            : `Deploy ${changedIds.length} Changed`,
          variant: "warning",
        });
        if (deploy) {
          handleDeploy(allChanged ? undefined : changedIds);
        } else {
          setHasPendingChanges(true);
        }
      }
    } else {
      setComposeError(res.error_message || "Failed to update compose");
    }
  };

  const handleSyncCompose = async () => {
    setSyncingCompose(true);
    setComposeError("");
    const toastId = toast.loading("Syncing config from compose…");
    const res = await reqSyncCompose(id);
    setSyncingCompose(false);
    if (res.success) {
      const updated = (res.data ?? []).filter((r) => r.updated).length;
      const skipped = (res.data ?? []).filter((r) => !r.updated).length;
      toast.success(
        `Synced ${updated} container${updated !== 1 ? "s" : ""}${skipped > 0 ? ` (${skipped} skipped)` : ""}`,
        { id: toastId },
      );
      await refreshContainers();
    } else {
      toast.error(res.error_message || "Sync failed", { id: toastId });
      setComposeError(res.error_message || "Sync failed");
    }
  };

  const workerName = (wId: number | null) => {
    if (!wId) return "Unassigned";
    const w = workers.find((w) => w.id === wId);
    return w ? w.name : `Worker #${wId}`;
  };

  // Download handlers — pass container name from current selection
  const selectedContainerName = useMemo(() => {
    const c = containers.find((cc) => cc.id === selectedContainer);
    return c?.name ?? String(selectedContainer);
  }, [containers, selectedContainer]);

  if (loading) return <PageLoader />;
  if (!stack)
    return (
      <div className="text-center text-sm text-muted py-12">
        Stack not found
      </div>
    );

  // Derive liveness from the map computed above
  const stackWorker = workers.find((w) => w.id === stack.worker_id) ?? null;
  const workerOnline = stackWorker
    ? (workerLiveness[stackWorker.id] ?? true)
    : true;
  const staleReason = stackWorker ? workerStaleReason(stackWorker) : null;

  const runningCount = containers.filter((c) => c.status === "running").length;
  const stoppedCount = containers.filter(
    (c) => c.status === "stopped" || c.status === "error",
  ).length;

  return (
    <div className="stack-page">
      {/* Worker offline banner */}
      {!workerOnline && (
        <WorkerOfflineBanner
          workerName={stackWorker?.name}
          reason={staleReason}
        />
      )}

      {/* ─── Header ─────────────────────────────────────────────── */}
      <div className="stack-header">
        <div className="stack-header-top">
          <Link href="/stacks" className="stack-back-link">
            <FontAwesomeIcon icon={faArrowLeft} className="h-3 w-3" />
            <span>Stacks</span>
          </Link>
        </div>
        <div className="stack-header-main">
          <div className="stack-header-left">
            <div className="flex items-center gap-3">
              <div className="stack-icon">
                <FontAwesomeIcon icon={faCubes} className="h-5 w-5 text-info" />
              </div>
              <div>
                <div className="flex items-center gap-2.5">
                  <h1 className="text-lg font-semibold text-primary">
                    {stack.name}
                  </h1>
                  <StatusBadge status={stack.status} />
                </div>
                {stack.status === "deploying" && (() => {
                  const activeDep = deployments.find(
                    (d) => d.status === "deploying" || d.status === "validating" || d.status === "sending",
                  );
                  const pct = activeDep ? (deployProgress[activeDep.id]?.percent ?? 15) : 15;
                  return (
                    <div className="progress-bar mt-1" style={{ width: 160 }}>
                      <div
                        className="progress-bar-fill pending"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  );
                })()}
                {stack.description && (
                  <p className="text-xs text-muted mt-0.5">
                    {stack.description}
                  </p>
                )}
              </div>
            </div>
            {/* Meta chips */}
            <div className="stack-meta-chips">
              {stack.worker_id ? (
                <WorkerBadge
                  id={stack.worker_id}
                  name={workerName(stack.worker_id)}
                />
              ) : (
                <span className="stack-chip text-pending">Unassigned</span>
              )}
              <span className="stack-chip">{stack.deployment_strategy}</span>
              {stack.auto_deploy && (() => {
                const watchedCount = containers.filter(c => c.registry_id).length;
                return (
                  <span className="stack-chip text-healthy" title={`${watchedCount} container${watchedCount !== 1 ? 's' : ''} watched for image updates`}>
                    Auto-deploy {watchedCount > 0 ? `(${watchedCount})` : ""}
                  </span>
                );
              })()}
              <span className="stack-chip">
                {containers.length} container
                {containers.length !== 1 ? "s" : ""}
              </span>
            </div>
          </div>
          <StackHeaderActions
            stack={stack}
            stackId={id}
            containers={containers}
            workerOnline={workerOnline}
            deploying={deploying}
            hasPendingChanges={hasPendingChanges}
            deleting={deleting}
            canEditUser={canEdit(user)}
            hasActiveDeployment={deployments.some(
              (d) => d.status === "deploying" || d.status === "validating" || d.status === "sending" || d.status === "pending",
            )}
            onDeploy={handleDeploy}
            onCancelDeploy={handleCancelDeploy}
            onEdit={() => setEditingStack(true)}
            onDelete={handleDeleteStack}
          />
        </div>
      </div>

      {/* ─── Edit Stack Modal (inline) ──────────────────────────── */}
      {editingStack && (
        <StackEditForm
          stack={stack}
          workers={workers}
          onSave={handleSaveStack}
          onCancel={() => setEditingStack(false)}
        />
      )}

      {/* ─── Stats Row ──────────────────────────────────────────── */}
      <div className="stack-stats-row">
        <div className="stack-stat">
          <div className="stack-stat-value text-healthy">{runningCount}</div>
          <div className="stack-stat-label">Running</div>
        </div>
        <div className="stack-stat">
          <div className="stack-stat-value text-failed">{stoppedCount}</div>
          <div className="stack-stat-label">Stopped</div>
        </div>
        <div className="stack-stat">
          <div className="stack-stat-value text-info">{deployments.length}</div>
          <div className="stack-stat-label">Deployments</div>
        </div>
        <div className="stack-stat">
          <div className="stack-stat-value text-secondary">
            {timeAgo(stack.inserted_at)}
          </div>
          <div className="stack-stat-label">Created</div>
        </div>
      </div>

      {/* ─── Dependency Graph (auto-hides when no depends_on) ──── */}
      <StackDependencyGraph containers={containers} />

      {/* ─── Tab Navigation ─────────────────────────────────────── */}
      <div className="stack-tabs" role="tablist">
        {(["containers", "compose", "env", "logs"] as StackTab[]).map((tab) => (
          <button
            key={tab}
            role="tab"
            aria-selected={activeTab === tab}
            tabIndex={activeTab === tab ? 0 : -1}
            onClick={() => setActiveTab(tab)}
            className={`stack-tab ${activeTab === tab ? "active" : ""}`}
          >
            {tab === "containers"
              ? `Containers (${containers.length})`
              : tab === "compose"
                ? "Compose"
                : tab === "env"
                  ? "Environment"
                  : "Logs"}
          </button>
        ))}
      </div>

      {/* ─── Main Content Grid ──────────────────────────────────── */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 xl:gap-5">
        <div className="xl:col-span-2">
          {/* ─── Containers Tab ─────────────────────────── */}
          {activeTab === "containers" && (
            <StackContainersList
              containers={containers}
              canEdit={canEdit(user)}
              workerOnline={workerOnline}
              actionLoading={actionLoading}
              onAction={handleContainerAction}
              onDelete={handleDeleteContainer}
              onCreateContainer={handleCreateContainer}
            />
          )}

          {/* ─── Compose Tab ────────────────────────────── */}
          {activeTab === "compose" && (
            <StackComposeTab
              composeYaml={composeYaml}
              onChange={setComposeYaml}
              onSave={handleSaveCompose}
              onSync={handleSyncCompose}
              savingCompose={savingCompose}
              syncingCompose={syncingCompose}
              composeError={composeError}
              onDismissError={() => setComposeError("")}
              canEdit={canEdit(user)}
              parsedEnvVars={parsedEnvVars}
              onSwitchToEnv={() => setActiveTab("env")}
            />
          )}

          {/* ─── Environment Tab ────────────────────────── */}
          {activeTab === "env" && (
            <StackEnvTab
              envVars={stackEnvVars}
              onChange={setStackEnvVars}
              onSave={handleSaveEnvVars}
              saving={savingEnvVars}
              canEdit={canEdit(user)}
            />
          )}

          {/* ─── Logs Tab ───────────────────────────────── */}
          {activeTab === "logs" && (
            <StackLogsTab
              containers={containers}
              selectedContainer={selectedContainer}
              onSelectContainer={setSelectedContainer}
              logs={logs}
              logsLoading={logsLoading}
              logLimit={logLimit}
              onLimitChange={setLogLimit}
              streamFilter={streamFilter}
              onStreamFilterChange={setStreamFilter}
              onRefresh={() =>
                selectedContainer && loadLogs(selectedContainer, streamFilter)
              }
              onDownloadVisible={() => handleDownloadVisible(selectedContainerName)}
              onDownloadLastRun={() => handleDownloadLastRun(selectedContainerName)}
              onDownloadAll={() => {
                if (selectedContainer) {
                  handleDownloadAll(selectedContainer, selectedContainerName);
                }
              }}
            />
          )}
        </div>

        {/* ─── Sidebar: Deployments + Deploy Tokens ────────────── */}
        <div className="space-y-5">
          <StackDeployments
            deployments={deployments}
            selectedDeployment={selectedDeployment}
            deploymentLogs={deploymentLogs}
            deploymentLogsLoading={deploymentLogsLoading}
            onSelectDeployment={loadDeploymentLogs}
          />
          <StackDeployTokensPanel stackId={id} />
        </div>
      </div>
    </div>
  );
}
