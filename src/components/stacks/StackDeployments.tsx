"use client";

import { useRef } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faCircleCheck,
  faCircleXmark,
  faRotateRight,
} from "@fortawesome/free-solid-svg-icons";
import { Deployment, DeploymentLog } from "@/types";
import { StatusBadge } from "@/components/ui/badge";
import { timeAgo } from "@/lib/utils";
import { useDeploymentProgress } from "@/hooks/useDeploymentProgress";

interface StackDeploymentsProps {
  deployments: Deployment[];
  selectedDeployment: number | null;
  deploymentLogs: DeploymentLog[];
  deploymentLogsLoading: boolean;
  onSelectDeployment: (id: number) => void;
}

export function StackDeployments({
  deployments,
  selectedDeployment,
  deploymentLogs,
  deploymentLogsLoading,
  onSelectDeployment,
}: StackDeploymentsProps) {
  const deploymentLogsEndRef = useRef<HTMLDivElement>(null);
  const deployProgress = useDeploymentProgress();

  return (
    <div className="space-y-5">
      <div className="panel">
        <div className="panel-header">
          <span>Deployment History</span>
          <span className="muted">{deployments.length}</span>
        </div>
        <div className="p-3 space-y-1.5">
          {deployments.length === 0 ? (
            <p className="text-xs text-muted text-center py-4">
              No deployments yet
            </p>
          ) : (
            deployments.slice(0, 10).map((d) => (
              <button
                key={d.id}
                onClick={() => onSelectDeployment(d.id)}
                className={`stack-deploy-item ${selectedDeployment === d.id ? "active" : ""}`}
              >
                <div className="flex items-center gap-2.5">
                  <FontAwesomeIcon
                    icon={
                      d.status === "deployed"
                        ? faCircleCheck
                        : d.status === "failed"
                          ? faCircleXmark
                          : faRotateRight
                    }
                    className={`h-3.5 w-3.5 ${d.status === "deployed" ? "text-healthy" : d.status === "failed" ? "text-failed" : "text-pending"}`}
                  />
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-primary">
                      {d.strategy}{" "}
                      <span className="text-muted">#{d.id}</span>
                    </p>
                    <p className="text-[11px] text-muted">
                      {timeAgo(d.inserted_at)}
                    </p>
                  </div>
                </div>
                <StatusBadge status={d.status} />
                {(d.status === "deploying" || d.status === "validating" || d.status === "sending") && (
                  <div className="progress-bar" style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 2, borderRadius: 0 }}>
                    <div
                      className="progress-bar-fill pending"
                      style={{ width: `${deployProgress[d.id]?.percent ?? 15}%` }}
                    />
                  </div>
                )}
              </button>
            ))
          )}
        </div>
      </div>

      {/* Deployment Logs */}
      {selectedDeployment && (
        <div className="panel">
          <div className="panel-header">
            <span>Deploy #{selectedDeployment}</span>
            <div className="panel-header-right">
              <button
                onClick={() => onSelectDeployment(selectedDeployment)}
                className="text-xs text-muted hover:text-secondary transition-colors"
              >
                Refresh
              </button>
            </div>
          </div>
          <div className="p-3">
            {deploymentLogsLoading ? (
              <p className="text-xs text-muted text-center py-4">
                Loading logs...
              </p>
            ) : deploymentLogs.length === 0 ? (
              <p className="text-xs text-muted text-center py-4">
                No logs yet
              </p>
            ) : (
              <div className="space-y-0.5 max-h-[500px] overflow-y-auto overflow-x-hidden font-mono text-xs">
                {deploymentLogs.map((log) => (
                  <div
                    key={log.id}
                    className={`px-2 py-1 rounded ${log.level === "error" ? "bg-red-950/30 text-red-400" : "text-secondary"}`}
                  >
                    <span className="text-dimmed tabular-nums">
                      {new Date(log.recorded_at).toLocaleTimeString()}
                    </span>
                    {log.stage && (
                      <span className="text-muted ml-1">
                        [{log.stage}]
                      </span>
                    )}
                    <span className="ml-1 break-words">{log.message}</span>
                  </div>
                ))}
                <div ref={deploymentLogsEndRef} />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
