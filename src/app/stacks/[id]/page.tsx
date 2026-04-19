"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
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
import { formatDate, timeAgo, workerStaleReason } from "@/lib/utils";
import { useAdminSocket, AdminSocketEvent } from "@/hooks/useAdminSocket";
import { useWorkerLiveness } from "@/hooks/useWorkerLiveness";
import { WorkerOfflineBanner } from "@/components/ui/worker-offline-banner";
import { useConfirm } from "@/components/ui/confirm-modal";

export default function StackDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = Number(params.id);

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
  const logsEndRef = useRef<HTMLDivElement>(null);

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

  const handleSocketEvent = useCallback(
    (event: AdminSocketEvent) => {
      if (
        event.type === "container_status" ||
        event.type === "container_sync" ||
        event.type === "container_health_status"
      ) {
        const name = (event.payload?.["container_name"] as string) ?? "";
        if (containerNamesRef.current.has(name)) {
          console.log(
            `[StackPage] WS ${event.type} for "${name}" — refreshing containers`,
          );
          refreshContainers();
        }
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

  const loadLogs = useCallback(async (containerId: number, stream?: string) => {
    setLogsLoading(true);
    const params: { limit: number; stream?: string } = { limit: 200 };
    if (stream && stream !== "all") params.stream = stream;
    const res = await reqGetContainerLogs(containerId, params);
    if (res.success) {
      setLogs((res.data ?? []).reverse());
      setTimeout(
        () => logsEndRef.current?.scrollIntoView({ behavior: "smooth" }),
        50,
      );
    }
    setLogsLoading(false);
  }, []);

  useEffect(() => {
    if (selectedContainer) {
      loadLogs(selectedContainer, streamFilter);
    }
  }, [selectedContainer, streamFilter, loadLogs]);

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
      <div className="text-center text-sm text-[#555555] py-12">
        Stack not found
      </div>
    );

  // Derive liveness from the map computed above
  const stackWorker = workers.find((w) => w.id === stack.worker_id) ?? null;
  const workerOnline = stackWorker
    ? (workerLiveness[stackWorker.id] ?? false)
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
            <h1 className="text-xl font-semibold text-white">{stack.name}</h1>
            <StatusBadge status={stack.status} />
          </div>
          {stack.description && (
            <p className="text-sm text-[#888888] mt-1">{stack.description}</p>
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
          {(() => {
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
                      ? "Force Deploy"
                      : isFailed
                        ? "Redeploy"
                        : "Deploy"}
                </Button>
              </div>
            );
          })()}
          <Button
            variant="secondary"
            onClick={handleDeleteStack}
            disabled={deleting}
            className="text-red-400 hover:text-red-300 border-red-900/50 hover:border-red-800"
          >
            {deleting ? "Deleting..." : "Delete"}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Stack Info + Containers */}
        <div className="lg:col-span-2 space-y-6">
          {/* Stack Info */}
          <div className="rounded-xl border border-[#1a1a1a] bg-[#111111] p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-medium text-white">Stack Info</h2>
              {!editingStack && (
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
                    <label className="text-xs font-medium text-[#888888] uppercase tracking-wider">
                      Worker
                    </label>
                    <select
                      value={editStackWorkerId}
                      onChange={(e) => setEditStackWorkerId(e.target.value)}
                      className="h-9 w-full rounded-lg border border-[#2a2a2a] bg-[#161616] px-3 text-sm text-white cursor-pointer focus:border-[#444444] focus:outline-none"
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
                  <label className="text-xs font-medium text-[#888888] uppercase tracking-wider">
                    Description
                  </label>
                  <textarea
                    rows={2}
                    value={editStackDescription}
                    onChange={(e) => setEditStackDescription(e.target.value)}
                    placeholder="Optional description..."
                    className="w-full rounded-lg border border-[#2a2a2a] bg-[#161616] px-3 py-2 text-sm text-white placeholder:text-[#555555] focus:border-[#444444] focus:outline-none resize-none"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-medium text-[#888888] uppercase tracking-wider">
                      Deployment Strategy
                    </label>
                    <select
                      value={editStackStrategy}
                      onChange={(e) => setEditStackStrategy(e.target.value)}
                      className="h-9 w-full rounded-lg border border-[#2a2a2a] bg-[#161616] px-3 text-sm text-white cursor-pointer focus:border-[#444444] focus:outline-none"
                    >
                      <option value="rolling">Rolling</option>
                      <option value="blue-green">Blue-Green</option>
                      <option value="canary">Canary</option>
                    </select>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-medium text-[#888888] uppercase tracking-wider">
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
                          editStackAutoDeploy ? "bg-[#3b82f6]" : "bg-[#2a2a2a]"
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
                      <span className="text-sm text-[#888888]">
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
                  <p className="text-xs text-[#555555] uppercase tracking-wider">
                    Worker
                  </p>
                  <p className="text-sm text-[#888888] mt-1">
                    {stack.worker_id ? (
                      <button
                        onClick={() =>
                          router.push(`/workers/${stack.worker_id}`)
                        }
                        className="text-[#3b82f6] hover:text-[#60a5fa] transition-colors"
                      >
                        {workerName(stack.worker_id)}
                      </button>
                    ) : (
                      <span className="text-[#f59e0b]">Unassigned</span>
                    )}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-[#555555] uppercase tracking-wider">
                    Strategy
                  </p>
                  <p className="text-sm text-[#888888] mt-1">
                    {stack.deployment_strategy}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-[#555555] uppercase tracking-wider">
                    Auto Deploy
                  </p>
                  <p className="text-sm text-[#888888] mt-1">
                    {stack.auto_deploy ? "Enabled" : "Disabled"}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-[#555555] uppercase tracking-wider">
                    Created
                  </p>
                  <p className="text-sm text-[#888888] mt-1">
                    {formatDate(stack.inserted_at)}
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Stack Environment Variables */}
          {showEnvVars && (
            <div className="rounded-xl border border-[#1a1a1a] bg-[#111111] p-5">
              <h2 className="text-sm font-medium text-white mb-4">
                Stack Environment Variables
              </h2>
              <EnvVarEditor value={stackEnvVars} onChange={setStackEnvVars} />
              <div className="mt-3 flex justify-end">
                <Button
                  size="sm"
                  onClick={handleSaveEnvVars}
                  disabled={savingEnvVars}
                >
                  {savingEnvVars ? "Saving..." : "Save"}
                </Button>
              </div>
            </div>
          )}

          {/* Compose Editor */}
          {showCompose && (
            <div className="rounded-xl border border-[#1a1a1a] bg-[#111111] p-5">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-medium text-white">
                  Docker Compose
                </h2>
                <button
                  onClick={() => setShowCompose(false)}
                  className="text-[#555555] hover:text-white transition-colors"
                  aria-label="Close compose editor"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>
              <p className="text-xs text-[#555555] mb-3">
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
                <p className="text-xs text-[#f87171] mt-2">{composeError}</p>
              )}
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
            </div>
          )}

          {/* Containers */}
          <div className="rounded-xl border border-[#1a1a1a] bg-[#111111] overflow-hidden">
            <div className="px-5 py-4 border-b border-[#1a1a1a] flex items-center justify-between">
              <h2 className="text-sm font-medium text-white">Containers</h2>
              <div className="flex items-center gap-3">
                <span className="text-xs text-[#555555]">
                  {containers.length} container
                  {containers.length !== 1 ? "s" : ""}
                </span>
                <Button size="sm" variant="secondary" onClick={() => setShowCreateContainer(!showCreateContainer)}>
                  {showCreateContainer ? "Cancel" : "Add Container"}
                </Button>
              </div>
            </div>

            {showCreateContainer && (
              <form onSubmit={handleCreateContainer} className="px-5 py-4 border-b border-[#1a1a1a] bg-[#0d0d0d]">
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
                <Button type="submit" size="sm" disabled={creatingContainer || !newContainerName.trim() || !newContainerImage.trim()}>
                  {creatingContainer ? "Creating..." : "Create Container"}
                </Button>
              </form>
            )}

            {containers.length === 0 ? (
              <div className="px-5 py-8 text-center text-sm text-[#555555]">
                No containers in this stack
              </div>
            ) : (
              containers.length > 0 && (
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-[#1a1a1a]">
                      <th className="px-4 py-3 text-left text-xs font-medium text-[#888888] uppercase tracking-wider">
                        Name
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-[#888888] uppercase tracking-wider">
                        Image
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-[#888888] uppercase tracking-wider">
                        Status
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-[#888888] uppercase tracking-wider">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {containers.map((container) => (
                      <tr
                        key={container.id}
                        className="border-b border-[#1a1a1a] last:border-0"
                      >
                        <td className="px-4 py-3 text-sm font-medium">
                          <Link
                            href={`/containers/${container.id}`}
                            className="text-white hover:text-[#3b82f6] transition-colors"
                          >
                            {container.name}
                          </Link>
                        </td>
                        <td className="px-4 py-3 text-sm text-[#888888] font-mono">
                          {container.image}:{container.tag}
                        </td>
                        <td className="px-4 py-3">
                          <StatusBadge status={container.status} />
                        </td>
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
                                  !workerOnline ? "Worker offline" : undefined
                                }
                                className="px-2 py-1 text-xs text-[#22c55e] hover:bg-[#161616] rounded transition-colors disabled:opacity-40"
                              >
                                {actionLoading[`${container.id}-start`]
                                  ? "..."
                                  : "Start"}
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
                                  !workerOnline ? "Worker offline" : undefined
                                }
                                className="px-2 py-1 text-xs text-[#3b82f6] hover:bg-[#161616] rounded transition-colors disabled:opacity-40"
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
                                  !workerOnline ? "Worker offline" : undefined
                                }
                                className="px-2 py-1 text-xs text-[#f59e0b] hover:bg-[#161616] rounded transition-colors disabled:opacity-40"
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
                                !workerOnline ? "Worker offline" : undefined
                              }
                              className="px-2 py-1 text-xs text-[#8b5cf6] hover:bg-[#161616] rounded transition-colors disabled:opacity-40"
                            >
                              {actionLoading[`${container.id}-recreate`]
                                ? "..."
                                : "Recreate"}
                            </button>
                            <a
                              href={`/containers/${container.id}`}
                              className="px-2 py-1 text-xs text-[#888888] hover:bg-[#161616] hover:text-white rounded transition-colors"
                            >
                              Edit
                            </a>
                            <button
                              onClick={() =>
                                handleDeleteContainer(container.id)
                              }
                              className="px-2 py-1 text-xs text-[#ef4444] hover:bg-[#161616] rounded transition-colors"
                            >
                              Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )
            )}
          </div>

          {/* Container Logs */}
          <div className="rounded-xl border border-[#1a1a1a] bg-[#111111] overflow-hidden">
            <div className="px-5 py-4 border-b border-[#1a1a1a] flex items-center justify-between">
              <h2 className="text-sm font-medium text-white">Container Logs</h2>
              <div className="flex items-center gap-2">
                <select
                  value={streamFilter}
                  onChange={(e) => setStreamFilter(e.target.value)}
                  className="bg-[#161616] border border-[#2a2a2a] text-[#ededed] px-2 py-1 rounded-md text-xs cursor-pointer"
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
                  className="bg-[#161616] border border-[#2a2a2a] text-[#ededed] px-2 py-1 rounded-md text-xs cursor-pointer"
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
                    className="text-xs text-[#3b82f6] hover:text-[#60a5fa] transition-colors"
                  >
                    Refresh
                  </button>
                )}
              </div>
            </div>
            {!selectedContainer ? (
              <div className="px-5 py-8 text-center text-sm text-[#555555]">
                Select a container to view logs
              </div>
            ) : logsLoading ? (
              <div className="px-5 py-8 text-center text-sm text-[#555555]">
                Loading logs...
              </div>
            ) : logs.length === 0 ? (
              <div className="px-5 py-8 text-center text-sm text-[#555555]">
                No logs available
              </div>
            ) : (
              <div className="max-h-[400px] overflow-y-auto p-4 font-mono text-xs leading-relaxed">
                {logs.map((log) => (
                  <div key={log.id} className="flex gap-2 hover:bg-[#161616]">
                    <span className="text-[#555555] shrink-0 select-none">
                      {new Date(log.recorded_at).toLocaleTimeString()}
                    </span>
                    <span className="text-[#888888]">{log.message}</span>
                  </div>
                ))}
                <div ref={logsEndRef} />
              </div>
            )}
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          <div className="rounded-xl border border-[#1a1a1a] bg-[#111111] p-5">
            <h2 className="text-sm font-medium text-white mb-4">
              Deployment History
            </h2>
            <div className="space-y-2">
              {deployments.length === 0 ? (
                <p className="text-xs text-[#555555] text-center py-4">
                  No deployments yet
                </p>
              ) : (
                deployments.slice(0, 10).map((d) => (
                  <button
                    key={d.id}
                    onClick={() => loadDeploymentLogs(d.id)}
                    className={`w-full flex items-center justify-between rounded-lg px-3 py-2 text-left transition-colors ${
                      selectedDeployment === d.id
                        ? "bg-[#1e1e1e] border border-[#333333]"
                        : "bg-[#161616] hover:bg-[#1a1a1a] border border-transparent"
                    }`}
                  >
                    <div>
                      <StatusBadge status={d.status} />
                      <p className="text-xs text-[#555555] mt-1">
                        {d.strategy} #{d.id}
                      </p>
                    </div>
                    <p className="text-xs text-[#555555]">
                      {timeAgo(d.inserted_at)}
                    </p>
                  </button>
                ))
              )}
            </div>
          </div>

          {/* Deployment Logs */}
          {selectedDeployment && (
            <div className="rounded-xl border border-[#1a1a1a] bg-[#111111] p-5">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-medium text-white">
                  Deployment #{selectedDeployment} Logs
                </h2>
                <button
                  onClick={() => loadDeploymentLogs(selectedDeployment)}
                  className="text-xs text-[#555555] hover:text-[#888888] transition-colors"
                >
                  Refresh
                </button>
              </div>
              {deploymentLogsLoading ? (
                <p className="text-xs text-[#555555] text-center py-4">
                  Loading logs...
                </p>
              ) : deploymentLogs.length === 0 ? (
                <p className="text-xs text-[#555555] text-center py-4">
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
                          : "text-[#888888]"
                      }`}
                    >
                      <span className="text-[#444444] shrink-0 tabular-nums">
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
