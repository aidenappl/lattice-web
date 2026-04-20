"use client";

import { useState, useRef, useEffect } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faArrowUp,
  faXmark,
  faServer,
  faGlobe,
  faMicrochip,
  faChevronDown,
} from "@fortawesome/free-solid-svg-icons";
import { useVersionCheck } from "@/hooks/useVersionCheck";
import { reqUpdateAPI, reqUpdateWeb } from "@/services/admin.service";
import { RunnerUpgradePanel } from "@/components/layout/RunnerUpgradePanel";
import toast from "react-hot-toast";
import Link from "next/link";

const API_URL = process.env.NEXT_PUBLIC_LATTICE_API ?? "";

/** Poll the API healthcheck until it comes back, then reload. */
function waitForRestart(label: string, toastId: string) {
  let attempts = 0;
  const maxAttempts = 60;
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
  const [runnerPanelOpen, setRunnerPanelOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
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
      // Container already restarting — expected.
    }
    waitForRestart("API", toastId);
  };

  // Outdated online workers — passed to the dropdown panel
  const outdatedWorkers = info.runner.workers.filter(
    (w) => w.outdated && w.status === "online",
  );

  return (
    <div className="sticky top-16 z-30 border-b border-[#3b82f6]/30 bg-[#3b82f6]/10 backdrop-blur-sm">
      <div className="mx-auto flex items-center justify-between gap-4 px-4 sm:px-6 lg:px-8 py-2.5 max-w-[1600px]">
        {/* Left: label + info tags */}
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[#3b82f6]/20">
            <FontAwesomeIcon
              icon={faArrowUp}
              className="h-3.5 w-3.5 text-info"
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

          {/* Runner upgrade dropdown */}
          {runnerUpdatesAvailable > 0 && (
            <div className="relative" ref={panelRef}>
              <button
                onClick={() => setRunnerPanelOpen((v) => !v)}
                className="flex items-center gap-1.5 rounded-lg border border-[#3b82f6]/40 bg-[#3b82f6]/10 px-3 py-1.5 text-xs font-medium text-info hover:bg-[#3b82f6]/20 transition-colors cursor-pointer"
              >
                <FontAwesomeIcon icon={faMicrochip} className="h-3 w-3" />
                Upgrade Runners
                <FontAwesomeIcon
                  icon={faChevronDown}
                  className={`h-2.5 w-2.5 transition-transform ${runnerPanelOpen ? "rotate-180" : ""}`}
                />
              </button>

              {runnerPanelOpen && (
                <div className="absolute right-0 top-full mt-2 w-80 rounded-xl border border-border-subtle bg-surface shadow-[0_8px_32px_rgba(0,0,0,0.5)] z-50">
                  {/* Header */}
                  <div className="flex items-center justify-between px-4 py-3 border-b border-border-subtle">
                    <span className="text-sm font-semibold text-primary">
                      Upgrade Runners
                    </span>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted">
                        → {info.runner.latest}
                      </span>
                      <button
                        onClick={() => setRunnerPanelOpen(false)}
                        className="flex h-5 w-5 items-center justify-center rounded text-secondary hover:text-primary transition-colors cursor-pointer"
                      >
                        <FontAwesomeIcon icon={faXmark} className="h-3 w-3" />
                      </button>
                    </div>
                  </div>
                  {/* Panel body */}
                  <div className="px-4 py-3">
                    <RunnerUpgradePanel
                      workers={outdatedWorkers}
                      latestVersion={info.runner.latest}
                    />
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
