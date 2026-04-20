"use client";

import { useState, useCallback } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faCheck,
  faTriangleExclamation,
  faArrowUp,
} from "@fortawesome/free-solid-svg-icons";
import { useAdminSocket, type AdminSocketEvent } from "@/hooks/useAdminSocket";
import { reqUpgradeRunner } from "@/services/workers.service";
import type { WorkerVersionInfo } from "@/types/version.types";

// ─── Types ────────────────────────────────────────────────────────────────────

export type RunnerUpgradeStatus =
  | "idle"
  | "sending"
  | "accepted"
  | "success"
  | "failed";

export interface RunnerStatusEntry {
  worker_id: number;
  name: string;
  current_version: string | null;
  worker_status: string;
  outdated: boolean;
  upgrade_status: RunnerUpgradeStatus;
  message?: string;
}

export interface RunnerUpgradePanelProps {
  /** Workers to display. Caller decides whether to pass all or only outdated. */
  workers: WorkerVersionInfo[];
  latestVersion: string;
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

function Spinner({ className }: { className?: string }) {
  return (
    <svg
      className={`animate-spin ${className ?? "h-3 w-3"}`}
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
      />
    </svg>
  );
}

function statusLabel(r: RunnerStatusEntry): string {
  if (r.worker_status !== "online") return "offline";
  switch (r.upgrade_status) {
    case "sending":
      return "sending command…";
    case "accepted":
      return "installing…";
    case "success":
      return "upgraded ✓";
    case "failed":
      return r.message ?? "failed";
    default:
      return r.current_version ?? "unknown";
  }
}

// ─── Component ────────────────────────────────────────────────────────────────

export function RunnerUpgradePanel({
  workers,
  latestVersion,
}: RunnerUpgradePanelProps) {
  const [statuses, setStatuses] = useState<RunnerStatusEntry[]>(() =>
    workers.map((w) => ({
      worker_id: w.worker_id,
      name: w.name,
      current_version: w.runner_version,
      worker_status: w.status,
      outdated: w.outdated,
      upgrade_status: "idle",
    })),
  );

  const handleSocketEvent = useCallback((event: AdminSocketEvent) => {
    if (event.type !== "worker_action_status") return;
    const p = event.payload ?? {};
    if ((p.action as string) !== "upgrade_runner") return;
    const workerId = event.worker_id;
    const rawStatus = p.status as string;
    const message = p.message as string | undefined;

    setStatuses((prev) =>
      prev.map((r) => {
        if (r.worker_id !== workerId) return r;
        let next: RunnerUpgradeStatus = r.upgrade_status;
        if (rawStatus === "accepted") next = "accepted";
        else if (rawStatus === "success") next = "success";
        else if (rawStatus === "failed" || rawStatus === "error")
          next = "failed";
        return { ...r, upgrade_status: next, message };
      }),
    );
  }, []);
  useAdminSocket(handleSocketEvent);

  const handleUpgradeOne = useCallback(async (workerId: number) => {
    setStatuses((prev) =>
      prev.map((r) =>
        r.worker_id === workerId ? { ...r, upgrade_status: "sending" } : r,
      ),
    );
    const res = await reqUpgradeRunner(workerId);
    setStatuses((prev) =>
      prev.map((r) => {
        if (r.worker_id !== workerId) return r;
        if (!res.success)
          return {
            ...r,
            upgrade_status: "failed",
            message: "Failed to send command",
          };
        return { ...r, upgrade_status: "accepted" };
      }),
    );
  }, []);

  const handleUpgradeAll = useCallback(async () => {
    const targets = statuses.filter(
      (r) =>
        r.outdated &&
        r.worker_status === "online" &&
        r.upgrade_status === "idle",
    );
    setStatuses((prev) =>
      prev.map((r) =>
        targets.some((t) => t.worker_id === r.worker_id)
          ? { ...r, upgrade_status: "sending" }
          : r,
      ),
    );
    for (const runner of targets) {
      const res = await reqUpgradeRunner(runner.worker_id);
      setStatuses((prev) =>
        prev.map((r) => {
          if (r.worker_id !== runner.worker_id) return r;
          if (!res.success)
            return {
              ...r,
              upgrade_status: "failed",
              message: "Failed to send command",
            };
          return { ...r, upgrade_status: "accepted" };
        }),
      );
    }
  }, [statuses]);

  const upgradeableIdle = statuses.filter(
    (r) =>
      r.outdated && r.worker_status === "online" && r.upgrade_status === "idle",
  );
  const anyBusy = statuses.some(
    (r) => r.upgrade_status === "sending" || r.upgrade_status === "accepted",
  );
  const allSettled =
    statuses.filter((r) => r.outdated && r.worker_status === "online").length >
      0 &&
    statuses
      .filter((r) => r.outdated && r.worker_status === "online")
      .every(
        (r) => r.upgrade_status === "success" || r.upgrade_status === "failed",
      );

  return (
    <div>
      {/* Worker rows */}
      <div className="divide-y divide-border-subtle">
        {statuses.map((r) => {
          const canUpgrade =
            r.outdated &&
            r.worker_status === "online" &&
            r.upgrade_status === "idle";
          const isBusy =
            r.upgrade_status === "sending" || r.upgrade_status === "accepted";

          return (
            <div key={r.worker_id} className="flex items-center gap-3 py-2.5">
              {/* Status icon */}
              <div className="flex h-5 w-5 shrink-0 items-center justify-center">
                {r.worker_status !== "online" && (
                  <span className="h-1.5 w-1.5 rounded-full bg-muted opacity-40" />
                )}
                {r.worker_status === "online" &&
                  !r.outdated &&
                  r.upgrade_status === "idle" && (
                    <FontAwesomeIcon
                      icon={faCheck}
                      className="h-3 w-3 text-green-400"
                    />
                  )}
                {r.worker_status === "online" &&
                  r.upgrade_status === "idle" &&
                  r.outdated && (
                    <span className="h-1.5 w-1.5 rounded-full bg-[#eab308]/60" />
                  )}
                {isBusy && <Spinner className="h-3.5 w-3.5 text-info" />}
                {r.upgrade_status === "success" && (
                  <FontAwesomeIcon
                    icon={faCheck}
                    className="h-3 w-3 text-green-400"
                  />
                )}
                {r.upgrade_status === "failed" && (
                  <FontAwesomeIcon
                    icon={faTriangleExclamation}
                    className="h-3 w-3 text-red-400"
                  />
                )}
              </div>

              {/* Name + status text */}
              <div className="flex-1 min-w-0">
                <span className="text-sm font-medium text-primary">
                  {r.name}
                </span>
                <span
                  className={`ml-2 text-xs font-mono ${
                    r.upgrade_status === "success"
                      ? "text-green-400"
                      : r.upgrade_status === "failed"
                        ? "text-red-400"
                        : isBusy
                          ? "text-info"
                          : "text-muted"
                  }`}
                >
                  {statusLabel(r)}
                </span>
              </div>

              {/* Upgrade button — only when idle + upgradeable */}
              {canUpgrade && (
                <button
                  onClick={() => handleUpgradeOne(r.worker_id)}
                  className="shrink-0 rounded-md bg-[#eab308]/10 border border-[#eab308]/30 px-2.5 py-1 text-xs font-medium text-pending hover:bg-[#eab308]/20 transition-colors cursor-pointer"
                >
                  Upgrade
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* Footer: Upgrade All / status summary */}
      {(upgradeableIdle.length > 0 || anyBusy || allSettled) && (
        <div className="pt-3 border-t border-border-subtle mt-1">
          {allSettled ? (
            <p className="text-xs text-secondary">
              Upgrade commands sent — runners will restart automatically.
            </p>
          ) : (
            <button
              onClick={handleUpgradeAll}
              disabled={anyBusy || upgradeableIdle.length === 0}
              className="flex items-center gap-1.5 rounded-lg bg-[#3b82f6] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#2563eb] transition-colors cursor-pointer disabled:opacity-50"
            >
              {anyBusy ? (
                <>
                  <Spinner className="h-3 w-3" />
                  Upgrading…
                </>
              ) : (
                <>
                  <FontAwesomeIcon icon={faArrowUp} className="h-3 w-3" />
                  Upgrade All → {latestVersion}
                </>
              )}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
