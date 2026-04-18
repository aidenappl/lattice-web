"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Deployment } from "@/types";
import { reqGetDeployment, reqApproveDeployment, reqRollbackDeployment } from "@/services/deployments.service";
import { PageLoader } from "@/components/ui/loading";
import { StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/utils";
import { cn } from "@/lib/utils";

const timelineSteps = ["pending", "approved", "deploying", "deployed"] as const;

export default function DeploymentDetailPage() {
  const params = useParams();
  const id = Number(params.id);

  const [deployment, setDeployment] = useState<Deployment | null>(null);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);

  useEffect(() => {
    const load = async () => {
      const res = await reqGetDeployment(id);
      if (res.success) setDeployment(res.data);
      setLoading(false);
    };
    load();
  }, [id]);

  const handleApprove = async () => {
    setActing(true);
    const res = await reqApproveDeployment(id);
    if (res.success) setDeployment(res.data);
    setActing(false);
  };

  const handleRollback = async () => {
    setActing(true);
    const res = await reqRollbackDeployment(id);
    if (res.success) setDeployment(res.data);
    setActing(false);
  };

  if (loading) return <PageLoader />;
  if (!deployment) return <div className="text-center text-sm text-[#555555] py-12">Deployment not found</div>;

  const currentStepIndex = timelineSteps.indexOf(deployment.status as typeof timelineSteps[number]);
  const isFailed = deployment.status === "failed";
  const isRolledBack = deployment.status === "rolled_back";

  return (
    <div>
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-semibold text-white">Deployment #{deployment.id}</h1>
            <StatusBadge status={deployment.status} />
          </div>
          <p className="text-sm text-[#888888] mt-1">
            <Link href={`/stacks/${deployment.stack_id}`} className="text-[#3b82f6] hover:underline">
              Stack #{deployment.stack_id}
            </Link>
            {" "}&middot; {deployment.strategy}
          </p>
        </div>
        <div className="flex gap-2">
          {deployment.status === "pending" && (
            <Button onClick={handleApprove} disabled={acting}>
              {acting ? "Approving..." : "Approve"}
            </Button>
          )}
          {(deployment.status === "deployed" || deployment.status === "deploying") && (
            <Button variant="destructive" onClick={handleRollback} disabled={acting}>
              {acting ? "Rolling back..." : "Rollback"}
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Timeline */}
        <div className="rounded-xl border border-[#1a1a1a] bg-[#111111] p-5">
          <h2 className="text-sm font-medium text-white mb-6">Status Timeline</h2>
          <div className="space-y-4">
            {timelineSteps.map((step, i) => {
              const isCompleted = currentStepIndex >= i;
              const isCurrent = currentStepIndex === i;
              return (
                <div key={step} className="flex items-center gap-3">
                  <div
                    className={cn(
                      "flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-medium",
                      isCompleted && !isFailed && !isRolledBack
                        ? "bg-[#22c55e]/20 text-[#22c55e] ring-1 ring-[#22c55e]/30"
                        : isCurrent
                          ? "bg-[#3b82f6]/20 text-[#3b82f6] ring-1 ring-[#3b82f6]/30"
                          : "bg-[#1a1a1a] text-[#555555]",
                    )}
                  >
                    {i + 1}
                  </div>
                  <div>
                    <p className={cn("text-sm font-medium capitalize", isCompleted ? "text-white" : "text-[#555555]")}>
                      {step}
                    </p>
                  </div>
                </div>
              );
            })}
            {(isFailed || isRolledBack) && (
              <div className="flex items-center gap-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-red-500/20 text-red-400 ring-1 ring-red-500/30 text-xs font-medium">
                  !
                </div>
                <p className="text-sm font-medium text-red-400 capitalize">{deployment.status.replace("_", " ")}</p>
              </div>
            )}
          </div>
        </div>

        {/* Details */}
        <div className="rounded-xl border border-[#1a1a1a] bg-[#111111] p-5">
          <h2 className="text-sm font-medium text-white mb-4">Details</h2>
          <div className="space-y-4">
            <div>
              <p className="text-xs text-[#555555] uppercase tracking-wider">Strategy</p>
              <p className="text-sm text-[#888888] mt-1">{deployment.strategy}</p>
            </div>
            <div>
              <p className="text-xs text-[#555555] uppercase tracking-wider">Triggered By</p>
              <p className="text-sm text-[#888888] mt-1">{deployment.triggered_by ? `User #${deployment.triggered_by}` : "System"}</p>
            </div>
            <div>
              <p className="text-xs text-[#555555] uppercase tracking-wider">Approved By</p>
              <p className="text-sm text-[#888888] mt-1">{deployment.approved_by ? `User #${deployment.approved_by}` : "-"}</p>
            </div>
            <div>
              <p className="text-xs text-[#555555] uppercase tracking-wider">Started At</p>
              <p className="text-sm text-[#888888] mt-1">{deployment.started_at ? formatDate(deployment.started_at) : "-"}</p>
            </div>
            <div>
              <p className="text-xs text-[#555555] uppercase tracking-wider">Completed At</p>
              <p className="text-sm text-[#888888] mt-1">{deployment.completed_at ? formatDate(deployment.completed_at) : "-"}</p>
            </div>
            <div>
              <p className="text-xs text-[#555555] uppercase tracking-wider">Created</p>
              <p className="text-sm text-[#888888] mt-1">{formatDate(deployment.inserted_at)}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
