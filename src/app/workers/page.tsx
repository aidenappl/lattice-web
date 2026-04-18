"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Worker } from "@/types";
import { reqGetWorkers } from "@/services/workers.service";
import { PageLoader } from "@/components/ui/loading";
import { StatusBadge } from "@/components/ui/badge";
import { timeAgo } from "@/lib/utils";

export default function WorkersPage() {
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      const res = await reqGetWorkers();
      if (res.success) {
        setWorkers(res.data);
      }
      setLoading(false);
    };
    load();
  }, []);

  if (loading) return <PageLoader />;

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-white">Workers</h1>
          <p className="text-sm text-[#888888] mt-1">Manage your infrastructure workers</p>
        </div>
      </div>

      <div className="rounded-xl border border-[#1a1a1a] bg-[#111111] overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-[#1a1a1a]">
              <th className="px-4 py-3 text-left text-xs font-medium text-[#888888] uppercase tracking-wider">Name</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-[#888888] uppercase tracking-wider">Hostname</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-[#888888] uppercase tracking-wider">Status</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-[#888888] uppercase tracking-wider">OS / Arch</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-[#888888] uppercase tracking-wider">Docker</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-[#888888] uppercase tracking-wider">Last Heartbeat</th>
            </tr>
          </thead>
          <tbody>
            {workers.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-12 text-center text-sm text-[#555555]">
                  No workers found
                </td>
              </tr>
            ) : (
              workers.map((worker) => (
                <tr key={worker.id} className="border-b border-[#1a1a1a] last:border-0 hover:bg-[#161616] transition-colors">
                  <td className="px-4 py-3">
                    <Link href={`/workers/${worker.id}`} className="text-sm font-medium text-white hover:text-[#3b82f6] transition-colors">
                      {worker.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-sm text-[#888888] font-mono">{worker.hostname}</td>
                  <td className="px-4 py-3">
                    <StatusBadge status={worker.status} />
                  </td>
                  <td className="px-4 py-3 text-sm text-[#888888]">
                    {worker.os ?? "-"} / {worker.arch ?? "-"}
                  </td>
                  <td className="px-4 py-3 text-sm text-[#888888] font-mono">{worker.docker_version ?? "-"}</td>
                  <td className="px-4 py-3 text-sm text-[#555555]">
                    {worker.last_heartbeat_at ? timeAgo(worker.last_heartbeat_at) : "Never"}
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
