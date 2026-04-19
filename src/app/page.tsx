"use client";

import { useEffect, useState } from "react";
import { reqGetOverview, OverviewData } from "@/services/admin.service";
import { APP_VERSION } from "@/lib/version";
import { TopologyBoard } from "@/components/topology/TopologyBoard";

export default function DashboardPage() {
  const [overview, setOverview] = useState<OverviewData | null>(null);
  const [apiVersion, setApiVersion] = useState<string | null>(null);

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
      if (overviewRes.success) setOverview(overviewRes.data);
      if (versionRes?.version) setApiVersion(versionRes.version);
    };
    load();
  }, []);

  const stats = [
    {
      label: "Workers",
      value: overview
        ? `${overview.online_workers}/${overview.total_workers}`
        : "-",
      color: "text-[#22c55e]",
    },
    {
      label: "Stacks",
      value: overview?.active_stacks ?? "-",
      color: "text-[#3b82f6]",
    },
    {
      label: "Total",
      value: overview?.total_stacks ?? "-",
      color: "text-[#a855f7]",
    },
    {
      label: "Deploys",
      value: overview?.recent_deployment_count ?? "-",
      color: "text-[#eab308]",
    },
  ];

  return (
    <div className="flex flex-col h-[calc(100vh-5.5rem)]">
      {/* Compact stats bar */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-5">
          {stats.map((s) => (
            <div key={s.label} className="flex items-center gap-1.5">
              <span className="text-[11px] text-muted uppercase tracking-wider">
                {s.label}
              </span>
              <span className={`text-sm font-semibold ${s.color}`}>
                {s.value}
              </span>
            </div>
          ))}
        </div>
        <span className="text-[10px] text-muted font-mono">
          Web {APP_VERSION} / API {apiVersion ?? "..."}
        </span>
      </div>

      {/* Topology canvas */}
      <div className="flex-1 min-h-0">
        <TopologyBoard />
      </div>
    </div>
  );
}
