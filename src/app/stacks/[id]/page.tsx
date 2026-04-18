"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Stack, Container, Deployment } from "@/types";
import { reqGetStack, reqGetContainers, reqDeployStack } from "@/services/stacks.service";
import { reqGetDeployments } from "@/services/deployments.service";
import { PageLoader } from "@/components/ui/loading";
import { StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDate, timeAgo } from "@/lib/utils";

export default function StackDetailPage() {
  const params = useParams();
  const id = Number(params.id);

  const [stack, setStack] = useState<Stack | null>(null);
  const [containers, setContainers] = useState<Container[]>([]);
  const [deployments, setDeployments] = useState<Deployment[]>([]);
  const [loading, setLoading] = useState(true);
  const [deploying, setDeploying] = useState(false);

  useEffect(() => {
    const load = async () => {
      const [stackRes, containersRes, deploymentsRes] = await Promise.all([
        reqGetStack(id),
        reqGetContainers(id),
        reqGetDeployments(),
      ]);
      if (stackRes.success) setStack(stackRes.data);
      if (containersRes.success) setContainers(containersRes.data);
      if (deploymentsRes.success) {
        setDeployments(deploymentsRes.data.filter((d) => d.stack_id === id));
      }
      setLoading(false);
    };
    load();
  }, [id]);

  const handleDeploy = async () => {
    setDeploying(true);
    const res = await reqDeployStack(id);
    if (res.success) {
      // Refresh stack state
      const stackRes = await reqGetStack(id);
      if (stackRes.success) setStack(stackRes.data);
    }
    setDeploying(false);
  };

  if (loading) return <PageLoader />;
  if (!stack) return <div className="text-center text-sm text-[#555555] py-12">Stack not found</div>;

  return (
    <div>
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-semibold text-white">{stack.name}</h1>
            <StatusBadge status={stack.status} />
          </div>
          {stack.description && (
            <p className="text-sm text-[#888888] mt-1">{stack.description}</p>
          )}
        </div>
        <div className="flex gap-2">
          <Button onClick={handleDeploy} disabled={deploying || stack.status === "deploying"}>
            {deploying ? "Deploying..." : "Deploy"}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Stack Info + Containers */}
        <div className="lg:col-span-2 space-y-6">
          {/* Stack Info */}
          <div className="rounded-xl border border-[#1a1a1a] bg-[#111111] p-5">
            <h2 className="text-sm font-medium text-white mb-4">Stack Info</h2>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-[#555555] uppercase tracking-wider">Strategy</p>
                <p className="text-sm text-[#888888] mt-1">{stack.deployment_strategy}</p>
              </div>
              <div>
                <p className="text-xs text-[#555555] uppercase tracking-wider">Auto Deploy</p>
                <p className="text-sm text-[#888888] mt-1">{stack.auto_deploy ? "Enabled" : "Disabled"}</p>
              </div>
              <div>
                <p className="text-xs text-[#555555] uppercase tracking-wider">Created</p>
                <p className="text-sm text-[#888888] mt-1">{formatDate(stack.inserted_at)}</p>
              </div>
              <div>
                <p className="text-xs text-[#555555] uppercase tracking-wider">Updated</p>
                <p className="text-sm text-[#888888] mt-1">{timeAgo(stack.updated_at)}</p>
              </div>
            </div>
          </div>

          {/* Containers */}
          <div className="rounded-xl border border-[#1a1a1a] bg-[#111111] overflow-hidden">
            <div className="px-5 py-4 border-b border-[#1a1a1a] flex items-center justify-between">
              <h2 className="text-sm font-medium text-white">Containers</h2>
              <span className="text-xs text-[#555555]">{containers.length} container{containers.length !== 1 ? "s" : ""}</span>
            </div>
            {containers.length === 0 ? (
              <div className="px-5 py-8 text-center text-sm text-[#555555]">
                No containers in this stack
              </div>
            ) : (
              <table className="w-full">
                <thead>
                  <tr className="border-b border-[#1a1a1a]">
                    <th className="px-4 py-3 text-left text-xs font-medium text-[#888888] uppercase tracking-wider">Name</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-[#888888] uppercase tracking-wider">Image</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-[#888888] uppercase tracking-wider">Status</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-[#888888] uppercase tracking-wider">Replicas</th>
                  </tr>
                </thead>
                <tbody>
                  {containers.map((container) => (
                    <tr key={container.id} className="border-b border-[#1a1a1a] last:border-0">
                      <td className="px-4 py-3 text-sm font-medium text-white">{container.name}</td>
                      <td className="px-4 py-3 text-sm text-[#888888] font-mono">{container.image}:{container.tag}</td>
                      <td className="px-4 py-3"><StatusBadge status={container.status} /></td>
                      <td className="px-4 py-3 text-sm text-[#888888]">{container.replicas}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Deployment History */}
        <div>
          <div className="rounded-xl border border-[#1a1a1a] bg-[#111111] p-5">
            <h2 className="text-sm font-medium text-white mb-4">Deployment History</h2>
            <div className="space-y-3">
              {deployments.length === 0 ? (
                <p className="text-xs text-[#555555] text-center py-4">No deployments yet</p>
              ) : (
                deployments.slice(0, 10).map((d) => (
                  <div key={d.id} className="flex items-center justify-between rounded-lg bg-[#161616] px-3 py-2">
                    <div>
                      <StatusBadge status={d.status} />
                      <p className="text-xs text-[#555555] mt-1">{d.strategy}</p>
                    </div>
                    <p className="text-xs text-[#555555]">{timeAgo(d.inserted_at)}</p>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
