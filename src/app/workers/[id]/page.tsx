"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Worker, WorkerToken, WorkerMetrics, Stack } from "@/types";
import {
  reqGetWorker,
  reqUpdateWorker,
  reqGetWorkerMetrics,
  reqGetWorkerTokens,
  reqCreateWorkerToken,
  reqDeleteWorkerToken,
} from "@/services/workers.service";
import { reqGetStacks } from "@/services/stacks.service";
import { PageLoader } from "@/components/ui/loading";
import { StatusBadge } from "@/components/ui/badge";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatDate, timeAgo } from "@/lib/utils";

function formatDisk(usedMB: number, totalMB: number): string {
  if (totalMB >= 1024)
    return `${(usedMB / 1024).toFixed(1)} / ${(totalMB / 1024).toFixed(1)} GB`;
  return `${Math.round(usedMB)} / ${Math.round(totalMB)} MB`;
}

function formatBytes(bytes: number): string {
  if (bytes >= 1073741824) return `${(bytes / 1073741824).toFixed(2)} GB`;
  if (bytes >= 1048576) return `${(bytes / 1048576).toFixed(1)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${bytes} B`;
}

function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function barColor(pct: number): string {
  if (pct > 90) return "bg-[#ef4444]";
  if (pct > 70) return "bg-[#eab308]";
  return "bg-[#3b82f6]";
}

function MetricCard({
  label,
  value,
  sub,
  color,
  percent,
}: {
  label: string;
  value: string;
  sub?: string;
  color: string;
  percent?: number;
}) {
  return (
    <div>
      <p className="text-xs text-[#555555] uppercase tracking-wider">{label}</p>
      <p className={`text-lg font-semibold mt-1 ${color}`}>{value}</p>
      {sub && <p className="text-xs text-[#555555] mt-0.5">{sub}</p>}
      {percent != null && (
        <div className="h-1 bg-[#1a1a1a] rounded-full mt-2 overflow-hidden">
          <div
            className={`h-full rounded-full ${barColor(percent)}`}
            style={{ width: `${Math.min(percent, 100)}%` }}
          />
        </div>
      )}
    </div>
  );
}

export default function WorkerDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = Number(params.id);

  const [worker, setWorker] = useState<Worker | null>(null);
  const [tokens, setTokens] = useState<WorkerToken[]>([]);
  const [metrics, setMetrics] = useState<WorkerMetrics[]>([]);
  const [stacks, setStacks] = useState<Stack[]>([]);
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
      const [workerRes, metricsRes, tokensRes, stacksRes] = await Promise.all([
        reqGetWorker(id),
        reqGetWorkerMetrics(id),
        reqGetWorkerTokens(id),
        reqGetStacks(),
      ]);
      if (workerRes.success) {
        setWorker(workerRes.data);
        setEditName(workerRes.data.name);
        setEditHostname(workerRes.data.hostname);
        setEditLabels(workerRes.data.labels ?? "");
      }
      if (metricsRes.success) setMetrics(metricsRes.data ?? []);
      if (tokensRes.success) setTokens(tokensRes.data ?? []);
      if (stacksRes.success)
        setStacks(
          (stacksRes.data ?? []).filter((s: Stack) => s.worker_id === id),
        );
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
  if (!worker)
    return (
      <div className="text-center text-sm text-[#555555] py-12">
        Worker not found
      </div>
    );

  const latestMetric = metrics.length > 0 ? metrics[0] : null;

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
            <Button
              onClick={handleSave}
              disabled={saving || !editName.trim() || !editHostname.trim()}
            >
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
                <p className="text-xs text-[#555555] uppercase tracking-wider">
                  IP Address
                </p>
                <p className="text-sm text-[#888888] mt-1 font-mono">
                  {worker.ip_address ?? "Unknown"}
                </p>
              </div>
              <div>
                <p className="text-xs text-[#555555] uppercase tracking-wider">
                  OS / Arch
                </p>
                <p className="text-sm text-[#888888] mt-1">
                  {worker.os ?? "Unknown"} / {worker.arch ?? "Unknown"}
                </p>
              </div>
              <div>
                <p className="text-xs text-[#555555] uppercase tracking-wider">
                  Docker Version
                </p>
                <p className="text-sm text-[#888888] mt-1 font-mono">
                  {worker.docker_version ?? "Unknown"}
                </p>
              </div>
              <div>
                <p className="text-xs text-[#555555] uppercase tracking-wider">
                  Runner Version
                </p>
                <p className="text-sm text-[#888888] mt-1 font-mono">
                  {worker.runner_version ?? "Unknown"}
                </p>
              </div>
              <div>
                <p className="text-xs text-[#555555] uppercase tracking-wider">
                  Last Heartbeat
                </p>
                <p className="text-sm text-[#888888] mt-1">
                  {worker.last_heartbeat_at
                    ? timeAgo(worker.last_heartbeat_at)
                    : "Never"}
                </p>
              </div>
              <div>
                <p className="text-xs text-[#555555] uppercase tracking-wider">
                  Labels
                </p>
                <p className="text-sm text-[#888888] mt-1">
                  {worker.labels ?? "None"}
                </p>
              </div>
              <div>
                <p className="text-xs text-[#555555] uppercase tracking-wider">
                  Created
                </p>
                <p className="text-sm text-[#888888] mt-1">
                  {formatDate(worker.inserted_at)}
                </p>
              </div>
            </div>
          </div>

          {/* Metrics */}
          {latestMetric && (
            <div className="rounded-xl border border-[#1a1a1a] bg-[#111111] p-5">
              <h2 className="text-sm font-medium text-white mb-4">
                Latest Metrics
              </h2>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
                <MetricCard
                  label="CPU"
                  value={`${latestMetric.cpu_percent?.toFixed(1) ?? "-"}%`}
                  sub={
                    latestMetric.cpu_cores
                      ? `${latestMetric.cpu_cores} cores`
                      : undefined
                  }
                  color="text-[#3b82f6]"
                  percent={latestMetric.cpu_percent ?? undefined}
                />
                <MetricCard
                  label="Memory"
                  value={
                    latestMetric.memory_used_mb != null &&
                    latestMetric.memory_total_mb != null
                      ? `${Math.round(latestMetric.memory_used_mb)} / ${Math.round(latestMetric.memory_total_mb)} MB`
                      : "-"
                  }
                  color="text-[#a855f7]"
                  percent={
                    latestMetric.memory_used_mb != null &&
                    latestMetric.memory_total_mb
                      ? (latestMetric.memory_used_mb /
                          latestMetric.memory_total_mb) *
                        100
                      : undefined
                  }
                />
                <MetricCard
                  label="Disk"
                  value={
                    latestMetric.disk_used_mb != null &&
                    latestMetric.disk_total_mb != null
                      ? formatDisk(
                          latestMetric.disk_used_mb,
                          latestMetric.disk_total_mb,
                        )
                      : "-"
                  }
                  color="text-[#eab308]"
                  percent={
                    latestMetric.disk_used_mb != null &&
                    latestMetric.disk_total_mb
                      ? (latestMetric.disk_used_mb /
                          latestMetric.disk_total_mb) *
                        100
                      : undefined
                  }
                />
                <MetricCard
                  label="Containers"
                  value={
                    latestMetric.container_running_count != null
                      ? `${latestMetric.container_running_count} / ${latestMetric.container_count ?? 0}`
                      : `${latestMetric.container_count ?? "-"}`
                  }
                  sub="running / total"
                  color="text-[#22c55e]"
                />
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div>
                  <p className="text-xs text-[#555555] uppercase tracking-wider">
                    Load Average
                  </p>
                  <p className="text-sm text-[#888888] mt-1 font-mono">
                    {latestMetric.load_avg_1?.toFixed(2) ?? "-"} /{" "}
                    {latestMetric.load_avg_5?.toFixed(2) ?? "-"} /{" "}
                    {latestMetric.load_avg_15?.toFixed(2) ?? "-"}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-[#555555] uppercase tracking-wider">
                    Swap
                  </p>
                  <p className="text-sm text-[#888888] mt-1">
                    {latestMetric.swap_total_mb != null &&
                    latestMetric.swap_total_mb > 0
                      ? `${Math.round(latestMetric.swap_used_mb ?? 0)} / ${Math.round(latestMetric.swap_total_mb)} MB`
                      : "None"}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-[#555555] uppercase tracking-wider">
                    Network
                  </p>
                  <p className="text-sm text-[#888888] mt-1 font-mono">
                    {latestMetric.network_rx_bytes != null
                      ? formatBytes(latestMetric.network_rx_bytes)
                      : "-"}{" "}
                    rx
                  </p>
                  <p className="text-sm text-[#888888] font-mono">
                    {latestMetric.network_tx_bytes != null
                      ? formatBytes(latestMetric.network_tx_bytes)
                      : "-"}{" "}
                    tx
                  </p>
                </div>
                <div>
                  <p className="text-xs text-[#555555] uppercase tracking-wider">
                    System
                  </p>
                  <p className="text-sm text-[#888888] mt-1">
                    {latestMetric.uptime_seconds != null
                      ? formatUptime(latestMetric.uptime_seconds)
                      : "-"}{" "}
                    uptime
                  </p>
                  <p className="text-sm text-[#888888]">
                    {latestMetric.process_count ?? "-"} processes
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Associated Stacks */}
          <div className="rounded-xl border border-[#1a1a1a] bg-[#111111] p-5">
            <h2 className="text-sm font-medium text-white mb-4">
              Associated Stacks
            </h2>
            <div className="space-y-2">
              {stacks.length === 0 ? (
                <p className="text-xs text-[#555555] py-4 text-center">
                  No stacks assigned to this worker
                </p>
              ) : (
                stacks.map((stack) => (
                  <button
                    key={stack.id}
                    onClick={() => router.push(`/stacks/${stack.id}`)}
                    className="w-full flex items-center justify-between rounded-lg bg-[#161616] px-3 py-2 hover:bg-[#1a1a1a] transition-colors text-left"
                  >
                    <div>
                      <p className="text-sm text-white">{stack.name}</p>
                      <p className="text-xs text-[#555555]">
                        {stack.deployment_strategy}
                      </p>
                    </div>
                    <StatusBadge status={stack.status} />
                  </button>
                ))
              )}
            </div>
          </div>

          {/* Worker Tokens */}
          <div className="rounded-xl border border-[#1a1a1a] bg-[#111111] p-5">
            <h2 className="text-sm font-medium text-white mb-4">
              Worker Tokens
            </h2>

            {/* Create Token */}
            <div className="flex gap-2 mb-4">
              <Input
                placeholder="Token name"
                value={newTokenName}
                onChange={(e) => setNewTokenName(e.target.value)}
                className="flex-1"
              />
              <Button
                size="md"
                onClick={handleCreateToken}
                disabled={!newTokenName.trim()}
              >
                Create
              </Button>
            </div>

            {createdToken && (
              <div className="mb-4 rounded-lg border border-[#22c55e]/30 bg-[#22c55e]/5 p-3">
                <p className="text-xs text-[#22c55e] mb-1 font-medium">
                  Token created — copy it now, it won&apos;t be shown again:
                </p>
                <p className="text-xs text-white font-mono break-all select-all">
                  {createdToken}
                </p>
              </div>
            )}

            {/* Token List */}
            <div className="space-y-2">
              {tokens.length === 0 ? (
                <p className="text-xs text-[#555555] py-4 text-center">
                  No tokens yet
                </p>
              ) : (
                tokens.map((token) => (
                  <div
                    key={token.id}
                    className="flex items-center justify-between rounded-lg bg-[#161616] px-3 py-2"
                  >
                    <div>
                      <p className="text-sm text-white">{token.name}</p>
                      <p className="text-xs text-[#555555]">
                        {token.last_used_at
                          ? `Used ${timeAgo(token.last_used_at)}`
                          : "Never used"}
                      </p>
                    </div>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => handleDeleteToken(token.id)}
                    >
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
