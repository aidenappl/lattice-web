"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { Stack } from "@/types";
import { reqGetStacks } from "@/services/stacks.service";
import { PageLoader } from "@/components/ui/loading";
import { StatusBadge } from "@/components/ui/badge";
import { useAdminSocket, AdminSocketEvent } from "@/hooks/useAdminSocket";

export default function StacksPage() {
  const [stacks, setStacks] = useState<Stack[]>([]);
  const [loading, setLoading] = useState(true);

  const refreshStacks = useCallback(async () => {
    const res = await reqGetStacks();
    if (res.success) setStacks(res.data ?? []);
  }, []);

  useEffect(() => {
    refreshStacks().then(() => setLoading(false));
  }, [refreshStacks]);

  // Live updates via WebSocket
  const handleSocketEvent = useCallback(
    (event: AdminSocketEvent) => {
      if (
        event.type === "container_status" ||
        event.type === "container_sync" ||
        event.type === "deployment_progress"
      ) {
        refreshStacks();
      }
    },
    [refreshStacks],
  );
  useAdminSocket(handleSocketEvent);

  if (loading) return <PageLoader />;

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-white">Stacks</h1>
          <p className="text-sm text-[#888888] mt-1">Manage your container stacks</p>
        </div>
        <Link
          href="/stacks/new"
          className="inline-flex items-center justify-center font-medium rounded-lg transition-colors cursor-pointer focus:outline-none bg-white text-black hover:bg-zinc-100 h-8 px-3.5 text-sm"
        >
          New Stack
        </Link>
      </div>

      {stacks.length === 0 ? (
        <div className="rounded-xl border border-[#1a1a1a] bg-[#111111] p-12 text-center">
          <p className="text-sm text-[#555555]">No stacks found</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {stacks.map((stack) => (
            <Link
              key={stack.id}
              href={`/stacks/${stack.id}`}
              className="rounded-xl border border-[#1a1a1a] bg-[#111111] p-5 hover:border-[#2a2a2a] hover:bg-[#161616] transition-colors"
            >
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-medium text-white">{stack.name}</h3>
                <StatusBadge status={stack.status} />
              </div>
              {stack.description && (
                <p className="text-xs text-[#888888] mb-3 line-clamp-2">{stack.description}</p>
              )}
              <div className="flex items-center gap-4 text-xs text-[#555555]">
                <span>Strategy: {stack.deployment_strategy}</span>
                {stack.auto_deploy && (
                  <span className="text-[#3b82f6]">Auto-deploy</span>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
