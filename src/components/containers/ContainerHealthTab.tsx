"use client";

import type { Container, HealthCheckConfig } from "@/types";
import { StatusBadge } from "@/components/ui/badge";
import { formatTestCommand } from "@/lib/utils";

export interface ContainerHealthTabProps {
  container: Container;
  healthConfig: HealthCheckConfig | null;
}

export function ContainerHealthTab({
  container,
  healthConfig,
}: ContainerHealthTabProps) {
  return (
    <div className="p-5 space-y-4">
      <div>
        <h3 className="text-xs font-medium text-muted uppercase tracking-wider mb-3">
          Health Status
        </h3>
        <StatusBadge status={container.health_status} />
      </div>
      {healthConfig ? (
        <>
          {/* Test command */}
          <section>
            <h3 className="text-xs font-medium text-muted uppercase tracking-wider mb-3">
              Test Command
            </h3>
            <code className="text-sm font-mono text-subtle bg-background-alt rounded-lg px-3 py-2 block whitespace-pre-wrap break-all">
              {formatTestCommand(healthConfig.test)}
            </code>
          </section>

          {/* Config table */}
          <section>
            <h3 className="text-xs font-medium text-muted uppercase tracking-wider mb-3">
              Configuration
            </h3>
            <div className="rounded-lg border border-border-subtle overflow-hidden">
              <table className="w-full">
                <tbody className="divide-y divide-border-subtle">
                  {healthConfig.interval && (
                    <tr>
                      <td className="px-3 py-2 text-xs font-mono text-secondary w-1/3">
                        Interval
                      </td>
                      <td className="px-3 py-2 text-xs font-mono text-primary">
                        {healthConfig.interval}
                      </td>
                    </tr>
                  )}
                  {healthConfig.timeout && (
                    <tr>
                      <td className="px-3 py-2 text-xs font-mono text-secondary w-1/3">
                        Timeout
                      </td>
                      <td className="px-3 py-2 text-xs font-mono text-primary">
                        {healthConfig.timeout}
                      </td>
                    </tr>
                  )}
                  {healthConfig.retries != null && (
                    <tr>
                      <td className="px-3 py-2 text-xs font-mono text-secondary w-1/3">
                        Retries
                      </td>
                      <td className="px-3 py-2 text-xs font-mono text-primary">
                        {healthConfig.retries}
                      </td>
                    </tr>
                  )}
                  {healthConfig.start_period && (
                    <tr>
                      <td className="px-3 py-2 text-xs font-mono text-secondary w-1/3">
                        Start Period
                      </td>
                      <td className="px-3 py-2 text-xs font-mono text-primary">
                        {healthConfig.start_period}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <p className="text-xs text-muted">
            Health checks are configured in your compose file and synced
            automatically.
          </p>
        </>
      ) : (
        <p className="text-sm text-muted">
          No health check detected. Configure a healthcheck in your
          compose file and redeploy — Lattice will sync it automatically.
        </p>
      )}
    </div>
  );
}
