"use client";

import { useEffect, useState } from "react";
import { reqGetAuditLog } from "@/services/admin.service";
import { reqGetUsers } from "@/services/admin.service";
import type { AuditLogEntry, User } from "@/types";
import { PageLoader } from "@/components/ui/loading";
import { formatDate } from "@/lib/utils";

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

export default function AuditLogPage() {
  const [entries, setEntries] = useState<AuditLogEntry[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [resourceFilter, setResourceFilter] = useState("all");
  const [actionFilter, setActionFilter] = useState("all");

  useEffect(() => {
    document.title = "Lattice - Audit Log";
  }, []);

  useEffect(() => {
    const load = async () => {
      const [logRes, usersRes] = await Promise.all([
        reqGetAuditLog(),
        reqGetUsers(),
      ]);
      if (logRes.success) setEntries(logRes.data ?? []);
      if (usersRes.success) setUsers(usersRes.data ?? []);
      setLoading(false);
    };
    load();
  }, []);

  const userMap = new Map(users.map((u) => [u.id, u.name || u.email]));
  const resourceTypes = [
    ...new Set(entries.map((e) => e.resource_type)),
  ].sort();
  const actions = [...new Set(entries.map((e) => e.action))].sort();

  const filtered = entries.filter((e) => {
    if (resourceFilter !== "all" && e.resource_type !== resourceFilter)
      return false;
    if (actionFilter !== "all" && e.action !== actionFilter) return false;
    return true;
  });

  if (loading) return <PageLoader />;

  return (
    <div>
      {/* Page header */}
      <div className="page-header">
        <div className="flex-1">
          <div className="page-title">Audit Log</div>
          <div className="page-subtitle">
            Track all actions performed in the system
          </div>
        </div>
        <div className="flex gap-2">
          <select
            value={resourceFilter}
            onChange={(e) => setResourceFilter(e.target.value)}
            className="form-select !h-9 !w-auto !text-sm cursor-pointer"
          >
            <option value="all">All Resources</option>
            {resourceTypes.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
          <select
            value={actionFilter}
            onChange={(e) => setActionFilter(e.target.value)}
            className="form-select !h-9 !w-auto !text-sm cursor-pointer"
          >
            <option value="all">All Actions</option>
            {actions.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="py-6">
        <div className="panel">
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
              {filtered.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    className="text-center text-sm text-muted !py-12"
                  >
                    No audit log entries found
                  </td>
                </tr>
              ) : (
                filtered.map((entry) => (
                  <tr key={entry.id}>
                    <td className="text-muted whitespace-nowrap">
                      {formatDate(entry.inserted_at)}
                    </td>
                    <td className="text-secondary">
                      {entry.user_id
                        ? (userMap.get(entry.user_id) ??
                          `User #${entry.user_id}`)
                        : "System"}
                    </td>
                    <td>
                      <span
                        className={`font-medium ${actionColor(entry.action)}`}
                      >
                        {entry.action}
                      </span>
                    </td>
                    <td className="text-secondary hidden sm:table-cell">
                      {entry.resource_type}
                      {entry.resource_id != null && (
                        <span className="text-muted">
                          {" "}
                          #{entry.resource_id}
                        </span>
                      )}
                    </td>
                    <td className="text-muted max-w-xs truncate hidden md:table-cell">
                      {entry.details ?? "-"}
                    </td>
                    <td className="text-muted mono hidden lg:table-cell">{entry.ip_address ?? "-"}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
