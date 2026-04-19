"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Deployment, DeploymentLog, Stack } from "@/types";
import { reqGetDeployment, reqGetDeploymentLogs, reqApproveDeployment, reqRollbackDeployment } from "@/services/deployments.service";
import { reqGetStacks } from "@/services/stacks.service";
import { reqGetUsers } from "@/services/admin.service";
import { PageLoader } from "@/components/ui/loading";
import { StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { useAdminSocket, AdminSocketEvent } from "@/hooks/useAdminSocket";
import { useConfirm } from "@/components/ui/confirm-modal";

const timelineSteps = ["pending", "approved", "deploying", "deployed"] as const;

export default function DeploymentDetailPage() {
  const params = useParams();
  const id = Number(params.id);

  const [deployment, setDeployment] = useState<Deployment | null>(null);
  const [logs, setLogs] = useState<DeploymentLog[]>([]);
  const [stacks, setStacks] = useState<Stack[]>([]);
  const [users, setUsers] = useState<{ id: number; name: string | null; email: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);
  const logsEndRef = useRef<HTMLDivElement>(null);
  const showConfirm = useConfirm();

  useEffect(() => {
    const load = async () => {
      const [depRes, logsRes, stacksRes, usersRes] = await Promise.all([
        reqGetDeployment(id),
        reqGetDeploymentLogs(id),
        reqGetStacks(),
        reqGetUsers(),
      ]);
      if (depRes.success) setDeployment(depRes.data);
      if (logsRes.success) setLogs(logsRes.data ?? []);
      if (stacksRes.success) setStacks(stacksRes.data ?? []);
      if (usersRes.success) setUsers(usersRes.data ?? []);
      setLoading(false);
    };
    load();
  }, [id]);

  // WS: listen for deployment_progress events for this deployment
  const handleSocketEvent = useCallback(
    (event: AdminSocketEvent) => {
      if (event.type !== "deployment_progress") return;
      const payload = event.payload ?? {};
      const depId = payload["deployment_id"] as number | undefined;
      if (depId !== id) return;

      // Update deployment status if present
      const status = payload["status"] as string | undefined;
      if (status) {
        setDeployment((prev) => prev ? { ...prev, status: status as Deployment["status"] } : prev);
      }

      // Append log entry if message present
      const message = payload["message"] as string | undefined;
      if (message) {
        setLogs((prev) => [
          ...prev,
          {
            id: Date.now(),
            deployment_id: id,
            level: (payload["level"] as string) ?? "info",
            stage: (payload["stage"] as string) ?? null,
            message,
            recorded_at: new Date().toISOString(),
          },
        ]);
        setTimeout(() => logsEndRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
      }
    },
    [id],
  );
  useAdminSocket(handleSocketEvent);

  // Poll while deploying
  useEffect(() => {
    if (!deployment || deployment.status !== "deploying") return;
    const interval = setInterval(async () => {
      const [depRes, logsRes] = await Promise.all([
        reqGetDeployment(id),
        reqGetDeploymentLogs(id),
      ]);
      if (depRes.success) setDeployment(depRes.data);
      if (logsRes.success) setLogs(logsRes.data ?? []);
    }, 5000);
    return () => clearInterval(interval);
  }, [deployment?.status, id]);

  const stackName = stacks.find((s) => s.id === deployment?.stack_id)?.name;
  const triggeredByUser = users.find((u) => u.id === deployment?.triggered_by);
  const approvedByUser = users.find((u) => u.id === deployment?.approved_by);

  const handleApprove = async () => {
    const ok = await showConfirm({
      title: "Approve deployment",
      message: "This will begin deploying to the worker. Continue?",
      confirmLabel: "Approve",
    });
    if (!ok) return;
    setActing(true);
    const res = await reqApproveDeployment(id);
    if (res.success) setDeployment(res.data);
    setActing(false);
  };

  const handleRollback = async () => {
    const ok = await showConfirm({
      title: "Rollback deployment",
      message: "This will roll back the deployment. Any changes made by this deployment will be reverted.",
      confirmLabel: "Rollback",
      variant: "danger",
    });
    if (!ok) return;
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
              {stackName ?? `Stack #${deployment.stack_id}`}
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
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#ef4444]/20 text-[#f87171] ring-1 ring-red-500/30 text-xs font-medium">
                  !
                </div>
                <p className="text-sm font-medium text-[#f87171] capitalize">{deployment.status.replace("_", " ")}</p>
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
              <p className="text-sm text-[#888888] mt-1">{triggeredByUser ? triggeredByUser.name || triggeredByUser.email : deployment.triggered_by ? `User #${deployment.triggered_by}` : "System"}</p>
            </div>
            <div>
              <p className="text-xs text-[#555555] uppercase tracking-wider">Approved By</p>
              <p className="text-sm text-[#888888] mt-1">{approvedByUser ? approvedByUser.name || approvedByUser.email : deployment.approved_by ? `User #${deployment.approved_by}` : "-"}</p>
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

      {/* Deployment Logs */}
      <div className="mt-6 rounded-xl border border-[#1a1a1a] bg-[#111111] p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-medium text-white">Deployment Logs</h2>
          {deployment.status === "deploying" && (
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#3b82f6] opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-[#3b82f6]" />
            </span>
          )}
        </div>
        <div className="max-h-[400px] overflow-y-auto rounded-lg bg-[#0a0a0a] border border-[#1a1a1a] p-4 font-mono text-xs space-y-1">
          {logs.length === 0 ? (
            <p className="text-[#555555] text-center py-8">No logs yet</p>
          ) : (
            logs.map((log) => (
              <div key={log.id} className="flex gap-2">
                <span className="text-[#444444] shrink-0 select-none">
                  {new Date(log.recorded_at).toLocaleTimeString()}
                </span>
                {log.stage && (
                  <span className="text-[#3b82f6] shrink-0">[{log.stage}]</span>
                )}
                <span
                  className={cn(
                    log.level === "error" ? "text-[#f87171]" : log.level === "warn" ? "text-[#eab308]" : "text-[#d4d4d4]",
                  )}
                >
                  {log.message}
                </span>
              </div>
            ))
          )}
          <div ref={logsEndRef} />
        </div>
      </div>
    </div>
  );
}
