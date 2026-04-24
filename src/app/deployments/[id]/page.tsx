"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import type { Deployment, DeploymentLog, Stack } from "@/types";
import {
  reqGetDeployment,
  reqGetDeploymentLogs,
  reqApproveDeployment,
  reqRollbackDeployment,
} from "@/services/deployments.service";
import { reqGetStacks } from "@/services/stacks.service";
import { reqGetUsers } from "@/services/admin.service";
import { PageLoader } from "@/components/ui/loading";
import { StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { useAdminSocket, AdminSocketEvent } from "@/hooks/useAdminSocket";
import { useConfirm } from "@/components/ui/confirm-modal";
import { useDeploymentProgress } from "@/hooks/useDeploymentProgress";

const timelineSteps = ["pending", "approved", "deploying", "validating", "deployed"] as const;

export default function DeploymentDetailPage() {
  const params = useParams();
  const id = Number(params.id);

  const [deployment, setDeployment] = useState<Deployment | null>(null);
  const [logs, setLogs] = useState<DeploymentLog[]>([]);
  const [stacks, setStacks] = useState<Stack[]>([]);
  const [users, setUsers] = useState<
    { id: number; name: string | null; email: string }[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [acting, setActing] = useState(false);
  const [liveMeta, setLiveMeta] = useState<{
    attempt?: number;
    maxRetries?: number;
    step?: string;
    message?: string;
    lastProgressAt?: string;
  }>({});
  const logsEndRef = useRef<HTMLDivElement>(null);
  const showConfirm = useConfirm();
  const deployProgress = useDeploymentProgress();

  // Mounted ref to prevent state updates after unmount
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  useEffect(() => {
    if (deployment) document.title = `Lattice - Deployment #${deployment.id}`;
  }, [deployment]);

  const loadDeployment = useCallback(async () => {
    setError(null);
    const [depRes, logsRes, stacksRes, usersRes] = await Promise.all([
      reqGetDeployment(id),
      reqGetDeploymentLogs(id),
      reqGetStacks(),
      reqGetUsers(),
    ]);
    if (!mountedRef.current) return;
    if (depRes.success) {
      setDeployment(depRes.data);
    } else {
      setError(depRes.error_message ?? "Failed to load deployment");
    }
    if (logsRes.success) setLogs(logsRes.data ?? []);
    if (stacksRes.success) setStacks(stacksRes.data ?? []);
    if (usersRes.success) setUsers(usersRes.data ?? []);
    setLoading(false);
  }, [id]);

  useEffect(() => {
    loadDeployment();
  }, [loadDeployment]);

  // WS: listen for deployment_progress events for this deployment
  const handleSocketEvent = useCallback(
    (event: AdminSocketEvent) => {
      if (
        event.type !== "deployment_progress" &&
        event.type !== "deployment_status"
      )
        return;
      const payload = event.payload ?? {};
      const depId = payload["deployment_id"] as number | undefined;
      if (depId !== id) return;

      setLiveMeta((prev) => ({
        ...prev,
        attempt: (payload["attempt"] as number | undefined) ?? prev.attempt,
        maxRetries:
          (payload["max_retries"] as number | undefined) ?? prev.maxRetries,
        step: (payload["step"] as string | undefined) ?? prev.step,
        message: (payload["message"] as string | undefined) ?? prev.message,
        lastProgressAt:
          (payload["last_progress_at"] as string | undefined) ??
          prev.lastProgressAt,
      }));

      // Update deployment status if present
      const status = payload["status"] as string | undefined;
      if (status) {
        setDeployment((prev) =>
          prev ? { ...prev, status: status as Deployment["status"] } : prev,
        );
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
            message:
              event.type === "deployment_status"
                ? `[status-check] ${message}`
                : message,
            recorded_at: new Date().toISOString(),
          },
        ]);
        setTimeout(
          () => logsEndRef.current?.scrollIntoView({ behavior: "smooth" }),
          50,
        );
      }
    },
    [id],
  );
  useAdminSocket(handleSocketEvent);

  // Poll while deploying
  useEffect(() => {
    if (!deployment || (deployment.status !== "deploying" && deployment.status !== "validating")) return;
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
    if (res.success) {
      setDeployment(res.data);
      // Refresh deployment data to pick up all changes
      setTimeout(loadDeployment, 2000);
    }
    setActing(false);
  };

  const handleRollback = async () => {
    const ok = await showConfirm({
      title: "Rollback deployment",
      message:
        "This will roll back the deployment. Any changes made by this deployment will be reverted.",
      confirmLabel: "Rollback",
      variant: "danger",
    });
    if (!ok) return;
    setActing(true);
    const res = await reqRollbackDeployment(id);
    if (res.success) {
      setDeployment(res.data);
      // Refresh deployment data to pick up all changes
      setTimeout(loadDeployment, 2000);
    }
    setActing(false);
  };

  if (loading) return <PageLoader />;
  if (error)
    return (
      <div className="flex flex-col items-center gap-2 py-8 text-muted">
        <p>{error}</p>
        <button onClick={loadDeployment} className="text-sm text-info hover:underline cursor-pointer">
          Retry
        </button>
      </div>
    );
  if (!deployment)
    return (
      <div className="text-center text-sm text-muted py-12">
        Deployment not found
      </div>
    );

  const currentStepIndex = timelineSteps.indexOf(
    deployment.status as (typeof timelineSteps)[number],
  );
  const isFailed = deployment.status === "failed";
  const isRolledBack = deployment.status === "rolled_back";
  const isActive = deployment.status === "deploying" || deployment.status === "validating" || deployment.status === "sending";
  const progressEntry = deployProgress[deployment.id];
  const percent = progressEntry?.percent ?? (deployment.status === "deployed" ? 100 : 0);

  return (
    <div className="py-6">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="page-title text-xl">Deployment #{deployment.id}</h1>
            <StatusBadge status={deployment.status} />
          </div>
          <p className="text-sm text-secondary mt-1">
            <Link
              href={`/stacks/${deployment.stack_id}`}
              className="text-info hover:underline"
            >
              {stackName ?? `Stack #${deployment.stack_id}`}
            </Link>{" "}
            &middot; {deployment.strategy}
          </p>
          {isActive && (
            <div className="progress-bar mt-2" style={{ width: 200 }}>
              <div
                className="progress-bar-fill pending"
                style={{ width: `${percent}%` }}
              />
            </div>
          )}
        </div>
        <div className="flex gap-2">
          {deployment.status === "pending" && (
            <Button onClick={handleApprove} disabled={acting}>
              {acting ? "Approving..." : "Approve"}
            </Button>
          )}
          {(deployment.status === "deployed" ||
            deployment.status === "deploying" ||
            deployment.status === "validating") && (
            <Button
              variant="destructive"
              onClick={handleRollback}
              disabled={acting}
            >
              {acting ? "Rolling back..." : "Rollback"}
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:gap-6">
        {/* Timeline */}
        <div className="card p-5">
          <h2 className="text-sm font-medium text-primary mb-6">
            Status Timeline
          </h2>
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
                        ? "bg-healthy/20 text-healthy ring-1 ring-[#22c55e]/30"
                        : isCurrent
                          ? "bg-info/20 text-info ring-1 ring-[#3b82f6]/30"
                          : "bg-surface-active text-muted",
                    )}
                  >
                    {i + 1}
                  </div>
                  <div>
                    <p
                      className={cn(
                        "text-sm font-medium capitalize",
                        isCompleted ? "text-primary" : "text-muted",
                      )}
                    >
                      {step}
                    </p>
                  </div>
                </div>
              );
            })}
            {(isFailed || isRolledBack) && (
              <div className="flex items-center gap-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-failed/20 text-destructive-soft ring-1 ring-red-500/30 text-xs font-medium">
                  !
                </div>
                <p className="text-sm font-medium text-destructive-soft capitalize">
                  {deployment.status.replace("_", " ")}
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Details */}
        <div className="card p-5">
          <h2 className="text-sm font-medium text-primary mb-4">Details</h2>
          <div className="space-y-4">
            <div>
              <p className="text-xs text-muted uppercase tracking-wider">
                Strategy
              </p>
              <p className="text-sm text-secondary mt-1">
                {deployment.strategy}
              </p>
            </div>

            <div>
              <p className="text-xs text-muted uppercase tracking-wider">
                Live Progress
              </p>
              <p className="text-sm text-secondary mt-1">
                {progressEntry?.status === "validating" && progressEntry.verifyCheck && progressEntry.verifyTotal
                  ? `Verifying health: check ${progressEntry.verifyCheck}/${progressEntry.verifyTotal}`
                  : liveMeta.attempt && liveMeta.maxRetries
                    ? `Attempt ${liveMeta.attempt}/${liveMeta.maxRetries}`
                    : "Attempt 1/3"}
                {liveMeta.step ? ` • ${liveMeta.step}` : ""}
              </p>
              {liveMeta.message && (
                <p className="text-xs text-muted mt-1">{liveMeta.message}</p>
              )}
              {isActive && (
                <p className="text-xs text-muted mt-1">{percent}% complete</p>
              )}
            </div>
            <div>
              <p className="text-xs text-muted uppercase tracking-wider">
                Triggered By
              </p>
              <p className="text-sm text-secondary mt-1">
                {triggeredByUser
                  ? triggeredByUser.name || triggeredByUser.email
                  : deployment.triggered_by
                    ? `User #${deployment.triggered_by}`
                    : "System"}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted uppercase tracking-wider">
                Approved By
              </p>
              <p className="text-sm text-secondary mt-1">
                {approvedByUser
                  ? approvedByUser.name || approvedByUser.email
                  : deployment.approved_by
                    ? `User #${deployment.approved_by}`
                    : "-"}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted uppercase tracking-wider">
                Started At
              </p>
              <p className="text-sm text-secondary mt-1">
                {deployment.started_at
                  ? formatDate(deployment.started_at)
                  : "-"}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted uppercase tracking-wider">
                Completed At
              </p>
              <p className="text-sm text-secondary mt-1">
                {deployment.completed_at
                  ? formatDate(deployment.completed_at)
                  : "-"}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted uppercase tracking-wider">
                Created
              </p>
              <p className="text-sm text-secondary mt-1">
                {formatDate(deployment.inserted_at)}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Deployment Logs */}
      <div className="mt-6 card p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-medium text-primary">Deployment Logs</h2>
          {isActive && (
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-info opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-info" />
            </span>
          )}
        </div>
        <div className="max-h-[400px] overflow-y-auto rounded-lg bg-background border border-border-subtle p-4 font-mono text-xs space-y-1">
          {logs.length === 0 ? (
            <p className="text-muted text-center py-8">No logs yet</p>
          ) : (
            logs.map((log, i) => (
              <div key={log.id}>
                {i > 0 &&
                  new Date(log.recorded_at).getTime() -
                    new Date(logs[i - 1].recorded_at).getTime() >
                    5_000 && (
                    <div className="flex items-center gap-2 px-2 py-2 my-1 select-none">
                      <div className="flex-1 h-px bg-border-subtle" />
                      <span className="text-[10px] font-mono text-muted whitespace-nowrap">
                        new session &middot;{" "}
                        {new Date(log.recorded_at).toLocaleTimeString([], {
                          hour12: false,
                          hour: "2-digit",
                          minute: "2-digit",
                          second: "2-digit",
                        })}
                      </span>
                      <div className="flex-1 h-px bg-border-subtle" />
                    </div>
                  )}
                <div className="flex gap-2">
                  <span className="text-dimmed shrink-0 select-none">
                    {new Date(log.recorded_at).toLocaleTimeString()}
                  </span>
                  {log.stage && (
                    <span className="text-info shrink-0">[{log.stage}]</span>
                  )}
                  <span
                    className={cn(
                      log.level === "error"
                        ? "text-destructive-soft"
                        : log.level === "warn"
                          ? "text-pending"
                          : "text-subtle",
                    )}
                  >
                    {log.message}
                  </span>
                </div>
              </div>
            ))
          )}
          <div ref={logsEndRef} />
        </div>
      </div>
    </div>
  );
}
