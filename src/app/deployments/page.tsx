"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import type { Deployment, Stack } from "@/types";
import {
  reqGetDeployments,
  reqApproveDeployment,
} from "@/services/deployments.service";
import { reqGetStacks } from "@/services/stacks.service";
import { PageLoader } from "@/components/ui/loading";
import { LoadError, loadErrorReason } from "@/components/ui/load-error";
import { StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { BulkActionBar } from "@/components/ui/bulk-action-bar";
import { formatDate, timeAgo, canEdit } from "@/lib/utils";
import { useAdminSocket, AdminSocketEvent } from "@/hooks/useAdminSocket";
import { useSelection } from "@/hooks/useSelection";
import { useBulkAction } from "@/hooks/useBulkAction";
import { useUser } from "@/store/hooks";
import { faCheck } from "@fortawesome/free-solid-svg-icons";

const statusOptions = [
  "all",
  "pending",
  "approved",
  "deploying",
  "deployed",
  "failed",
  "rolled_back",
] as const;

const PAGE_SIZE = 50;

function duration(d: Deployment): string {
  if (!d.started_at) return "—";
  const end = d.completed_at ? new Date(d.completed_at) : new Date();
  const s = Math.max(
    0,
    Math.round((end.getTime() - new Date(d.started_at).getTime()) / 1000),
  );
  const text = s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`;
  return d.completed_at ? text : `${text}…`;
}

export default function DeploymentsPage() {
  const router = useRouter();
  const user = useUser();
  const editable = canEdit(user);
  const [deployments, setDeployments] = useState<Deployment[]>([]);
  const [stacks, setStacks] = useState<Stack[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [stackFilter, setStackFilter] = useState<string>("all");
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  // Debounce socket-driven refreshes so a burst of deployment_progress
  // events doesn't hammer the list endpoints.
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Filters go to the API. They used to be applied in the browser to the 50
  // most recent deployments, so filtering to a quiet stack showed nothing even
  // though it had history — the rows simply weren't in the first page.
  const params = useMemo(
    () => ({
      stack_id: stackFilter === "all" ? undefined : Number(stackFilter),
      status: statusFilter === "all" ? undefined : statusFilter,
    }),
    [stackFilter, statusFilter],
  );

  const load = useCallback(async () => {
    const [depRes, stacksRes] = await Promise.all([
      reqGetDeployments({ ...params, limit: PAGE_SIZE }),
      reqGetStacks(),
    ]);
    if (depRes.success) {
      const rows = depRes.data ?? [];
      setDeployments(rows);
      setHasMore(rows.length === PAGE_SIZE);
      setLoadError(null);
    } else {
      setLoadError(loadErrorReason(depRes));
      toast.error(depRes.error_message || "Failed to load deployments");
    }
    if (stacksRes.success) setStacks(stacksRes.data ?? []);
    setLoading(false);
  }, [params]);

  const loadMore = async () => {
    setLoadingMore(true);
    const res = await reqGetDeployments({
      ...params,
      limit: PAGE_SIZE,
      offset: deployments.length,
    });
    if (res.success) {
      const rows = res.data ?? [];
      setDeployments((prev) => [...prev, ...rows]);
      setHasMore(rows.length === PAGE_SIZE);
    } else {
      toast.error(res.error_message || "Failed to load more deployments");
    }
    setLoadingMore(false);
  };

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

  const stackMap = useMemo(
    () => new Map(stacks.map((s) => [s.id, s.name])),
    [stacks],
  );

  // Only deployments awaiting approval can be acted on from the list.
  const pendingIds = useMemo(
    () => deployments.filter((d) => d.status === "pending").map((d) => d.id),
    [deployments],
  );
  const selection = useSelection(pendingIds);
  const bulk = useBulkAction();

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
      </div>

      <div className="filters-bar">
        <select
          aria-label="Filter by stack"
          value={stackFilter}
          onChange={(e) => setStackFilter(e.target.value)}
          className="form-select !h-8 !w-auto !text-sm cursor-pointer"
        >
          <option value="all">All stacks</option>
          {stacks.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <select
          aria-label="Filter by status"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="form-select !h-8 !w-auto !text-sm cursor-pointer"
        >
          {statusOptions.map((s) => (
            <option key={s} value={s}>
              {s === "all"
                ? "All statuses"
                : s.charAt(0).toUpperCase() + s.slice(1).replace("_", " ")}
            </option>
          ))}
        </select>
        {pendingIds.length > 0 && (
          <span className="ml-auto text-xs text-pending">
            {pendingIds.length} awaiting approval
          </span>
        )}
      </div>

      {editable && (
        <BulkActionBar
          count={selection.count}
          noun="deployment"
          onClear={selection.clear}
          busy={bulk.running}
          actions={[
            {
              label: "Approve",
              icon: faCheck,
              onClick: () =>
                bulk
                  .run({
                    items: selection.selectedIds,
                    verb: "Approve",
                    verbPast: "Approved",
                    noun: "deployment",
                    name: (id) => `#${id}`,
                    action: (id) => reqApproveDeployment(id),
                    confirm: {
                      message: "Each approved deployment starts rolling out immediately.",
                    },
                  })
                  .then((r) => {
                    if (r) {
                      selection.clear();
                      load();
                    }
                  }),
            },
          ]}
        />
      )}

      <div className="py-6">
        {loadError && deployments.length === 0 ? (
          <LoadError
            title="Failed to load deployments"
            message="Couldn't load deployment history."
            reason={loadError}
            onRetry={() => {
              setLoading(true);
              load();
            }}
          />
        ) : (
          <>
            <div className="panel">
              <table className="data-table">
                <thead>
                  <tr>
                    {editable && pendingIds.length > 0 && (
                      <th className="select-col">
                        <Checkbox
                          label="Select all pending deployments"
                          checked={selection.allSelected}
                          indeterminate={selection.someSelected}
                          onChange={selection.toggleAll}
                          disabled={selection.empty}
                        />
                      </th>
                    )}
                    <th>ID</th>
                    <th>Stack</th>
                    <th>Status</th>
                    <th className="hidden sm:table-cell">Strategy</th>
                    <th className="hidden md:table-cell">Started</th>
                    <th className="hidden md:table-cell num">Duration</th>
                  </tr>
                </thead>
                <tbody>
                  {deployments.length === 0 ? (
                    <tr>
                      <td
                        colSpan={7}
                        className="px-4 py-12 text-center text-sm text-muted"
                      >
                        {statusFilter === "all" && stackFilter === "all"
                          ? "No deployments yet"
                          : "No deployments match these filters"}
                      </td>
                    </tr>
                  ) : (
                    deployments.map((d) => (
                      <tr
                        key={d.id}
                        onClick={() => router.push(`/deployments/${d.id}`)}
                        className={selection.isSelected(d.id) ? "is-selected" : ""}
                      >
                        {editable && pendingIds.length > 0 && (
                          <td className="select-col">
                            {d.status === "pending" && (
                              <Checkbox
                                label={`Select deployment #${d.id}`}
                                checked={selection.isSelected(d.id)}
                                onChange={(_, e) =>
                                  selection.toggle(d.id, { shiftKey: e.shiftKey })
                                }
                              />
                            )}
                          </td>
                        )}
                        <td>
                          <Link
                            href={`/deployments/${d.id}`}
                            className="font-medium text-primary hover:text-info transition-colors"
                          >
                            #{d.id}
                          </Link>
                        </td>
                        <td onClick={(e) => e.stopPropagation()}>
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
                        <td className="text-secondary hidden sm:table-cell">
                          {d.strategy}
                        </td>
                        <td
                          className="text-muted hidden md:table-cell whitespace-nowrap"
                          title={d.started_at ? formatDate(d.started_at) : undefined}
                        >
                          {d.started_at ? timeAgo(d.started_at) : "—"}
                        </td>
                        <td className="num text-muted hidden md:table-cell">
                          {duration(d)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            {hasMore && (
              <div className="flex justify-center mt-4">
                <Button
                  variant="secondary"
                  size="sm"
                  loading={loadingMore}
                  onClick={loadMore}
                >
                  Load older deployments
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
