"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Worker } from "@/types";
import { reqGetWorkers, reqCreateWorker, reqCreateWorkerToken } from "@/services/workers.service";
import { PageLoader } from "@/components/ui/loading";
import { StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { timeAgo } from "@/lib/utils";

export default function WorkersPage() {
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [loading, setLoading] = useState(true);

  // Create form
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [hostname, setHostname] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Post-create token reveal
  const [createdWorker, setCreatedWorker] = useState<Worker | null>(null);
  const [createdToken, setCreatedToken] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      const res = await reqGetWorkers();
      if (res.success) setWorkers(res.data ?? []);
      setLoading(false);
    };
    load();
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !hostname.trim()) return;
    setSubmitting(true);

    // Create the worker
    const workerRes = await reqCreateWorker({ name: name.trim(), hostname: hostname.trim() });
    if (!workerRes.success) {
      setSubmitting(false);
      return;
    }

    // Immediately generate a token
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
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-white">Workers</h1>
          <p className="text-sm text-[#888888] mt-1">Manage your infrastructure workers</p>
        </div>
        <Button onClick={() => { setShowForm(!showForm); dismissCreated(); }}>
          {showForm ? "Cancel" : "Add Worker"}
        </Button>
      </div>

      {/* Create form */}
      {showForm && (
        <form onSubmit={handleCreate} className="rounded-xl border border-[#1a1a1a] bg-[#111111] p-6 mb-6 space-y-4">
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
          <Button type="submit" disabled={submitting || !name.trim() || !hostname.trim()}>
            {submitting ? "Creating..." : "Create Worker"}
          </Button>
        </form>
      )}

      {/* Post-create token reveal */}
      {createdWorker && createdToken && (
        <div className="rounded-xl border border-[#22c55e]/30 bg-[#22c55e]/5 p-6 mb-6">
          <div className="flex items-start justify-between mb-3">
            <div>
              <h3 className="text-sm font-semibold text-[#22c55e]">
                Worker &quot;{createdWorker.name}&quot; created
              </h3>
              <p className="text-xs text-[#888888] mt-1">
                Copy the token below and configure it on your runner. It will not be shown again.
              </p>
            </div>
            <Button variant="ghost" size="sm" onClick={dismissCreated}>
              Dismiss
            </Button>
          </div>
          <div className="rounded-lg bg-[#0a0a0a] border border-[#1a1a1a] p-4 space-y-3">
            <div>
              <p className="text-xs text-[#555555] uppercase tracking-wider mb-1">Quick Install (run on the worker VM)</p>
              <pre className="text-xs text-white font-mono whitespace-pre-wrap select-all bg-[#111111] rounded-lg p-3 mt-1">
{`curl -fsSL ${process.env.NEXT_PUBLIC_LATTICE_API}/install/runner | WORKER_TOKEN=${createdToken} WORKER_NAME=${createdWorker.name} bash`}
              </pre>
            </div>
            <div className="border-t border-[#1a1a1a] pt-3">
              <p className="text-xs text-[#555555] uppercase tracking-wider mb-1">Or configure manually</p>
              <pre className="text-xs text-[#888888] font-mono whitespace-pre-wrap select-all">
{`ORCHESTRATOR_URL=${(process.env.NEXT_PUBLIC_LATTICE_API ?? "").replace(/^http/, "ws")}/ws/worker
WORKER_TOKEN=${createdToken}
WORKER_NAME=${createdWorker.name}`}
              </pre>
            </div>
            <div className="border-t border-[#1a1a1a] pt-3">
              <p className="text-xs text-[#555555] uppercase tracking-wider mb-1">Worker Token</p>
              <p className="text-xs text-white font-mono break-all select-all">{createdToken}</p>
              <p className="text-xs text-[#555555] mt-1">This token will not be shown again.</p>
            </div>
          </div>
        </div>
      )}

      {/* Workers table */}
      <div className="rounded-xl border border-[#1a1a1a] bg-[#111111] overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-[#1a1a1a]">
              <th className="px-4 py-3 text-left text-xs font-medium text-[#888888] uppercase tracking-wider">Name</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-[#888888] uppercase tracking-wider">Hostname</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-[#888888] uppercase tracking-wider">Status</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-[#888888] uppercase tracking-wider">OS / Arch</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-[#888888] uppercase tracking-wider">Docker</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-[#888888] uppercase tracking-wider">Last Heartbeat</th>
            </tr>
          </thead>
          <tbody>
            {workers.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-12 text-center text-sm text-[#555555]">
                  No workers found
                </td>
              </tr>
            ) : (
              workers.map((worker) => (
                <tr key={worker.id} className="border-b border-[#1a1a1a] last:border-0 hover:bg-[#161616] transition-colors">
                  <td className="px-4 py-3">
                    <Link href={`/workers/${worker.id}`} className="text-sm font-medium text-white hover:text-[#3b82f6] transition-colors">
                      {worker.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-sm text-[#888888] font-mono">{worker.hostname}</td>
                  <td className="px-4 py-3">
                    <StatusBadge status={worker.status} />
                  </td>
                  <td className="px-4 py-3 text-sm text-[#888888]">
                    {worker.os ?? "-"} / {worker.arch ?? "-"}
                  </td>
                  <td className="px-4 py-3 text-sm text-[#888888] font-mono">{worker.docker_version ?? "-"}</td>
                  <td className="px-4 py-3 text-sm text-[#555555]">
                    {worker.last_heartbeat_at ? timeAgo(worker.last_heartbeat_at) : "Never"}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
