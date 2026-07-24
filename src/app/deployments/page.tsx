"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import toast from "react-hot-toast";
import type { Deployment, Stack } from "@/types";
import { reqGetDeployments } from "@/services/deployments.service";
import { reqGetStacks } from "@/services/stacks.service";
import { PageLoader } from "@/components/ui/loading";
import { LoadError } from "@/components/ui/load-error";
import { StatusBadge } from "@/components/ui/badge";
import { formatDate } from "@/lib/utils";
import { useAdminSocket, AdminSocketEvent } from "@/hooks/useAdminSocket";

const statusOptions = [
  "all",
  "pending",
  "approved",
  "deploying",
  "deployed",
  "failed",
  "rolled_back",
] as const;

export default function DeploymentsPage() {
  const [deployments, setDeployments] = useState<Deployment[]>([]);
  const [stacks, setStacks] = useState<Stack[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [stackFilter, setStackFilter] = useState<string>("all");

  // Debounce socket-driven refreshes so a burst of deployment_progress
  // events doesn't hammer the list endpoints.
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    const [depRes, stacksRes] = await Promise.all([
      reqGetDeployments(),
      reqGetStacks(),
    ]);
    if (depRes.success) {
      setDeployments(depRes.data ?? []);
      setLoadError(false);
    } else {
      setLoadError(true);
      toast.error(depRes.error_message || "Failed to load deployments");
    }
    if (stacksRes.success) setStacks(stacksRes.data ?? []);
    setLoading(false);
  }, []);

  const loadRef = useRef(load);
  loadRef.current = load;

  const scheduleRefresh = useCallback(() => {
    if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    refreshTimerRef.current = setTimeout(() => loadRef.current(), 1500);
  }, []);

  useEffect(() => {
    document.title = "Lattice - Deployments";
  }, []);

  useEffect(() => {
    load();
    return () => {
      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    };
  }, [load]);

  // Live refresh on deployment progress events
  const handleSocketEvent = useCallback(
    (event: AdminSocketEvent) => {
      if (
        event.type === "deployment_progress" ||
        event.type === "deployment_status"
      ) {
        scheduleRefresh();
      }
    },
    [scheduleRefresh],
  );
  useAdminSocket(handleSocketEvent);

  const filtered = deployments.filter((d) => {
    if (statusFilter !== "all" && d.status !== statusFilter) return false;
    if (stackFilter !== "all" && d.stack_id !== Number(stackFilter))
      return false;
    return true;
  });
  const stackMap = new Map(stacks.map((s) => [s.id, s.name]));

  if (loading) return <PageLoader />;

  return (
    <div>
      {/* Page header */}
      <div className="page-header">
        <div className="flex-1">
          <div className="page-title">Deployments</div>
          <div className="page-subtitle">
            Track deployment history and status
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <select
            value={stackFilter}
            onChange={(e) => setStackFilter(e.target.value)}
            className="form-select !h-9 !w-auto !text-sm cursor-pointer"
          >
            <option value="all">All Stacks</option>
            {stacks.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="form-select !h-9 !w-auto !text-sm cursor-pointer"
          >
            {statusOptions.map((s) => (
              <option key={s} value={s}>
                {s === "all"
                  ? "All Statuses"
                  : s.charAt(0).toUpperCase() + s.slice(1).replace("_", " ")}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="py-6">
      {loadError && deployments.length === 0 ? (
        <LoadError
          title="Failed to load deployments"
          message="Could not reach lattice-api to load deployment history."
          onRetry={() => {
            setLoading(true);
            load();
          }}
        />
      ) : (
      <div className="panel">
        <table className="data-table">
          <thead>
            <tr>
              <th>ID</th>
              <th>Stack</th>
              <th>Status</th>
              <th className="hidden sm:table-cell">Strategy</th>
              <th className="hidden md:table-cell">Started</th>
              <th className="hidden md:table-cell">Completed</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td
                  colSpan={6}
                  className="px-4 py-12 text-center text-sm text-muted"
                >
                  No deployments found
                </td>
              </tr>
            ) : (
              filtered.map((d) => (
                <tr key={d.id}>
                  <td>
                    <Link
                      href={`/deployments/${d.id}`}
                      className="font-medium text-primary hover:text-info transition-colors"
                    >
                      #{d.id}
                    </Link>
                  </td>
                  <td>
                    <Link
                      href={`/stacks/${d.stack_id}`}
                      className="text-info hover:underline"
                    >
                      {stackMap.get(d.stack_id) ?? `Stack #${d.stack_id}`}
                    </Link>
                  </td>
                  <td>
                    <StatusBadge status={d.status} />
                  </td>
                  <td className="text-secondary hidden sm:table-cell">{d.strategy}</td>
                  <td className="text-muted hidden md:table-cell">
                    {d.started_at ? formatDate(d.started_at) : "-"}
                  </td>
                  <td className="text-muted hidden md:table-cell">
                    {d.completed_at ? formatDate(d.completed_at) : "-"}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      )}
      </div>
    </div>
  );
}
