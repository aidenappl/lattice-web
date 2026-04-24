"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import toast from "react-hot-toast";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faChevronRight,
  faRecycle,
  faPenToSquare,
  faTerminal,
} from "@fortawesome/free-solid-svg-icons";
import type { Container, Stack, Worker } from "@/types";
import {
  reqGetContainer,
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
import { canEdit, parseHealthCheck, workerStaleReason } from "@/lib/utils";
import { useUser } from "@/store/hooks";
import { useAdminSocket, AdminSocketEvent } from "@/hooks/useAdminSocket";
import { useWorkerLiveness } from "@/hooks/useWorkerLiveness";
import { useContainerLogs } from "@/hooks/useContainerLogs";
import { usePoll } from "@/hooks/usePoll";
import { WorkerOfflineBanner } from "@/components/ui/worker-offline-banner";
import { Alert } from "@/components/ui/alert";
import { useConfirm } from "@/components/ui/confirm-modal";
import WorkerBadge from "@/components/ui/worker-badge";
import { Terminal } from "@/components/ui/terminal";
import { LogViewer } from "@/components/ui/log-viewer";
import { ContainerActionBar, ActionButton } from "@/components/containers/ContainerActionBar";
import { ContainerEditForm } from "@/components/containers/ContainerEditForm";
import { ContainerDetailsTab } from "@/components/containers/ContainerDetailsTab";
import { ContainerHealthTab } from "@/components/containers/ContainerHealthTab";
import { ContainerInfoPanels } from "@/components/containers/ContainerInfoPanels";

type Tab = "logs" | "details" | "health";

// ─── main page ────────────────────────────────────────────────────────────────

export default function ContainerDetailPage() {
  const params = useParams();
  const id = Number(params.id);
  const user = useUser();

  const [container, setContainer] = useState<Container | null>(null);
  const [stack, setStack] = useState<Stack | null>(null);
  const [worker, setWorker] = useState<Worker | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("logs");

  // terminal state
  const [showTerminal, setShowTerminal] = useState(false);

  // action state
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // edit state
  const [editing, setEditing] = useState(false);

  const containerNameRef = useRef<string>("");
  const showConfirm = useConfirm();

  // Mounted ref to prevent state updates after unmount
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  // Container logs hook
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

  // Worker liveness — must be declared unconditionally before any early return
  const workerListForLiveness = worker ? [worker] : [];
  const workerLiveness = useWorkerLiveness(workerListForLiveness);

  const loadContainer = useCallback(async () => {
    const res = await reqGetContainer(id);
    if (!mountedRef.current) return;
    if (res.success) {
      setContainer(res.data);
      containerNameRef.current = res.data.name;
      if (res.data.stack_id) {
        const sRes = await reqGetStack(res.data.stack_id);
        if (!mountedRef.current) return;
        if (sRes.success) {
          setStack(sRes.data);
          if (sRes.data.worker_id) {
            const wRes = await reqGetWorker(sRes.data.worker_id);
            if (!mountedRef.current) return;
            if (wRes.success) setWorker(wRes.data);
          }
        }
      }
    } else {
      if (process.env.NODE_ENV === "development") console.error(
        `[ContainerInspector] failed to load container ${id}:`,
        res.error_message,
      );
    }
    setLoading(false);
  }, [id]);

  const loadLogsForContainer = useCallback(() => {
    loadLogs(id, streamFilter);
  }, [id, streamFilter, loadLogs]);

  // WebSocket: refresh on events matching this container
  const handleSocketEvent = useCallback(
    (event: AdminSocketEvent) => {
      const payload = event.payload ?? {};
      const eventName = payload["container_name"] as string | undefined;
      const myName = containerNameRef.current;

      // Container-specific events — match by container_name
      if (eventName && myName && eventName === myName) {
        if (
          event.type === "container_status" ||
          event.type === "container_sync" ||
          event.type === "container_health_status"
        ) {
          if (process.env.NODE_ENV === "development") console.log(
            `[ContainerInspector] WS ${event.type} matched "${myName}"`,
            payload,
          );
          loadContainer();
          if (tab === "logs") loadLogsForContainer();
        }

        if (event.type === "container_logs" || event.type === "lifecycle_log") {
          handleLogSocketEvent(event, myName);
        }
      }

      // lifecycle_log can also come with a different container_name path
      if (event.type === "lifecycle_log" && !eventName) {
        const lcName = (payload["container_name"] as string) ?? "";
        if (lcName === myName) {
          handleLogSocketEvent(event, myName);
        }
      }

      // Worker-level events: lifecycle logs are written to DB for every
      // container on the worker, so we reload whenever our worker is affected.
      if (
        event.type === "worker_shutdown" ||
        event.type === "worker_crash" ||
        event.type === "worker_disconnected"
      ) {
        const workerID = event.worker_id;
        if (workerID != null) {
          loadContainer();
          if (tab === "logs") {
            setTimeout(loadLogsForContainer, 500);
          }
        }
      }
    },
    [loadContainer, loadLogsForContainer, handleLogSocketEvent, tab],
  );
  useAdminSocket(handleSocketEvent);

  // ──────────────────────────────────────────────────────────────────────────

  useEffect(() => {
    if (container) document.title = `Lattice - ${container.name}`;
  }, [container]);

  // Initial load
  useEffect(() => {
    loadContainer();
    loadLogsForContainer();
  }, [loadContainer, loadLogsForContainer]);

  // 10s polling via usePoll
  usePoll(
    useCallback(() => {
      loadContainer();
      if (tab === "logs") loadLogsForContainer();
    }, [loadContainer, loadLogsForContainer, tab]),
    10000,
  );

  const runAction = async (action: string) => {
    const actionFns: Record<string, () => Promise<{ success: boolean; error_message?: string }>> = {
      start: () => reqStartContainer(container!.id),
      stop: () => reqStopContainer(container!.id),
      kill: () => reqKillContainer(container!.id),
      restart: () => reqRestartContainer(container!.id),
      pause: () => reqPauseContainer(container!.id),
      unpause: () => reqUnpauseContainer(container!.id),
      remove: () => reqRemoveContainer(container!.id),
      recreate: () => reqRecreateContainer(container!.id),
    };
    const fn = actionFns[action];
    if (!fn || !container) return;

    const name = containerNameRef.current || String(id);
    const label = action.charAt(0).toUpperCase() + action.slice(1);
    setActionError(null);
    setActionLoading(action);

    const toastId = toast.loading(`Sending ${label.toLowerCase()} to ${name}\u2026`);
    if (process.env.NODE_ENV === "development") console.log(
      `[ContainerInspector] sending action "${action}" to container ${id} (${name})`,
    );

    try {
      const res = await fn();
      if (res.success) {
        toast.success(`${label} command sent to ${name}`, { id: toastId });
        if (process.env.NODE_ENV === "development") console.log(`[ContainerInspector] action "${action}" ok for ${name}`);
        // Inject a synthetic lifecycle log for immediate feedback.
        const lifecycleMsg: Record<string, string> = {
          restart: "container restarting\u2026",
          start: "container starting\u2026",
          stop: "container stopping\u2026",
          kill: "container force-killed",
          recreate: "container recreating\u2026",
        };
        if (lifecycleMsg[action]) {
          // Use the hook's handleLogSocketEvent to inject lifecycle entry
          const syntheticEvent: AdminSocketEvent = {
            type: "lifecycle_log",
            worker_id: 0,
            payload: {
              container_name: containerNameRef.current,
              message: lifecycleMsg[action],
            },
          };
          handleLogSocketEvent(syntheticEvent, containerNameRef.current);
        }
      } else {
        const msg = res.error_message ?? "Unknown error";
        toast.error(`${label} failed: ${msg}`, { id: toastId });
        if (process.env.NODE_ENV === "development") console.error(
          `[ContainerInspector] action "${action}" failed for ${name}:`,
          msg,
        );
        setActionError(msg);
      }
    } catch (err) {
      const msg = String(err);
      toast.error(`${label} error: ${msg}`, { id: toastId });
      if (process.env.NODE_ENV === "development") console.error(
        `[ContainerInspector] action "${action}" threw for ${name}:`,
        err,
      );
      setActionError(msg);
    }

    setActionLoading(null);
    // Burst-poll to catch state + log changes
    setTimeout(loadContainer, 2000);
    [2000, 5000, 10000, 20000].forEach((d) => setTimeout(loadLogsForContainer, d));
  };

  const handleEditSave = () => {
    setEditing(false);
    loadContainer();
  };

  if (loading) return <PageLoader />;
  if (!container) {
    return (
      <div className="card p-12 text-center">
        <p className="text-sm text-muted">Container not found</p>
      </div>
    );
  }

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
    <div className="p-6 space-y-6">
      {/* Worker offline banner */}
      {!workerOnline && (
        <WorkerOfflineBanner workerName={worker?.name} reason={staleReason} />
      )}

      {/* Header */}
      <div>
        <div className="breadcrumb mb-2">
          <Link
            href="/containers"
            className="breadcrumb-link flex items-center gap-1.5"
          >
            <FontAwesomeIcon
              icon={faChevronRight}
              className="h-3 w-3 rotate-180"
            />
            Containers
          </Link>
          <span className="breadcrumb-sep">/</span>
          <span className="breadcrumb-current">{container.name}</span>
        </div>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="page-title text-xl">{container.name}</h1>
              <StatusBadge status={container.status} />
              {container.health_status !== "none" && (
                <StatusBadge status={container.health_status} />
              )}
            </div>
            <div className="flex items-center gap-3 mt-1.5 text-xs text-muted flex-wrap">
              <span className="font-mono text-secondary">
                {container.image}:{container.tag}
              </span>
              {stack && (
                <>
                  <span className="text-dimmed">·</span>
                  <Link
                    href={`/stacks/${stack.id}`}
                    className="text-info hover:underline"
                  >
                    {stack.name}
                  </Link>
                </>
              )}
              {worker && (
                <>
                  <span className="text-dimmed">·</span>
                  <WorkerBadge id={worker.id} name={worker.name} size="sm" />
                </>
              )}
            </div>
          </div>
          {canEdit(user) && (
            <div className="flex items-center gap-2">
              <button
                onClick={() => setEditing((e) => !e)}
                title="Edit container config"
                className="inline-flex items-center gap-1.5 rounded-lg border border-border-strong px-3 h-8 text-sm font-medium text-secondary hover:text-primary hover:bg-surface-active transition-colors cursor-pointer"
              >
                <FontAwesomeIcon icon={faPenToSquare} className="h-3.5 w-3.5" />
                Edit
              </button>
              {isRunning && worker && (
                <button
                  onClick={() => setShowTerminal(true)}
                  title="Open terminal session"
                  className="inline-flex items-center gap-1.5 rounded-lg border border-border-strong px-3 h-8 text-sm font-medium text-secondary hover:text-primary hover:bg-surface-active transition-colors cursor-pointer"
                >
                  <FontAwesomeIcon icon={faTerminal} className="h-3.5 w-3.5" />
                  Terminal
                </button>
              )}
              <ActionButton
                label="Recreate"
                title="Remove and recreate container from config"
                icon={
                  <FontAwesomeIcon icon={faRecycle} className="h-3.5 w-3.5" />
                }
                disabled={controlsDisabled}
                loading={actionLoading === "recreate"}
                color="text-violet hover:bg-[#a855f7]/10"
                onClick={async () => {
                  const ok = await showConfirm({
                    title: "Recreate container",
                    message: `Recreate "${container.name}"? The container will be removed and created fresh from its config.`,
                    confirmLabel: "Recreate",
                    variant: "warning",
                  });
                  if (ok) runAction("recreate");
                }}
              />
            </div>
          )}
        </div>
      </div>

      {/* Pending context banner */}
      {container.status === "pending" && (
        <Alert variant="warning">
          <strong>Container is pending</strong>
          <br />
          {!worker
            ? "No worker is assigned to this stack. Assign a worker and deploy to start this container."
            : !workerOnline
              ? `Worker "${worker.name}" is offline. The container will start once the worker reconnects.`
              : "This container has been configured but not yet deployed. Click Deploy on the stack page to push it to the worker."}
        </Alert>
      )}

      {/* Action bar */}
      {canEdit(user) && (
        <ContainerActionBar
          containerName={container.name}
          containerId={container.id}
          isRunning={isRunning}
          isStopped={isStopped}
          isPaused={isPaused}
          controlsDisabled={controlsDisabled}
          actionLoading={actionLoading}
          actionError={actionError}
          onAction={runAction}
          onClearError={() => setActionError(null)}
          showConfirm={showConfirm}
        />
      )}

      {/* Edit form */}
      {editing && canEdit(user) && (
        <ContainerEditForm
          container={container}
          onSave={handleEditSave}
          onCancel={() => setEditing(false)}
        />
      )}

      {/* Info panels */}
      <ContainerInfoPanels container={container} healthConfig={healthConfig} />

      {/* Tabs */}
      <div className="panel">
        <div className="tabs-bar !px-4 !gap-0" role="tablist">
          {(["logs", "details", "health"] as Tab[]).map((t) => (
            <button
              key={t}
              role="tab"
              aria-selected={tab === t}
              tabIndex={tab === t ? 0 : -1}
              onClick={() => setTab(t)}
              className={`tab-item ${tab === t ? "active" : ""}`}
            >
              {t === "health"
                ? "Health Check"
                : t === "details"
                  ? "Details"
                  : "Logs"}
            </button>
          ))}
        </div>

        {/* LOGS TAB */}
        {tab === "logs" && (
          <>
            <div className="flex items-center gap-2 px-4 py-2 border-b border-border-subtle">
              <select
                value={streamFilter}
                onChange={(e) => setStreamFilter(e.target.value)}
                className="bg-surface-elevated border border-border-strong text-foreground px-2 py-1 rounded-md text-xs cursor-pointer"
              >
                <option value="all">All streams</option>
                <option value="stdout">stdout</option>
                <option value="stderr">stderr</option>
              </select>
              <button
                onClick={loadLogsForContainer}
                className="text-xs text-info hover:text-info transition-colors cursor-pointer"
              >
                Refresh
              </button>
            </div>
            <LogViewer
              logs={logs}
              logLimit={logLimit}
              onLimitChange={setLogLimit}
              onDownloadVisible={() => handleDownloadVisible(container.name)}
              onDownloadLastRun={() => handleDownloadLastRun(container.name)}
              onDownloadAll={() => handleDownloadAll(container.id, container.name)}
              loading={logsLoading}
            />
          </>
        )}

        {/* DETAILS TAB */}
        {tab === "details" && <ContainerDetailsTab container={container} />}

        {/* HEALTH TAB */}
        {tab === "health" && (
          <ContainerHealthTab container={container} healthConfig={healthConfig} />
        )}
      </div>

      {/* Terminal modal */}
      {showTerminal && container && worker && (
        <Terminal
          containerId={container.id}
          containerName={container.name}
          workerId={worker.id}
          onClose={() => setShowTerminal(false)}
        />
      )}
    </div>
  );
}
