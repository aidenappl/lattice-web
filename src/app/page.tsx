"use client";

import { useEffect, useState } from "react";
import { reqGetOverview, OverviewData } from "@/services/admin.service";
import { PageLoader } from "@/components/ui/loading";
import { APP_VERSION } from "@/lib/version";

export default function DashboardPage() {
  const [overview, setOverview] = useState<OverviewData | null>(null);
  const [apiVersion, setApiVersion] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    document.title = "Lattice - Dashboard";
  }, []);

  useEffect(() => {
    const load = async () => {
      const [overviewRes, versionRes] = await Promise.all([
        reqGetOverview(),
        fetch(`${process.env.NEXT_PUBLIC_LATTICE_API}/version`)
          .then((r) => r.json())
          .catch(() => null),
      ]);
      if (overviewRes.success) {
        setOverview(overviewRes.data);
      }
      if (versionRes?.version) {
        setApiVersion(versionRes.version);
      }
      setLoading(false);
    };
    load();
  }, []);

  if (loading) return <PageLoader />;

  const stats = [
    {
      label: "Workers",
      value: overview
        ? `${overview.online_workers} / ${overview.total_workers}`
        : "0 / 0",
      sub: "online / total",
      color: "text-[#22c55e]",
    },
    {
      label: "Stacks",
      value: overview?.active_stacks ?? 0,
      sub: "active",
      color: "text-[#3b82f6]",
    },
    {
      label: "Total Stacks",
      value: overview?.total_stacks ?? 0,
      sub: "configured",
      color: "text-[#a855f7]",
    },
    {
      label: "Deployments",
      value: overview?.recent_deployment_count ?? 0,
      sub: "recent",
      color: "text-[#eab308]",
    },
  ];

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-white">Dashboard</h1>
        <p className="text-sm text-[#888888] mt-1">
          Overview of your infrastructure
        </p>
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

      {/* Version Info */}
      <div className="mt-8 flex items-center gap-6 text-xs text-[#555555] font-mono">
        <span>Web {APP_VERSION}</span>
        <span>API {apiVersion ?? "..."}</span>
      </div>
    </div>
  );
}
