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
import { StatusBadge } from "@/components/ui/badge";
import { Stack, Worker } from "@/types";
import { timeAgo } from "@/lib/utils";
import { useAdminSocket, AdminSocketEvent } from "@/hooks/useAdminSocket";
import { useWorkerLiveness } from "@/hooks/useWorkerLiveness";
import { StalePill } from "@/components/ui/worker-offline-banner";

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
    load();
    const interval = setInterval(load, 15000);
    return () => {
      clearInterval(interval);
      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    };
  }, [load]);

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
          <h1 className="text-xl font-semibold text-white">Containers</h1>
          <p className="text-sm text-[#888888] mt-1">
            {containers.length} container{containers.length !== 1 ? "s" : ""}{" "}
            across all stacks
          </p>
        </div>
        <button
          onClick={load}
          className="inline-flex items-center justify-center font-medium rounded-lg transition-colors cursor-pointer focus:outline-none border border-[#2a2a2a] bg-[#111111] text-white hover:bg-[#1a1a1a] h-8 px-3.5 text-sm gap-1.5"
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
              d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
            />
          </svg>
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
          className="h-8 rounded-lg border border-[#2a2a2a] bg-[#111111] px-3 text-sm text-white placeholder-[#555555] focus:border-[#3b82f6] focus:outline-none w-56"
        />
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className="h-8 rounded-lg border border-[#2a2a2a] bg-[#111111] px-3 text-sm text-white focus:border-[#3b82f6] focus:outline-none cursor-pointer"
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
            className="h-8 rounded-lg border border-[#2a2a2a] bg-[#111111] px-3 text-sm text-white focus:border-[#3b82f6] focus:outline-none cursor-pointer"
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
            className="h-8 rounded-lg border border-[#2a2a2a] bg-[#111111] px-3 text-sm text-white focus:border-[#3b82f6] focus:outline-none cursor-pointer"
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
        <div className="rounded-xl border border-[#1a1a1a] bg-[#111111] p-12 text-center">
          <p className="text-sm text-[#555555]">No containers found</p>
        </div>
      ) : (
        <div className="rounded-xl border border-[#1a1a1a] bg-[#111111] overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-[#1a1a1a]">
                <th className="px-4 py-3 text-left text-xs font-medium text-[#555555] uppercase tracking-wider">
                  Name
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-[#555555] uppercase tracking-wider">
                  Status
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-[#555555] uppercase tracking-wider hidden sm:table-cell">
                  Health
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-[#555555] uppercase tracking-wider hidden md:table-cell">
                  Stack
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-[#555555] uppercase tracking-wider hidden lg:table-cell">
                  Worker
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-[#555555] uppercase tracking-wider hidden lg:table-cell">
                  Image
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-[#555555] uppercase tracking-wider hidden xl:table-cell">
                  Ports
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-[#555555] uppercase tracking-wider hidden xl:table-cell">
                  Updated
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-[#555555] uppercase tracking-wider">
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
                  ? (workerLiveness[worker.id] ?? false)
                  : true; // unknown → don't block
                return (
                  <tr
                    key={c.id}
                    className="hover:bg-[#161616] transition-colors group"
                  >
                    <td className="px-4 py-3">
                      <Link
                        href={`/containers/${c.id}`}
                        className="text-sm font-medium text-white hover:text-[#3b82f6] transition-colors"
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
                        <span className="text-xs text-[#444444]">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell">
                      {stack ? (
                        <Link
                          href={`/stacks/${stack.id}`}
                          className="text-xs text-[#888888] hover:text-white transition-colors"
                        >
                          {stack.name}
                        </Link>
                      ) : (
                        <span className="text-xs text-[#444444]">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 hidden lg:table-cell">
                      {worker ? (
                        <Link
                          href={`/workers/${worker.id}`}
                          className="text-xs text-[#888888] hover:text-white transition-colors"
                        >
                          {worker.name}
                        </Link>
                      ) : (
                        <span className="text-xs text-[#444444]">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 hidden lg:table-cell">
                      <span className="text-xs text-[#888888] font-mono">
                        {c.image}:{c.tag}
                      </span>
                    </td>
                    <td className="px-4 py-3 hidden xl:table-cell">
                      <span className="text-xs text-[#888888] font-mono">
                        {parsePortMappings(c.port_mappings)}
                      </span>
                    </td>
                    <td className="px-4 py-3 hidden xl:table-cell">
                      <span
                        className={`text-xs ${!workerOnline ? "text-[#7c3a00]" : "text-[#555555]"}`}
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
                              <svg
                                className="h-3.5 w-3.5"
                                fill="currentColor"
                                viewBox="0 0 24 24"
                              >
                                <path d="M8 5v14l11-7z" />
                              </svg>
                            )}
                          </button>
                        )}
                        {/* Stop (only when running) */}
                        {c.status === "running" && (
                          <button
                            onClick={() => runAction(c.id, "stop")}
                            disabled={!!busy || !workerOnline}
                            title={!workerOnline ? "Worker offline" : "Stop"}
                            className="h-7 w-7 rounded flex items-center justify-center text-[#888888] hover:text-[#ef4444] hover:bg-[#ef4444]/10 disabled:opacity-40 transition-colors cursor-pointer"
                          >
                            {busy === "stop" ? (
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
                              <svg
                                className="h-3.5 w-3.5"
                                fill="currentColor"
                                viewBox="0 0 24 24"
                              >
                                <rect x="6" y="6" width="12" height="12" />
                              </svg>
                            )}
                          </button>
                        )}
                        {/* Restart */}
                        {c.status === "running" && (
                          <button
                            onClick={() => runAction(c.id, "restart")}
                            disabled={!!busy || !workerOnline}
                            title={!workerOnline ? "Worker offline" : "Restart"}
                            className="h-7 w-7 rounded flex items-center justify-center text-[#888888] hover:text-[#3b82f6] hover:bg-[#3b82f6]/10 disabled:opacity-40 transition-colors cursor-pointer"
                          >
                            {busy === "restart" ? (
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
                            )}
                          </button>
                        )}
                        {/* Recreate */}
                        <button
                          onClick={() => runAction(c.id, "recreate")}
                          disabled={!!busy || !workerOnline}
                          title={!workerOnline ? "Worker offline" : "Recreate"}
                          className="h-7 w-7 rounded flex items-center justify-center text-[#888888] hover:text-[#a855f7] hover:bg-[#a855f7]/10 disabled:opacity-40 transition-colors cursor-pointer"
                        >
                          {busy === "recreate" ? (
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
                          )}
                        </button>
                        {/* Details link */}
                        <Link
                          href={`/containers/${c.id}`}
                          title="View details"
                          className="h-7 w-7 rounded flex items-center justify-center text-[#555555] hover:text-white hover:bg-[#2a2a2a] transition-colors"
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
                              d="M9 5l7 7-7 7"
                            />
                          </svg>
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
