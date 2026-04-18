"use client";

import { useEffect, useState } from "react";
import { reqGetOverview, OverviewData } from "@/services/admin.service";
import { PageLoader } from "@/components/ui/loading";

export default function DashboardPage() {
  const [overview, setOverview] = useState<OverviewData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      const res = await reqGetOverview();
      if (res.success) {
        setOverview(res.data);
      }
      setLoading(false);
    };
    load();
  }, []);

  if (loading) return <PageLoader />;

  const stats = [
    {
      label: "Workers",
      value: overview ? `${overview.workers_online} / ${overview.workers_total}` : "0 / 0",
      sub: "online / total",
      color: "text-[#22c55e]",
    },
    {
      label: "Containers",
      value: overview?.containers_running ?? 0,
      sub: "running",
      color: "text-[#3b82f6]",
    },
    {
      label: "Stacks",
      value: overview?.stacks_active ?? 0,
      sub: "active",
      color: "text-[#a855f7]",
    },
    {
      label: "Recent Deployments",
      value: overview?.recent_deployments ?? 0,
      sub: "last 24h",
      color: "text-yellow-400",
    },
  ];

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-xl font-semibold text-white">Dashboard</h1>
        <p className="text-sm text-[#888888] mt-1">Overview of your infrastructure</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat) => (
          <div
            key={stat.label}
            className="rounded-xl border border-[#1a1a1a] bg-[#111111] p-5"
          >
            <p className="text-xs font-medium text-[#888888] uppercase tracking-wider mb-3">
              {stat.label}
            </p>
            <p className={`text-2xl font-semibold ${stat.color}`}>
              {stat.value}
            </p>
            <p className="text-xs text-[#555555] mt-1">{stat.sub}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
