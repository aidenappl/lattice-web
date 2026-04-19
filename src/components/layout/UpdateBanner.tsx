"use client";

import { useState, useCallback } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faArrowUp,
  faXmark,
  faServer,
  faGlobe,
  faMicrochip,
} from "@fortawesome/free-solid-svg-icons";
import { useVersionCheck } from "@/hooks/useVersionCheck";
import { reqUpdateAPI, reqUpdateWeb } from "@/services/admin.service";
import { reqUpgradeRunner } from "@/services/workers.service";
import toast from "react-hot-toast";
import Link from "next/link";

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

export function UpdateBanner() {
  const { info, apiUpdateAvailable, webUpdateAvailable, runnerUpdatesAvailable, loading } =
    useVersionCheck();
  const [dismissed, setDismissed] = useState(false);
  const [updatingWeb, setUpdatingWeb] = useState(false);
  const [updatingAPI, setUpdatingAPI] = useState(false);
  const [updatingRunners, setUpdatingRunners] = useState(false);

  if (loading || dismissed || !info) return null;

  const hasUpdates = apiUpdateAvailable || webUpdateAvailable || runnerUpdatesAvailable > 0;
  if (!hasUpdates) return null;

  const handleUpdateWeb = async () => {
    setUpdatingWeb(true);
    const res = await reqUpdateWeb();
    if (res.success) {
      const toastId = toast.loading(
        "Web container restarting — waiting for it to come back...",
      );
      // Web container is restarting. The API is still up, so poll the
      // web's own health endpoint until it responds.
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
    // The API will respond with success then kill itself ~2 seconds later.
    // The request may also fail entirely if the container dies too fast.
    // Both cases are expected — we just poll until it comes back.
    const toastId = toast.loading(
      "Pulling latest API image and restarting...",
    );
    try {
      const res = await reqUpdateAPI();
      if (!res.success && "error_message" in res) {
        // Actual failure (e.g. pull failed) — not a restart
        toast.error(`API update failed: ${res.error_message}`, {
          id: toastId,
        });
        setUpdatingAPI(false);
        return;
      }
    } catch {
      // Request failed — container likely already restarting. Expected.
    }
    // Wait for the API to come back up.
    waitForRestart("API", toastId);
  };

  const handleUpdateAllRunners = async () => {
    if (!info) return;
    setUpdatingRunners(true);
    const outdated = info.runner.workers.filter(
      (w) => w.outdated && w.status === "online",
    );
    let succeeded = 0;
    let failed = 0;
    for (const w of outdated) {
      const res = await reqUpgradeRunner(w.worker_id);
      if (res.success) succeeded++;
      else failed++;
    }
    if (failed === 0) {
      toast.success(
        `Upgrade command sent to ${succeeded} runner${succeeded !== 1 ? "s" : ""}.`,
      );
    } else {
      toast.error(
        `Upgraded ${succeeded}, failed ${failed} runner${failed !== 1 ? "s" : ""}.`,
      );
    }
    setUpdatingRunners(false);
  };

  return (
    <div className="sticky top-16 z-30 border-b border-[#3b82f6]/30 bg-[#3b82f6]/10 backdrop-blur-sm">
      <div className="mx-auto flex items-center justify-between gap-4 px-4 sm:px-6 lg:px-8 py-2.5 max-w-[1600px]">
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
          {runnerUpdatesAvailable > 0 && (
            <button
              onClick={handleUpdateAllRunners}
              disabled={updatingRunners}
              className="flex items-center gap-1.5 rounded-lg border border-[#3b82f6]/40 bg-[#3b82f6]/10 px-3 py-1.5 text-xs font-medium text-[#3b82f6] hover:bg-[#3b82f6]/20 transition-colors cursor-pointer disabled:opacity-50"
            >
              <FontAwesomeIcon icon={faServer} className="h-3 w-3" />
              {updatingRunners ? "Upgrading..." : "Upgrade Runners"}
            </button>
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
