"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faArrowUp,
  faXmark,
  faServer,
  faGlobe,
  faMicrochip,
  faCheck,
  faTriangleExclamation,
  faChevronDown,
} from "@fortawesome/free-solid-svg-icons";
import { useVersionCheck } from "@/hooks/useVersionCheck";
import { useAdminSocket, type AdminSocketEvent } from "@/hooks/useAdminSocket";
import { reqUpdateAPI, reqUpdateWeb } from "@/services/admin.service";
import { reqUpgradeRunner } from "@/services/workers.service";
import toast from "react-hot-toast";
import Link from "next/link";

type RunnerUpgradeStatus =
  | "idle"
  | "sending"
  | "accepted"
  | "success"
  | "failed";

interface RunnerStatusEntry {
  worker_id: number;
  name: string;
  current_version: string | null;
  status: RunnerUpgradeStatus;
  message?: string;
}

const API_URL = process.env.NEXT_PUBLIC_LATTICE_API ?? "";

/** Poll the API healthcheck until it comes back, then reload. */
function waitForRestart(label: string, toastId: string) {
  let attempts = 0;
  const maxAttempts = 60; // 60s timeout
  const poll = setInterval(async () => {
    attempts++;
    try {
      const res = await fetch(`${API_URL}/healthcheck`, {
        signal: AbortSignal.timeout(2000),
      });
      if (res.ok) {
        clearInterval(poll);
        toast.success(`${label} restarted successfully.`, { id: toastId });
        setTimeout(() => window.location.reload(), 1500);
      }
    } catch {
      // still down — keep polling
    }
    if (attempts >= maxAttempts) {
      clearInterval(poll);
      toast.error(`${label} did not come back within 60 seconds.`, {
        id: toastId,
      });
    }
  }, 1000);
}

/** Spinner SVG (matches the spinner used elsewhere in the app). */
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

export function UpdateBanner() {
  const {
    info,
    apiUpdateAvailable,
    webUpdateAvailable,
    runnerUpdatesAvailable,
    loading,
  } = useVersionCheck();
  const [dismissed, setDismissed] = useState(false);
  const [updatingWeb, setUpdatingWeb] = useState(false);
  const [updatingAPI, setUpdatingAPI] = useState(false);

  // Runner upgrade panel state
  const [runnerPanelOpen, setRunnerPanelOpen] = useState(false);
  const [runnerStatuses, setRunnerStatuses] = useState<RunnerStatusEntry[]>([]);
  const panelRef = useRef<HTMLDivElement>(null);

  // Close panel on outside click
  useEffect(() => {
    if (!runnerPanelOpen) return;
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setRunnerPanelOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [runnerPanelOpen]);

  // Open the panel and initialise runner list whenever info changes
  const openRunnerPanel = useCallback(() => {
    if (!info) return;
    const outdated = info.runner.workers.filter(
      (w) => w.outdated && w.status === "online",
    );
    setRunnerStatuses(
      outdated.map((w) => ({
        worker_id: w.worker_id,
        name: w.name,
        current_version: w.runner_version,
        status: "idle",
      })),
    );
    setRunnerPanelOpen(true);
  }, [info]);

  // Listen to admin WebSocket for upgrade status updates
  const handleSocketEvent = useCallback((event: AdminSocketEvent) => {
    if (event.type !== "worker_action_status") return;
    const p = event.payload ?? {};
    if ((p.action as string) !== "upgrade_runner") return;
    const workerId = event.worker_id;
    const status = p.status as string;
    const message = p.message as string | undefined;

    setRunnerStatuses((prev) =>
      prev.map((r) => {
        if (r.worker_id !== workerId) return r;
        let next: RunnerUpgradeStatus = r.status;
        if (status === "accepted") next = "accepted";
        else if (status === "success") next = "success";
        else if (status === "failed" || status === "error") next = "failed";
        return { ...r, status: next, message };
      }),
    );
  }, []);
  useAdminSocket(handleSocketEvent);

  const handleUpgradeAll = useCallback(async () => {
    setRunnerStatuses((prev) =>
      prev.map((r) => ({ ...r, status: "sending" as const })),
    );
    for (const runner of runnerStatuses) {
      const res = await reqUpgradeRunner(runner.worker_id);
      setRunnerStatuses((prev) =>
        prev.map((r) => {
          if (r.worker_id !== runner.worker_id) return r;
          if (!res.success)
            return {
              ...r,
              status: "failed",
              message: "Failed to send command",
            };
          // status will update via WebSocket; move to accepted optimistically
          return { ...r, status: "accepted" };
        }),
      );
    }
  }, [runnerStatuses]);

  const handleUpgradeOne = useCallback(async (workerId: number) => {
    setRunnerStatuses((prev) =>
      prev.map((r) =>
        r.worker_id === workerId ? { ...r, status: "sending" as const } : r,
      ),
    );
    const res = await reqUpgradeRunner(workerId);
    setRunnerStatuses((prev) =>
      prev.map((r) => {
        if (r.worker_id !== workerId) return r;
        if (!res.success)
          return { ...r, status: "failed", message: "Failed to send command" };
        return { ...r, status: "accepted" };
      }),
    );
  }, []);

  if (loading || dismissed || !info) return null;

  const hasUpdates =
    apiUpdateAvailable || webUpdateAvailable || runnerUpdatesAvailable > 0;
  if (!hasUpdates) return null;

  const handleUpdateWeb = async () => {
    setUpdatingWeb(true);
    const res = await reqUpdateWeb();
    if (res.success) {
      const toastId = toast.loading(
        "Web container restarting — waiting for it to come back...",
      );
      let attempts = 0;
      const poll = setInterval(async () => {
        attempts++;
        try {
          const r = await fetch("/api/health", {
            signal: AbortSignal.timeout(2000),
          });
          if (r.ok) {
            clearInterval(poll);
            toast.success("Web updated successfully. Reloading...", {
              id: toastId,
            });
            setTimeout(() => window.location.reload(), 1500);
          }
        } catch {
          // still restarting
        }
        if (attempts >= 60) {
          clearInterval(poll);
          toast.error("Web did not come back within 60 seconds.", {
            id: toastId,
          });
          setUpdatingWeb(false);
        }
      }, 1000);
    } else {
      toast.error(
        `Failed to update web: ${"error_message" in res ? res.error_message : "Unknown error"}`,
      );
      setUpdatingWeb(false);
    }
  };

  const handleUpdateAPI = async () => {
    setUpdatingAPI(true);
    const toastId = toast.loading("Pulling latest API image and restarting...");
    try {
      const res = await reqUpdateAPI();
      if (!res.success && "error_message" in res) {
        toast.error(`API update failed: ${res.error_message}`, { id: toastId });
        setUpdatingAPI(false);
        return;
      }
    } catch {
      // Container likely already restarting — expected.
    }
    waitForRestart("API", toastId);
  };

  const anyRunnerBusy = runnerStatuses.some(
    (r) => r.status === "sending" || r.status === "accepted",
  );
  const allRunnersDone =
    runnerStatuses.length > 0 &&
    runnerStatuses.every(
      (r) => r.status === "success" || r.status === "failed",
    );

  return (
    <div className="sticky top-16 z-30 border-b border-[#3b82f6]/30 bg-[#3b82f6]/10 backdrop-blur-sm">
      <div className="mx-auto flex items-center justify-between gap-4 px-4 sm:px-6 lg:px-8 py-2.5 max-w-[1600px]">
        {/* Left: label + info tags */}
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[#3b82f6]/20">
            <FontAwesomeIcon
              icon={faArrowUp}
              className="h-3.5 w-3.5 text-[#3b82f6]"
            />
          </div>
          <div className="flex items-center gap-4 flex-wrap min-w-0">
            <span className="text-sm font-medium text-primary">
              Updates available
            </span>
            <div className="flex items-center gap-3 text-xs">
              {apiUpdateAvailable && (
                <span className="flex items-center gap-1.5 text-secondary">
                  <FontAwesomeIcon icon={faServer} className="h-3 w-3" />
                  API {info.api.latest}
                </span>
              )}
              {webUpdateAvailable && (
                <span className="flex items-center gap-1.5 text-secondary">
                  <FontAwesomeIcon icon={faGlobe} className="h-3 w-3" />
                  Web {info.web.latest}
                </span>
              )}
              {runnerUpdatesAvailable > 0 && (
                <Link
                  href="/workers"
                  className="flex items-center gap-1.5 text-secondary hover:text-primary transition-colors"
                >
                  <FontAwesomeIcon icon={faMicrochip} className="h-3 w-3" />
                  {runnerUpdatesAvailable} runner
                  {runnerUpdatesAvailable !== 1 ? "s" : ""} outdated
                </Link>
              )}
            </div>
          </div>
        </div>

        {/* Right: action buttons */}
        <div className="flex items-center gap-2 shrink-0">
          {apiUpdateAvailable && (
            <button
              onClick={handleUpdateAPI}
              disabled={updatingAPI}
              className="flex items-center gap-1.5 rounded-lg bg-[#3b82f6] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#2563eb] transition-colors cursor-pointer disabled:opacity-50"
            >
              <FontAwesomeIcon icon={faServer} className="h-3 w-3" />
              {updatingAPI ? "Updating..." : "Update API"}
            </button>
          )}
          {webUpdateAvailable && (
            <button
              onClick={handleUpdateWeb}
              disabled={updatingWeb}
              className="flex items-center gap-1.5 rounded-lg bg-[#3b82f6] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#2563eb] transition-colors cursor-pointer disabled:opacity-50"
            >
              <FontAwesomeIcon icon={faGlobe} className="h-3 w-3" />
              {updatingWeb ? "Updating..." : "Update Web"}
            </button>
          )}

          {/* Runner upgrade button + dropdown panel */}
          {runnerUpdatesAvailable > 0 && (
            <div className="relative" ref={panelRef}>
              <button
                onClick={openRunnerPanel}
                className="flex items-center gap-1.5 rounded-lg border border-[#3b82f6]/40 bg-[#3b82f6]/10 px-3 py-1.5 text-xs font-medium text-[#3b82f6] hover:bg-[#3b82f6]/20 transition-colors cursor-pointer"
              >
                <FontAwesomeIcon icon={faMicrochip} className="h-3 w-3" />
                Upgrade Runners
                <FontAwesomeIcon
                  icon={faChevronDown}
                  className="h-2.5 w-2.5 ml-0.5"
                />
              </button>

              {runnerPanelOpen && (
                <div className="absolute right-0 top-full mt-2 w-80 rounded-xl border border-[var(--border)] bg-[var(--bg-card)] shadow-xl z-50">
                  {/* Header */}
                  <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)]">
                    <span className="text-sm font-semibold text-primary">
                      Upgrade Runners
                    </span>
                    <span className="text-xs text-secondary">
                      → {info.runner.latest}
                    </span>
                  </div>

                  {/* Runner list */}
                  <div className="divide-y divide-[var(--border)]">
                    {runnerStatuses.map((r) => (
                      <div
                        key={r.worker_id}
                        className="flex items-center gap-3 px-4 py-3"
                      >
                        {/* Status icon */}
                        <div className="flex h-6 w-6 shrink-0 items-center justify-center">
                          {r.status === "idle" && (
                            <span className="h-2 w-2 rounded-full bg-[var(--text-muted)] opacity-40" />
                          )}
                          {(r.status === "sending" ||
                            r.status === "accepted") && (
                            <Spinner className="h-4 w-4 text-[#3b82f6]" />
                          )}
                          {r.status === "success" && (
                            <FontAwesomeIcon
                              icon={faCheck}
                              className="h-3.5 w-3.5 text-green-400"
                            />
                          )}
                          {r.status === "failed" && (
                            <FontAwesomeIcon
                              icon={faTriangleExclamation}
                              className="h-3.5 w-3.5 text-red-400"
                            />
                          )}
                        </div>

                        {/* Name + version */}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-primary truncate">
                            {r.name}
                          </p>
                          <p className="text-xs text-muted font-mono">
                            {r.status === "success"
                              ? "upgraded"
                              : r.status === "failed"
                                ? (r.message ?? "failed")
                                : r.status === "accepted"
                                  ? "installing…"
                                  : r.status === "sending"
                                    ? "sending command…"
                                    : (r.current_version ?? "unknown")}
                          </p>
                        </div>

                        {/* Per-runner upgrade button (idle only) */}
                        {r.status === "idle" && (
                          <button
                            onClick={() => handleUpgradeOne(r.worker_id)}
                            className="shrink-0 rounded-md bg-[#3b82f6]/10 border border-[#3b82f6]/30 px-2 py-1 text-[10px] font-medium text-[#3b82f6] hover:bg-[#3b82f6]/20 transition-colors cursor-pointer"
                          >
                            Upgrade
                          </button>
                        )}
                      </div>
                    ))}
                  </div>

                  {/* Footer */}
                  <div className="flex items-center justify-between gap-2 px-4 py-3 border-t border-[var(--border)]">
                    {allRunnersDone ? (
                      <span className="text-xs text-secondary">
                        All upgrade commands sent. Runners will restart
                        automatically.
                      </span>
                    ) : (
                      <button
                        onClick={handleUpgradeAll}
                        disabled={anyRunnerBusy}
                        className="flex items-center gap-1.5 rounded-lg bg-[#3b82f6] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#2563eb] transition-colors cursor-pointer disabled:opacity-50"
                      >
                        {anyRunnerBusy ? (
                          <>
                            <Spinner className="h-3 w-3" />
                            Upgrading…
                          </>
                        ) : (
                          <>
                            <FontAwesomeIcon
                              icon={faArrowUp}
                              className="h-3 w-3"
                            />
                            Upgrade All
                          </>
                        )}
                      </button>
                    )}
                    <button
                      onClick={() => setRunnerPanelOpen(false)}
                      className="text-xs text-secondary hover:text-primary transition-colors cursor-pointer"
                    >
                      Close
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          <button
            onClick={() => setDismissed(true)}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-secondary hover:text-primary hover:bg-surface-active transition-colors cursor-pointer"
            title="Dismiss"
          >
            <FontAwesomeIcon icon={faXmark} className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
