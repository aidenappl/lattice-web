"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Worker, VersionInfo } from "@/types";
import {
  reqGetWorkers,
  reqCreateWorker,
  reqCreateWorkerToken,
  reqUpgradeRunner,
  reqRebootWorker,
  reqStopAllContainers,
  reqStartAllContainers,
  reqDeleteWorker,
} from "@/services/workers.service";
import { reqGetVersions, reqGetOverview } from "@/services/admin.service";
import { Meter } from "@/components/ui/sparkline";
import { PageLoader } from "@/components/ui/loading";
import { StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LoadError } from "@/components/ui/load-error";
import { Checkbox } from "@/components/ui/checkbox";
import { BulkActionBar } from "@/components/ui/bulk-action-bar";
import { timeAgo, canEdit, isAdmin } from "@/lib/utils";
import { useAdminSocket, AdminSocketEvent } from "@/hooks/useAdminSocket";
import { useSelection } from "@/hooks/useSelection";
import { useBulkAction } from "@/hooks/useBulkAction";
import { useUser } from "@/store/hooks";
import WorkerBadge from "@/components/ui/worker-badge";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faArrowUp,
  faPlus,
  faPowerOff,
  faPlay,
  faStop,
  faTrash,
} from "@fortawesome/free-solid-svg-icons";
import toast from "react-hot-toast";

// Optional: exposes each worker's hostname as a link to its metrics endpoint.
// Unset → render the hostname as plain text (no hardcoded port assumption).
const WORKER_METRICS_PORT = process.env.NEXT_PUBLIC_WORKER_METRICS_PORT;

type Usage = { cpu: number | null; mem: number | null; disk: number | null };

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function UsageCell({ value }: { value: number | null | undefined }) {
  if (value == null) return <span className="text-muted">—</span>;
  return (
    <div className="flex items-center gap-2" title={`${value.toFixed(1)}%`}>
      <Meter value={value} width={44} />
      <span className="mono text-xs text-secondary tabular-nums w-9 text-right">
        {Math.round(value)}%
      </span>
    </div>
  );
}

export default function WorkersPage() {
  const [usage, setUsage] = useState<Record<number, Usage>>({});
  const router = useRouter();
  const user = useUser();
  const editable = canEdit(user);
  const admin = isAdmin(user);
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [search, setSearch] = useState("");
  const [latestRunner, setLatestRunner] = useState<string | null>(null);
  const [upgradingWorker, setUpgradingWorker] = useState<number | null>(null);

  // Create form
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [hostname, setHostname] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Post-create token reveal
  const [createdWorker, setCreatedWorker] = useState<Worker | null>(null);
  const [createdToken, setCreatedToken] = useState<string | null>(null);
  const [regeneratingToken, setRegeneratingToken] = useState(false);

  useEffect(() => {
    document.title = "Lattice - Workers";
  }, []);

  const load = useCallback(async () => {
    const [workersRes, versionsRes, overviewRes] = await Promise.all([
      reqGetWorkers(),
      reqGetVersions(),
      reqGetOverview(),
    ]);
    // Latest stored sample per worker; heartbeats keep it live from here.
    if (overviewRes.success) {
      const next: Record<number, Usage> = {};
      for (const m of overviewRes.data?.worker_metrics ?? []) {
        next[m.worker_id] = {
          cpu: m.cpu,
          mem: m.memory,
          disk:
            m.disk_used != null && m.disk_total
              ? (m.disk_used / m.disk_total) * 100
              : null,
        };
      }
      setUsage(next);
    }
    if (workersRes.success) {
      setWorkers(workersRes.data ?? []);
      setLoadError(false);
    } else {
      setLoadError(true);
    }
    if (versionsRes.success)
      setLatestRunner(versionsRes.data?.runner?.latest ?? null);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return workers;
    return workers.filter(
      (w) =>
        w.name.toLowerCase().includes(q) ||
        w.hostname.toLowerCase().includes(q) ||
        (w.ip_address ?? "").includes(q),
    );
  }, [workers, search]);
  const visibleIds = useMemo(() => filtered.map((w) => w.id), [filtered]);
  const selection = useSelection(visibleIds);
  const bulk = useBulkAction();
  const selected = useMemo(
    () => filtered.filter((w) => selection.isSelected(w.id)),
    [filtered, selection],
  );
  const onlineSelected = selected.filter((w) => w.status === "online");

  // Live updates via WebSocket
  const handleSocketEvent = useCallback((event: AdminSocketEvent) => {
    if (event.type === "worker_heartbeat" && event.worker_id) {
      const payload = event.payload as
        | ({ runner_version?: string } & Record<string, unknown>)
        | undefined;
      if (payload) {
        const memUsed = num(payload.memory_used_mb);
        const memTotal = num(payload.memory_total_mb);
        const diskUsed = num(payload.disk_used_mb);
        const diskTotal = num(payload.disk_total_mb);
        const wid = event.worker_id;
        setUsage((prev) => ({
          ...prev,
          [wid]: {
            cpu: num(payload.cpu_percent) ?? prev[wid]?.cpu ?? null,
            mem:
              memUsed != null && memTotal
                ? (memUsed / memTotal) * 100
                : (prev[wid]?.mem ?? null),
            disk:
              diskUsed != null && diskTotal
                ? (diskUsed / diskTotal) * 100
                : (prev[wid]?.disk ?? null),
          },
        }));
      }
      setWorkers((prev) =>
        prev.map((w) =>
          w.id === event.worker_id
            ? {
                ...w,
                status: "online",
                last_heartbeat_at: new Date().toISOString(),
                ...(payload?.runner_version
                  ? { runner_version: payload.runner_version }
                  : {}),
              }
            : w,
        ),
      );
    }
    if (event.type === "worker_connected" && event.worker_id) {
      setWorkers((prev) =>
        prev.map((w) =>
          w.id === event.worker_id
            ? {
                ...w,
                status: "online",
                last_heartbeat_at: new Date().toISOString(),
              }
            : w,
        ),
      );
    }
    if (event.type === "worker_disconnected" && event.worker_id) {
      setWorkers((prev) =>
        prev.map((w) =>
          w.id === event.worker_id ? { ...w, status: "offline" } : w,
        ),
      );
    }
  }, []);
  useAdminSocket(handleSocketEvent);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !hostname.trim()) return;
    setSubmitting(true);

    const workerRes = await reqCreateWorker({
      name: name.trim(),
      hostname: hostname.trim(),
    });
    if (!workerRes.success) {
      // Used to return silently, leaving the form looking as if nothing happened.
      toast.error(workerRes.error_message || "Failed to create worker");
      setSubmitting(false);
      return;
    }

    const tokenRes = await reqCreateWorkerToken(workerRes.data.id, "default");
    setWorkers((prev) => [workerRes.data, ...prev]);
    setCreatedWorker(workerRes.data);
    setCreatedToken(tokenRes.success ? tokenRes.data.token : null);
    if (!tokenRes.success) {
      toast.error(
        `Worker created, but token generation failed: ${
          tokenRes.error_message || "unknown error"
        }. Use "Regenerate token" below.`,
      );
    }
    setShowForm(false);
    setName("");
    setHostname("");
    setSubmitting(false);
  };

  const handleRegenerateToken = async () => {
    if (!createdWorker) return;
    setRegeneratingToken(true);
    const tokenRes = await reqCreateWorkerToken(createdWorker.id, "default");
    if (tokenRes.success) {
      setCreatedToken(tokenRes.data.token);
      toast.success("New token generated");
    } else {
      toast.error(tokenRes.error_message || "Failed to generate token");
    }
    setRegeneratingToken(false);
  };

  const dismissCreated = () => {
    setCreatedWorker(null);
    setCreatedToken(null);
  };

  if (loading) return <PageLoader />;

  return (
    <div>
      {/* Page header */}
      <div className="page-header">
        <div className="flex-1">
          <div className="page-title">Workers</div>
          <div className="page-subtitle">
            Manage your infrastructure workers
          </div>
        </div>
        {editable && (
          <Button
            variant={showForm ? "secondary" : "primary"}
            onClick={() => {
              setShowForm(!showForm);
              dismissCreated();
            }}
          >
            {!showForm && <FontAwesomeIcon icon={faPlus} className="h-3 w-3 mr-1.5" />}
            {showForm ? "Cancel" : "Add Worker"}
          </Button>
        )}
      </div>

      {workers.length > 0 && (
        <div className="filters-bar">
          <input
            type="search"
            aria-label="Search workers"
            placeholder="Search by name, hostname or IP…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="form-input !w-full sm:!w-72 !h-8 !text-sm"
          />
          <span className="ml-auto text-xs text-muted whitespace-nowrap">
            {workers.filter((w) => w.status === "online").length} of{" "}
            {workers.length} online
          </span>
        </div>
      )}

      {editable && (
        <BulkActionBar
          count={selection.count}
          noun="worker"
          onClear={selection.clear}
          busy={bulk.running}
          actions={[
            {
              label: "Upgrade runner",
              icon: faArrowUp,
              hidden: !admin,
              disabled: !latestRunner,
              onClick: () =>
                bulk
                  .run({
                    items: onlineSelected.filter(
                      (w) => w.runner_version !== latestRunner,
                    ),
                    verb: "Upgrade",
                    verbPast: "Sent upgrade to",
                    noun: "worker",
                    name: (w) => w.name,
                    action: (w) => reqUpgradeRunner(w.id),
                    confirm: {
                      message: `Each online worker that is not on ${latestRunner} downloads it and restarts its runner. Containers keep running.`,
                    },
                  })
                  .then((r) => {
                    if (r === null && onlineSelected.every((w) => w.runner_version === latestRunner))
                      toast("Every selected online worker is already up to date");
                    if (r) setTimeout(load, 3000);
                  }),
            },
            {
              label: "Start containers",
              icon: faPlay,
              onClick: () =>
                bulk
                  .run({
                    items: onlineSelected,
                    verb: "Start all on",
                    verbPast: "Started containers on",
                    noun: "worker",
                    name: (w) => w.name,
                    action: (w) => reqStartAllContainers(w.id),
                  })
                  .then((r) => r && setTimeout(load, 2000)),
            },
            {
              label: "Stop containers",
              icon: faStop,
              onClick: () =>
                bulk
                  .run({
                    items: onlineSelected,
                    verb: "Stop all on",
                    verbPast: "Stopped containers on",
                    noun: "worker",
                    name: (w) => w.name,
                    action: (w) => reqStopAllContainers(w.id),
                    confirm: {
                      title: `Stop every container on ${onlineSelected.length} worker${onlineSelected.length !== 1 ? "s" : ""}?`,
                      message:
                        "Every container on each worker is stopped, including databases and anything Lattice itself depends on.",
                      variant: "danger",
                    },
                  })
                  .then((r) => r && setTimeout(load, 2000)),
            },
            {
              label: "Reboot",
              icon: faPowerOff,
              hidden: !admin,
              onClick: () =>
                bulk
                  .run({
                    items: onlineSelected,
                    verb: "Reboot",
                    verbPast: "Rebooted",
                    noun: "worker",
                    name: (w) => w.name,
                    action: (w) => reqRebootWorker(w.id),
                    confirm: {
                      message:
                        "Each machine reboots. Everything on it is unavailable until it comes back and its containers restart.",
                      variant: "danger",
                    },
                    concurrency: 1,
                  })
                  .then((r) => r && setTimeout(load, 5000)),
            },
            {
              label: "Delete",
              icon: faTrash,
              variant: "danger",
              onClick: () =>
                bulk
                  .run({
                    items: selected,
                    verb: "Delete",
                    verbPast: "Deleted",
                    noun: "worker",
                    name: (w) => w.name,
                    action: (w) => reqDeleteWorker(w.id),
                    confirm: {
                      message:
                        "Each worker is removed from Lattice and its tokens stop working. Containers already running on the machine are left alone.",
                      variant: "danger",
                    },
                  })
                  .then((r) => {
                    if (r) {
                      selection.clear();
                      load();
                    }
                  }),
            },
          ]}
        />
      )}

      <div className="py-6">
        {/* Create form */}
        {showForm && (
          <form
            onSubmit={handleCreate}
            className="card p-6 mb-6 space-y-4"
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input
                id="worker-name"
                label="Name"
                placeholder="production-1"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
              <Input
                id="worker-hostname"
                label="Hostname"
                placeholder="10.0.0.1 or worker-1.appleby.cloud"
                value={hostname}
                onChange={(e) => setHostname(e.target.value)}
                required
              />
            </div>
            <Button
              type="submit"
              disabled={submitting || !name.trim() || !hostname.trim()}
            >
              {submitting ? "Creating..." : "Create Worker"}
            </Button>
          </form>
        )}

        {/* Post-create token reveal */}
        {createdWorker && (
          <div className="rounded-lg border border-healthy/30 bg-healthy/5 p-6 mb-6">
            <div className="flex items-start justify-between mb-3">
              <div>
                <h3 className="text-sm font-semibold text-healthy">
                  Worker &quot;{createdWorker.name}&quot; created
                </h3>
                <p className="text-xs text-secondary mt-1">
                  {createdToken
                    ? "Copy the token below and configure it on your runner. It will not be shown again."
                    : "The worker was created, but its access token could not be generated. Regenerate one below to finish setup."}
                </p>
              </div>
              <Button variant="ghost" size="sm" onClick={dismissCreated}>
                Dismiss
              </Button>
            </div>
            {!createdToken ? (
              <div className="rounded-lg bg-background border border-border p-4">
                <p className="text-xs text-secondary mb-3">
                  No token is available for this worker yet. Generate one to get
                  the install command.
                </p>
                <Button
                  size="sm"
                  onClick={handleRegenerateToken}
                  loading={regeneratingToken}
                >
                  Regenerate token
                </Button>
              </div>
            ) : (
            <div className="rounded-lg bg-background border border-border p-4 space-y-3">
              <div>
                <p className="form-label">Quick Install (run on the worker VM)</p>
                <pre className="text-xs text-primary font-mono whitespace-pre-wrap select-all bg-surface rounded-lg p-3 mt-1">
                  {`curl -fsSL ${process.env.NEXT_PUBLIC_LATTICE_API}/install/runner | WORKER_TOKEN=${createdToken} WORKER_NAME=${createdWorker.name} bash`}
                </pre>
              </div>
              <div className="border-t border-border-subtle pt-3">
                <p className="form-label">Or configure manually</p>
                <pre className="text-xs text-secondary font-mono whitespace-pre-wrap select-all">
                  {`ORCHESTRATOR_URL=${(process.env.NEXT_PUBLIC_LATTICE_API ?? "").replace(/^http/, "ws")}/ws/worker
WORKER_TOKEN=${createdToken}
WORKER_NAME=${createdWorker.name}`}
                </pre>
              </div>
              <div className="border-t border-border-subtle pt-3">
                <p className="form-label">Worker Token</p>
                <p className="text-xs text-primary font-mono break-all select-all">
                  {createdToken}
                </p>
                <p className="text-xs text-muted mt-1">
                  This token will not be shown again.
                </p>
              </div>
            </div>
            )}
          </div>
        )}

        {/* Workers table */}
        {loadError && workers.length === 0 ? (
          <LoadError
            title="Failed to load workers"
            message="Could not reach lattice-api to load the worker list."
            onRetry={() => {
              setLoading(true);
              load();
            }}
          />
        ) : (
        <div className="panel">
          <table className="data-table">
            <thead>
              <tr>
                {editable && (
                  <th className="select-col">
                    <Checkbox
                      label="Select all visible workers"
                      checked={selection.allSelected}
                      indeterminate={selection.someSelected}
                      onChange={selection.toggleAll}
                      disabled={selection.empty}
                    />
                  </th>
                )}
                <th>Name</th>
                <th className="hidden sm:table-cell">Hostname</th>
                <th>Status</th>
                <th className="hidden md:table-cell">CPU</th>
                <th className="hidden md:table-cell">Memory</th>
                <th className="hidden lg:table-cell">Disk</th>
                <th className="hidden xl:table-cell">OS / Arch</th>
                <th className="hidden xl:table-cell">Docker</th>
                <th className="hidden md:table-cell">Runner</th>
                <th className="hidden sm:table-cell">Last Heartbeat</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td
                    colSpan={11}
                    className="text-center text-sm text-muted !py-12"
                  >
                    {workers.length === 0
                      ? "No workers yet. Add one to start deploying stacks."
                      : "No workers match this search"}
                  </td>
                </tr>
              ) : (
                filtered.map((worker) => (
                  <tr
                    key={worker.id}
                    // Rows already showed a pointer cursor but clicking one did
                    // nothing unless you hit the name badge exactly.
                    onClick={() => router.push(`/workers/${worker.id}`)}
                    className={selection.isSelected(worker.id) ? "is-selected" : ""}
                  >
                    {editable && (
                      <td className="select-col">
                        <Checkbox
                          label={`Select ${worker.name}`}
                          checked={selection.isSelected(worker.id)}
                          onChange={(_, e) =>
                            selection.toggle(worker.id, { shiftKey: e.shiftKey })
                          }
                        />
                      </td>
                    )}
                    <td onClick={(e) => e.stopPropagation()}>
                      <WorkerBadge id={worker.id} name={worker.name} />
                    </td>
                    <td
                      className="mono hidden sm:table-cell"
                      onClick={(e) => WORKER_METRICS_PORT && e.stopPropagation()}
                    >
                      {WORKER_METRICS_PORT ? (
                        <Link
                          href={`http://${worker.hostname}:${WORKER_METRICS_PORT}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-primary hover:text-info transition-colors truncate max-w-[200px] inline-block"
                        >
                          {worker.hostname}
                        </Link>
                      ) : (
                        <span className="text-primary truncate max-w-[200px] inline-block">
                          {worker.hostname}
                        </span>
                      )}
                    </td>
                    <td>
                      <StatusBadge status={worker.status} />
                    </td>
                    <td className="hidden md:table-cell">
                      <UsageCell value={worker.status === "online" ? usage[worker.id]?.cpu : null} />
                    </td>
                    <td className="hidden md:table-cell">
                      <UsageCell value={worker.status === "online" ? usage[worker.id]?.mem : null} />
                    </td>
                    <td className="hidden lg:table-cell">
                      <UsageCell value={usage[worker.id]?.disk} />
                    </td>
                    <td className="text-secondary hidden xl:table-cell whitespace-nowrap">
                      {worker.os ?? "-"}/{worker.arch ?? "-"}
                    </td>
                    <td className="mono text-secondary hidden xl:table-cell">
                      {worker.docker_version ?? "-"}
                    </td>
                    <td className="hidden md:table-cell">
                      {worker.runner_version ? (
                        <div className="flex items-center gap-2">
                          <span className="mono text-secondary">
                            {worker.runner_version}
                          </span>
                          {latestRunner &&
                            worker.runner_version !== latestRunner && (
                              <button
                                onClick={async (e) => {
                                  e.stopPropagation();
                                  setUpgradingWorker(worker.id);
                                  const res = await reqUpgradeRunner(worker.id);
                                  if (res.success) {
                                    toast.success(
                                      `Upgrade command sent to ${worker.name}`,
                                    );
                                  } else {
                                    toast.error(
                                      "error_message" in res
                                        ? res.error_message
                                        : "Upgrade failed",
                                    );
                                  }
                                  setUpgradingWorker(null);
                                }}
                                disabled={
                                  upgradingWorker === worker.id ||
                                  worker.status !== "online"
                                }
                                title={`Upgrade to ${latestRunner}`}
                                className="badge badge-pending cursor-pointer hover:opacity-80 disabled:opacity-50"
                              >
                                <FontAwesomeIcon
                                  icon={faArrowUp}
                                  className="h-2.5 w-2.5"
                                />
                                {upgradingWorker === worker.id
                                  ? "..."
                                  : latestRunner}
                              </button>
                            )}
                        </div>
                      ) : (
                        <span className="text-muted">-</span>
                      )}
                    </td>
                    <td className="text-muted hidden sm:table-cell whitespace-nowrap">
                      {worker.last_heartbeat_at
                        ? timeAgo(worker.last_heartbeat_at)
                        : "Never"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        )}
      </div>
    </div>
  );
}
