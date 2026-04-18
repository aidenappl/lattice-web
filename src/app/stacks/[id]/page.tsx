"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
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
  reqCreateContainer,
  reqUpdateContainer,
  reqDeleteContainer,
  reqUpdateStack,
  reqDeleteStack,
  reqUpdateCompose,
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
import { formatDate, timeAgo } from "@/lib/utils";

type ContainerForm = {
  name: string;
  image: string;
  tag: string;
  port_mappings: string;
  env_vars: string;
  volumes: string;
  cpu_limit: string;
  memory_limit: string;
  replicas: string;
  restart_policy: string;
  command: string;
  entrypoint: string;
  registry_id: string;
};

const emptyContainerForm: ContainerForm = {
  name: "",
  image: "",
  tag: "latest",
  port_mappings: "",
  env_vars: "",
  volumes: "",
  cpu_limit: "",
  memory_limit: "",
  replicas: "1",
  restart_policy: "unless-stopped",
  command: "",
  entrypoint: "",
  registry_id: "",
};

function containerToForm(c: Container): ContainerForm {
  return {
    name: c.name,
    image: c.image,
    tag: c.tag,
    port_mappings: c.port_mappings ?? "",
    env_vars: c.env_vars ?? "",
    volumes: c.volumes ?? "",
    cpu_limit: c.cpu_limit?.toString() ?? "",
    memory_limit: c.memory_limit?.toString() ?? "",
    replicas: c.replicas.toString(),
    restart_policy: c.restart_policy ?? "unless-stopped",
    command: c.command ?? "",
    entrypoint: c.entrypoint ?? "",
    registry_id: c.registry_id?.toString() ?? "",
  };
}

function formToPayload(form: ContainerForm) {
  return {
    name: form.name,
    image: form.image,
    tag: form.tag || "latest",
    port_mappings: form.port_mappings || undefined,
    env_vars: form.env_vars || undefined,
    volumes: form.volumes || undefined,
    cpu_limit: form.cpu_limit ? parseFloat(form.cpu_limit) : undefined,
    memory_limit: form.memory_limit ? parseInt(form.memory_limit) : undefined,
    replicas: parseInt(form.replicas) || 1,
    restart_policy: form.restart_policy || undefined,
    command: form.command || undefined,
    entrypoint: form.entrypoint || undefined,
    registry_id: form.registry_id ? parseInt(form.registry_id) : undefined,
  };
}

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

  // Container form state
  const [showContainerForm, setShowContainerForm] = useState(false);
  const [editingContainer, setEditingContainer] = useState<number | null>(null);
  const [containerForm, setContainerForm] =
    useState<ContainerForm>(emptyContainerForm);
  const [containerFormError, setContainerFormError] = useState("");
  const [containerFormSubmitting, setContainerFormSubmitting] = useState(false);

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
      if (containersRes.success) setContainers(containersRes.data ?? []);
      if (deploymentsRes.success) {
        setDeployments(
          (deploymentsRes.data ?? []).filter((d) => d.stack_id === id),
        );
      }
      if (workersRes.success) setWorkers(workersRes.data ?? []);
      setLoading(false);
    };
    load();
  }, [id]);

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

  const handleDeploy = async () => {
    setDeploying(true);
    const res = await reqDeployStack(id);
    if (res.success) {
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
    if (
      !confirm(
        "Are you sure you want to delete this stack? This cannot be undone.",
      )
    )
      return;
    setDeleting(true);
    const res = await reqDeleteStack(id);
    if (res.success) {
      router.push("/stacks");
    }
    setDeleting(false);
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

  // Container CRUD
  const openAddContainer = () => {
    setEditingContainer(null);
    setContainerForm(emptyContainerForm);
    setContainerFormError("");
    setShowContainerForm(true);
  };

  const openEditContainer = (c: Container) => {
    setEditingContainer(c.id);
    setContainerForm(containerToForm(c));
    setContainerFormError("");
    setShowContainerForm(true);
  };

  const handleContainerSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setContainerFormError("");
    setContainerFormSubmitting(true);
    const payload = formToPayload(containerForm);
    if (editingContainer) {
      const res = await reqUpdateContainer(editingContainer, payload);
      if (!res.success) {
        setContainerFormError(
          res.error_message || "Failed to update container",
        );
        setContainerFormSubmitting(false);
        return;
      }
    } else {
      const res = await reqCreateContainer(id, payload);
      if (!res.success) {
        setContainerFormError(
          res.error_message || "Failed to create container",
        );
        setContainerFormSubmitting(false);
        return;
      }
    }
    setShowContainerForm(false);
    setContainerFormSubmitting(false);
    await refreshContainers();
  };

  const handleDeleteContainer = async (containerId: number) => {
    if (!confirm("Delete this container?")) return;
    const res = await reqDeleteContainer(containerId);
    if (res.success) await refreshContainers();
  };

  const handleContainerAction = async (containerId: number, action: string) => {
    const key = `${containerId}-${action}`;
    setActionLoading((prev) => ({ ...prev, [key]: true }));
    const actionFns: Record<string, (id: number) => Promise<unknown>> = {
      stop: reqStopContainer,
      restart: reqRestartContainer,
      remove: reqRemoveContainer,
      recreate: reqRecreateContainer,
    };
    await actionFns[action]?.(containerId);
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
    if (res.success) setStack(res.data);
    setSavingEnvVars(false);
  };

  const handleSaveCompose = async () => {
    setSavingCompose(true);
    setComposeError("");
    const res = await reqUpdateCompose(id, { compose_yaml: composeYaml });
    if (res.success) {
      setStack(res.data);
      await refreshContainers();
    } else {
      setComposeError(res.error_message || "Failed to update compose");
    }
    setSavingCompose(false);
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

  return (
    <div>
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
          <Button
            onClick={handleDeploy}
            disabled={deploying || stack.status === "deploying"}
          >
            {deploying
              ? "Deploying..."
              : stack.status === "failed"
                ? "Redeploy"
                : "Deploy"}
          </Button>
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
            <h2 className="text-sm font-medium text-white mb-4">Stack Info</h2>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-[#555555] uppercase tracking-wider">
                  Worker
                </p>
                <p className="text-sm text-[#888888] mt-1">
                  {stack.worker_id ? (
                    <button
                      onClick={() => router.push(`/workers/${stack.worker_id}`)}
                      className="text-[#3b82f6] hover:text-[#60a5fa] transition-colors"
                    >
                      {workerName(stack.worker_id)}
                    </button>
                  ) : (
                    "Unassigned"
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
          </div>

          {/* Stack Environment Variables */}
          {showEnvVars && (
            <div className="rounded-xl border border-[#1a1a1a] bg-[#111111] p-5">
              <h2 className="text-sm font-medium text-white mb-3">
                Stack Environment Variables
              </h2>
              <p className="text-xs text-[#555555] mb-3">
                JSON object of key-value pairs injected into all containers
                during deploy. Container-level env vars override these.
              </p>
              <textarea
                rows={6}
                value={stackEnvVars}
                onChange={(e) => setStackEnvVars(e.target.value)}
                placeholder='{"NODE_ENV": "production", "LOG_LEVEL": "info"}'
                className="w-full rounded-lg border border-[#2a2a2a] bg-[#161616] px-3 py-2 text-sm text-white placeholder:text-[#555555] focus:border-[#444444] focus:outline-none font-mono resize-none"
              />
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
              <h2 className="text-sm font-medium text-white mb-3">
                Docker Compose
              </h2>
              <p className="text-xs text-[#555555] mb-3">
                Edit the compose YAML and save to replace all containers with
                the updated definition.
              </p>
              <textarea
                rows={20}
                value={composeYaml}
                onChange={(e) => setComposeYaml(e.target.value)}
                placeholder={`version: "3"\nservices:\n  web:\n    image: nginx:latest\n    ports:\n      - "8080:80"`}
                className="w-full rounded-lg border border-[#2a2a2a] bg-[#161616] px-3 py-2 text-sm text-white placeholder:text-[#555555] focus:border-[#444444] focus:outline-none font-mono resize-none"
              />
              {composeError && (
                <p className="text-xs text-[#f87171] mt-2">{composeError}</p>
              )}
              <div className="mt-3 flex justify-end">
                <Button
                  size="sm"
                  onClick={handleSaveCompose}
                  disabled={savingCompose || !composeYaml.trim()}
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
              <div className="flex items-center gap-2">
                <span className="text-xs text-[#555555]">
                  {containers.length} container
                  {containers.length !== 1 ? "s" : ""}
                </span>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={openAddContainer}
                >
                  Add Container
                </Button>
              </div>
            </div>

            {/* Container Form */}
            {showContainerForm && (
              <div className="px-5 py-4 border-b border-[#1a1a1a] bg-[#0d0d0d]">
                <form onSubmit={handleContainerSubmit} className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <Input
                      id="c-name"
                      label="Name"
                      placeholder="my-container"
                      value={containerForm.name}
                      onChange={(e) =>
                        setContainerForm((f) => ({
                          ...f,
                          name: e.target.value,
                        }))
                      }
                      required
                    />
                    <Input
                      id="c-image"
                      label="Image"
                      placeholder="nginx"
                      value={containerForm.image}
                      onChange={(e) =>
                        setContainerForm((f) => ({
                          ...f,
                          image: e.target.value,
                        }))
                      }
                      required
                    />
                    <Input
                      id="c-tag"
                      label="Tag"
                      placeholder="latest"
                      value={containerForm.tag}
                      onChange={(e) =>
                        setContainerForm((f) => ({ ...f, tag: e.target.value }))
                      }
                    />
                    <Input
                      id="c-replicas"
                      label="Replicas"
                      type="number"
                      min="1"
                      value={containerForm.replicas}
                      onChange={(e) =>
                        setContainerForm((f) => ({
                          ...f,
                          replicas: e.target.value,
                        }))
                      }
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-medium text-[#888888] uppercase tracking-wider">
                        Restart Policy
                      </label>
                      <select
                        value={containerForm.restart_policy}
                        onChange={(e) =>
                          setContainerForm((f) => ({
                            ...f,
                            restart_policy: e.target.value,
                          }))
                        }
                        className="h-9 w-full rounded-lg border border-[#2a2a2a] bg-[#161616] px-3 text-sm text-white cursor-pointer focus:border-[#444444] focus:outline-none"
                      >
                        <option value="no">No</option>
                        <option value="always">Always</option>
                        <option value="unless-stopped">Unless Stopped</option>
                        <option value="on-failure">On Failure</option>
                      </select>
                    </div>
                    <Input
                      id="c-cpu"
                      label="CPU Limit (cores)"
                      placeholder="0.5"
                      value={containerForm.cpu_limit}
                      onChange={(e) =>
                        setContainerForm((f) => ({
                          ...f,
                          cpu_limit: e.target.value,
                        }))
                      }
                    />
                  </div>
                  <Input
                    id="c-memory"
                    label="Memory Limit (MB)"
                    placeholder="512"
                    value={containerForm.memory_limit}
                    onChange={(e) =>
                      setContainerForm((f) => ({
                        ...f,
                        memory_limit: e.target.value,
                      }))
                    }
                  />
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-medium text-[#888888] uppercase tracking-wider">
                      Port Mappings (JSON)
                    </label>
                    <textarea
                      rows={2}
                      value={containerForm.port_mappings}
                      onChange={(e) =>
                        setContainerForm((f) => ({
                          ...f,
                          port_mappings: e.target.value,
                        }))
                      }
                      placeholder='[{"host_port":"8080","container_port":"80","protocol":"tcp"}]'
                      className="w-full rounded-lg border border-[#2a2a2a] bg-[#161616] px-3 py-2 text-sm text-white placeholder:text-[#555555] focus:border-[#444444] focus:outline-none font-mono resize-none"
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-medium text-[#888888] uppercase tracking-wider">
                      Environment Variables (JSON)
                    </label>
                    <textarea
                      rows={2}
                      value={containerForm.env_vars}
                      onChange={(e) =>
                        setContainerForm((f) => ({
                          ...f,
                          env_vars: e.target.value,
                        }))
                      }
                      placeholder='{"NODE_ENV": "production"}'
                      className="w-full rounded-lg border border-[#2a2a2a] bg-[#161616] px-3 py-2 text-sm text-white placeholder:text-[#555555] focus:border-[#444444] focus:outline-none font-mono resize-none"
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-medium text-[#888888] uppercase tracking-wider">
                      Volumes (JSON)
                    </label>
                    <textarea
                      rows={2}
                      value={containerForm.volumes}
                      onChange={(e) =>
                        setContainerForm((f) => ({
                          ...f,
                          volumes: e.target.value,
                        }))
                      }
                      placeholder='{"/host/path": "/container/path"}'
                      className="w-full rounded-lg border border-[#2a2a2a] bg-[#161616] px-3 py-2 text-sm text-white placeholder:text-[#555555] focus:border-[#444444] focus:outline-none font-mono resize-none"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <Input
                      id="c-command"
                      label="Command (JSON array)"
                      placeholder='["npm", "start"]'
                      value={containerForm.command}
                      onChange={(e) =>
                        setContainerForm((f) => ({
                          ...f,
                          command: e.target.value,
                        }))
                      }
                    />
                    <Input
                      id="c-entrypoint"
                      label="Entrypoint (JSON array)"
                      placeholder='["/entrypoint.sh"]'
                      value={containerForm.entrypoint}
                      onChange={(e) =>
                        setContainerForm((f) => ({
                          ...f,
                          entrypoint: e.target.value,
                        }))
                      }
                    />
                  </div>
                  {containerFormError && (
                    <p className="text-xs text-[#f87171]">
                      {containerFormError}
                    </p>
                  )}
                  <div className="flex gap-2">
                    <Button
                      type="submit"
                      size="sm"
                      disabled={containerFormSubmitting}
                    >
                      {containerFormSubmitting
                        ? "Saving..."
                        : editingContainer
                          ? "Update"
                          : "Add"}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setShowContainerForm(false)}
                    >
                      Cancel
                    </Button>
                  </div>
                </form>
              </div>
            )}

            {containers.length === 0 && !showContainerForm ? (
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
                        <td className="px-4 py-3 text-sm font-medium text-white">
                          {container.name}
                        </td>
                        <td className="px-4 py-3 text-sm text-[#888888] font-mono">
                          {container.image}:{container.tag}
                        </td>
                        <td className="px-4 py-3">
                          <StatusBadge status={container.status} />
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              onClick={() =>
                                handleContainerAction(container.id, "restart")
                              }
                              disabled={
                                !!actionLoading[`${container.id}-restart`]
                              }
                              className="px-2 py-1 text-xs text-[#3b82f6] hover:bg-[#161616] rounded transition-colors disabled:opacity-40"
                            >
                              {actionLoading[`${container.id}-restart`]
                                ? "..."
                                : "Restart"}
                            </button>
                            <button
                              onClick={() =>
                                handleContainerAction(container.id, "stop")
                              }
                              disabled={!!actionLoading[`${container.id}-stop`]}
                              className="px-2 py-1 text-xs text-[#f59e0b] hover:bg-[#161616] rounded transition-colors disabled:opacity-40"
                            >
                              {actionLoading[`${container.id}-stop`]
                                ? "..."
                                : "Stop"}
                            </button>
                            <button
                              onClick={() =>
                                handleContainerAction(container.id, "recreate")
                              }
                              disabled={
                                !!actionLoading[`${container.id}-recreate`]
                              }
                              className="px-2 py-1 text-xs text-[#8b5cf6] hover:bg-[#161616] rounded transition-colors disabled:opacity-40"
                            >
                              {actionLoading[`${container.id}-recreate`]
                                ? "..."
                                : "Recreate"}
                            </button>
                            <button
                              onClick={() => openEditContainer(container)}
                              className="px-2 py-1 text-xs text-[#888888] hover:bg-[#161616] hover:text-white rounded transition-colors"
                            >
                              Edit
                            </button>
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
                    <span
                      className={
                        log.stream === "stderr"
                          ? "text-[#ef4444]"
                          : "text-[#888888]"
                      }
                    >
                      {log.message}
                    </span>
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
