"use client";

import { useState } from "react";
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

export function UpdateBanner() {
  const { info, webUpdateAvailable, runnerUpdatesAvailable, loading } =
    useVersionCheck();
  const [dismissed, setDismissed] = useState(false);
  const [updatingWeb, setUpdatingWeb] = useState(false);
  const [updatingAPI, setUpdatingAPI] = useState(false);
  const [updatingRunners, setUpdatingRunners] = useState(false);

  if (loading || dismissed || !info) return null;

  const hasUpdates = webUpdateAvailable || runnerUpdatesAvailable > 0;
  if (!hasUpdates) return null;

  const handleUpdateWeb = async () => {
    setUpdatingWeb(true);
    const res = await reqUpdateWeb();
    if (res.success) {
      toast.success(
        "Web update triggered. The page will reload when the new version is ready.",
      );
      // Poll until the web comes back up with the new version
      setTimeout(() => window.location.reload(), 10000);
    } else {
      toast.error(
        `Failed to update web: ${"error_message" in res ? res.error_message : "Unknown error"}`,
      );
    }
    setUpdatingWeb(false);
  };

  const handleUpdateAPI = async () => {
    setUpdatingAPI(true);
    const res = await reqUpdateAPI();
    if (res.success) {
      toast.success("API update triggered successfully.");
    } else {
      toast.error(
        `Failed to update API: ${"error_message" in res ? res.error_message : "Unknown error"}`,
      );
    }
    setUpdatingAPI(false);
  };

  const handleUpdateAllRunners = async () => {
    if (!info) return;
    setUpdatingRunners(true);
    const outdated = info.runner.workers.filter((w) => w.outdated && w.status === "online");
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
