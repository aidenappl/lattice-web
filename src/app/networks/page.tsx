"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faRotate,
  faArrowUpRightFromSquare,
  faNetworkWired,
  faPlug,
} from "@fortawesome/free-solid-svg-icons";
import type {
  Container,
  Stack,
  Worker,
  PortEntry,
  WorkerGroup,
  GlobalEnvVar,
  LatticeNetwork,
} from "@/types";
import { reqGetAllContainers, reqGetStacks } from "@/services/stacks.service";
import { reqGetWorkers } from "@/services/workers.service";
import { reqGetGlobalEnvVars } from "@/services/admin.service";
import { reqListAllNetworks } from "@/services/networks.service";
import { parsePortMappings, parseJSON } from "@/lib/utils";
import { PageLoader } from "@/components/ui/loading";
import { StatusBadge } from "@/components/ui/badge";
import WorkerBadge from "@/components/ui/worker-badge";

type Tab = "networks" | "ports";

export default function NetworksPage() {
  const [tab, setTab] = useState<Tab>("networks");
  const [containers, setContainers] = useState<Container[]>([]);
  const [stacks, setStacks] = useState<Stack[]>([]);
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [globalEnvVars, setGlobalEnvVars] = useState<GlobalEnvVar[]>([]);
  const [networks, setNetworks] = useState<LatticeNetwork[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const [cRes, sRes, wRes, gRes, nRes] = await Promise.all([
      reqGetAllContainers(),
      reqGetStacks(),
      reqGetWorkers(),
      reqGetGlobalEnvVars(),
      reqListAllNetworks(),
    ]);
    if (cRes.success) setContainers(cRes.data ?? []);
    if (sRes.success) setStacks(sRes.data ?? []);
    if (wRes.success) setWorkers(wRes.data ?? []);
    if (gRes.success) setGlobalEnvVars(gRes.data ?? []);
    if (nRes.success) setNetworks(nRes.data ?? []);
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

  return (
    <div>
      {/* Page header */}
      <div className="page-header">
        <div className="flex-1">
          <div className="page-title">Networks</div>
          <div className="page-subtitle">
            Docker networks and port mappings across your fleet
          </div>
        </div>
        <button onClick={load} className="btn btn-secondary">
          <FontAwesomeIcon icon={faRotate} className="h-3.5 w-3.5" />
          Refresh
        </button>
      </div>

      {/* Tabs */}
      <div className="px-6 pt-2">
        <div className="flex gap-1 border-b border-border-subtle">
          <button
            onClick={() => setTab("networks")}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors cursor-pointer ${
              tab === "networks"
                ? "border-info text-primary"
                : "border-transparent text-muted hover:text-secondary"
            }`}
          >
            <FontAwesomeIcon icon={faNetworkWired} className="h-3.5 w-3.5" />
            Networks
            <span className="text-xs text-muted bg-surface-alt px-1.5 py-0.5 rounded">
              {networks.length}
            </span>
          </button>
          <button
            onClick={() => setTab("ports")}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors cursor-pointer ${
              tab === "ports"
                ? "border-info text-primary"
                : "border-transparent text-muted hover:text-secondary"
            }`}
          >
            <FontAwesomeIcon icon={faPlug} className="h-3.5 w-3.5" />
            Ports
          </button>
        </div>
      </div>

      <div className="p-6">
        {tab === "networks" ? (
          <NetworksTab
            networks={networks}
            stacks={stacks}
            stackMap={stackMap}
            workers={workers}
            containers={containers}
          />
        ) : (
          <PortsTab
            containers={containers}
            stacks={stacks}
            workers={workers}
            globalEnvVars={globalEnvVars}
            stackMap={stackMap}
          />
        )}
      </div>
    </div>
  );
}

// ── Networks Tab ────────────────────────────────────────────────────

function NetworksTab({
  networks,
  stacks,
  stackMap,
  workers,
  containers,
}: {
  networks: LatticeNetwork[];
  stacks: Stack[];
  stackMap: Record<number, Stack>;
  workers: Worker[];
  containers: Container[];
}) {
  if (networks.length === 0) {
    return (
      <div className="card p-12 text-center">
        <p className="text-sm text-muted">No networks found</p>
        <p className="text-xs text-dimmed mt-1">
          Networks are created automatically when you deploy stacks with
          docker-compose definitions
        </p>
      </div>
    );
  }

  // Group networks by stack
  const byStack = new Map<number, LatticeNetwork[]>();
  for (const n of networks) {
    const list = byStack.get(n.stack_id) ?? [];
    list.push(n);
    byStack.set(n.stack_id, list);
  }

  // Build a map of containers per network name (from the same stack)
  const containersByNetwork = new Map<string, Container[]>();
  for (const c of containers) {
    const netNames = parseJSON<string[]>(c.networks) ?? [];
    for (const name of netNames) {
      const key = `${c.stack_id}:${name}`;
      const list = containersByNetwork.get(key) ?? [];
      list.push(c);
      containersByNetwork.set(key, list);
    }
  }

  // Sort stacks: those with networks first, then by name
  const stackIds = Array.from(byStack.keys()).sort((a, b) => {
    const nameA = stackMap[a]?.name ?? "";
    const nameB = stackMap[b]?.name ?? "";
    return nameA.localeCompare(nameB);
  });

  // Find worker for each stack
  const workerMap = Object.fromEntries(workers.map((w) => [w.id, w]));

  return (
    <div className="space-y-6">
      {stackIds.map((stackId) => {
        const stack = stackMap[stackId];
        const stackNetworks = byStack.get(stackId) ?? [];
        const worker = stack?.worker_id ? workerMap[stack.worker_id] : null;

        return (
          <div key={stackId} className="panel">
            <div className="panel-header">
              <div className="flex items-center gap-3">
                <Link
                  href={`/stacks/${stackId}`}
                  className="text-sm font-medium text-primary hover:text-info transition-colors"
                >
                  {stack?.name ?? `Stack #${stackId}`}
                </Link>
                {stack && <StatusBadge status={stack.status} />}
                {worker && (
                  <WorkerBadge
                    id={worker.id}
                    name={worker.name}
                    size="sm"
                  />
                )}
              </div>
              <span className="text-xs text-muted">
                {stackNetworks.length} network
                {stackNetworks.length !== 1 ? "s" : ""}
              </span>
            </div>
            <table className="w-full">
              <thead>
                <tr className="border-b border-border-subtle">
                  <th className="px-5 py-2.5 text-left text-xs font-medium text-muted uppercase tracking-wider">
                    Name
                  </th>
                  <th className="px-5 py-2.5 text-left text-xs font-medium text-muted uppercase tracking-wider">
                    Driver
                  </th>
                  <th className="px-5 py-2.5 text-left text-xs font-medium text-muted uppercase tracking-wider">
                    Subnet
                  </th>
                  <th className="px-5 py-2.5 text-left text-xs font-medium text-muted uppercase tracking-wider">
                    Connected Containers
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-subtle">
                {stackNetworks.map((n) => {
                  const key = `${n.stack_id}:${n.name}`;
                  const connected = containersByNetwork.get(key) ?? [];
                  return (
                    <tr
                      key={n.id}
                      className="hover:bg-surface-elevated transition-colors"
                    >
                      <td className="px-5 py-2.5">
                        <span className="text-sm font-mono font-medium text-primary">
                          {n.name}
                        </span>
                      </td>
                      <td className="px-5 py-2.5">
                        <span className="text-xs text-secondary bg-surface-alt px-2 py-0.5 rounded font-mono">
                          {n.driver || "bridge"}
                        </span>
                      </td>
                      <td className="px-5 py-2.5">
                        <span className="text-sm font-mono text-secondary">
                          {n.subnet ?? "-"}
                        </span>
                      </td>
                      <td className="px-5 py-2.5">
                        {connected.length === 0 ? (
                          <span className="text-xs text-dimmed">none</span>
                        ) : (
                          <div className="flex flex-wrap gap-1.5">
                            {connected.map((c) => (
                              <Link
                                key={c.id}
                                href={`/containers/${c.id}`}
                                className="inline-flex items-center gap-1.5 text-xs text-secondary hover:text-primary transition-colors bg-surface-alt px-2 py-0.5 rounded"
                              >
                                <span
                                  className={`h-1.5 w-1.5 rounded-full ${c.status === "running" ? "bg-[#22c55e]" : c.status === "stopped" ? "bg-[#888888]" : "bg-[#eab308]"}`}
                                />
                                {c.name}
                              </Link>
                            ))}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        );
      })}
    </div>
  );
}

// ── Ports Tab ───────────────────────────────────────────────────────

function PortsTab({
  containers,
  stacks,
  workers,
  globalEnvVars,
  stackMap,
}: {
  containers: Container[];
  stacks: Stack[];
  workers: Worker[];
  globalEnvVars: GlobalEnvVar[];
  stackMap: Record<number, Stack>;
}) {
  const workerMap = Object.fromEntries(workers.map((w) => [w.id, w]));

  // Build global env lookup
  const globalEnv: Record<string, string> = {};
  for (const gv of globalEnvVars) {
    globalEnv[gv.key] = gv.value;
  }

  // Resolve ${VAR} references in a string against env vars
  const resolveVars = (s: string, envMap: Record<string, string>): string =>
    s.replace(
      /\$\{([^}]+)\}|\$([A-Za-z_][A-Za-z0-9_]*)/g,
      (match, braced, bare) => {
        const key = braced ?? bare;
        return envMap[key] ?? match;
      },
    );

  // Group ports by worker
  const workerGroups: WorkerGroup[] = [];
  const workerPortMap = new Map<number, PortEntry[]>();

  for (const c of containers) {
    const stack = stackMap[c.stack_id];
    if (!stack?.worker_id) continue;

    // Build merged env: global -> stack -> container
    const mergedEnv: Record<string, string> = { ...globalEnv };
    const stackEnv = parseJSON<Record<string, string>>(stack.env_vars) ?? {};
    Object.assign(mergedEnv, stackEnv);
    const containerEnv = parseJSON<Record<string, string>>(c.env_vars) ?? {};
    Object.assign(mergedEnv, containerEnv);

    const ports = parsePortMappings(c.port_mappings);
    for (const p of ports) {
      if (!p.host_port) continue;
      const entry: PortEntry = {
        hostPort: resolveVars(p.host_port, mergedEnv),
        containerPort: resolveVars(p.container_port ?? "?", mergedEnv),
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

  if (workerGroups.length === 0) {
    return (
      <div className="card p-12 text-center">
        <p className="text-sm text-muted">No workers found</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <p className="text-xs text-muted">
        {totalPorts} port{totalPorts !== 1 ? "s" : ""} mapped across{" "}
        {workers.length} worker{workers.length !== 1 ? "s" : ""}
      </p>
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
                        {group.worker.ip_address && p.protocol === "tcp" && (
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
  );
}
