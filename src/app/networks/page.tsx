"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { Container, Stack, Worker } from "@/types";
import { reqGetAllContainers, reqGetStacks } from "@/services/stacks.service";
import { reqGetWorkers } from "@/services/workers.service";
import { PageLoader } from "@/components/ui/loading";
import { StatusBadge } from "@/components/ui/badge";

type PortEntry = {
  hostPort: string;
  containerPort: string;
  protocol: string;
  container: Container;
  stack: Stack;
};

type WorkerGroup = {
  worker: Worker;
  ports: PortEntry[];
};

function parsePortMappings(
  raw: string | null,
): { host_port?: string; container_port?: string; protocol?: string }[] {
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

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
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-white">Networks</h1>
          <p className="text-sm text-[#888888] mt-1">
            {totalPorts} port{totalPorts !== 1 ? "s" : ""} mapped across{" "}
            {workers.length} worker{workers.length !== 1 ? "s" : ""}
          </p>
        </div>
        <button
          onClick={load}
          className="inline-flex items-center justify-center font-medium rounded-lg transition-colors cursor-pointer focus:outline-none border border-[#2a2a2a] bg-[#111111] text-white hover:bg-[#1a1a1a] h-8 px-3.5 text-sm gap-1.5"
        >
          <svg
            className="h-3.5 w-3.5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
            />
          </svg>
          Refresh
        </button>
      </div>

      {workerGroups.length === 0 ? (
        <div className="rounded-xl border border-[#1a1a1a] bg-[#111111] p-12 text-center">
          <p className="text-sm text-[#555555]">No workers found</p>
        </div>
      ) : (
        <div className="space-y-6">
          {workerGroups.map((group) => (
            <div
              key={group.worker.id}
              className="rounded-xl border border-[#1a1a1a] bg-[#111111] overflow-hidden"
            >
              {/* Worker header */}
              <div className="flex items-center justify-between px-5 py-3.5 border-b border-[#1a1a1a] bg-[#0d0d0d]">
                <div className="flex items-center gap-3">
                  <Link
                    href={`/workers/${group.worker.id}`}
                    className="text-sm font-medium text-white hover:text-[#3b82f6] transition-colors"
                  >
                    {group.worker.name}
                  </Link>
                  <StatusBadge status={group.worker.status} />
                  {group.worker.ip_address && (
                    <span className="text-xs text-[#555555] font-mono">
                      {group.worker.ip_address}
                    </span>
                  )}
                </div>
                <span className="text-xs text-[#555555]">
                  {group.ports.length} port{group.ports.length !== 1 ? "s" : ""}
                </span>
              </div>

              {/* Port table */}
              {group.ports.length === 0 ? (
                <div className="px-5 py-6 text-center">
                  <p className="text-xs text-[#444444]">
                    No port mappings on this worker
                  </p>
                </div>
              ) : (
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-[#141414]">
                      <th className="px-5 py-2.5 text-left text-xs font-medium text-[#555555] uppercase tracking-wider">
                        Host Port
                      </th>
                      <th className="px-5 py-2.5 text-left text-xs font-medium text-[#555555] uppercase tracking-wider">
                        Container Port
                      </th>
                      <th className="px-5 py-2.5 text-left text-xs font-medium text-[#555555] uppercase tracking-wider">
                        Protocol
                      </th>
                      <th className="px-5 py-2.5 text-left text-xs font-medium text-[#555555] uppercase tracking-wider">
                        Container
                      </th>
                      <th className="px-5 py-2.5 text-left text-xs font-medium text-[#555555] uppercase tracking-wider">
                        Status
                      </th>
                      <th className="px-5 py-2.5 text-left text-xs font-medium text-[#555555] uppercase tracking-wider">
                        Stack
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#141414]">
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
                          className="hover:bg-[#161616] transition-colors"
                        >
                          <td className="px-5 py-2.5">
                            <span
                              className={`text-sm font-mono font-medium ${conflicting ? "text-[#ef4444]" : "text-white"}`}
                              title={
                                conflicting
                                  ? "Port conflict — multiple containers using this port"
                                  : undefined
                              }
                            >
                              :{p.hostPort}
                              {conflicting && (
                                <span className="ml-1.5 text-[10px] text-[#ef4444] font-sans font-normal uppercase">
                                  conflict
                                </span>
                              )}
                            </span>
                          </td>
                          <td className="px-5 py-2.5">
                            <span className="text-sm font-mono text-[#888888]">
                              :{p.containerPort}
                            </span>
                          </td>
                          <td className="px-5 py-2.5">
                            <span className="text-xs text-[#555555] uppercase">
                              {p.protocol}
                            </span>
                          </td>
                          <td className="px-5 py-2.5">
                            <Link
                              href={`/containers/${p.container.id}`}
                              className="text-sm text-[#888888] hover:text-white transition-colors"
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
                              className="text-xs text-[#555555] hover:text-white transition-colors"
                            >
                              {p.stack.name}
                            </Link>
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
  );
}
