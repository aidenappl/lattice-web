"use client";

import { useEffect, useState } from "react";
import { reqGetAuditLog, AuditLogEntry } from "@/services/admin.service";
import { reqGetUsers } from "@/services/admin.service";
import { User } from "@/types";
import { PageLoader } from "@/components/ui/loading";
import { formatDate } from "@/lib/utils";

const actionColors: Record<string, string> = {
  create: "text-[#22c55e]",
  update: "text-[#3b82f6]",
  delete: "text-[#ef4444]",
  deploy: "text-[#a855f7]",
  login: "text-[#eab308]",
  approve: "text-[#22c55e]",
  rollback: "text-[#f59e0b]",
};

function actionColor(action: string): string {
  const key = Object.keys(actionColors).find((k) => action.toLowerCase().includes(k));
  return key ? actionColors[key] : "text-[#888888]";
}

export default function AuditLogPage() {
  const [entries, setEntries] = useState<AuditLogEntry[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [resourceFilter, setResourceFilter] = useState("all");
  const [actionFilter, setActionFilter] = useState("all");

  useEffect(() => {
    const load = async () => {
      const [logRes, usersRes] = await Promise.all([reqGetAuditLog(), reqGetUsers()]);
      if (logRes.success) setEntries(logRes.data ?? []);
      if (usersRes.success) setUsers(usersRes.data ?? []);
      setLoading(false);
    };
    load();
  }, []);

  const userMap = new Map(users.map((u) => [u.id, u.name || u.email]));
  const resourceTypes = [...new Set(entries.map((e) => e.resource_type))].sort();
  const actions = [...new Set(entries.map((e) => e.action))].sort();

  const filtered = entries.filter((e) => {
    if (resourceFilter !== "all" && e.resource_type !== resourceFilter) return false;
    if (actionFilter !== "all" && e.action !== actionFilter) return false;
    return true;
  });

  if (loading) return <PageLoader />;

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-white">Audit Log</h1>
          <p className="text-sm text-[#888888] mt-1">Track all actions performed in the system</p>
        </div>
        <div className="flex gap-2">
          <select
            value={resourceFilter}
            onChange={(e) => setResourceFilter(e.target.value)}
            className="h-9 rounded-lg border border-[#2a2a2a] bg-[#161616] px-3 text-sm text-white cursor-pointer focus:border-[#444444] focus:outline-none focus:ring-1 focus:ring-[#444444]/50"
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
            className="h-9 rounded-lg border border-[#2a2a2a] bg-[#161616] px-3 text-sm text-white cursor-pointer focus:border-[#444444] focus:outline-none focus:ring-1 focus:ring-[#444444]/50"
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

      <div className="rounded-xl border border-[#1a1a1a] bg-[#111111] overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-[#1a1a1a]">
              <th className="px-4 py-3 text-left text-xs font-medium text-[#888888] uppercase tracking-wider">Time</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-[#888888] uppercase tracking-wider">User</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-[#888888] uppercase tracking-wider">Action</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-[#888888] uppercase tracking-wider">Resource</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-[#888888] uppercase tracking-wider">Details</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-[#888888] uppercase tracking-wider">IP</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-12 text-center text-sm text-[#555555]">
                  No audit log entries found
                </td>
              </tr>
            ) : (
              filtered.map((entry) => (
                <tr key={entry.id} className="border-b border-[#1a1a1a] last:border-0 hover:bg-[#161616] transition-colors">
                  <td className="px-4 py-3 text-sm text-[#555555] whitespace-nowrap">{formatDate(entry.inserted_at)}</td>
                  <td className="px-4 py-3 text-sm text-[#888888]">
                    {entry.user_id ? userMap.get(entry.user_id) ?? `User #${entry.user_id}` : "System"}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-sm font-medium ${actionColor(entry.action)}`}>{entry.action}</span>
                  </td>
                  <td className="px-4 py-3 text-sm text-[#888888]">
                    {entry.resource_type}
                    {entry.resource_id != null && <span className="text-[#555555]"> #{entry.resource_id}</span>}
                  </td>
                  <td className="px-4 py-3 text-sm text-[#555555] max-w-xs truncate">{entry.details ?? "-"}</td>
                  <td className="px-4 py-3 text-sm text-[#555555] font-mono">{entry.ip_address ?? "-"}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
