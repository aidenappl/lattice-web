"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import Link from "next/link";
import toast from "react-hot-toast";
import { Container } from "@/types";
import {
  reqGetAllContainers,
  reqStartContainer,
  reqStopContainer,
  reqRestartContainer,
  reqRecreateContainer,
} from "@/services/stacks.service";
import { reqGetWorkers } from "@/services/workers.service";
import { reqGetStacks } from "@/services/stacks.service";
import { PageLoader } from "@/components/ui/loading";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faRotate,
  faPlay,
  faStop,
  faSpinner,
  faArrowsRotate,
  faChevronRight,
} from "@fortawesome/free-solid-svg-icons";
import { StatusBadge } from "@/components/ui/badge";
import { Stack, Worker } from "@/types";
import { timeAgo } from "@/lib/utils";
import { useAdminSocket, AdminSocketEvent } from "@/hooks/useAdminSocket";
import { useWorkerLiveness } from "@/hooks/useWorkerLiveness";
import { StalePill } from "@/components/ui/worker-offline-banner";
import { useConfirm } from "@/components/ui/confirm-modal";

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

  const [actionLoading, setActionLoading] = useState<Record<number, string>>(
    {},
  );
  const showConfirm = useConfirm();

  // Debounce socket-driven refreshes
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    const [cRes, sRes, wRes] = await Promise.all([
      reqGetAllContainers(),
      reqGetStacks(),
      reqGetWorkers(),
    ]);
    if (cRes.success) setContainers(cRes.data ?? []);
    else console.error("[Containers] failed to load:", cRes.error_message);
    if (sRes.success) setStacks(sRes.data ?? []);
    if (wRes.success) setWorkers(wRes.data ?? []);
    setLoading(false);
  }, []);

  const scheduleRefresh = useCallback(() => {
    if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    refreshTimerRef.current = setTimeout(load, 1500);
  }, [load]);

  // Real-time WebSocket updates
  const handleSocketEvent = useCallback(
    (event: AdminSocketEvent) => {
      if (
        event.type === "container_sync" ||
        event.type === "container_status" ||
        event.type === "container_health_status"
      ) {
        const name = (event.payload?.["container_name"] as string) ?? "?";
        console.log(
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

  const confirmAndRun = async (id: number, action: string) => {
    const container = containers.find((c) => c.id === id);
    const name = container?.name ?? String(id);
    const confirmMap: Record<
      string,
      { title: string; message: string; variant: "danger" | "warning" }
    > = {
      stop: {
        title: "Stop container",
        message: `Stop "${name}"? The container will be gracefully shut down.`,
        variant: "warning",
      },
      restart: {
        title: "Restart container",
        message: `Restart "${name}"? The container will be stopped and started.`,
        variant: "warning",
      },
      recreate: {
        title: "Recreate container",
        message: `Recreate "${name}"? The container will be removed and created fresh.`,
        variant: "warning",
      },
    };
    const conf = confirmMap[action];
    if (conf) {
      const ok = await showConfirm({
        ...conf,
        confirmLabel: conf.title.split(" ")[0],
      });
      if (!ok) return;
    }
    runAction(id, action);
  };

  const runAction = async (id: number, action: string) => {
    const container = containers.find((c) => c.id === id);
    const name = container?.name ?? String(id);
    const label = action.charAt(0).toUpperCase() + action.slice(1);

    setActionLoading((p) => ({ ...p, [id]: action }));
    const toastId = toast.loading(`Sending ${label.toLowerCase()} to ${name}…`);

    try {
      const fns: Record<
        string,
        (id: number) => Promise<{ success: boolean; error_message?: string }>
      > = {
        start: reqStartContainer,
        stop: reqStopContainer,
        restart: reqRestartContainer,
        recreate: reqRecreateContainer,
      };
      const res = await fns[action]?.(id);
      if (res?.success) {
        toast.success(`${label} command sent to ${name}`, { id: toastId });
        console.log(`[Containers] ${action} ok for container ${id} (${name})`);
      } else {
        const msg = res?.error_message ?? "Unknown error";
        toast.error(`${label} failed: ${msg}`, { id: toastId });
        console.error(`[Containers] ${action} failed for ${name}:`, msg);
      }
    } catch (err) {
      toast.error(`${label} error: ${String(err)}`, { id: toastId });
      console.error(`[Containers] ${action} threw for ${name}:`, err);
    }

    setActionLoading((p) => {
      const n = { ...p };
      delete n[id];
      return n;
    });
    setTimeout(load, 2500);
  };

  const stackMap = Object.fromEntries(stacks.map((s) => [s.id, s]));
  const workerMap = Object.fromEntries(workers.map((w) => [w.id, w]));
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
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-primary">Containers</h1>
          <p className="text-sm text-secondary mt-1">
            {containers.length} container{containers.length !== 1 ? "s" : ""}{" "}
            across all stacks
          </p>
        </div>
        <button
          onClick={load}
          className="inline-flex items-center justify-center font-medium rounded-lg transition-colors cursor-pointer focus:outline-none border border-border-strong bg-surface text-primary hover:bg-surface-active h-8 px-3.5 text-sm gap-1.5"
        >
          <FontAwesomeIcon icon={faRotate} className="h-3.5 w-3.5" />
          Refresh
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 mb-4">
        <input
          type="text"
          placeholder="Search by name or image…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-8 rounded-lg border border-border-strong bg-surface px-3 text-sm text-primary placeholder-[#555555] focus:border-[#3b82f6] focus:outline-none w-56"
        />
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className="h-8 rounded-lg border border-border-strong bg-surface px-3 text-sm text-primary focus:border-[#3b82f6] focus:outline-none cursor-pointer"
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
            className="h-8 rounded-lg border border-border-strong bg-surface px-3 text-sm text-primary focus:border-[#3b82f6] focus:outline-none cursor-pointer"
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
            className="h-8 rounded-lg border border-border-strong bg-surface px-3 text-sm text-primary focus:border-[#3b82f6] focus:outline-none cursor-pointer"
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

      {filtered.length === 0 ? (
        <div className="rounded-xl border border-border-subtle bg-surface p-12 text-center">
          <p className="text-sm text-muted">No containers found</p>
        </div>
      ) : (
        <div className="rounded-xl border border-border-subtle bg-surface overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border-subtle">
                <th className="px-4 py-3 text-left text-xs font-medium text-muted uppercase tracking-wider">
                  Name
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted uppercase tracking-wider">
                  Status
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted uppercase tracking-wider hidden sm:table-cell">
                  Health
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted uppercase tracking-wider hidden md:table-cell">
                  Stack
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted uppercase tracking-wider hidden lg:table-cell">
                  Worker
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted uppercase tracking-wider hidden lg:table-cell">
                  Image
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted uppercase tracking-wider hidden xl:table-cell">
                  Ports
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted uppercase tracking-wider hidden xl:table-cell">
                  Updated
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-muted uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#141414]">
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
                        className="text-sm font-medium text-primary hover:text-[#3b82f6] transition-colors"
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
                        <Link
                          href={`/workers/${worker.id}`}
                          className="text-xs text-secondary hover:text-primary transition-colors"
                        >
                          {worker.name}
                        </Link>
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
                        className={`text-xs ${!workerOnline ? "text-[#7c3a00]" : "text-muted"}`}
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
                            title={!workerOnline ? "Worker offline" : "Start"}
                            className="h-7 w-7 rounded flex items-center justify-center text-[#22c55e] hover:bg-[#22c55e]/10 disabled:opacity-40 transition-colors cursor-pointer"
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
                        {/* Stop (only when running) */}
                        {c.status === "running" && (
                          <button
                            onClick={() => confirmAndRun(c.id, "stop")}
                            disabled={!!busy || !workerOnline}
                            title={!workerOnline ? "Worker offline" : "Stop"}
                            className="h-7 w-7 rounded flex items-center justify-center text-secondary hover:text-[#ef4444] hover:bg-[#ef4444]/10 disabled:opacity-40 transition-colors cursor-pointer"
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
                            onClick={() => confirmAndRun(c.id, "restart")}
                            disabled={!!busy || !workerOnline}
                            title={!workerOnline ? "Worker offline" : "Restart"}
                            className="h-7 w-7 rounded flex items-center justify-center text-secondary hover:text-[#3b82f6] hover:bg-[#3b82f6]/10 disabled:opacity-40 transition-colors cursor-pointer"
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
                          onClick={() => confirmAndRun(c.id, "recreate")}
                          disabled={!!busy || !workerOnline}
                          title={!workerOnline ? "Worker offline" : "Recreate"}
                          className="h-7 w-7 rounded flex items-center justify-center text-secondary hover:text-[#a855f7] hover:bg-[#a855f7]/10 disabled:opacity-40 transition-colors cursor-pointer"
                        >
                          {busy === "recreate" ? (
                            <FontAwesomeIcon
                              icon={faSpinner}
                              className="h-3.5 w-3.5 animate-spin"
                            />
                          ) : (
                            <FontAwesomeIcon
                              icon={faArrowsRotate}
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
  );
}
