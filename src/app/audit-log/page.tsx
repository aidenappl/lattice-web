"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { reqGetAuditLog, reqGetUsers } from "@/services/admin.service";
import type { AuditLogEntry, AuditLogQuery, User } from "@/types";
import { PageLoader } from "@/components/ui/loading";
import { LoadError } from "@/components/ui/load-error";
import { Button } from "@/components/ui/button";
import { formatDate, timeAgo } from "@/lib/utils";
import { toCSV, downloadText } from "@/lib/csv";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faFileExport, faXmark } from "@fortawesome/free-solid-svg-icons";
import toast from "react-hot-toast";

const PAGE_SIZE = 100;
// lattice-api caps a page at 500; an export walks pages up to this many rows.
const EXPORT_PAGE = 500;
const EXPORT_MAX = 10_000;

const actionColors: Record<string, string> = {
  create: "text-healthy",
  update: "text-info",
  delete: "text-failed",
  deploy: "text-violet",
  login: "text-pending",
  approve: "text-healthy",
  rollback: "text-pending",
};

function actionColor(action: string): string {
  const key = Object.keys(actionColors).find((k) =>
    action.toLowerCase().includes(k),
  );
  return key ? actionColors[key] : "text-secondary";
}

// Resources with a detail page. Others render as plain text.
const RESOURCE_ROUTES: Record<string, string> = {
  stack: "/stacks",
  container: "/containers",
  worker: "/workers",
  deployment: "/deployments",
  database_instance: "/databases",
  automation: "/automations",
};

/** <input type="date"> value (local day) → RFC 3339 at local midnight. */
function dayStart(day: string, addDays = 0): string {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(y, m - 1, d + addDays).toISOString();
}

export default function AuditLogPage() {
  const [entries, setEntries] = useState<AuditLogEntry[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [exporting, setExporting] = useState(false);

  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [userFilter, setUserFilter] = useState("all");
  const [resourceFilter, setResourceFilter] = useState("all");
  const [actionFilter, setActionFilter] = useState("all");
  const [fromDay, setFromDay] = useState("");
  const [toDay, setToDay] = useState("");

  // Option lists grow as entries are seen. Filtering is server-side now, so
  // deriving them from the current page alone would make a selected option
  // vanish from its own dropdown.
  const [seenActions, setSeenActions] = useState<Set<string>>(() => new Set());
  const [seenResources, setSeenResources] = useState<Set<string>>(() => new Set());
  const requestSeq = useRef(0);

  useEffect(() => {
    document.title = "Lattice - Audit Log";
  }, []);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  // The old page fetched one unpaged slice and filtered it in the browser, so
  // anything past the first page was unreachable.
  const query = useMemo<AuditLogQuery>(() => {
    const q: AuditLogQuery = {};
    if (debounced) q.q = debounced;
    if (userFilter !== "all") q.user_id = Number(userFilter);
    if (actionFilter !== "all") q.action = actionFilter;
    if (resourceFilter !== "all") q.resource_type = resourceFilter;
    if (fromDay) q.from = dayStart(fromDay);
    if (toDay) q.to = dayStart(toDay, 1); // inclusive of the whole "to" day
    return q;
  }, [debounced, userFilter, actionFilter, resourceFilter, fromDay, toDay]);

  const remember = (rows: AuditLogEntry[]) => {
    setSeenActions((prev) => {
      const next = new Set(prev);
      rows.forEach((r) => next.add(r.action));
      return next.size === prev.size ? prev : next;
    });
    setSeenResources((prev) => {
      const next = new Set(prev);
      rows.forEach((r) => next.add(r.resource_type));
      return next.size === prev.size ? prev : next;
    });
  };

  const load = useCallback(async () => {
    const seq = ++requestSeq.current;
    setRefreshing(true);
    setLoadError(false);
    const res = await reqGetAuditLog({ ...query, limit: PAGE_SIZE });
    if (seq !== requestSeq.current) return; // a newer filter won
    if (res.success) {
      const rows = res.data ?? [];
      setEntries(rows);
      setHasMore(rows.length === PAGE_SIZE);
      remember(rows);
    } else {
      setLoadError(true);
      toast.error(res.error_message || "Failed to load audit log");
    }
    setLoading(false);
    setRefreshing(false);
  }, [query]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    reqGetUsers().then((r) => {
      if (r.success) setUsers(r.data ?? []);
    });
  }, []);

  const loadMore = async () => {
    setLoadingMore(true);
    const res = await reqGetAuditLog({
      ...query,
      limit: PAGE_SIZE,
      offset: entries.length,
    });
    if (res.success) {
      const rows = res.data ?? [];
      setEntries((prev) => [...prev, ...rows]);
      setHasMore(rows.length === PAGE_SIZE);
      remember(rows);
    } else {
      toast.error(res.error_message || "Failed to load more entries");
    }
    setLoadingMore(false);
  };

  const userMap = useMemo(
    () => new Map(users.map((u) => [u.id, u.name || u.email])),
    [users],
  );
  const userLabel = (e: AuditLogEntry) =>
    e.user_id ? (userMap.get(e.user_id) ?? `User #${e.user_id}`) : "System";

  const exportCSV = async () => {
    setExporting(true);
    const all: AuditLogEntry[] = [];
    let truncated = false;
    for (let offset = 0; ; offset += EXPORT_PAGE) {
      const res = await reqGetAuditLog({ ...query, limit: EXPORT_PAGE, offset });
      if (!res.success) {
        toast.error(res.error_message || "Export failed");
        setExporting(false);
        return;
      }
      const rows = res.data ?? [];
      all.push(...rows);
      if (rows.length < EXPORT_PAGE) break;
      if (all.length >= EXPORT_MAX) {
        truncated = true;
        break;
      }
    }
    const csv = toCSV(
      ["time", "user", "action", "resource_type", "resource_id", "automation_run_id", "details", "ip"],
      all.map((e) => [
        e.inserted_at,
        userLabel(e),
        e.action,
        e.resource_type,
        e.resource_id,
        e.automation_run_id,
        e.details,
        e.ip_address,
      ]),
    );
    downloadText(`lattice-audit-${new Date().toISOString().slice(0, 10)}.csv`, csv);
    toast.success(
      truncated
        ? `Exported the newest ${all.length} entries (narrow the filters for older ones)`
        : `Exported ${all.length} entr${all.length === 1 ? "y" : "ies"}`,
    );
    setExporting(false);
  };

  const filtersActive =
    !!search || userFilter !== "all" || actionFilter !== "all" ||
    resourceFilter !== "all" || !!fromDay || !!toDay;
  const clearFilters = () => {
    setSearch("");
    setUserFilter("all");
    setActionFilter("all");
    setResourceFilter("all");
    setFromDay("");
    setToDay("");
  };

  if (loading) return <PageLoader />;

  return (
    <div>
      <div className="page-header">
        <div className="flex-1">
          <div className="page-title">Audit Log</div>
          <div className="page-subtitle">
            Every administrative action, newest first. Kept for 180 days.
          </div>
        </div>
        <Button variant="secondary" onClick={exportCSV} loading={exporting}>
          {!exporting && <FontAwesomeIcon icon={faFileExport} className="h-3 w-3 mr-1.5" />}
          Export CSV
        </Button>
      </div>

      <div className="filters-bar flex-wrap">
        <input
          type="search"
          aria-label="Search the audit log"
          placeholder="Search details, actions, IPs…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="form-input !w-full sm:!w-64 !h-8 !text-sm"
        />
        <select
          aria-label="Filter by user"
          value={userFilter}
          onChange={(e) => setUserFilter(e.target.value)}
          className="form-select !h-8 !w-auto !text-sm cursor-pointer"
        >
          <option value="all">All users</option>
          {users.map((u) => (
            <option key={u.id} value={String(u.id)}>
              {u.name || u.email}
            </option>
          ))}
        </select>
        <select
          aria-label="Filter by action"
          value={actionFilter}
          onChange={(e) => setActionFilter(e.target.value)}
          className="form-select !h-8 !w-auto !text-sm cursor-pointer"
        >
          <option value="all">All actions</option>
          {[...seenActions].sort().map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </select>
        <select
          aria-label="Filter by resource"
          value={resourceFilter}
          onChange={(e) => setResourceFilter(e.target.value)}
          className="form-select !h-8 !w-auto !text-sm cursor-pointer"
        >
          <option value="all">All resources</option>
          {[...seenResources].sort().map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-1.5 text-xs text-muted">
          From
          <input
            type="date"
            aria-label="From date"
            value={fromDay}
            max={toDay || undefined}
            onChange={(e) => setFromDay(e.target.value)}
            className="form-input !h-8 !w-auto !text-sm"
          />
        </label>
        <label className="flex items-center gap-1.5 text-xs text-muted">
          To
          <input
            type="date"
            aria-label="To date"
            value={toDay}
            min={fromDay || undefined}
            onChange={(e) => setToDay(e.target.value)}
            className="form-input !h-8 !w-auto !text-sm"
          />
        </label>
        {filtersActive && (
          <button
            onClick={clearFilters}
            className="inline-flex items-center gap-1 text-xs text-muted hover:text-primary cursor-pointer"
          >
            <FontAwesomeIcon icon={faXmark} className="h-3 w-3" />
            Clear
          </button>
        )}
      </div>

      <div className="py-6">
        {loadError && entries.length === 0 ? (
          <LoadError
            title="Failed to load audit log"
            message="Could not reach lattice-api to load the audit trail."
            onRetry={load}
            retrying={refreshing}
          />
        ) : (
          <>
            <div className={`panel ${refreshing ? "opacity-60 transition-opacity" : ""}`}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Time</th>
                    <th>User</th>
                    <th>Action</th>
                    <th className="hidden sm:table-cell">Resource</th>
                    <th className="hidden md:table-cell">Details</th>
                    <th className="hidden lg:table-cell">IP</th>
                  </tr>
                </thead>
                <tbody>
                  {entries.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="text-center text-sm text-muted !py-12">
                        {filtersActive
                          ? "No entries match these filters"
                          : "No audit log entries yet"}
                      </td>
                    </tr>
                  ) : (
                    entries.map((entry) => {
                      const route = RESOURCE_ROUTES[entry.resource_type];
                      return (
                        <tr key={entry.id} className="!cursor-default">
                          <td
                            className="text-muted whitespace-nowrap"
                            title={formatDate(entry.inserted_at)}
                          >
                            {timeAgo(entry.inserted_at)}
                          </td>
                          <td className="text-secondary">
                            {userLabel(entry)}
                            {entry.automation_run_id != null && (
                              <span
                                className="badge badge-violet ml-1.5"
                                title="Performed by an automation run acting as this user"
                              >
                                via automation · run #{entry.automation_run_id}
                              </span>
                            )}
                          </td>
                          <td>
                            <span className={`font-medium ${actionColor(entry.action)}`}>
                              {entry.action}
                            </span>
                          </td>
                          <td className="text-secondary hidden sm:table-cell whitespace-nowrap">
                            {route && entry.resource_id != null ? (
                              <Link
                                href={`${route}/${entry.resource_id}`}
                                className="underline decoration-border-strong underline-offset-2 hover:text-primary"
                              >
                                {entry.resource_type} #{entry.resource_id}
                              </Link>
                            ) : (
                              <>
                                {entry.resource_type}
                                {entry.resource_id != null && (
                                  <span className="text-muted"> #{entry.resource_id}</span>
                                )}
                              </>
                            )}
                          </td>
                          <td
                            className="text-muted max-w-xs truncate hidden md:table-cell"
                            title={entry.details ?? undefined}
                          >
                            {entry.details ?? "—"}
                          </td>
                          <td className="text-muted mono hidden lg:table-cell">
                            {entry.ip_address ?? "—"}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
            <div className="mt-3 flex items-center justify-between px-1">
              <span className="text-xs text-muted">
                {entries.length} entr{entries.length === 1 ? "y" : "ies"} shown
              </span>
              {hasMore && (
                <Button variant="secondary" size="sm" loading={loadingMore} onClick={loadMore}>
                  Load older entries
                </Button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
