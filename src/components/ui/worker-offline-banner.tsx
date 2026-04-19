import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faTriangleExclamation } from "@fortawesome/free-solid-svg-icons";

/**
 * WorkerOfflineBanner — shown whenever the worker backing a page is offline
 * or stale. Disables action buttons and warns the user that data may be stale.
 */
export function WorkerOfflineBanner({
  workerName,
  reason,
}: {
  workerName?: string;
  reason?: string | null;
}) {
  return (
    <div className="mb-5 flex items-start gap-3 rounded-xl border border-[#7c3a00] bg-[#1f0f00] px-4 py-3">
      <FontAwesomeIcon
        icon={faTriangleExclamation}
        className="h-4 w-4 mt-0.5 shrink-0 text-[#f97316]"
      />
      <div>
        <p className="text-sm font-medium text-[#f97316]">
          Worker{workerName ? ` "${workerName}"` : ""} is offline
        </p>
        <p className="text-xs text-[#9a4a1a] mt-0.5">
          {reason ?? "No heartbeat received."} Container data may not reflect
          the current state. All controls are disabled until the worker
          reconnects.
        </p>
      </div>
    </div>
  );
}

/**
 * StalePill — inline badge for container rows on the containers page,
 * indicating that the row's data comes from an offline worker.
 */
export function StalePill() {
  return (
    <span className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-medium border border-[#7c3a00] bg-[#1f0f00] text-[#f97316]">
      <span className="h-1.5 w-1.5 rounded-full bg-[#f97316] animate-pulse" />
      stale
    </span>
  );
}
