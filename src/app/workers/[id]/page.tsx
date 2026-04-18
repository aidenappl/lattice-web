"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Worker, WorkerToken, WorkerMetrics } from "@/types";
import {
  reqGetWorker,
  reqUpdateWorker,
  reqGetWorkerMetrics,
  reqGetWorkerTokens,
  reqCreateWorkerToken,
  reqDeleteWorkerToken,
} from "@/services/workers.service";
import { PageLoader } from "@/components/ui/loading";
import { StatusBadge } from "@/components/ui/badge";

function formatDisk(usedMB: number, totalMB: number): string {
  if (totalMB >= 1024) {
    return `${(usedMB / 1024).toFixed(1)} / ${(totalMB / 1024).toFixed(1)} GB`;
  }
  return `${Math.round(usedMB)} / ${Math.round(totalMB)} MB`;
}
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatDate, timeAgo } from "@/lib/utils";

export default function WorkerDetailPage() {
  const params = useParams();
  const id = Number(params.id);

  const [worker, setWorker] = useState<Worker | null>(null);
  const [tokens, setTokens] = useState<WorkerToken[]>([]);
  const [metrics, setMetrics] = useState<WorkerMetrics[]>([]);
  const [loading, setLoading] = useState(true);

  // Edit state
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState("");
  const [editHostname, setEditHostname] = useState("");
  const [editLabels, setEditLabels] = useState("");
  const [saving, setSaving] = useState(false);

  // Token state
  const [newTokenName, setNewTokenName] = useState("");
  const [createdToken, setCreatedToken] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      const [workerRes, metricsRes, tokensRes] = await Promise.all([
        reqGetWorker(id),
        reqGetWorkerMetrics(id),
        reqGetWorkerTokens(id),
      ]);
      if (workerRes.success) {
        setWorker(workerRes.data);
        setEditName(workerRes.data.name);
        setEditHostname(workerRes.data.hostname);
        setEditLabels(workerRes.data.labels ?? "");
      }
      if (metricsRes.success) setMetrics(metricsRes.data ?? []);
      if (tokensRes.success) setTokens(tokensRes.data ?? []);
      setLoading(false);
    };
    load();
  }, [id]);

  const handleSave = async () => {
    setSaving(true);
    const res = await reqUpdateWorker(id, {
      name: editName.trim(),
      hostname: editHostname.trim(),
      labels: editLabels.trim() || undefined,
    });
    if (res.success) {
      setWorker(res.data);
      setEditing(false);
    }
    setSaving(false);
  };

  const handleCancel = () => {
    if (worker) {
      setEditName(worker.name);
      setEditHostname(worker.hostname);
      setEditLabels(worker.labels ?? "");
    }
    setEditing(false);
  };

  const handleCreateToken = async () => {
    if (!newTokenName.trim()) return;
    const res = await reqCreateWorkerToken(id, newTokenName.trim());
    if (res.success) {
      setCreatedToken(res.data.token);
      // Add the token to the list (res.data has all WorkerToken fields + token)
      setTokens((prev) => [
        {
          id: res.data.id,
          worker_id: res.data.worker_id,
          name: res.data.name,
          last_used_at: res.data.last_used_at,
          active: res.data.active,
          inserted_at: res.data.inserted_at,
          updated_at: res.data.updated_at,
        },
        ...prev,
      ]);
      setNewTokenName("");
    }
  };

  const handleDeleteToken = async (tokenId: number) => {
    const res = await reqDeleteWorkerToken(tokenId);
    if (res.success) {
      setTokens((prev) => prev.filter((t) => t.id !== tokenId));
    }
  };

  if (loading) return <PageLoader />;
  if (!worker) return <div className="text-center text-sm text-[#555555] py-12">Worker not found</div>;

  const latestMetric = metrics.length > 0 ? metrics[metrics.length - 1] : null;

  return (
    <div>
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-semibold text-white">{worker.name}</h1>
          <StatusBadge status={worker.status} />
        </div>
        {!editing && (
          <Button variant="secondary" onClick={() => setEditing(true)}>
            Edit Worker
          </Button>
        )}
      </div>

      {/* Edit form */}
      {editing && (
        <div className="rounded-xl border border-[#1a1a1a] bg-[#111111] p-5 mb-6">
          <h2 className="text-sm font-medium text-white mb-4">Edit Worker</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
            <Input
              id="edit-name"
              label="Name"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
            />
            <Input
              id="edit-hostname"
              label="Hostname"
              value={editHostname}
              onChange={(e) => setEditHostname(e.target.value)}
            />
            <Input
              id="edit-labels"
              label="Labels"
              placeholder="e.g. env=production,region=us-east"
              value={editLabels}
              onChange={(e) => setEditLabels(e.target.value)}
            />
          </div>
          <div className="flex gap-2">
            <Button onClick={handleSave} disabled={saving || !editName.trim() || !editHostname.trim()}>
              {saving ? "Saving..." : "Save Changes"}
            </Button>
            <Button variant="ghost" onClick={handleCancel}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Info + Metrics */}
        <div className="lg:col-span-2 space-y-6">
          <div className="rounded-xl border border-[#1a1a1a] bg-[#111111] p-5">
            <h2 className="text-sm font-medium text-white mb-4">Worker Info</h2>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-[#555555] uppercase tracking-wider">IP Address</p>
                <p className="text-sm text-[#888888] mt-1 font-mono">{worker.ip_address ?? "Unknown"}</p>
              </div>
              <div>
                <p className="text-xs text-[#555555] uppercase tracking-wider">OS / Arch</p>
                <p className="text-sm text-[#888888] mt-1">{worker.os ?? "Unknown"} / {worker.arch ?? "Unknown"}</p>
              </div>
              <div>
                <p className="text-xs text-[#555555] uppercase tracking-wider">Docker Version</p>
                <p className="text-sm text-[#888888] mt-1 font-mono">{worker.docker_version ?? "Unknown"}</p>
              </div>
              <div>
                <p className="text-xs text-[#555555] uppercase tracking-wider">Last Heartbeat</p>
                <p className="text-sm text-[#888888] mt-1">{worker.last_heartbeat_at ? timeAgo(worker.last_heartbeat_at) : "Never"}</p>
              </div>
              <div>
                <p className="text-xs text-[#555555] uppercase tracking-wider">Labels</p>
                <p className="text-sm text-[#888888] mt-1">{worker.labels ?? "None"}</p>
              </div>
              <div>
                <p className="text-xs text-[#555555] uppercase tracking-wider">Created</p>
                <p className="text-sm text-[#888888] mt-1">{formatDate(worker.inserted_at)}</p>
              </div>
            </div>
          </div>

          {/* Metrics */}
          {latestMetric && (
            <div className="rounded-xl border border-[#1a1a1a] bg-[#111111] p-5">
              <h2 className="text-sm font-medium text-white mb-4">Latest Metrics</h2>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div>
                  <p className="text-xs text-[#555555] uppercase tracking-wider">CPU</p>
                  <p className="text-lg font-semibold text-[#3b82f6] mt-1">{latestMetric.cpu_percent?.toFixed(1) ?? "-"}%</p>
                </div>
                <div>
                  <p className="text-xs text-[#555555] uppercase tracking-wider">Memory</p>
                  <p className="text-lg font-semibold text-[#a855f7] mt-1">
                    {latestMetric.memory_used_mb != null && latestMetric.memory_total_mb != null
                      ? `${Math.round(latestMetric.memory_used_mb)} / ${Math.round(latestMetric.memory_total_mb)} MB`
                      : "-"}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-[#555555] uppercase tracking-wider">Disk</p>
                  <p className="text-lg font-semibold text-[#eab308] mt-1">
                    {latestMetric.disk_used_mb != null && latestMetric.disk_total_mb != null
                      ? formatDisk(latestMetric.disk_used_mb, latestMetric.disk_total_mb)
                      : "-"}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-[#555555] uppercase tracking-wider">Containers</p>
                  <p className="text-lg font-semibold text-[#22c55e] mt-1">{latestMetric.container_count ?? "-"}</p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Token Management */}
        <div className="space-y-6">
          <div className="rounded-xl border border-[#1a1a1a] bg-[#111111] p-5">
            <h2 className="text-sm font-medium text-white mb-4">Worker Tokens</h2>

            {/* Create Token */}
            <div className="flex gap-2 mb-4">
              <Input
                placeholder="Token name"
                value={newTokenName}
                onChange={(e) => setNewTokenName(e.target.value)}
                className="flex-1"
              />
              <Button size="md" onClick={handleCreateToken} disabled={!newTokenName.trim()}>
                Create
              </Button>
            </div>

            {createdToken && (
              <div className="mb-4 rounded-lg border border-[#22c55e]/30 bg-[#22c55e]/5 p-3">
                <p className="text-xs text-[#22c55e] mb-1 font-medium">Token created — copy it now, it won&apos;t be shown again:</p>
                <p className="text-xs text-white font-mono break-all select-all">{createdToken}</p>
              </div>
            )}

            {/* Token List */}
            <div className="space-y-2">
              {tokens.length === 0 ? (
                <p className="text-xs text-[#555555] py-4 text-center">No tokens yet</p>
              ) : (
                tokens.map((token) => (
                  <div key={token.id} className="flex items-center justify-between rounded-lg bg-[#161616] px-3 py-2">
                    <div>
                      <p className="text-sm text-white">{token.name}</p>
                      <p className="text-xs text-[#555555]">
                        {token.last_used_at ? `Used ${timeAgo(token.last_used_at)}` : "Never used"}
                      </p>
                    </div>
                    <Button variant="destructive" size="sm" onClick={() => handleDeleteToken(token.id)}>
                      Delete
                    </Button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
