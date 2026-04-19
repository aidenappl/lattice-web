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
      <svg
        className="h-4 w-4 mt-0.5 shrink-0 text-[#f97316]"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"
        />
      </svg>
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
