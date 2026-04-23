"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faCheck,
  faTriangleExclamation,
  faArrowUp,
} from "@fortawesome/free-solid-svg-icons";
import { useAdminSocket, type AdminSocketEvent } from "@/hooks/useAdminSocket";
import { useVersionCheck } from "@/hooks/useVersionCheck";
import { reqUpgradeRunner } from "@/services/workers.service";
import type { WorkerVersionInfo } from "@/types/version.types";

// ─── Types ────────────────────────────────────────────────────────────────────

export type RunnerUpgradeStatus =
  | "idle"
  | "sending"
  | "accepted"
  | "restarting"
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
  /** Intermediate step name reported by the runner (e.g. "downloading") */
  step?: string;
}

export interface RunnerUpgradePanelProps {
  workers: WorkerVersionInfo[];
  latestVersion: string;
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

const TERMINAL_STATES = new Set<RunnerUpgradeStatus>(["idle", "success", "failed"]);

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
  switch (r.upgrade_status) {
    case "sending":
      return "sending command…";
    case "accepted":
      return r.message || "installing…";
    case "restarting":
      return r.message || "restarting runner…";
    case "success":
      return r.message ?? "upgraded";
    case "failed":
      return r.message ?? "failed";
    default:
      if (r.worker_status !== "online") return "offline";
      return r.current_version ?? "unknown";
  }
}

/** Map upgrade state to a progress percentage (0-100). */
function progressPercent(r: RunnerStatusEntry): number {
  switch (r.upgrade_status) {
    case "sending":
      return 15;
    case "accepted": {
      const step = r.step?.toLowerCase() ?? "";
      if (step.includes("download")) return 40;
      if (step.includes("verif")) return 55;
      if (step.includes("replac") || step.includes("install")) return 70;
      return 25;
    }
    case "restarting":
      return 85;
    case "success":
      return 100;
    case "failed":
      return 100;
    default:
      return 0;
  }
}

/**
 * Derive a RunnerStatusEntry from a WorkerVersionInfo prop.
 * Handles ALL intermediate pending_action statuses, not just "accepted".
 */
function deriveEntry(w: WorkerVersionInfo): RunnerStatusEntry {
  let upgradeStatus: RunnerUpgradeStatus = "idle";
  let message: string | undefined;
  let step: string | undefined;

  if (w.pending_action) {
    try {
      const pa = JSON.parse(w.pending_action) as {
        action?: string;
        status?: string;
        message?: string;
      };
      if (pa.action === "upgrade_runner" && pa.status) {
        if (pa.status === "success") {
          upgradeStatus = "success";
        } else if (pa.status === "failed" || pa.status === "error") {
          upgradeStatus = "failed";
        } else {
          // Any non-terminal status: accepted, downloading, replacing, etc.
          upgradeStatus = w.status !== "online" ? "restarting" : "accepted";
          step = pa.status;
        }
        message = pa.message;
      }
    } catch {
      /* ignore parse errors */
    }
  }

  return {
    worker_id: w.worker_id,
    name: w.name,
    current_version: w.runner_version,
    worker_status: w.status,
    outdated: w.outdated,
    upgrade_status: upgradeStatus,
    message,
    step,
  };
}

// ─── Component ────────────────────────────────────────────────────────────────

export function RunnerUpgradePanel({
  workers,
  latestVersion,
}: RunnerUpgradePanelProps) {
  const { refresh: refreshVersions } = useVersionCheck();
  const prevWorkersRef = useRef(workers);

  const [statuses, setStatuses] = useState<RunnerStatusEntry[]>(() =>
    workers.map(deriveEntry),
  );

  // Sync when the workers prop changes (e.g. after refreshVersions()).
  // For entries in a terminal or idle state: fully re-derive from props.
  // For entries actively upgrading: only sync online/offline status.
  useEffect(() => {
    if (prevWorkersRef.current === workers) return;
    prevWorkersRef.current = workers;

    setStatuses((prev) => {
      const prevMap = new Map(prev.map((r) => [r.worker_id, r]));
      const result: RunnerStatusEntry[] = [];

      for (const w of workers) {
        const tracked = prevMap.get(w.worker_id);

        if (!tracked) {
          // New worker — derive fully from props
          result.push(deriveEntry(w));
          continue;
        }

        if (TERMINAL_STATES.has(tracked.upgrade_status)) {
          // Idle, success, or failed — take fresh version/outdated from props
          result.push({
            ...tracked,
            name: w.name,
            current_version: w.runner_version,
            worker_status: w.status,
            outdated: w.outdated,
          });
        } else {
          // Mid-upgrade (sending/accepted/restarting) — only sync online/offline
          result.push({
            ...tracked,
            worker_status: w.status,
          });
        }
      }

      return result;
    });
  }, [workers]);

  const handleSocketEvent = useCallback(
    (event: AdminSocketEvent) => {
      // Worker disconnected — if mid-upgrade, show "restarting"
      if (event.type === "worker_disconnected") {
        setStatuses((prev) =>
          prev.map((r) => {
            if (r.worker_id !== event.worker_id) return r;
            if (
              r.upgrade_status === "accepted" ||
              r.upgrade_status === "sending"
            ) {
              return {
                ...r,
                upgrade_status: "restarting",
                worker_status: "offline",
                step: undefined,
              };
            }
            return { ...r, worker_status: "offline" };
          }),
        );
        return;
      }

      // Worker reconnected
      if (event.type === "worker_connected") {
        setStatuses((prev) =>
          prev.map((r) =>
            r.worker_id === event.worker_id
              ? { ...r, worker_status: "online" }
              : r,
          ),
        );
        return;
      }

      if (event.type !== "worker_action_status") return;
      const p = event.payload ?? {};
      if ((p.action as string) !== "upgrade_runner") return;
      const workerId = event.worker_id;
      const rawStatus = p.status as string;
      const message = (p.message as string) || undefined;

      setStatuses((prev) =>
        prev.map((r) => {
          if (r.worker_id !== workerId) return r;

          if (rawStatus === "success") {
            // Extract version from message like "upgraded to v1.2.3"
            const versionMatch = message?.match(/upgraded to (.+)/);
            return {
              ...r,
              upgrade_status: "success",
              message,
              step: undefined,
              current_version: versionMatch
                ? versionMatch[1]
                : r.current_version,
              outdated: false,
            };
          }

          if (rawStatus === "failed" || rawStatus === "error") {
            return {
              ...r,
              upgrade_status: "failed",
              message,
              step: undefined,
            };
          }

          // Any intermediate status from the runner
          return {
            ...r,
            upgrade_status: "accepted",
            message,
            step: rawStatus,
          };
        }),
      );

      // Refresh version info after terminal states so the page fully updates
      if (
        rawStatus === "success" ||
        rawStatus === "failed" ||
        rawStatus === "error"
      ) {
        setTimeout(() => refreshVersions(), 2000);
      }
    },
    [refreshVersions],
  );
  useAdminSocket(handleSocketEvent);

  const handleUpgradeOne = useCallback(async (workerId: number) => {
    setStatuses((prev) =>
      prev.map((r) =>
        r.worker_id === workerId
          ? {
              ...r,
              upgrade_status: "sending" as RunnerUpgradeStatus,
              step: undefined,
              message: undefined,
            }
          : r,
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
        return { ...r, upgrade_status: "accepted", step: "accepted" };
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
          ? {
              ...r,
              upgrade_status: "sending" as RunnerUpgradeStatus,
              step: undefined,
              message: undefined,
            }
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
          return { ...r, upgrade_status: "accepted", step: "accepted" };
        }),
      );
    }
  }, [statuses]);

  const upgradeableIdle = statuses.filter(
    (r) =>
      r.outdated &&
      r.worker_status === "online" &&
      r.upgrade_status === "idle",
  );
  const anyBusy = statuses.some(
    (r) =>
      r.upgrade_status === "sending" ||
      r.upgrade_status === "accepted" ||
      r.upgrade_status === "restarting",
  );
  const allSettled =
    statuses.filter((r) => r.outdated && r.worker_status === "online")
      .length > 0 &&
    statuses
      .filter((r) => r.outdated && r.worker_status === "online")
      .every(
        (r) =>
          r.upgrade_status === "success" || r.upgrade_status === "failed",
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
            r.upgrade_status === "sending" ||
            r.upgrade_status === "accepted" ||
            r.upgrade_status === "restarting";
          const pct = progressPercent(r);
          const showBar = isBusy || r.upgrade_status === "success" || r.upgrade_status === "failed";

          return (
            <div key={r.worker_id} className="py-2.5">
              <div className="flex items-center gap-3">
                {/* Status icon */}
                <div className="flex h-5 w-5 shrink-0 items-center justify-center">
                  {isBusy ? (
                    <Spinner className="h-3.5 w-3.5 text-info" />
                  ) : r.upgrade_status === "success" ? (
                    <FontAwesomeIcon
                      icon={faCheck}
                      className="h-3 w-3 text-green-400"
                    />
                  ) : r.upgrade_status === "failed" ? (
                    <FontAwesomeIcon
                      icon={faTriangleExclamation}
                      className="h-3 w-3 text-red-400"
                    />
                  ) : r.worker_status !== "online" ? (
                    <span className="h-1.5 w-1.5 rounded-full bg-muted opacity-40" />
                  ) : r.outdated ? (
                    <span className="h-1.5 w-1.5 rounded-full bg-[#eab308]/60" />
                  ) : (
                    <FontAwesomeIcon
                      icon={faCheck}
                      className="h-3 w-3 text-green-400"
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

                {/* Upgrade button */}
                {canUpgrade && (
                  <button
                    onClick={() => handleUpgradeOne(r.worker_id)}
                    className="shrink-0 rounded-md bg-[#eab308]/10 border border-[#eab308]/30 px-2.5 py-1 text-xs font-medium text-pending hover:bg-[#eab308]/20 transition-colors cursor-pointer"
                  >
                    Upgrade
                  </button>
                )}
              </div>

              {/* Progress bar */}
              {showBar && (
                <div className="mt-1.5 ml-8">
                  <div className="h-1 rounded-full bg-surface-elevated overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ease-out ${
                        r.upgrade_status === "success"
                          ? "bg-green-400"
                          : r.upgrade_status === "failed"
                            ? "bg-red-400"
                            : "bg-info animate-pulse"
                      }`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Footer: Upgrade All / status summary */}
      {(upgradeableIdle.length > 0 || anyBusy || allSettled) && (
        <div className="pt-3 border-t border-border-subtle mt-1">
          {allSettled ? (
            <p className="text-xs text-secondary">All upgrades complete.</p>
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
