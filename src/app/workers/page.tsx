"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { Worker, VersionInfo } from "@/types";
import {
  reqGetWorkers,
  reqCreateWorker,
  reqCreateWorkerToken,
  reqUpgradeRunner,
} from "@/services/workers.service";
import { reqGetVersions } from "@/services/admin.service";
import { PageLoader } from "@/components/ui/loading";
import { StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { timeAgo } from "@/lib/utils";
import { useAdminSocket, AdminSocketEvent } from "@/hooks/useAdminSocket";
import WorkerBadge from "@/components/ui/worker-badge";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faArrowUp, faPlus } from "@fortawesome/free-solid-svg-icons";
import toast from "react-hot-toast";

export default function WorkersPage() {
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [loading, setLoading] = useState(true);
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

  useEffect(() => {
    document.title = "Lattice - Workers";
  }, []);

  useEffect(() => {
    const load = async () => {
      const [workersRes, versionsRes] = await Promise.all([
        reqGetWorkers(),
        reqGetVersions(),
      ]);
      if (workersRes.success) setWorkers(workersRes.data ?? []);
      if (versionsRes.success) setLatestRunner(versionsRes.data.runner.latest);
      setLoading(false);
    };
    load();
  }, []);

  // Live updates via WebSocket
  const handleSocketEvent = useCallback((event: AdminSocketEvent) => {
    if (event.type === "worker_heartbeat" && event.worker_id) {
      const payload = event.payload as { runner_version?: string } | undefined;
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
      setSubmitting(false);
      return;
    }

    const tokenRes = await reqCreateWorkerToken(workerRes.data.id, "default");
    setWorkers((prev) => [workerRes.data, ...prev]);
    setCreatedWorker(workerRes.data);
    setCreatedToken(tokenRes.success ? tokenRes.data.token : null);
    setShowForm(false);
    setName("");
    setHostname("");
    setSubmitting(false);
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
        <Button
          onClick={() => {
            setShowForm(!showForm);
            dismissCreated();
          }}
        >
          <FontAwesomeIcon icon={faPlus} className="h-3 w-3" />
          {showForm ? "Cancel" : "Add Worker"}
        </Button>
      </div>

      <div className="p-6">
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
        {createdWorker && createdToken && (
          <div className="rounded-lg border border-healthy/30 bg-healthy/5 p-6 mb-6">
            <div className="flex items-start justify-between mb-3">
              <div>
                <h3 className="text-sm font-semibold text-healthy">
                  Worker &quot;{createdWorker.name}&quot; created
                </h3>
                <p className="text-xs text-secondary mt-1">
                  Copy the token below and configure it on your runner. It will
                  not be shown again.
                </p>
              </div>
              <Button variant="ghost" size="sm" onClick={dismissCreated}>
                Dismiss
              </Button>
            </div>
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
          </div>
        )}

        {/* Workers table */}
        <div className="panel">
          <table className="data-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Hostname</th>
                <th>Status</th>
                <th>OS / Arch</th>
                <th>Docker</th>
                <th>Runner</th>
                <th>Last Heartbeat</th>
              </tr>
            </thead>
            <tbody>
              {workers.length === 0 ? (
                <tr>
                  <td
                    colSpan={7}
                    className="text-center text-sm text-muted !py-12"
                  >
                    No workers found
                  </td>
                </tr>
              ) : (
                workers.map((worker) => (
                  <tr key={worker.id}>
                    <td>
                      <WorkerBadge id={worker.id} name={worker.name} />
                    </td>
                    <td className="mono">
                      <Link
                        href={`http://${worker.hostname}:9100`}
                        target="_blank"
                        className="text-primary hover:text-info transition-colors"
                      >
                        {worker.hostname}
                      </Link>
                    </td>
                    <td>
                      <StatusBadge status={worker.status} />
                    </td>
                    <td className="text-secondary">
                      {worker.os ?? "-"} / {worker.arch ?? "-"}
                    </td>
                    <td className="mono text-secondary">
                      {worker.docker_version ?? "-"}
                    </td>
                    <td>
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
                    <td className="text-muted">
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
      </div>
    </div>
  );
}
