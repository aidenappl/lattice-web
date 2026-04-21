"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faRotate,
  faArrowUpRightFromSquare,
} from "@fortawesome/free-solid-svg-icons";
import type { Container, Stack, Worker, PortEntry, WorkerGroup } from "@/types";
import { reqGetAllContainers, reqGetStacks } from "@/services/stacks.service";
import { reqGetWorkers } from "@/services/workers.service";
import { parsePortMappings } from "@/lib/utils";
import { PageLoader } from "@/components/ui/loading";
import { StatusBadge } from "@/components/ui/badge";
import WorkerBadge from "@/components/ui/worker-badge";

export default function NetworksPage() {
  const [containers, setContainers] = useState<Container[]>([]);
  const [stacks, setStacks] = useState<Stack[]>([]);
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const [cRes, sRes, wRes] = await Promise.all([
      reqGetAllContainers(),
      reqGetStacks(),
      reqGetWorkers(),
    ]);
    if (cRes.success) setContainers(cRes.data ?? []);
    if (sRes.success) setStacks(sRes.data ?? []);
    if (wRes.success) setWorkers(wRes.data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    document.title = "Lattice - Networks";
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) return <PageLoader />;

  const stackMap = Object.fromEntries(stacks.map((s) => [s.id, s]));
  const workerMap = Object.fromEntries(workers.map((w) => [w.id, w]));

  // Group ports by worker
  const workerGroups: WorkerGroup[] = [];
  const workerPortMap = new Map<number, PortEntry[]>();

  for (const c of containers) {
    const stack = stackMap[c.stack_id];
    if (!stack?.worker_id) continue;

    const ports = parsePortMappings(c.port_mappings);
    for (const p of ports) {
      if (!p.host_port) continue;
      const entry: PortEntry = {
        hostPort: p.host_port,
        containerPort: p.container_port ?? "?",
        protocol: p.protocol ?? "tcp",
        container: c,
        stack,
      };
      const existing = workerPortMap.get(stack.worker_id) ?? [];
      existing.push(entry);
      workerPortMap.set(stack.worker_id, existing);
    }
  }

  for (const w of workers) {
    const ports = workerPortMap.get(w.id) ?? [];
    workerGroups.push({
      worker: w,
      ports: ports.sort(
        (a, b) => parseInt(a.hostPort, 10) - parseInt(b.hostPort, 10),
      ),
    });
  }

  // Sort workers: those with ports first
  workerGroups.sort((a, b) => b.ports.length - a.ports.length);

  const totalPorts = workerGroups.reduce((n, g) => n + g.ports.length, 0);

  return (
    <div>
      {/* Page header */}
      <div className="page-header">
        <div className="flex-1">
          <div className="page-title">Networks</div>
          <div className="page-subtitle">
            {totalPorts} port{totalPorts !== 1 ? "s" : ""} mapped across{" "}
            {workers.length} worker{workers.length !== 1 ? "s" : ""}
          </div>
        </div>
        <button onClick={load} className="btn btn-secondary">
          <FontAwesomeIcon icon={faRotate} className="h-3.5 w-3.5" />
          Refresh
        </button>
      </div>

      <div className="p-6">
      {workerGroups.length === 0 ? (
        <div className="card p-12 text-center">
          <p className="text-sm text-muted">No workers found</p>
        </div>
      ) : (
        <div className="space-y-6">
          {workerGroups.map((group) => (
            <div key={group.worker.id} className="panel">
              {/* Worker header */}
              <div className="panel-header">
                <div className="flex items-center gap-3">
                  <WorkerBadge
                    id={group.worker.id}
                    name={group.worker.name}
                    size="sm"
                  />
                  <StatusBadge status={group.worker.status} />
                  {group.worker.ip_address && (
                    <span className="text-xs text-muted font-mono">
                      {group.worker.ip_address}
                    </span>
                  )}
                </div>
                <span className="text-xs text-muted">
                  {group.ports.length} port{group.ports.length !== 1 ? "s" : ""}
                </span>
              </div>

              {/* Port table */}
              {group.ports.length === 0 ? (
                <div className="px-5 py-6 text-center">
                  <p className="text-xs text-dimmed">
                    No port mappings on this worker
                  </p>
                </div>
              ) : (
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border-subtle">
                      <th className="px-5 py-2.5 text-left text-xs font-medium text-muted uppercase tracking-wider">
                        Host Port
                      </th>
                      <th className="px-5 py-2.5 text-left text-xs font-medium text-muted uppercase tracking-wider">
                        Container Port
                      </th>
                      <th className="px-5 py-2.5 text-left text-xs font-medium text-muted uppercase tracking-wider">
                        Protocol
                      </th>
                      <th className="px-5 py-2.5 text-left text-xs font-medium text-muted uppercase tracking-wider">
                        Container
                      </th>
                      <th className="px-5 py-2.5 text-left text-xs font-medium text-muted uppercase tracking-wider">
                        Status
                      </th>
                      <th className="px-5 py-2.5 text-left text-xs font-medium text-muted uppercase tracking-wider">
                        Stack
                      </th>
                      <th className="px-5 py-2.5" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border-subtle">
                    {group.ports.map((p, i) => {
                      // Check for port conflicts within this worker
                      const conflicting =
                        group.ports.filter(
                          (other) =>
                            other.hostPort === p.hostPort &&
                            other.container.id !== p.container.id,
                        ).length > 0;

                      return (
                        <tr
                          key={`${p.container.id}-${p.hostPort}-${i}`}
                          className="hover:bg-surface-elevated transition-colors"
                        >
                          <td className="px-5 py-2.5">
                            <span
                              className={`text-sm font-mono font-medium ${conflicting ? "text-failed" : "text-primary"}`}
                              title={
                                conflicting
                                  ? "Port conflict — multiple containers using this port"
                                  : undefined
                              }
                            >
                              :{p.hostPort}
                              {conflicting && (
                                <span className="ml-1.5 text-[10px] text-failed font-sans font-normal uppercase">
                                  conflict
                                </span>
                              )}
                            </span>
                          </td>
                          <td className="px-5 py-2.5">
                            <span className="text-sm font-mono text-secondary">
                              :{p.containerPort}
                            </span>
                          </td>
                          <td className="px-5 py-2.5">
                            <span className="text-xs text-muted uppercase">
                              {p.protocol}
                            </span>
                          </td>
                          <td className="px-5 py-2.5">
                            <Link
                              href={`/containers/${p.container.id}`}
                              className="text-sm text-secondary hover:text-primary transition-colors"
                            >
                              {p.container.name}
                            </Link>
                          </td>
                          <td className="px-5 py-2.5">
                            <StatusBadge status={p.container.status} />
                          </td>
                          <td className="px-5 py-2.5">
                            <Link
                              href={`/stacks/${p.stack.id}`}
                              className="text-xs text-muted hover:text-primary transition-colors"
                            >
                              {p.stack.name}
                            </Link>
                          </td>
                          <td className="px-5 py-2.5 text-right">
                            {group.worker.ip_address &&
                              p.protocol === "tcp" && (
                                <a
                                  href={`http://${group.worker.ip_address}:${p.hostPort}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1.5 text-xs text-muted hover:text-primary transition-colors"
                                  title={`Open http://${group.worker.ip_address}:${p.hostPort}`}
                                >
                                  <FontAwesomeIcon
                                    icon={faArrowUpRightFromSquare}
                                    className="h-3 w-3"
                                  />
                                  Open
                                </a>
                              )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          ))}
        </div>
      )}
      </div>
    </div>
  );
}
