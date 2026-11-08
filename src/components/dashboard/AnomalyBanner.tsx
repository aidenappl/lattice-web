"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import type { HealthAnomaly } from "@/types";
import { reqGetAnomalies } from "@/services/admin.service";
import { reqForceRemoveContainer } from "@/services/workers.service";
import { useAdminSocket } from "@/hooks/useAdminSocket";
import { useConfirm } from "@/components/ui/confirm-modal";
import { Alert } from "@/components/ui/alert";
import toast from "react-hot-toast";

export default function AnomalyBanner() {
  const [anomalies, setAnomalies] = useState<HealthAnomaly[]>([]);
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());
  const [removing, setRemoving] = useState<string | null>(null);
  const showConfirm = useConfirm();

  // Fetch anomalies on mount
  useEffect(() => {
    reqGetAnomalies().then((res) => {
      if (res.success && res.data) {
        setAnomalies(res.data);
      }
    });
  }, []);

  // Listen for real-time anomaly updates
  useAdminSocket(
    useCallback((event: Record<string, unknown>) => {
      if (event.type === "health_anomalies") {
        const payload = event.payload as HealthAnomaly[] | undefined;
        if (payload) {
          setAnomalies(payload);
          setDismissedIds(new Set()); // reset dismissals on new scan
        }
      }
    }, [])
  );

  const handleForceRemove = async (anomaly: HealthAnomaly) => {
    const confirmed = await showConfirm({
      title: "Force remove container",
      message: `Remove "${anomaly.container_name}" from ${anomaly.worker_name}? This will stop and delete the container.`,
      confirmLabel: "Remove",
      variant: "danger",
    });
    if (!confirmed) return;
    setRemoving(anomaly.id);
    const res = await reqForceRemoveContainer(anomaly.worker_id, anomaly.container_name!);
    if (res.success) {
      toast.success(`Force remove sent for ${anomaly.container_name}`);
      setAnomalies((prev) => prev.filter((a) => a.id !== anomaly.id));
    }
    setRemoving(null);
  };

  const dismiss = (id: string) => {
    setDismissedIds((prev) => new Set(prev).add(id));
  };

  const visible = anomalies.filter((a) => !dismissedIds.has(a.id));
  if (visible.length === 0) return null;

  const typeLabels: Record<string, string> = {
    orphaned_container: "Orphaned",
    missing_container: "Missing",
    status_mismatch: "Mismatch",
    unmanaged_container: "Unmanaged",
    stale_state: "Stale",
    low_disk: "Low disk",
    control_plane_low_disk: "Low disk",
  };

  const typeColors: Record<string, string> = {
    orphaned_container: "text-warning",
    missing_container: "text-destructive",
    status_mismatch: "text-warning",
    unmanaged_container: "text-muted",
    stale_state: "text-warning",
    low_disk: "text-destructive",
    control_plane_low_disk: "text-destructive",
  };

  return (
    <Alert variant="warning">
      <div>
        <strong>Health anomalies detected ({visible.length})</strong>
        <p className="text-xs text-muted mt-1">
          The health scanner found issues across your fleet. Review and take
          action below.
        </p>
        <div className="mt-3 space-y-2">
          {visible.map((a) => (
            <div
              key={a.id}
              className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-3 bg-surface/50 rounded px-3 py-2 min-w-0"
            >
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 min-w-0">
                <span
                  className={`text-[10px] font-semibold uppercase tracking-wider ${typeColors[a.type] ?? "text-muted"}`}
                >
                  {typeLabels[a.type] ?? a.type}
                </span>
                {a.container_name && (
                  <span className="text-sm font-mono truncate">
                    {a.container_name}
                  </span>
                )}
                <span className="text-xs text-muted hidden sm:inline">
                  on{" "}
                  {/* The control plane is not a worker (worker_id 0): no page to link. */}
                  {a.type === "control_plane_low_disk" ? (
                    <span className="text-primary">control plane</span>
                  ) : (
                    <Link
                      href={`/workers/${a.worker_id}`}
                      className="underline hover:text-primary"
                    >
                      {a.worker_name}
                    </Link>
                  )}
                </span>
                {/* A worker-level anomaly has no container: its message is the whole story. */}
                <span className={`text-xs text-muted ${a.container_name ? "hidden md:inline" : "basis-full sm:basis-auto"}`}>
                  {a.container_name ? "— " : ""}
                  {a.message}
                </span>
              </div>
              <div className="flex items-center gap-2 shrink-0 self-end sm:self-auto">
                {(a.type === "orphaned_container" ||
                  a.type === "unmanaged_container") &&
                  a.container_name && (
                    <button
                      onClick={() => handleForceRemove(a)}
                      disabled={removing === a.id}
                      className="text-xs px-2 py-1 rounded bg-destructive/10 text-destructive hover:bg-destructive/20 disabled:opacity-50"
                    >
                      {removing === a.id ? "Removing..." : "Remove"}
                    </button>
                  )}
                <button
                  onClick={() => dismiss(a.id)}
                  className="text-xs text-muted hover:text-primary"
                  title="Dismiss"
                >
                  Dismiss
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </Alert>
  );
}
