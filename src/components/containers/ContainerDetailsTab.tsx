"use client";

import type { Container } from "@/types";
import { parsePortMappings, parseEnvVars, parseVolumes, prettyField } from "@/lib/utils";

export function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-[10px] text-muted uppercase tracking-wider font-mono">
        {label}
      </dt>
      <dd className="mt-0.5 text-sm text-primary">{value}</dd>
    </div>
  );
}

export interface ContainerDetailsTabProps {
  container: Container;
}

export function ContainerDetailsTab({ container }: ContainerDetailsTabProps) {
  const ports = parsePortMappings(container.port_mappings);
  const envVars = parseEnvVars(container.env_vars);
  const volumes = parseVolumes(container.volumes);

  return (
    <div className="p-5 space-y-6">
      {/* Image */}
      <section>
        <h3 className="text-xs font-medium text-muted uppercase tracking-wider mb-3">
          Image
        </h3>
        <p className="text-sm text-primary font-mono">
          {container.image}:{container.tag}
        </p>
      </section>

      {/* Image Watching */}
      <section>
        <h3 className="text-xs font-medium text-muted uppercase tracking-wider mb-3">
          Image Watching
        </h3>
        {container.registry_id ? (
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-info animate-pulse" />
            <p className="text-sm text-primary">
              Watching for updates (Registry #{container.registry_id})
            </p>
          </div>
        ) : (
          <p className="text-sm text-muted">
            Not configured — link a registry in the edit form to enable automatic image update detection
          </p>
        )}
      </section>

      {/* Port mappings */}
      <section>
        <h3 className="text-xs font-medium text-muted uppercase tracking-wider mb-3">
          Port Configuration
        </h3>
        {ports.length === 0 ? (
          <p className="text-sm text-muted">No ports exposed</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {ports.map((p, i) => (
              <span
                key={i}
                className="rounded-lg border border-border-strong bg-surface-elevated px-3 py-1 text-xs font-mono text-primary"
              >
                {p.host_port ?? "?"}:{p.container_port ?? "?"}
                {p.protocol && p.protocol !== "tcp"
                  ? `/${p.protocol}`
                  : ""}
              </span>
            ))}
          </div>
        )}
      </section>

      {/* Volumes */}
      <section>
        <h3 className="text-xs font-medium text-muted uppercase tracking-wider mb-3">
          Volumes
        </h3>
        {volumes.length === 0 ? (
          <p className="text-sm text-muted">No volumes mounted</p>
        ) : (
          <div className="space-y-1">
            {volumes.map((v, i) => (
              <div
                key={i}
                className="flex items-center gap-2 text-xs font-mono"
              >
                <span className="text-secondary">{v.host ?? "?"}</span>
                <span className="text-dimmed">&rarr;</span>
                <span className="text-primary">{v.container ?? "?"}</span>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* CMD */}
      {container.command && (
        <section>
          <h3 className="text-xs font-medium text-muted uppercase tracking-wider mb-3">
            CMD
          </h3>
          <code className="text-sm text-subtle font-mono">
            {prettyField(container.command)}
          </code>
        </section>
      )}

      {/* ENTRYPOINT */}
      {container.entrypoint && (
        <section>
          <h3 className="text-xs font-medium text-muted uppercase tracking-wider mb-3">
            ENTRYPOINT
          </h3>
          <code className="text-sm text-subtle font-mono">
            {prettyField(container.entrypoint)}
          </code>
        </section>
      )}

      {/* Resource limits */}
      <section>
        <h3 className="text-xs font-medium text-muted uppercase tracking-wider mb-3">
          Resource Limits
        </h3>
        <div className="flex flex-wrap gap-4">
          <div>
            <p className="text-xs text-muted">CPU</p>
            <p className="text-sm text-primary">
              {container.cpu_limit != null
                ? `${container.cpu_limit} cores`
                : "unlimited"}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted">Memory</p>
            <p className="text-sm text-primary">
              {container.memory_limit != null
                ? `${container.memory_limit} MB`
                : "unlimited"}
            </p>
          </div>
        </div>
      </section>

      {/* Environment variables */}
      <section>
        <h3 className="text-xs font-medium text-muted uppercase tracking-wider mb-3">
          Environment Variables
        </h3>
        {Object.keys(envVars).length === 0 ? (
          <p className="text-sm text-muted">No environment variables</p>
        ) : (
          <div className="rounded-lg border border-border-subtle overflow-hidden overflow-x-auto">
            <table className="w-full min-w-[300px]">
              <tbody className="divide-y divide-border-subtle">
                {Object.entries(envVars).map(([k, v]) => (
                  <tr key={k}>
                    <td className="px-3 py-2 text-xs font-mono text-secondary w-1/3 align-top">
                      {k}
                    </td>
                    <td className="px-3 py-2 text-xs font-mono text-primary break-all">
                      {v}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
