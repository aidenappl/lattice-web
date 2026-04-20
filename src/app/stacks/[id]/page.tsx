"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faXmark } from "@fortawesome/free-solid-svg-icons";
import toast from "react-hot-toast";
import {
  Stack,
  Container,
  Deployment,
  DeploymentLog,
  ContainerLog,
  Worker,
} from "@/types";
import {
  reqGetStack,
  reqGetContainers,
  reqDeployStack,
  reqGetContainerLogs,
  reqGetLifecycleLogs,
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
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CodeEditor } from "@/components/ui/code-editor";
import { EnvVarEditor } from "@/components/ui/env-var-editor";
import { formatDate, timeAgo, workerStaleReason, canEdit } from "@/lib/utils";
import { useUser } from "@/store/hooks";
import { useAdminSocket, AdminSocketEvent } from "@/hooks/useAdminSocket";
import { useWorkerLiveness } from "@/hooks/useWorkerLiveness";
import { WorkerOfflineBanner } from "@/components/ui/worker-offline-banner";
import { useConfirm } from "@/components/ui/confirm-modal";
import { Alert } from "@/components/ui/alert";
import {
  LogViewer,
  LogLimit,
  sortLogs,
  downloadLogsAsTxt,
  isNewSession,
  syntheticId,
  isSynthetic,
  lifecycleToContainerLog,
} from "@/components/ui/log-viewer";
import WorkerBadge from "@/components/ui/worker-badge";

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

  // Worker liveness — must be declared unconditionally before any early return.
  // Passes all workers; we filter to the stack's worker after loading.
  const workerLiveness = useWorkerLiveness(workers);
  const showConfirm = useConfirm();

  // Container actions state
  const [actionLoading, setActionLoading] = useState<Record<string, boolean>>(
    {},
  );

  // Logs state
  const [selectedContainer, setSelectedContainer] = useState<number | null>(
    null,
  );
  const [logs, setLogs] = useState<ContainerLog[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [streamFilter, setStreamFilter] = useState<string>("all");
  const [logLimit, setLogLimit] = useState<LogLimit>(250);

  // Refs to allow WS handler to access current state without stale closures
  const selectedContainerNameRef = useRef<string>("");
  const selectedContainerRef = useRef<number | null>(null);
  const logLimitRef = useRef<LogLimit>(250);

  // Stack env vars
  const [showEnvVars, setShowEnvVars] = useState(false);
  const [stackEnvVars, setStackEnvVars] = useState("");
  const [savingEnvVars, setSavingEnvVars] = useState(false);

  // Compose editor
  const [showCompose, setShowCompose] = useState(false);
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
  const deploymentLogsEndRef = useRef<HTMLDivElement>(null);

  // Delete stack
  const [deleting, setDeleting] = useState(false);

  // Create container
  const [showCreateContainer, setShowCreateContainer] = useState(false);
  const [newContainerName, setNewContainerName] = useState("");
  const [newContainerImage, setNewContainerImage] = useState("");
  const [newContainerTag, setNewContainerTag] = useState("latest");
  const [creatingContainer, setCreatingContainer] = useState(false);

  // Deploy button state
  const [hasPendingChanges, setHasPendingChanges] = useState(false);
  const [forceDeployHovered, setForceDeployHovered] = useState(false);

  // Stack settings edit state
  const [editingStack, setEditingStack] = useState(false);
  const [editStackName, setEditStackName] = useState("");
  const [editStackDescription, setEditStackDescription] = useState("");
  const [editStackWorkerId, setEditStackWorkerId] = useState("");
  const [editStackStrategy, setEditStackStrategy] = useState("");
  const [editStackAutoDeploy, setEditStackAutoDeploy] = useState(false);
  const [savingStack, setSavingStack] = useState(false);

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

        // Compute whether any container was modified after the last deployment.
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

  // Poll while stack is deploying to pick up terminal status
  useEffect(() => {
    if (!stack || stack.status !== "deploying") return;
    const interval = setInterval(async () => {
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
        // Auto-refresh logs for the selected deployment
        if (selectedDeployment) {
          const logsRes = await reqGetDeploymentLogs(selectedDeployment);
          if (logsRes.success) setDeploymentLogs(logsRes.data ?? []);
        }
      }
      if (containersRes.success) setContainers(containersRes.data ?? []);
    }, 3000);
    return () => clearInterval(interval);
  }, [stack?.status, id, selectedDeployment]);

  const refreshContainers = async () => {
    const res = await reqGetContainers(id);
    if (res.success) setContainers(res.data ?? []);
  };

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
  useEffect(() => {
    logLimitRef.current = logLimit;
  }, [logLimit]);

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
          console.log(
            `[StackPage] WS ${event.type} for "${eventName}" — refreshing containers`,
          );
          refreshContainers();
          // Reload logs when the selected container's status changes
          // (picks up lifecycle entries from lifecycle_logs table)
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
        event.type === "container_logs" &&
        eventName &&
        eventName === selectedContainerNameRef.current
      ) {
        const message = payload["message"] as string | undefined;
        const rawStream = (payload["stream"] as string | undefined) ?? "stdout";
        const stream: "stdout" | "stderr" =
          rawStream === "stderr" ? "stderr" : "stdout";
        if (message) {
          const entry: ContainerLog = {
            id: syntheticId() as unknown as number,
            container_id: null,
            container_name: eventName,
            worker_id: event.worker_id ?? 0,
            stream,
            message,
            recorded_at: new Date().toISOString(),
          };
          const limit = logLimitRef.current;
          setLogs((prev) => {
            // Only skip if a DB-fetched entry with the same message arrived
            // within 2 s (same boot burst). This avoids dropping lines that
            // legitimately repeat across sessions (e.g. "Starting...").
            const now = Date.now();
            const dominated = prev.some(
              (l) =>
                !isSynthetic(l) &&
                l.message === message &&
                Math.abs(now - new Date(l.recorded_at).getTime()) < 2_000,
            );
            if (dominated) return prev;
            return sortLogs([...prev.slice(-(limit - 1)), entry]);
          });
        }
      }

      // Live lifecycle_log entries from the runner (verbose action progress).
      if (
        event.type === "lifecycle_log" &&
        eventName &&
        eventName === selectedContainerNameRef.current
      ) {
        const message = (payload["message"] as string) ?? "";
        if (message) {
          const entry: ContainerLog = {
            id: `lc_${syntheticId()}` as unknown as number,
            container_id: null,
            container_name: eventName,
            worker_id: event.worker_id ?? 0,
            stream: "lifecycle" as "stdout",
            message,
            recorded_at: new Date().toISOString(),
          };
          const limit = logLimitRef.current;
          setLogs((prev) => sortLogs([...prev.slice(-(limit - 1)), entry]));
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
    [id],
  );
  useAdminSocket(handleSocketEvent);

  // Periodic lightweight container status refresh (every 8s)
  useEffect(() => {
    const interval = setInterval(refreshContainers, 8000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const handleDeploy = async () => {
    setDeploying(true);
    const res = await reqDeployStack(id);
    if (res.success) {
      setHasPendingChanges(false);
      const stackRes = await reqGetStack(id);
      if (stackRes.success) setStack(stackRes.data);
      // Refresh deployments list
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

  const handleCreateContainer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newContainerName.trim() || !newContainerImage.trim()) return;
    setCreatingContainer(true);
    const res = await reqCreateContainer(id, {
      name: newContainerName.trim(),
      image: newContainerImage.trim(),
      tag: newContainerTag.trim() || "latest",
    } as Partial<Container>);
    if (res.success) {
      setContainers((prev) => [...prev, res.data]);
      setHasPendingChanges(true);
      setShowCreateContainer(false);
      setNewContainerName("");
      setNewContainerImage("");
      setNewContainerTag("latest");
    }
    setCreatingContainer(false);
  };

  const openEditStack = () => {
    if (!stack) return;
    setEditStackName(stack.name);
    setEditStackDescription(stack.description ?? "");
    setEditStackWorkerId(stack.worker_id?.toString() ?? "");
    setEditStackStrategy(stack.deployment_strategy);
    setEditStackAutoDeploy(stack.auto_deploy);
    setEditingStack(true);
  };

  const handleSaveStack = async () => {
    if (!stack) return;
    setSavingStack(true);
    const res = await reqUpdateStack(id, {
      name: editStackName.trim(),
      description: editStackDescription.trim(),
      worker_id: editStackWorkerId ? Number(editStackWorkerId) : 0,
      deployment_strategy: editStackStrategy,
      auto_deploy: editStackAutoDeploy,
    });
    if (res.success) {
      setStack(res.data);
      setEditingStack(false);
    }
    setSavingStack(false);
  };

  const handleCancelEditStack = () => {
    setEditingStack(false);
  };

  const loadDeploymentLogs = async (deploymentId: number) => {
    setSelectedDeployment(deploymentId);
    setDeploymentLogsLoading(true);
    const res = await reqGetDeploymentLogs(deploymentId);
    if (res.success) {
      setDeploymentLogs(res.data ?? []);
      setTimeout(
        () =>
          deploymentLogsEndRef.current?.scrollIntoView({ behavior: "smooth" }),
        50,
      );
    }
    setDeploymentLogsLoading(false);
  };

  const loadLogs = useCallback(
    async (containerId: number, stream?: string, limit?: number) => {
      setLogsLoading(true);
      const params: { limit: number; stream?: string } = {
        limit: limit ?? logLimitRef.current,
      };
      if (stream && stream !== "all") params.stream = stream;
      const [logRes, lcRes] = await Promise.all([
        reqGetContainerLogs(containerId, params),
        reqGetLifecycleLogs(containerId, { limit: params.limit }),
      ]);
      const dbLogs = logRes.success ? (logRes.data ?? []) : [];
      const lcLogs = lcRes.success
        ? (lcRes.data ?? []).map(lifecycleToContainerLog)
        : [];
      if (logRes.success || lcRes.success) {
        // Message-based dedup (safe against clock skew)
        const seen = new Set<string>();
        const unique = [...dbLogs, ...lcLogs].filter((l) => {
          const key = `${l.recorded_at}|${l.message}`;
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });
        setLogs(sortLogs(unique));
      }
      setLogsLoading(false);
    },
    [],
  );

  useEffect(() => {
    if (selectedContainer) {
      loadLogs(selectedContainer, streamFilter);
    }
  }, [selectedContainer, streamFilter, logLimit, loadLogs]);

  // ─── Download handlers ─────────────────────────────────────────────────────

  const handleDownloadVisible = () => {
    const c = containers.find((cc) => cc.id === selectedContainer);
    const name = c?.name ?? String(selectedContainer);
    downloadLogsAsTxt(logs, `${name}-logs-visible.txt`);
  };

  const handleDownloadLastRun = () => {
    let startIdx = 0;
    for (let i = logs.length - 1; i > 0; i--) {
      if (isNewSession(logs[i - 1], logs[i])) {
        startIdx = i;
        break;
      }
    }
    const c = containers.find((cc) => cc.id === selectedContainer);
    const name = c?.name ?? String(selectedContainer);
    downloadLogsAsTxt(logs.slice(startIdx), `${name}-logs-last-run.txt`);
  };

  const handleDownloadAll = async () => {
    if (!selectedContainer) return;
    const [logRes, lcRes] = await Promise.all([
      reqGetContainerLogs(selectedContainer, { limit: 9999 }),
      reqGetLifecycleLogs(selectedContainer, { limit: 9999 }),
    ]);
    if (logRes.success) {
      const dbLogs = (logRes.data ?? []).slice();
      const lcLogs = lcRes.success
        ? (lcRes.data ?? []).map(lifecycleToContainerLog)
        : [];
      const all = sortLogs([...dbLogs, ...lcLogs]);
      const c = containers.find((cc) => cc.id === selectedContainer);
      const name = c?.name ?? String(selectedContainer);
      downloadLogsAsTxt(all, `${name}-logs-all.txt`);
    }
  };

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

    // Confirm destructive actions
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
      console.warn(`[StackPage] unknown action "${action}"`);
      setActionLoading((prev) => ({ ...prev, [key]: false }));
      return;
    }

    const toastId = toast.loading(`Sending ${label.toLowerCase()} to ${name}…`);
    console.log(
      `[StackPage] sending action "${action}" to container ${containerId} (${name})`,
    );

    const res = await fn(containerId);
    if (res.success) {
      toast.success(`${label} command sent to ${name}`, { id: toastId });
      console.log(`[StackPage] action "${action}" ok for ${name}`);
    } else {
      const msg = res.error_message ?? "Unknown error";
      toast.error(`${label} failed: ${msg}`, { id: toastId });
      console.error(`[StackPage] action "${action}" failed for ${name}:`, msg);
    }

    // Give the worker a moment to execute, then refresh
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
      setStack(res.data);
      setHasPendingChanges(true);
      await refreshContainers();
      setShowCompose(false);
      const deploy = await showConfirm({
        title: "Compose saved",
        message:
          "Deploy now to apply the updated definition to your containers?",
        confirmLabel: "Deploy",
        variant: "warning",
      });
      if (deploy) handleDeploy();
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
    : true; // no worker assigned → don't block
  const staleReason = stackWorker ? workerStaleReason(stackWorker) : null;

  return (
    <div>
      {/* Worker offline banner */}
      {!workerOnline && (
        <WorkerOfflineBanner
          workerName={stackWorker?.name}
          reason={staleReason}
        />
      )}

      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-semibold text-primary">{stack.name}</h1>
            <StatusBadge status={stack.status} />
          </div>
          {stack.description && (
            <p className="text-sm text-secondary mt-1">{stack.description}</p>
          )}
        </div>
        <div className="flex gap-2">
          <Button
            variant="secondary"
            onClick={() => {
              setShowCompose(!showCompose);
              if (showEnvVars) setShowEnvVars(false);
            }}
          >
            Compose
          </Button>
          <Button
            variant="secondary"
            onClick={() => {
              setShowEnvVars(!showEnvVars);
              if (showCompose) setShowCompose(false);
            }}
          >
            Env Vars
          </Button>
          {canEdit(user) && (() => {
            const isDeploying = deploying || stack.status === "deploying";
            const isFailed = stack.status === "failed";
            const needsDeploy = hasPendingChanges || isFailed;
            const showForce = !needsDeploy && !isDeploying;
            return (
              <div className="relative">
                <Button
                  onClick={handleDeploy}
                  disabled={isDeploying || !workerOnline}
                  title={
                    !workerOnline
                      ? "Worker is offline — cannot deploy"
                      : undefined
                  }
                  onMouseEnter={() => showForce && setForceDeployHovered(true)}
                  onMouseLeave={() => setForceDeployHovered(false)}
                  className={
                    showForce
                      ? "opacity-40 hover:opacity-60 transition-opacity"
                      : ""
                  }
                >
                  {isDeploying
                    ? "Deploying..."
                    : forceDeployHovered
                      ? "Force Re-deploy"
                      : isFailed
                        ? "Redeploy"
                        : needsDeploy
                          ? "Deploy"
                          : "Re-deploy"}
                </Button>
              </div>
            );
          })()}
          {canEdit(user) && (
            <Button
              variant="secondary"
              onClick={handleDeleteStack}
              disabled={deleting}
              className="text-red-400 hover:text-red-300 border-red-900/50 hover:border-red-800"
            >
              {deleting ? "Deleting..." : "Delete"}
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Stack Info + Containers */}
        <div className="lg:col-span-2 space-y-6">
          {/* Stack Info */}
          <div className="rounded-xl border border-border-subtle bg-surface p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-medium text-primary">Stack Info</h2>
              {!editingStack && canEdit(user) && (
                <Button variant="ghost" size="sm" onClick={openEditStack}>
                  Edit
                </Button>
              )}
            </div>

            {editingStack ? (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <Input
                    id="edit-stack-name"
                    label="Name"
                    value={editStackName}
                    onChange={(e) => setEditStackName(e.target.value)}
                    required
                  />
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-medium text-secondary uppercase tracking-wider">
                      Worker
                    </label>
                    <select
                      value={editStackWorkerId}
                      onChange={(e) => setEditStackWorkerId(e.target.value)}
                      className="h-9 w-full rounded-lg border border-border-strong bg-surface-elevated px-3 text-sm text-primary cursor-pointer focus:border-border-emphasis focus:outline-none"
                    >
                      <option value="">Unassigned</option>
                      {workers.map((w) => (
                        <option key={w.id} value={w.id}>
                          {w.name} ({w.hostname})
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-medium text-secondary uppercase tracking-wider">
                    Description
                  </label>
                  <textarea
                    rows={2}
                    value={editStackDescription}
                    onChange={(e) => setEditStackDescription(e.target.value)}
                    placeholder="Optional description..."
                    className="w-full rounded-lg border border-border-strong bg-surface-elevated px-3 py-2 text-sm text-primary placeholder:text-muted focus:border-border-emphasis focus:outline-none resize-none"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-medium text-secondary uppercase tracking-wider">
                      Deployment Strategy
                    </label>
                    <select
                      value={editStackStrategy}
                      onChange={(e) => setEditStackStrategy(e.target.value)}
                      className="h-9 w-full rounded-lg border border-border-strong bg-surface-elevated px-3 text-sm text-primary cursor-pointer focus:border-border-emphasis focus:outline-none"
                    >
                      <option value="rolling">Rolling</option>
                      <option value="blue-green">Blue-Green</option>
                      <option value="canary">Canary</option>
                    </select>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-medium text-secondary uppercase tracking-wider">
                      Auto Deploy
                    </label>
                    <div className="flex items-center h-9 gap-3">
                      <button
                        type="button"
                        role="switch"
                        aria-checked={editStackAutoDeploy}
                        onClick={() =>
                          setEditStackAutoDeploy(!editStackAutoDeploy)
                        }
                        className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${
                          editStackAutoDeploy
                            ? "bg-[#3b82f6]"
                            : "bg-border-strong"
                        }`}
                      >
                        <span
                          className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                            editStackAutoDeploy
                              ? "translate-x-4"
                              : "translate-x-0"
                          }`}
                        />
                      </button>
                      <span className="text-sm text-secondary">
                        {editStackAutoDeploy ? "Enabled" : "Disabled"}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    onClick={handleSaveStack}
                    disabled={savingStack || !editStackName.trim()}
                  >
                    {savingStack ? "Saving..." : "Save Changes"}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleCancelEditStack}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-muted uppercase tracking-wider">
                    Worker
                  </p>
                  <p className="text-sm text-secondary mt-1">
                    {stack.worker_id ? (
                      <WorkerBadge
                        id={stack.worker_id}
                        name={workerName(stack.worker_id)}
                      />
                    ) : (
                      <span className="text-[#f59e0b]">Unassigned</span>
                    )}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted uppercase tracking-wider">
                    Strategy
                  </p>
                  <p className="text-sm text-secondary mt-1">
                    {stack.deployment_strategy}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted uppercase tracking-wider">
                    Auto Deploy
                  </p>
                  <p className="text-sm text-secondary mt-1">
                    {stack.auto_deploy ? "Enabled" : "Disabled"}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted uppercase tracking-wider">
                    Created
                  </p>
                  <p className="text-sm text-secondary mt-1">
                    {formatDate(stack.inserted_at)}
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Stack Environment Variables */}
          {showEnvVars && (
            <div className="rounded-xl border border-border-subtle bg-surface p-5">
              <h2 className="text-sm font-medium text-primary mb-4">
                Stack Environment Variables
              </h2>
              <EnvVarEditor value={stackEnvVars} onChange={setStackEnvVars} />
              {canEdit(user) && (
                <div className="mt-3 flex justify-end">
                  <Button
                    size="sm"
                    onClick={handleSaveEnvVars}
                    disabled={savingEnvVars}
                  >
                    {savingEnvVars ? "Saving..." : "Save"}
                  </Button>
                </div>
              )}
            </div>
          )}

          {/* Compose Editor */}
          {showCompose && (
            <div className="rounded-xl border border-border-subtle bg-surface p-5">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-medium text-primary">
                  Docker Compose
                </h2>
                <button
                  onClick={() => setShowCompose(false)}
                  className="text-muted hover:text-primary transition-colors"
                  aria-label="Close compose editor"
                >
                  <FontAwesomeIcon icon={faXmark} className="h-3.5 w-3.5" />
                </button>
              </div>
              <p className="text-xs text-muted mb-3">
                Edit the compose YAML and save to replace all containers with
                the updated definition.
              </p>
              <CodeEditor
                rows={20}
                value={composeYaml}
                onChange={setComposeYaml}
                language="yaml"
                placeholder={`version: "3"\nservices:\n  web:\n    image: nginx:latest\n    ports:\n      - "8080:80"`}
              />
              {composeError && (
                <div className="mt-2">
                  <Alert variant="error" onDismiss={() => setComposeError("")}>
                    {composeError}
                  </Alert>
                </div>
              )}
              {canEdit(user) && (
                <div className="mt-3 flex justify-between items-center">
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={handleSyncCompose}
                    disabled={
                      syncingCompose || savingCompose || !composeYaml.trim()
                    }
                    title="Re-read the stored compose YAML and patch existing containers (health check, env, ports, etc.) without recreating them"
                  >
                    {syncingCompose ? "Syncing…" : "Sync Config"}
                  </Button>
                  <Button
                    size="sm"
                    onClick={handleSaveCompose}
                    disabled={
                      savingCompose || syncingCompose || !composeYaml.trim()
                    }
                  >
                    {savingCompose ? "Saving..." : "Save & Sync Containers"}
                  </Button>
                </div>
              )}
            </div>
          )}

          {/* Containers */}
          <div className="rounded-xl border border-border-subtle bg-surface overflow-hidden">
            <div className="px-5 py-4 border-b border-border-subtle flex items-center justify-between">
              <h2 className="text-sm font-medium text-primary">Containers</h2>
              <div className="flex items-center gap-3">
                <span className="text-xs text-muted">
                  {containers.length} container
                  {containers.length !== 1 ? "s" : ""}
                </span>
                {canEdit(user) && (
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => setShowCreateContainer(!showCreateContainer)}
                  >
                    {showCreateContainer ? "Cancel" : "Add Container"}
                  </Button>
                )}
              </div>
            </div>

            {showCreateContainer && canEdit(user) && (
              <form
                onSubmit={handleCreateContainer}
                className="px-5 py-4 border-b border-border-subtle bg-background-alt"
              >
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
                  <Input
                    id="new-container-name"
                    label="Name"
                    placeholder="my-service"
                    value={newContainerName}
                    onChange={(e) => setNewContainerName(e.target.value)}
                    required
                  />
                  <Input
                    id="new-container-image"
                    label="Image"
                    placeholder="nginx"
                    value={newContainerImage}
                    onChange={(e) => setNewContainerImage(e.target.value)}
                    required
                  />
                  <Input
                    id="new-container-tag"
                    label="Tag"
                    placeholder="latest"
                    value={newContainerTag}
                    onChange={(e) => setNewContainerTag(e.target.value)}
                  />
                </div>
                <Button
                  type="submit"
                  size="sm"
                  disabled={
                    creatingContainer ||
                    !newContainerName.trim() ||
                    !newContainerImage.trim()
                  }
                >
                  {creatingContainer ? "Creating..." : "Create Container"}
                </Button>
              </form>
            )}

            {containers.length === 0 ? (
              <div className="px-5 py-8 text-center text-sm text-muted">
                No containers in this stack
              </div>
            ) : (
              containers.length > 0 && (
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border-subtle">
                      <th className="px-4 py-3 text-left text-xs font-medium text-secondary uppercase tracking-wider">
                        Name
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-secondary uppercase tracking-wider">
                        Image
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-secondary uppercase tracking-wider">
                        Status
                      </th>
                      {canEdit(user) && (
                        <th className="px-4 py-3 text-right text-xs font-medium text-secondary uppercase tracking-wider">
                          Actions
                        </th>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {containers.map((container) => (
                      <tr
                        key={container.id}
                        className="border-b border-border-subtle last:border-0"
                      >
                        <td className="px-4 py-3 text-sm font-medium">
                          <Link
                            href={`/containers/${container.id}`}
                            className="text-primary hover:text-[#3b82f6] transition-colors"
                          >
                            {container.name}
                          </Link>
                        </td>
                        <td className="px-4 py-3 text-sm text-secondary font-mono">
                          {container.image}:{container.tag}
                        </td>
                        <td className="px-4 py-3">
                          <StatusBadge status={container.status} />
                        </td>
                        {canEdit(user) && (
                          <td className="px-4 py-3">
                            <div className="flex items-center justify-end gap-1">
                              {(container.status === "stopped" ||
                                container.status === "error") && (
                                <button
                                  onClick={() =>
                                    handleContainerAction(container.id, "start")
                                  }
                                  disabled={
                                    !workerOnline ||
                                    !!actionLoading[`${container.id}-start`]
                                  }
                                  title={
                                    !workerOnline
                                      ? "Worker offline"
                                      : "Start container"
                                  }
                                  className="px-2 py-1 text-xs text-[#22c55e] hover:bg-surface-elevated rounded transition-colors disabled:opacity-40"
                                >
                                  {actionLoading[`${container.id}-start`]
                                    ? "..."
                                    : "Start"}
                                </button>
                              )}
                              {container.status === "paused" && (
                                <button
                                  onClick={() =>
                                    handleContainerAction(
                                      container.id,
                                      "unpause",
                                    )
                                  }
                                  disabled={
                                    !workerOnline ||
                                    !!actionLoading[`${container.id}-unpause`]
                                  }
                                  title={
                                    !workerOnline
                                      ? "Worker offline"
                                      : "Resume container"
                                  }
                                  className="px-2 py-1 text-xs text-[#22c55e] hover:bg-surface-elevated rounded transition-colors disabled:opacity-40"
                                >
                                  {actionLoading[`${container.id}-unpause`]
                                    ? "..."
                                    : "Resume"}
                                </button>
                              )}
                              {container.status === "running" && (
                                <button
                                  onClick={() =>
                                    handleContainerAction(container.id, "restart")
                                  }
                                  disabled={
                                    !workerOnline ||
                                    !!actionLoading[`${container.id}-restart`]
                                  }
                                  title={
                                    !workerOnline
                                      ? "Worker offline"
                                      : "Restart container"
                                  }
                                  className="px-2 py-1 text-xs text-[#3b82f6] hover:bg-surface-elevated rounded transition-colors disabled:opacity-40"
                                >
                                  {actionLoading[`${container.id}-restart`]
                                    ? "..."
                                    : "Restart"}
                                </button>
                              )}
                              {container.status === "running" && (
                                <button
                                  onClick={() =>
                                    handleContainerAction(container.id, "stop")
                                  }
                                  disabled={
                                    !workerOnline ||
                                    !!actionLoading[`${container.id}-stop`]
                                  }
                                  title={
                                    !workerOnline
                                      ? "Worker offline"
                                      : "Stop container"
                                  }
                                  className="px-2 py-1 text-xs text-[#f59e0b] hover:bg-surface-elevated rounded transition-colors disabled:opacity-40"
                                >
                                  {actionLoading[`${container.id}-stop`]
                                    ? "..."
                                    : "Stop"}
                                </button>
                              )}
                              <button
                                onClick={() =>
                                  handleContainerAction(container.id, "recreate")
                                }
                                disabled={
                                  !workerOnline ||
                                  !!actionLoading[`${container.id}-recreate`]
                                }
                                title={
                                  !workerOnline
                                    ? "Worker offline"
                                    : "Remove and recreate container from config"
                                }
                                className="px-2 py-1 text-xs text-[#8b5cf6] hover:bg-surface-elevated rounded transition-colors disabled:opacity-40"
                              >
                                {actionLoading[`${container.id}-recreate`]
                                  ? "..."
                                  : "Recreate"}
                              </button>
                              <a
                                href={`/containers/${container.id}`}
                                title="Edit container config"
                                className="px-2 py-1 text-xs text-secondary hover:bg-surface-elevated hover:text-primary rounded transition-colors"
                              >
                                Edit
                              </a>
                              <button
                                onClick={() =>
                                  handleDeleteContainer(container.id)
                                }
                                title="Delete container"
                                className="px-2 py-1 text-xs text-[#ef4444] hover:bg-surface-elevated rounded transition-colors"
                              >
                                Delete
                              </button>
                            </div>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              )
            )}
          </div>

          {/* Container Logs */}
          <div className="rounded-xl border border-border-subtle bg-surface overflow-hidden">
            <div className="px-5 py-4 border-b border-border-subtle flex items-center justify-between">
              <h2 className="text-sm font-medium text-primary">
                Container Logs
              </h2>
              <div className="flex items-center gap-2">
                <select
                  value={streamFilter}
                  onChange={(e) => setStreamFilter(e.target.value)}
                  className="bg-surface-elevated border border-border-strong text-foreground px-2 py-1 rounded-md text-xs cursor-pointer"
                >
                  <option value="all">All streams</option>
                  <option value="stdout">stdout</option>
                  <option value="stderr">stderr</option>
                </select>
                <select
                  value={selectedContainer ?? ""}
                  onChange={(e) =>
                    setSelectedContainer(
                      e.target.value ? Number(e.target.value) : null,
                    )
                  }
                  className="bg-surface-elevated border border-border-strong text-foreground px-2 py-1 rounded-md text-xs cursor-pointer"
                >
                  <option value="">Select container...</option>
                  {containers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
                {selectedContainer && (
                  <button
                    onClick={() => loadLogs(selectedContainer, streamFilter)}
                    className="text-xs text-[#3b82f6] hover:text-[#60a5fa] transition-colors cursor-pointer"
                  >
                    Refresh
                  </button>
                )}
              </div>
            </div>
            {!selectedContainer ? (
              <div className="px-5 py-8 text-center text-sm text-muted">
                Select a container to view logs
              </div>
            ) : logsLoading ? (
              <div className="px-5 py-8 text-center text-sm text-muted">
                Loading logs...
              </div>
            ) : (
              <LogViewer
                logs={logs}
                logLimit={logLimit}
                onLimitChange={setLogLimit}
                onDownloadVisible={handleDownloadVisible}
                onDownloadLastRun={handleDownloadLastRun}
                onDownloadAll={handleDownloadAll}
                loading={logsLoading}
              />
            )}
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          <div className="rounded-xl border border-border-subtle bg-surface p-5">
            <h2 className="text-sm font-medium text-primary mb-4">
              Deployment History
            </h2>
            <div className="space-y-2">
              {deployments.length === 0 ? (
                <p className="text-xs text-muted text-center py-4">
                  No deployments yet
                </p>
              ) : (
                deployments.slice(0, 10).map((d) => (
                  <button
                    key={d.id}
                    onClick={() => loadDeploymentLogs(d.id)}
                    className={`w-full flex items-center justify-between rounded-lg px-3 py-2 text-left transition-colors ${
                      selectedDeployment === d.id
                        ? "bg-[#1e1e1e] border border-border-strong"
                        : "bg-surface-elevated hover:bg-surface-active border border-transparent"
                    }`}
                  >
                    <div>
                      <StatusBadge status={d.status} />
                      <p className="text-xs text-muted mt-1">
                        {d.strategy} #{d.id}
                      </p>
                    </div>
                    <p className="text-xs text-muted">
                      {timeAgo(d.inserted_at)}
                    </p>
                  </button>
                ))
              )}
            </div>
          </div>

          {/* Deployment Logs */}
          {selectedDeployment && (
            <div className="rounded-xl border border-border-subtle bg-surface p-5">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-medium text-primary">
                  Deployment #{selectedDeployment} Logs
                </h2>
                <button
                  onClick={() => loadDeploymentLogs(selectedDeployment)}
                  className="text-xs text-muted hover:text-secondary transition-colors"
                >
                  Refresh
                </button>
              </div>
              {deploymentLogsLoading ? (
                <p className="text-xs text-muted text-center py-4">
                  Loading logs...
                </p>
              ) : deploymentLogs.length === 0 ? (
                <p className="text-xs text-muted text-center py-4">
                  No logs yet
                </p>
              ) : (
                <div className="space-y-1 max-h-[500px] overflow-y-auto font-mono text-xs">
                  {deploymentLogs.map((log) => (
                    <div
                      key={log.id}
                      className={`flex gap-2 px-2 py-1 rounded ${
                        log.level === "error"
                          ? "bg-red-950/30 text-red-400"
                          : "text-secondary"
                      }`}
                    >
                      <span className="text-dimmed shrink-0 tabular-nums">
                        {new Date(log.recorded_at).toLocaleTimeString()}
                      </span>
                      {log.stage && (
                        <span className="text-[#666666] shrink-0">
                          [{log.stage}]
                        </span>
                      )}
                      <span className="break-all">{log.message}</span>
                    </div>
                  ))}
                  <div ref={deploymentLogsEndRef} />
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
