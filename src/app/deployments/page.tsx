"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Deployment, Stack } from "@/types";
import { reqGetDeployments } from "@/services/deployments.service";
import { reqGetStacks } from "@/services/stacks.service";
import { PageLoader } from "@/components/ui/loading";
import { StatusBadge } from "@/components/ui/badge";
import { formatDate } from "@/lib/utils";

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
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [stackFilter, setStackFilter] = useState<string>("all");

  useEffect(() => {
    document.title = "Lattice - Deployments";
  }, []);

  useEffect(() => {
    const load = async () => {
      const [depRes, stacksRes] = await Promise.all([
        reqGetDeployments(),
        reqGetStacks(),
      ]);
      if (depRes.success) setDeployments(depRes.data ?? []);
      if (stacksRes.success) setStacks(stacksRes.data ?? []);
      setLoading(false);
    };
    load();
  }, []);

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
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-primary">Deployments</h1>
          <p className="text-sm text-secondary mt-1">
            Track deployment history and status
          </p>
        </div>
        <div className="flex gap-2">
          <select
            value={stackFilter}
            onChange={(e) => setStackFilter(e.target.value)}
            className="h-9 rounded-lg border border-border-strong bg-surface-elevated px-3 text-sm text-primary cursor-pointer focus:border-border-emphasis focus:outline-none focus:ring-1 focus:ring-[#444444]/50"
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
            className="h-9 rounded-lg border border-border-strong bg-surface-elevated px-3 text-sm text-primary cursor-pointer focus:border-border-emphasis focus:outline-none focus:ring-1 focus:ring-[#444444]/50"
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

      <div className="rounded-xl border border-border-subtle bg-surface overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border-subtle">
              <th className="px-4 py-3 text-left text-xs font-medium text-secondary uppercase tracking-wider">
                ID
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-secondary uppercase tracking-wider">
                Stack
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-secondary uppercase tracking-wider">
                Status
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-secondary uppercase tracking-wider">
                Strategy
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-secondary uppercase tracking-wider">
                Started
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-secondary uppercase tracking-wider">
                Completed
              </th>
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
                <tr
                  key={d.id}
                  className="border-b border-border-subtle last:border-0 hover:bg-surface-elevated transition-colors"
                >
                  <td className="px-4 py-3">
                    <Link
                      href={`/deployments/${d.id}`}
                      className="text-sm font-medium text-primary hover:text-[#3b82f6] transition-colors"
                    >
                      #{d.id}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <Link
                      href={`/stacks/${d.stack_id}`}
                      className="text-sm text-[#3b82f6] hover:underline"
                    >
                      {stackMap.get(d.stack_id) ?? `Stack #${d.stack_id}`}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={d.status} />
                  </td>
                  <td className="px-4 py-3 text-sm text-secondary">
                    {d.strategy}
                  </td>
                  <td className="px-4 py-3 text-sm text-muted">
                    {d.started_at ? formatDate(d.started_at) : "-"}
                  </td>
                  <td className="px-4 py-3 text-sm text-muted">
                    {d.completed_at ? formatDate(d.completed_at) : "-"}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
