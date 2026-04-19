"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import toast from "react-hot-toast";
import { Container, ContainerLog, Stack, Worker } from "@/types";
import {
  reqGetContainer,
  reqUpdateContainer,
  reqGetContainerLogs,
  reqStartContainer,
  reqStopContainer,
  reqKillContainer,
  reqRestartContainer,
  reqPauseContainer,
  reqUnpauseContainer,
  reqRemoveContainer,
  reqRecreateContainer,
} from "@/services/stacks.service";
import { reqGetStack } from "@/services/stacks.service";
import { reqGetWorker } from "@/services/workers.service";
import { PageLoader } from "@/components/ui/loading";
import { StatusBadge } from "@/components/ui/badge";
import { formatDate, timeAgo, workerStaleReason } from "@/lib/utils";
import { useAdminSocket, AdminSocketEvent } from "@/hooks/useAdminSocket";
import { useWorkerLiveness } from "@/hooks/useWorkerLiveness";
import { WorkerOfflineBanner } from "@/components/ui/worker-offline-banner";
import { CodeEditor } from "@/components/ui/code-editor";
import { Alert } from "@/components/ui/alert";
import { useConfirm } from "@/components/ui/confirm-modal";

// ─── helpers ──────────────────────────────────────────────────────────────────

function parseJSON<T>(raw: string | null): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function parsePortMappings(
  raw: string | null,
): { host_port?: string; container_port?: string; protocol?: string }[] {
  return (
    parseJSON<
      { host_port?: string; container_port?: string; protocol?: string }[]
    >(raw) ?? []
  );
}

function parseEnvVars(raw: string | null): Record<string, string> {
  return parseJSON<Record<string, string>>(raw) ?? {};
}

function parseVolumes(
  raw: string | null,
): { host?: string; container?: string }[] {
  const data = parseJSON<
    Record<string, string> | { host?: string; container?: string }[]
  >(raw);
  if (!data) return [];
  if (Array.isArray(data)) return data;
  return Object.entries(data).map(([host, container]) => ({ host, container }));
}

interface HealthCheckConfig {
  test?: string[] | string;
  interval?: string;
  timeout?: string;
  retries?: number;
  start_period?: string;
  disable?: boolean;
}

function parseHealthCheck(raw: string | null): HealthCheckConfig | null {
  return parseJSON<HealthCheckConfig>(raw);
}

function formatTestCommand(test: string[] | string | undefined): string {
  if (!test) return "";
  if (typeof test === "string") return test;
  // ["CMD-SHELL", "curl ..."] or ["CMD", "arg1", "arg2"]
  if (test[0] === "CMD-SHELL" && test.length === 2) return test[1];
  if (test[0] === "CMD") return test.slice(1).join(" ");
  return test.join(" ");
}

function prettyField(raw: string | null): string {
  if (!raw) return "";
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.join(" ");
    return JSON.stringify(parsed, null, 2);
  } catch {
    return raw;
  }
}

// Marker used to identify synthetic (WS/client-side) log entries.
// A string UUID stored in the ContainerLog.id field won't collide with
// integer DB ids and can be detected with typeof.
const SYNTHETIC_ID_PREFIX = "syn_";
function isSynthetic(log: ContainerLog): boolean {
  return (
    typeof log.id === "string" && String(log.id).startsWith(SYNTHETIC_ID_PREFIX)
  );
}
function syntheticId(): string {
  return SYNTHETIC_ID_PREFIX + crypto.randomUUID();
}

const SESSION_GAP_MS = 5_000;

function isNewSession(prev: ContainerLog, curr: ContainerLog): boolean {
  return (
    new Date(curr.recorded_at).getTime() -
      new Date(prev.recorded_at).getTime() >
    SESSION_GAP_MS
  );
}

function SessionBreak({ at }: { at: string }) {
  return (
    <div className="flex items-center gap-2 px-2 py-2 my-1 select-none">
      <div className="flex-1 h-px bg-border-subtle" />
      <span className="text-[10px] font-mono text-muted whitespace-nowrap">
        new session &middot;{" "}
        {new Date(at).toLocaleTimeString([], {
          hour12: false,
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        })}
      </span>
      <div className="flex-1 h-px bg-border-subtle" />
    </div>
  );
}

function LogLine({ line }: { line: ContainerLog }) {
  return (
    <div className="flex gap-2 text-xs font-mono hover:bg-surface-elevated px-2 py-0.5 rounded">
      <span className="text-dimmed shrink-0 select-none w-40">
        {line.recorded_at
          ? new Date(line.recorded_at).toLocaleTimeString([], {
              hour12: false,
              hour: "2-digit",
              minute: "2-digit",
              second: "2-digit",
            })
          : ""}
      </span>
      <span className="text-subtle">{line.message}</span>
    </div>
  );
}

type Tab = "logs" | "details" | "health";

// ─── main page ────────────────────────────────────────────────────────────────

export default function ContainerDetailPage() {
  const params = useParams();
  const id = Number(params.id);

  const [container, setContainer] = useState<Container | null>(null);
  const [stack, setStack] = useState<Stack | null>(null);
  const [worker, setWorker] = useState<Worker | null>(null);
  const [logs, setLogs] = useState<ContainerLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("logs");

  // action state
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // edit state
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState("");
  const [editImage, setEditImage] = useState("");
  const [editTag, setEditTag] = useState("");
  const [editRestartPolicy, setEditRestartPolicy] = useState("");
  const [editCommand, setEditCommand] = useState("");
  const [editEntrypoint, setEditEntrypoint] = useState("");
  const [editCpuLimit, setEditCpuLimit] = useState("");
  const [editMemoryLimit, setEditMemoryLimit] = useState("");
  const [editReplicas, setEditReplicas] = useState("");
  const [editEnvVars, setEditEnvVars] = useState("");
  const [editPortMappings, setEditPortMappings] = useState("");
  const [editVolumes, setEditVolumes] = useState("");
  const [editHealthCheck, setEditHealthCheck] = useState("");
  const [editRegistryId, setEditRegistryId] = useState("");
  const [saving, setSaving] = useState(false);

  const logsEndRef = useRef<HTMLDivElement>(null);
  const containerNameRef = useRef<string>("");
  const showConfirm = useConfirm();

  // Worker liveness — must be declared unconditionally before any early return
  const workerListForLiveness = worker ? [worker] : [];
  const workerLiveness = useWorkerLiveness(workerListForLiveness);

  const loadContainer = useCallback(async () => {
    const res = await reqGetContainer(id);
    if (res.success) {
      setContainer(res.data);
      containerNameRef.current = res.data.name;
      if (!editing) {
        setEditName(res.data.name);
        setEditImage(res.data.image);
        setEditTag(res.data.tag);
        setEditRestartPolicy(res.data.restart_policy ?? "");
        setEditCommand(res.data.command ?? "");
        setEditEntrypoint(res.data.entrypoint ?? "");
        setEditCpuLimit(
          res.data.cpu_limit != null ? String(res.data.cpu_limit) : "",
        );
        setEditMemoryLimit(
          res.data.memory_limit != null ? String(res.data.memory_limit) : "",
        );
        setEditReplicas(String(res.data.replicas));
        setEditEnvVars(res.data.env_vars ?? "");
        setEditPortMappings(res.data.port_mappings ?? "");
        setEditVolumes(res.data.volumes ?? "");
        setEditHealthCheck(res.data.health_check ?? "");
        setEditRegistryId(
          res.data.registry_id != null ? String(res.data.registry_id) : "",
        );
      }
      if (res.data.stack_id) {
        const sRes = await reqGetStack(res.data.stack_id);
        if (sRes.success) {
          setStack(sRes.data);
          if (sRes.data.worker_id) {
            const wRes = await reqGetWorker(sRes.data.worker_id);
            if (wRes.success) setWorker(wRes.data);
          }
        }
      }
    } else {
      console.error(
        `[ContainerInspector] failed to load container ${id}:`,
        res.error_message,
      );
    }
    setLoading(false);
  }, [id, editing]);

  const loadLogs = useCallback(async () => {
    const res = await reqGetContainerLogs(id, { limit: 250 });
    if (res.success) {
      const dbLogs = (res.data ?? []).slice().reverse();
      setLogs((prev) => {
        // Keep synthetic (WS-delivered) entries that haven't been persisted yet.
        // Match by message content to avoid duplicates caused by clock skew.
        const dbMessages = new Set(dbLogs.map((l) => l.message));
        const pendingSynthetics = prev.filter(
          (l) => isSynthetic(l) && !dbMessages.has(l.message),
        );
        return [...dbLogs, ...pendingSynthetics];
      });
    } else {
      console.warn(
        `[ContainerInspector] failed to load logs for container ${id}:`,
        res.error_message,
      );
    }
  }, [id]);

  // WebSocket: refresh on events matching this container
  const handleSocketEvent = useCallback(
    (event: AdminSocketEvent) => {
      const payload = event.payload ?? {};
      const eventName = payload["container_name"] as string | undefined;
      const myName = containerNameRef.current;

      if (!eventName || !myName || eventName !== myName) return;

      if (
        event.type === "container_status" ||
        event.type === "container_sync" ||
        event.type === "container_health_status"
      ) {
        console.log(
          `[ContainerInspector] WS ${event.type} matched "${myName}"`,
          payload,
        );
        loadContainer();
        if (tab === "logs") loadLogs();
      }

      if (event.type === "container_logs") {
        const message = payload["message"] as string | undefined;
        const rawStream = (payload["stream"] as string | undefined) ?? "stdout";
        const stream: "stdout" | "stderr" =
          rawStream === "stderr" ? "stderr" : "stdout";
        if (message) {
          const entry: ContainerLog = {
            id: syntheticId() as unknown as number, // string UUID; isSynthetic() detects it
            container_id: null,
            container_name: myName,
            worker_id: event.worker_id ?? 0,
            stream,
            message,
            recorded_at: new Date().toISOString(),
          };
          setLogs((prev) => [...prev.slice(-249), entry]);
        }
      }
    },
    [loadContainer, loadLogs, tab],
  );
  useAdminSocket(handleSocketEvent);

  useEffect(() => {
    if (container) document.title = `Lattice - ${container.name}`;
  }, [container]);

  useEffect(() => {
    loadContainer();
    loadLogs();
    const interval = setInterval(() => {
      loadContainer();
      if (tab === "logs") loadLogs();
    }, 10000);
    return () => clearInterval(interval);
  }, [loadContainer, loadLogs, tab]);

  useEffect(() => {
    if (tab === "logs")
      logsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs, tab]);

  const runAction = async (
    action: string,
    fn: () => Promise<{ success: boolean; error_message?: string }>,
  ) => {
    const name = containerNameRef.current || String(id);
    const label = action.charAt(0).toUpperCase() + action.slice(1);
    setActionError(null);
    setActionLoading(action);

    const toastId = toast.loading(`Sending ${label.toLowerCase()} to ${name}…`);
    console.log(
      `[ContainerInspector] sending action "${action}" to container ${id} (${name})`,
    );

    try {
      const res = await fn();
      if (res.success) {
        toast.success(`${label} command sent to ${name}`, { id: toastId });
        console.log(`[ContainerInspector] action "${action}" ok for ${name}`);
        // Inject a synthetic system log so the log viewer shows immediate
        // feedback; it's preserved across loadLogs() calls until real logs arrive.
        const lifecycleMsg: Record<string, string> = {
          restart: "[lattice] container restarting\u2026",
          start: "[lattice] container starting\u2026",
          stop: "[lattice] container stopping\u2026",
          kill: "[lattice] container force-killed",
          recreate: "[lattice] container recreating\u2026",
        };
        if (lifecycleMsg[action]) {
          setLogs((prev) => [
            ...prev,
            {
              id: syntheticId() as unknown as number,
              container_id: null,
              container_name: containerNameRef.current,
              worker_id: 0,
              stream: "stdout" as const,
              message: lifecycleMsg[action],
              recorded_at: new Date().toISOString(),
            },
          ]);
        }
      } else {
        const msg = res.error_message ?? "Unknown error";
        toast.error(`${label} failed: ${msg}`, { id: toastId });
        console.error(
          `[ContainerInspector] action "${action}" failed for ${name}:`,
          msg,
        );
        setActionError(msg);
      }
    } catch (err) {
      const msg = String(err);
      toast.error(`${label} error: ${msg}`, { id: toastId });
      console.error(
        `[ContainerInspector] action "${action}" threw for ${name}:`,
        err,
      );
      setActionError(msg);
    }

    setActionLoading(null);
    // Burst-poll to catch state + log changes — new container logs can take
    // several seconds to be persisted after a restart.
    setTimeout(loadContainer, 2000);
    [2000, 5000, 10000, 20000].forEach((d) => setTimeout(loadLogs, d));
  };

  const handleSave = async () => {
    if (!container) return;
    setSaving(true);
    const toastId = toast.loading("Saving container config…");
    const res = await reqUpdateContainer(container.id, {
      name: editName || undefined,
      image: editImage || undefined,
      tag: editTag || undefined,
      restart_policy: editRestartPolicy || undefined,
      command: editCommand || null,
      entrypoint: editEntrypoint || null,
      cpu_limit: editCpuLimit ? Number(editCpuLimit) : null,
      memory_limit: editMemoryLimit ? Number(editMemoryLimit) : null,
      replicas: editReplicas ? Number(editReplicas) : undefined,
      env_vars: editEnvVars || null,
      port_mappings: editPortMappings || null,
      volumes: editVolumes || null,
      health_check: editHealthCheck || null,
      registry_id: editRegistryId ? Number(editRegistryId) : null,
    } as Partial<Container>);
    setSaving(false);
    if (res.success) {
      toast.success("Container config saved", { id: toastId });
      setEditing(false);
      loadContainer();
    } else {
      toast.error(`Save failed: ${res.error_message ?? "unknown error"}`, {
        id: toastId,
      });
    }
  };

  if (loading) return <PageLoader />;
  if (!container) {
    return (
      <div className="rounded-xl border border-border-subtle bg-surface p-12 text-center">
        <p className="text-sm text-muted">Container not found</p>
      </div>
    );
  }

  const ports = parsePortMappings(container.port_mappings);
  const envVars = parseEnvVars(container.env_vars);
  const volumes = parseVolumes(container.volumes);
  const healthConfig = parseHealthCheck(container.health_check);

  const isRunning = container.status === "running";
  const isStopped =
    container.status === "stopped" || container.status === "error";
  const isPaused = container.status === "paused";

  // Derive liveness values from the already-computed map
  const workerOnline = worker ? (workerLiveness[worker.id] ?? true) : true;
  const staleReason = worker ? workerStaleReason(worker) : null;
  const controlsDisabled = !workerOnline || !!actionLoading;

  return (
    <div>
      {/* Worker offline banner */}
      {!workerOnline && (
        <WorkerOfflineBanner workerName={worker?.name} reason={staleReason} />
      )}

      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-muted mb-6">
        <Link
          href="/containers"
          className="hover:text-primary transition-colors"
        >
          Containers
        </Link>
        <svg
          className="h-3 w-3"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M9 5l7 7-7 7"
          />
        </svg>
        <span className="text-primary font-medium">{container.name}</span>
      </div>

      {/* Header */}
      <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-semibold text-primary">
              {container.name}
            </h1>
            <StatusBadge status={container.status} />
            {container.health_status !== "none" && (
              <StatusBadge status={container.health_status} />
            )}
          </div>
          <p className="text-sm text-secondary mt-1 font-mono">
            {container.image}:{container.tag}
          </p>
        </div>
      </div>

      {/* Pending context banner */}
      {container.status === "pending" && (
        <div className="mb-6">
          <Alert variant="warning">
            <strong>Container is pending</strong>
            <br />
            {!worker
              ? "No worker is assigned to this stack. Assign a worker and deploy to start this container."
              : !workerOnline
                ? `Worker "${worker.name}" is offline. The container will start once the worker reconnects.`
                : "This container has been configured but not yet deployed. Click Deploy on the stack page to push it to the worker."}
          </Alert>
        </div>
      )}

      {/* Action buttons */}
      <div className="flex flex-wrap gap-2 mb-6 p-4 rounded-xl border border-border-subtle bg-surface">
        {/* Start */}
        <ActionButton
          label="Start"
          icon={
            <svg
              className="h-3.5 w-3.5"
              fill="currentColor"
              viewBox="0 0 24 24"
            >
              <path d="M8 5v14l11-7z" />
            </svg>
          }
          disabled={!isStopped || controlsDisabled}
          loading={actionLoading === "start"}
          color="text-[#22c55e] hover:bg-[#22c55e]/10"
          onClick={() =>
            runAction("start", () => reqStartContainer(container.id))
          }
        />
        {/* Stop */}
        <ActionButton
          label="Stop"
          icon={
            <svg
              className="h-3.5 w-3.5"
              fill="currentColor"
              viewBox="0 0 24 24"
            >
              <rect x="6" y="6" width="12" height="12" />
            </svg>
          }
          disabled={!isRunning || controlsDisabled}
          loading={actionLoading === "stop"}
          color="text-secondary hover:bg-border-strong"
          onClick={async () => {
            const ok = await showConfirm({
              title: "Stop container",
              message: `Stop "${container.name}"? The container will be gracefully shut down.`,
              confirmLabel: "Stop",
              variant: "warning",
            });
            if (ok) runAction("stop", () => reqStopContainer(container.id));
          }}
        />
        {/* Kill */}
        <ActionButton
          label="Kill"
          icon={
            <svg
              className="h-3.5 w-3.5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          }
          disabled={!isRunning || controlsDisabled}
          loading={actionLoading === "kill"}
          color="text-[#ef4444] hover:bg-[#ef4444]/10"
          onClick={async () => {
            const ok = await showConfirm({
              title: "Kill container",
              message: `Force-kill "${container.name}"? This sends SIGKILL immediately.`,
              confirmLabel: "Kill",
              variant: "danger",
            });
            if (ok) runAction("kill", () => reqKillContainer(container.id));
          }}
        />
        {/* Restart */}
        <ActionButton
          label="Restart"
          icon={
            <svg
              className="h-3.5 w-3.5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
              />
            </svg>
          }
          disabled={!isRunning || controlsDisabled}
          loading={actionLoading === "restart"}
          color="text-[#3b82f6] hover:bg-[#3b82f6]/10"
          onClick={async () => {
            const ok = await showConfirm({
              title: "Restart container",
              message: `Restart "${container.name}"? The container will be stopped and started.`,
              confirmLabel: "Restart",
              variant: "warning",
            });
            if (ok)
              runAction("restart", () => reqRestartContainer(container.id));
          }}
        />
        {/* Pause */}
        <ActionButton
          label="Pause"
          icon={
            <svg
              className="h-3.5 w-3.5"
              fill="currentColor"
              viewBox="0 0 24 24"
            >
              <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
            </svg>
          }
          disabled={!isRunning || controlsDisabled}
          loading={actionLoading === "pause"}
          color="text-secondary hover:bg-border-strong"
          onClick={() =>
            runAction("pause", () => reqPauseContainer(container.id))
          }
        />
        {/* Resume */}
        <ActionButton
          label="Resume"
          icon={
            <svg
              className="h-3.5 w-3.5"
              fill="currentColor"
              viewBox="0 0 24 24"
            >
              <path d="M8 5v14l11-7z" />
            </svg>
          }
          disabled={!isPaused || controlsDisabled}
          loading={actionLoading === "unpause"}
          color="text-[#22c55e] hover:bg-[#22c55e]/10"
          onClick={() =>
            runAction("unpause", () => reqUnpauseContainer(container.id))
          }
        />
        {/* Recreate */}
        <ActionButton
          label="Recreate"
          icon={
            <svg
              className="h-3.5 w-3.5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 4v1m6 11l-6 6-6-6m12-5a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          }
          disabled={controlsDisabled}
          loading={actionLoading === "recreate"}
          color="text-[#a855f7] hover:bg-[#a855f7]/10"
          onClick={async () => {
            const ok = await showConfirm({
              title: "Recreate container",
              message: `Recreate "${container.name}"? The container will be removed and created fresh from its config.`,
              confirmLabel: "Recreate",
              variant: "warning",
            });
            if (ok)
              runAction("recreate", () => reqRecreateContainer(container.id));
          }}
        />
        {/* Remove */}
        <ActionButton
          label="Remove"
          icon={
            <svg
              className="h-3.5 w-3.5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
              />
            </svg>
          }
          disabled={controlsDisabled}
          loading={actionLoading === "remove"}
          color="text-[#ef4444] hover:bg-[#ef4444]/10"
          onClick={async () => {
            const ok = await showConfirm({
              title: "Remove container",
              message: `Permanently remove "${container.name}" from Docker? This cannot be undone.`,
              confirmLabel: "Remove",
              variant: "danger",
            });
            if (ok) runAction("remove", () => reqRemoveContainer(container.id));
          }}
        />
        {/* Edit */}
        <button
          onClick={() => setEditing((e) => !e)}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border-strong px-3 h-8 text-sm font-medium text-secondary hover:text-primary hover:bg-surface-active transition-colors cursor-pointer"
        >
          <svg
            className="h-3.5 w-3.5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
            />
          </svg>
          Edit
        </button>

        {actionError && (
          <div className="ml-auto">
            <Alert variant="error" onDismiss={() => setActionError(null)}>
              {actionError}
            </Alert>
          </div>
        )}
      </div>

      {/* Edit form */}
      {editing && (
        <div className="mb-6 rounded-xl border border-border-strong bg-surface p-5 space-y-4">
          <h2 className="text-sm font-medium text-primary">Edit Container</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs text-secondary mb-1.5">
                Name
              </label>
              <input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                className={inputClass}
              />
            </div>
            <div>
              <label className="block text-xs text-secondary mb-1.5">
                Image
              </label>
              <input
                value={editImage}
                onChange={(e) => setEditImage(e.target.value)}
                className={inputClass}
              />
            </div>
            <div>
              <label className="block text-xs text-secondary mb-1.5">Tag</label>
              <input
                value={editTag}
                onChange={(e) => setEditTag(e.target.value)}
                className={inputClass}
              />
            </div>
            <div>
              <label className="block text-xs text-secondary mb-1.5">
                Restart Policy
              </label>
              <select
                value={editRestartPolicy}
                onChange={(e) => setEditRestartPolicy(e.target.value)}
                className={inputClass}
              >
                <option value="">none</option>
                <option value="always">always</option>
                <option value="unless-stopped">unless-stopped</option>
                <option value="on-failure">on-failure</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-secondary mb-1.5">
                CPU Limit (cores)
              </label>
              <input
                type="number"
                step="0.1"
                min="0"
                value={editCpuLimit}
                onChange={(e) => setEditCpuLimit(e.target.value)}
                placeholder="e.g. 0.5"
                className={inputClass}
              />
            </div>
            <div>
              <label className="block text-xs text-secondary mb-1.5">
                Memory Limit (MB)
              </label>
              <input
                type="number"
                min="0"
                value={editMemoryLimit}
                onChange={(e) => setEditMemoryLimit(e.target.value)}
                placeholder="e.g. 512"
                className={inputClass}
              />
            </div>
            <div>
              <label className="block text-xs text-secondary mb-1.5">
                Replicas
              </label>
              <input
                type="number"
                min="1"
                value={editReplicas}
                onChange={(e) => setEditReplicas(e.target.value)}
                className={inputClass}
              />
            </div>
            <div>
              <label className="block text-xs text-secondary mb-1.5">
                Command
              </label>
              <input
                value={editCommand}
                onChange={(e) => setEditCommand(e.target.value)}
                placeholder="e.g. npm start"
                className={inputClass}
              />
            </div>
            <div>
              <label className="block text-xs text-secondary mb-1.5">
                Entrypoint
              </label>
              <input
                value={editEntrypoint}
                onChange={(e) => setEditEntrypoint(e.target.value)}
                placeholder="e.g. /bin/sh"
                className={inputClass}
              />
            </div>
            <div>
              <label className="block text-xs text-secondary mb-1.5">
                Registry ID
              </label>
              <input
                type="number"
                min="0"
                value={editRegistryId}
                onChange={(e) => setEditRegistryId(e.target.value)}
                placeholder="e.g. 1"
                className={inputClass}
              />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
            <div>
              <label className="block text-xs text-secondary mb-1.5">
                Environment Variables (JSON)
              </label>
              <CodeEditor
                rows={4}
                value={editEnvVars}
                onChange={setEditEnvVars}
                placeholder={'{"KEY": "value"}'}
                language="json"
              />
            </div>
            <div>
              <label className="block text-xs text-secondary mb-1.5">
                Port Mappings (JSON)
              </label>
              <CodeEditor
                rows={4}
                value={editPortMappings}
                onChange={setEditPortMappings}
                placeholder={'[{"host_port": "8080", "container_port": "80"}]'}
                language="json"
              />
            </div>
            <div>
              <label className="block text-xs text-secondary mb-1.5">
                Volumes (JSON)
              </label>
              <CodeEditor
                rows={4}
                value={editVolumes}
                onChange={setEditVolumes}
                placeholder={'[{"host": "/data", "container": "/app/data"}]'}
                language="json"
              />
            </div>
            <div>
              <label className="block text-xs text-secondary mb-1.5">
                Health Check (JSON)
              </label>
              <CodeEditor
                rows={4}
                value={editHealthCheck}
                onChange={setEditHealthCheck}
                placeholder={
                  '{"test": ["CMD", "curl", "-f", "http://localhost"], "interval": "30s", "timeout": "10s", "retries": 3}'
                }
                language="json"
              />
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleSave}
              disabled={saving}
              className="inline-flex items-center justify-center h-8 px-4 text-sm font-medium rounded-lg bg-white text-black hover:bg-zinc-100 disabled:opacity-50 cursor-pointer transition-colors"
            >
              {saving ? "Saving…" : "Save Changes"}
            </button>
            <button
              onClick={() => setEditing(false)}
              className="inline-flex items-center justify-center h-8 px-4 text-sm font-medium rounded-lg border border-border-strong text-secondary hover:text-primary hover:bg-surface-active cursor-pointer transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
        {/* Status card */}
        <div className="lg:col-span-2 rounded-xl border border-border-subtle bg-surface p-5">
          <h2 className="text-xs font-medium text-muted uppercase tracking-wider mb-4">
            Container Status
          </h2>
          <dl className="grid grid-cols-2 gap-x-8 gap-y-3">
            <InfoRow
              label="Container ID"
              value={<span className="font-mono text-xs">{container.id}</span>}
            />
            <InfoRow label="Name" value={container.name} />
            <InfoRow
              label="Status"
              value={<StatusBadge status={container.status} />}
            />
            <InfoRow label="Replicas" value={String(container.replicas)} />
            <InfoRow
              label="Created"
              value={formatDate(container.inserted_at)}
            />
            <InfoRow
              label="Last Updated"
              value={timeAgo(container.updated_at)}
            />
            <InfoRow
              label="Restart Policy"
              value={container.restart_policy ?? "none"}
            />
            {stack && (
              <InfoRow
                label="Stack"
                value={
                  <Link
                    href={`/stacks/${stack.id}`}
                    className="text-[#3b82f6] hover:underline"
                  >
                    {stack.name}
                  </Link>
                }
              />
            )}
            {worker && (
              <InfoRow
                label="Worker"
                value={
                  <Link
                    href={`/workers/${worker.id}`}
                    className="text-[#3b82f6] hover:underline"
                  >
                    {worker.name}
                  </Link>
                }
              />
            )}
          </dl>
        </div>

        {/* Health card */}
        <div className="rounded-xl border border-border-subtle bg-surface p-5">
          <h2 className="text-xs font-medium text-muted uppercase tracking-wider mb-4">
            Health
          </h2>
          {container.health_status === "none" && !healthConfig ? (
            <p className="text-sm text-muted">No health check configured</p>
          ) : (
            <dl className="space-y-3">
              <InfoRow
                label="Health Status"
                value={<StatusBadge status={container.health_status} />}
              />
              {healthConfig && (
                <InfoRow
                  label="Test Command"
                  value={
                    <span className="font-mono text-xs break-all">
                      {formatTestCommand(healthConfig.test)}
                    </span>
                  }
                />
              )}
              {healthConfig?.interval && (
                <InfoRow label="Interval" value={healthConfig.interval} />
              )}
              {healthConfig?.timeout && (
                <InfoRow label="Timeout" value={healthConfig.timeout} />
              )}
            </dl>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="rounded-xl border border-border-subtle bg-surface overflow-hidden">
        <div className="flex border-b border-border-subtle">
          {(["logs", "details", "health"] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-5 py-3 text-sm font-medium capitalize transition-colors cursor-pointer ${
                tab === t
                  ? "text-primary border-b-2 border-[#3b82f6]"
                  : "text-muted hover:text-primary"
              }`}
            >
              {t === "health"
                ? "Health Check"
                : t === "details"
                  ? "Container Details"
                  : "Logs"}
            </button>
          ))}
        </div>

        {/* LOGS TAB */}
        {tab === "logs" && (
          <div className="bg-background-alt min-h-[320px] max-h-[520px] overflow-y-auto p-3">
            {logs.length === 0 ? (
              <p className="text-xs text-dimmed font-mono p-2">
                No logs available
              </p>
            ) : (
              <>
                {logs.map((line, i) => (
                  <div key={String(line.id)}>
                    {i > 0 && isNewSession(logs[i - 1], line) && (
                      <SessionBreak at={line.recorded_at} />
                    )}
                    <LogLine line={line} />
                  </div>
                ))}
                <div ref={logsEndRef} />
              </>
            )}
          </div>
        )}

        {/* DETAILS TAB */}
        {tab === "details" && (
          <div className="p-5 space-y-6">
            {/* Image */}
            <section>
              <h3 className="text-xs font-medium text-muted uppercase tracking-wider mb-3">
                Image
              </h3>
              <p className="text-sm text-primary font-mono">
                {container.image}:{container.tag}
              </p>
            </section>

            {/* Port mappings */}
            <section>
              <h3 className="text-xs font-medium text-muted uppercase tracking-wider mb-3">
                Port Configuration
              </h3>
              {ports.length === 0 ? (
                <p className="text-sm text-muted">No ports exposed</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {ports.map((p, i) => (
                    <span
                      key={i}
                      className="rounded-lg border border-border-strong bg-surface-elevated px-3 py-1 text-xs font-mono text-primary"
                    >
                      {p.host_port ?? "?"}:{p.container_port ?? "?"}
                      {p.protocol && p.protocol !== "tcp"
                        ? `/${p.protocol}`
                        : ""}
                    </span>
                  ))}
                </div>
              )}
            </section>

            {/* Volumes */}
            <section>
              <h3 className="text-xs font-medium text-muted uppercase tracking-wider mb-3">
                Volumes
              </h3>
              {volumes.length === 0 ? (
                <p className="text-sm text-muted">No volumes mounted</p>
              ) : (
                <div className="space-y-1">
                  {volumes.map((v, i) => (
                    <div
                      key={i}
                      className="flex items-center gap-2 text-xs font-mono"
                    >
                      <span className="text-secondary">{v.host ?? "?"}</span>
                      <span className="text-dimmed">→</span>
                      <span className="text-primary">{v.container ?? "?"}</span>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* CMD */}
            {container.command && (
              <section>
                <h3 className="text-xs font-medium text-muted uppercase tracking-wider mb-3">
                  CMD
                </h3>
                <code className="text-sm text-subtle font-mono">
                  {prettyField(container.command)}
                </code>
              </section>
            )}

            {/* ENTRYPOINT */}
            {container.entrypoint && (
              <section>
                <h3 className="text-xs font-medium text-muted uppercase tracking-wider mb-3">
                  ENTRYPOINT
                </h3>
                <code className="text-sm text-subtle font-mono">
                  {prettyField(container.entrypoint)}
                </code>
              </section>
            )}

            {/* Resource limits */}
            <section>
              <h3 className="text-xs font-medium text-muted uppercase tracking-wider mb-3">
                Resource Limits
              </h3>
              <div className="flex flex-wrap gap-4">
                <div>
                  <p className="text-xs text-muted">CPU</p>
                  <p className="text-sm text-primary">
                    {container.cpu_limit != null
                      ? `${container.cpu_limit} cores`
                      : "unlimited"}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted">Memory</p>
                  <p className="text-sm text-primary">
                    {container.memory_limit != null
                      ? `${container.memory_limit} MB`
                      : "unlimited"}
                  </p>
                </div>
              </div>
            </section>

            {/* Environment variables */}
            <section>
              <h3 className="text-xs font-medium text-muted uppercase tracking-wider mb-3">
                Environment Variables
              </h3>
              {Object.keys(envVars).length === 0 ? (
                <p className="text-sm text-muted">No environment variables</p>
              ) : (
                <div className="rounded-lg border border-border-subtle overflow-hidden">
                  <table className="w-full">
                    <tbody className="divide-y divide-[#141414]">
                      {Object.entries(envVars).map(([k, v]) => (
                        <tr key={k}>
                          <td className="px-3 py-2 text-xs font-mono text-secondary w-1/3 align-top">
                            {k}
                          </td>
                          <td className="px-3 py-2 text-xs font-mono text-primary break-all">
                            {v}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </div>
        )}

        {/* HEALTH TAB */}
        {tab === "health" && (
          <div className="p-5 space-y-4">
            <div>
              <h3 className="text-xs font-medium text-muted uppercase tracking-wider mb-3">
                Health Status
              </h3>
              <StatusBadge status={container.health_status} />
            </div>
            {healthConfig ? (
              <>
                {/* Test command */}
                <section>
                  <h3 className="text-xs font-medium text-muted uppercase tracking-wider mb-3">
                    Test Command
                  </h3>
                  <code className="text-sm font-mono text-subtle bg-background-alt rounded-lg px-3 py-2 block whitespace-pre-wrap break-all">
                    {formatTestCommand(healthConfig.test)}
                  </code>
                </section>

                {/* Config table */}
                <section>
                  <h3 className="text-xs font-medium text-muted uppercase tracking-wider mb-3">
                    Configuration
                  </h3>
                  <div className="rounded-lg border border-border-subtle overflow-hidden">
                    <table className="w-full">
                      <tbody className="divide-y divide-[#141414]">
                        {healthConfig.interval && (
                          <tr>
                            <td className="px-3 py-2 text-xs font-mono text-secondary w-1/3">
                              Interval
                            </td>
                            <td className="px-3 py-2 text-xs font-mono text-primary">
                              {healthConfig.interval}
                            </td>
                          </tr>
                        )}
                        {healthConfig.timeout && (
                          <tr>
                            <td className="px-3 py-2 text-xs font-mono text-secondary w-1/3">
                              Timeout
                            </td>
                            <td className="px-3 py-2 text-xs font-mono text-primary">
                              {healthConfig.timeout}
                            </td>
                          </tr>
                        )}
                        {healthConfig.retries != null && (
                          <tr>
                            <td className="px-3 py-2 text-xs font-mono text-secondary w-1/3">
                              Retries
                            </td>
                            <td className="px-3 py-2 text-xs font-mono text-primary">
                              {healthConfig.retries}
                            </td>
                          </tr>
                        )}
                        {healthConfig.start_period && (
                          <tr>
                            <td className="px-3 py-2 text-xs font-mono text-secondary w-1/3">
                              Start Period
                            </td>
                            <td className="px-3 py-2 text-xs font-mono text-primary">
                              {healthConfig.start_period}
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </section>

                <p className="text-xs text-muted">
                  Health checks are configured in your compose file and synced
                  automatically.
                </p>
              </>
            ) : (
              <p className="text-sm text-muted">
                No health check detected. Configure a healthcheck in your
                compose file and redeploy — Lattice will sync it automatically.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── sub-components ───────────────────────────────────────────────────────────

const inputClass =
  "w-full rounded-lg border border-border-strong bg-background-alt px-3 py-1.5 text-sm text-primary placeholder-[#444444] focus:border-[#3b82f6] focus:outline-none";

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="mt-0.5 text-sm text-primary">{value}</dd>
    </div>
  );
}

function ActionButton({
  label,
  icon,
  disabled,
  loading,
  color,
  onClick,
}: {
  label: string;
  icon: React.ReactNode;
  disabled: boolean;
  loading: boolean;
  color: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center gap-1.5 rounded-lg border border-border-strong px-3 h-8 text-sm font-medium transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed ${color}`}
    >
      {loading ? (
        <svg
          className="h-3.5 w-3.5 animate-spin"
          fill="none"
          viewBox="0 0 24 24"
        >
          <circle
            className="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="4"
          />
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8v4l3-3-3-3v4a8 8 0 00-8 8h4z"
          />
        </svg>
      ) : (
        icon
      )}
      {label}
    </button>
  );
}
