"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Deployment } from "@/types";
import { reqGetDeployments } from "@/services/deployments.service";
import { PageLoader } from "@/components/ui/loading";
import { StatusBadge } from "@/components/ui/badge";
import { formatDate } from "@/lib/utils";

export default function DeploymentsPage() {
  const [deployments, setDeployments] = useState<Deployment[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      const res = await reqGetDeployments();
      if (res.success) {
        setDeployments(res.data);
      }
      setLoading(false);
    };
    load();
  }, []);

  if (loading) return <PageLoader />;

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-white">Deployments</h1>
        <p className="text-sm text-[#888888] mt-1">Track deployment history and status</p>
      </div>

      <div className="rounded-xl border border-[#1a1a1a] bg-[#111111] overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-[#1a1a1a]">
              <th className="px-4 py-3 text-left text-xs font-medium text-[#888888] uppercase tracking-wider">ID</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-[#888888] uppercase tracking-wider">Stack</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-[#888888] uppercase tracking-wider">Status</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-[#888888] uppercase tracking-wider">Strategy</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-[#888888] uppercase tracking-wider">Started</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-[#888888] uppercase tracking-wider">Completed</th>
            </tr>
          </thead>
          <tbody>
            {deployments.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-12 text-center text-sm text-[#555555]">
                  No deployments found
                </td>
              </tr>
            ) : (
              deployments.map((d) => (
                <tr key={d.id} className="border-b border-[#1a1a1a] last:border-0 hover:bg-[#161616] transition-colors">
                  <td className="px-4 py-3">
                    <Link href={`/deployments/${d.id}`} className="text-sm font-medium text-white hover:text-[#3b82f6] transition-colors">
                      #{d.id}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <Link href={`/stacks/${d.stack_id}`} className="text-sm text-[#3b82f6] hover:underline">
                      Stack #{d.stack_id}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={d.status} />
                  </td>
                  <td className="px-4 py-3 text-sm text-[#888888]">{d.strategy}</td>
                  <td className="px-4 py-3 text-sm text-[#555555]">{d.started_at ? formatDate(d.started_at) : "-"}</td>
                  <td className="px-4 py-3 text-sm text-[#555555]">{d.completed_at ? formatDate(d.completed_at) : "-"}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
