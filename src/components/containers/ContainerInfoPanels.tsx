"use client";

import type { Container, HealthCheckConfig } from "@/types";
import { StatusBadge } from "@/components/ui/badge";
import { formatDate, timeAgo, formatUptime, formatTestCommand } from "@/lib/utils";
import { InfoRow } from "./ContainerDetailsTab";

export interface ContainerInfoPanelsProps {
  container: Container;
  healthConfig: HealthCheckConfig | null;
}

export function ContainerInfoPanels({
  container,
  healthConfig,
}: ContainerInfoPanelsProps) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div className="lg:col-span-2 panel">
        <div className="panel-header">
          <span>Container Info</span>
        </div>
        <div className="p-4">
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-3">
            <InfoRow
              label="Container ID"
              value={
                <span className="font-mono text-xs">{container.id}</span>
              }
            />
            <InfoRow
              label="Status"
              value={<StatusBadge status={container.status} />}
            />
            <InfoRow label="Replicas" value={String(container.replicas)} />
            <InfoRow
              label="Restart Policy"
              value={container.restart_policy ?? "none"}
            />
            <InfoRow
              label="Uptime"
              value={
                container.status === "running" && container.started_at
                  ? formatUptime(Math.floor((Date.now() - new Date(container.started_at).getTime()) / 1000))
                  : <span className="text-muted">—</span>
              }
            />
            <InfoRow
              label="Created"
              value={formatDate(container.inserted_at)}
            />
            <InfoRow
              label="Last Updated"
              value={timeAgo(container.updated_at)}
            />
            <InfoRow
              label="Image Watching"
              value={
                container.registry_id ? (
                  <span className="flex items-center gap-1.5">
                    <span className="h-1.5 w-1.5 rounded-full bg-info animate-pulse" />
                    <span className="text-info">Active</span>
                  </span>
                ) : (
                  <span className="text-muted">Not configured</span>
                )
              }
            />
            {container.cpu_limit != null && (
              <InfoRow
                label="CPU Limit"
                value={`${container.cpu_limit} cores`}
              />
            )}
            {container.memory_limit != null && (
              <InfoRow
                label="Memory Limit"
                value={`${container.memory_limit} MB`}
              />
            )}
          </dl>
        </div>
      </div>

      <div className="panel">
        <div className="panel-header">
          <span>Health</span>
        </div>
        <div className="p-4">
          {container.health_status === "none" && !healthConfig ? (
            <p className="text-xs text-muted">No health check configured</p>
          ) : (
            <dl className="space-y-3">
              <InfoRow
                label="Health Status"
                value={<StatusBadge status={container.health_status} />}
              />
              {healthConfig && (
                <InfoRow
                  label="Test Command"
                  value={
                    <span className="font-mono text-xs break-all">
                      {formatTestCommand(healthConfig.test)}
                    </span>
                  }
                />
              )}
              {healthConfig?.interval && (
                <InfoRow label="Interval" value={healthConfig.interval} />
              )}
              {healthConfig?.timeout && (
                <InfoRow label="Timeout" value={healthConfig.timeout} />
              )}
              {healthConfig?.retries != null && (
                <InfoRow
                  label="Retries"
                  value={String(healthConfig.retries)}
                />
              )}
            </dl>
          )}
        </div>
      </div>
    </div>
  );
}
