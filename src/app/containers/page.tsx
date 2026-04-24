"use client";

import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import Link from "next/link";
import type { Container, Stack, Worker } from "@/types";
import {
  reqGetAllContainers,
  reqGetStacks,
} from "@/services/stacks.service";
import { reqGetWorkers } from "@/services/workers.service";
import { PageLoader } from "@/components/ui/loading";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faRotate,
  faPlay,
  faStop,
  faSpinner,
  faRecycle,
  faChevronRight,
} from "@fortawesome/free-solid-svg-icons";
import { StatusBadge } from "@/components/ui/badge";
import { timeAgo } from "@/lib/utils";
import { useAdminSocket, AdminSocketEvent } from "@/hooks/useAdminSocket";
import { useWorkerLiveness } from "@/hooks/useWorkerLiveness";
import { useContainerActions } from "@/hooks/useContainerActions";
import { StalePill } from "@/components/ui/worker-offline-banner";
import WorkerBadge from "@/components/ui/worker-badge";

function parsePortMappings(raw: string | null): string {
  if (!raw) return "—";
  try {
    const arr: {
      host_port?: string;
      container_port?: string;
      protocol?: string;
    }[] = JSON.parse(raw);
    if (!Array.isArray(arr) || arr.length === 0) return "—";
    return arr
      .map(
        (p) =>
          `${p.host_port ?? "?"}:${p.container_port ?? "?"}${p.protocol && p.protocol !== "tcp" ? `/${p.protocol}` : ""}`,
      )
      .join(", ");
  } catch {
    return raw;
  }
}

export default function ContainersPage() {
  const [containers, setContainers] = useState<Container[]>([]);
  const [stacks, setStacks] = useState<Stack[]>([]);
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [filterStack, setFilterStack] = useState<string>("all");
  const [filterWorker, setFilterWorker] = useState<string>("all");
  const [search, setSearch] = useState<string>("");

  // Debounce socket-driven refreshes
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    const [cRes, sRes, wRes] = await Promise.all([
      reqGetAllContainers(),
      reqGetStacks(),
      reqGetWorkers(),
    ]);
    if (cRes.success) setContainers(cRes.data ?? []);
    else if (process.env.NODE_ENV === "development") console.error("[Containers] failed to load:", cRes.error_message);
    if (sRes.success) setStacks(sRes.data ?? []);
    if (wRes.success) setWorkers(wRes.data ?? []);
    setLoading(false);
  }, []);

  // Use a ref for load to avoid stale closure in scheduleRefresh
  const loadRef = useRef(load);
  loadRef.current = load;

  const scheduleRefresh = useCallback(() => {
    if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    refreshTimerRef.current = setTimeout(() => loadRef.current(), 1500);
  }, []);

  const { actionLoading, performAction } = useContainerActions(load);

  // Real-time WebSocket updates
  const handleSocketEvent = useCallback(
    (event: AdminSocketEvent) => {
      if (
        event.type === "container_sync" ||
        event.type === "container_status" ||
        event.type === "container_health_status"
      ) {
        const name = (event.payload?.["container_name"] as string) ?? "?";
        if (process.env.NODE_ENV === "development") console.log(
          `[Containers] WS ${event.type} for "${name}"`,
          event.payload,
        );
        scheduleRefresh();
      }
    },
    [scheduleRefresh],
  );
  useAdminSocket(handleSocketEvent);

  useEffect(() => {
    document.title = "Lattice - Containers";
  }, []);

  useEffect(() => {
    load();
    const interval = setInterval(load, 15000);
    return () => {
      clearInterval(interval);
      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    };
  }, [load]);

  const runAction = useCallback(
    (id: number, action: string) => {
      const container = containers.find((c) => c.id === id);
      performAction(id, action, container?.name);
    },
    [containers, performAction],
  );

  const stackMap = useMemo(
    () => Object.fromEntries(stacks.map((s) => [s.id, s])),
    [stacks],
  );
  const workerMap = useMemo(
    () => Object.fromEntries(workers.map((w) => [w.id, w])),
    [workers],
  );
  const workerLiveness = useWorkerLiveness(workers);

  const filtered = containers.filter((c) => {
    if (filterStatus !== "all" && c.status !== filterStatus) return false;
    if (filterStack !== "all" && String(c.stack_id) !== filterStack)
      return false;
    if (filterWorker !== "all") {
      const stack = stackMap[c.stack_id];
      if (!stack || String(stack.worker_id) !== filterWorker) return false;
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      if (
        !c.name.toLowerCase().includes(q) &&
        !c.image.toLowerCase().includes(q)
      )
        return false;
    }
    return true;
  });

  if (loading) return <PageLoader />;

  return (
    <div>
      {/* Page header */}
      <div className="page-header">
        <div className="flex-1">
          <div className="page-title">Containers</div>
          <div className="page-subtitle">
            {containers.length} container{containers.length !== 1 ? "s" : ""}{" "}
            across all stacks
          </div>
        </div>
        <button onClick={load} className="btn btn-secondary">
          <FontAwesomeIcon icon={faRotate} className="h-3.5 w-3.5" />
          Refresh
        </button>
      </div>

      {/* Filters */}
      <div className="filters-bar">
        <input
          type="text"
          placeholder="Search by name or image..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="form-input w-56 !h-8 !text-sm"
        />
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className="form-select !h-8 !w-auto !text-sm cursor-pointer"
        >
          <option value="all">All statuses</option>
          <option value="running">Running</option>
          <option value="stopped">Stopped</option>
          <option value="paused">Paused</option>
          <option value="error">Error</option>
          <option value="pending">Pending</option>
        </select>
        {stacks.length > 0 && (
          <select
            value={filterStack}
            onChange={(e) => setFilterStack(e.target.value)}
            className="form-select !h-8 !w-auto !text-sm cursor-pointer"
          >
            <option value="all">All stacks</option>
            {stacks.map((s) => (
              <option key={s.id} value={String(s.id)}>
                {s.name}
              </option>
            ))}
          </select>
        )}
        {workers.length > 0 && (
          <select
            value={filterWorker}
            onChange={(e) => setFilterWorker(e.target.value)}
            className="form-select !h-8 !w-auto !text-sm cursor-pointer"
          >
            <option value="all">All workers</option>
            {workers.map((w) => (
              <option key={w.id} value={String(w.id)}>
                {w.name}
              </option>
            ))}
          </select>
        )}
      </div>

      <div className="p-6">
      {filtered.length === 0 ? (
        <div className="card p-12 text-center">
          <p className="text-sm text-muted">No containers found</p>
        </div>
      ) : (
        <div className="panel">
          <table className="data-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Status</th>
                <th className="hidden sm:table-cell">Health</th>
                <th className="hidden md:table-cell">Stack</th>
                <th className="hidden lg:table-cell">Worker</th>
                <th className="hidden lg:table-cell">Image</th>
                <th className="hidden xl:table-cell">Ports</th>
                <th className="hidden xl:table-cell">Updated</th>
                <th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => {
                const stack = stackMap[c.stack_id];
                const worker = stack?.worker_id
                  ? workerMap[stack.worker_id]
                  : undefined;
                const busy = actionLoading[c.id];
                const workerOnline = worker
                  ? (workerLiveness[worker.id] ?? true)
                  : true; // unknown → don't block
                return (
                  <tr
                    key={c.id}
                    className="hover:bg-surface-elevated transition-colors group"
                  >
                    <td className="px-4 py-3">
                      <Link
                        href={`/containers/${c.id}`}
                        className="text-sm font-medium text-primary hover:text-info transition-colors"
                      >
                        {c.name}
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <StatusBadge status={c.status} />
                        {!workerOnline && <StalePill />}
                      </div>
                    </td>
                    <td className="px-4 py-3 hidden sm:table-cell">
                      {c.health_status && c.health_status !== "none" ? (
                        <StatusBadge status={c.health_status} />
                      ) : (
                        <span className="text-xs text-dimmed">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell">
                      {stack ? (
                        <Link
                          href={`/stacks/${stack.id}`}
                          className="text-xs text-secondary hover:text-primary transition-colors"
                        >
                          {stack.name}
                        </Link>
                      ) : (
                        <span className="text-xs text-dimmed">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 hidden lg:table-cell">
                      {worker ? (
                        <WorkerBadge
                          id={worker.id}
                          name={worker.name}
                          size="sm"
                        />
                      ) : (
                        <span className="text-xs text-dimmed">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 hidden lg:table-cell">
                      <span className="text-xs text-secondary font-mono">
                        {c.image}:{c.tag}
                      </span>
                    </td>
                    <td className="px-4 py-3 hidden xl:table-cell">
                      <span className="text-xs text-secondary font-mono">
                        {parsePortMappings(c.port_mappings)}
                      </span>
                    </td>
                    <td className="px-4 py-3 hidden xl:table-cell">
                      <span
                        className={`text-xs ${!workerOnline ? "text-pending" : "text-muted"}`}
                      >
                        {timeAgo(c.updated_at)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        {/* Start (only when stopped/error) */}
                        {(c.status === "stopped" || c.status === "error") && (
                          <button
                            onClick={() => runAction(c.id, "start")}
                            disabled={!!busy || !workerOnline}
                            title={!workerOnline ? "Worker offline" : "Start container"}
                            aria-label="Start container"
                            className="h-7 w-7 rounded flex items-center justify-center text-healthy hover:bg-healthy/10 disabled:opacity-40 transition-colors cursor-pointer"
                          >
                            {busy === "start" ? (
                              <FontAwesomeIcon
                                icon={faSpinner}
                                className="h-3.5 w-3.5 animate-spin"
                              />
                            ) : (
                              <FontAwesomeIcon
                                icon={faPlay}
                                className="h-3.5 w-3.5"
                              />
                            )}
                          </button>
                        )}
                        {/* Resume (only when paused) */}
                        {c.status === "paused" && (
                          <button
                            onClick={() => runAction(c.id, "unpause")}
                            disabled={!!busy || !workerOnline}
                            title={!workerOnline ? "Worker offline" : "Resume container"}
                            aria-label="Resume container"
                            className="h-7 w-7 rounded flex items-center justify-center text-healthy hover:bg-healthy/10 disabled:opacity-40 transition-colors cursor-pointer"
                          >
                            {busy === "unpause" ? (
                              <FontAwesomeIcon
                                icon={faSpinner}
                                className="h-3.5 w-3.5 animate-spin"
                              />
                            ) : (
                              <FontAwesomeIcon
                                icon={faPlay}
                                className="h-3.5 w-3.5"
                              />
                            )}
                          </button>
                        )}
                        {/* Stop (only when running) */}
                        {c.status === "running" && (
                          <button
                            onClick={() => runAction(c.id, "stop")}
                            disabled={!!busy || !workerOnline}
                            title={!workerOnline ? "Worker offline" : "Stop container"}
                            aria-label="Stop container"
                            className="h-7 w-7 rounded flex items-center justify-center text-secondary hover:text-failed hover:bg-failed/10 disabled:opacity-40 transition-colors cursor-pointer"
                          >
                            {busy === "stop" ? (
                              <FontAwesomeIcon
                                icon={faSpinner}
                                className="h-3.5 w-3.5 animate-spin"
                              />
                            ) : (
                              <FontAwesomeIcon
                                icon={faStop}
                                className="h-3.5 w-3.5"
                              />
                            )}
                          </button>
                        )}
                        {/* Restart */}
                        {c.status === "running" && (
                          <button
                            onClick={() => runAction(c.id, "restart")}
                            disabled={!!busy || !workerOnline}
                            title={!workerOnline ? "Worker offline" : "Restart container"}
                            aria-label="Restart container"
                            className="h-7 w-7 rounded flex items-center justify-center text-secondary hover:text-info hover:bg-info/10 disabled:opacity-40 transition-colors cursor-pointer"
                          >
                            {busy === "restart" ? (
                              <FontAwesomeIcon
                                icon={faSpinner}
                                className="h-3.5 w-3.5 animate-spin"
                              />
                            ) : (
                              <FontAwesomeIcon
                                icon={faRotate}
                                className="h-3.5 w-3.5"
                              />
                            )}
                          </button>
                        )}
                        {/* Recreate */}
                        <button
                          onClick={() => runAction(c.id, "recreate")}
                          disabled={!!busy || !workerOnline}
                          title={!workerOnline ? "Worker offline" : "Remove and recreate container from config"}
                          aria-label="Recreate container"
                          className="h-7 w-7 rounded flex items-center justify-center text-secondary hover:text-violet hover:bg-violet/10 disabled:opacity-40 transition-colors cursor-pointer"
                        >
                          {busy === "recreate" ? (
                            <FontAwesomeIcon
                              icon={faSpinner}
                              className="h-3.5 w-3.5 animate-spin"
                            />
                          ) : (
                            <FontAwesomeIcon
                              icon={faRecycle}
                              className="h-3.5 w-3.5"
                            />
                          )}
                        </button>
                        {/* Details link */}
                        <Link
                          href={`/containers/${c.id}`}
                          title="View details"
                          className="h-7 w-7 rounded flex items-center justify-center text-muted hover:text-primary hover:bg-border-strong transition-colors"
                        >
                          <FontAwesomeIcon
                            icon={faChevronRight}
                            className="h-3.5 w-3.5"
                          />
                        </Link>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      </div>
    </div>
  );
}
