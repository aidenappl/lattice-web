"use client";

import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faTriangleExclamation } from "@fortawesome/free-solid-svg-icons";
import { Button } from "./button";
import type { ApiError } from "@/types";

interface LoadErrorProps {
  title?: string;
  message?: string;
  /** What the API said, from loadErrorReason. */
  reason?: string | null;
  onRetry?: () => void;
  retrying?: boolean;
}

/**
 * Why a load failed, in words: the API's own message and status, or "no
 * response" when the request never got one (fetchApi reports those as
 * error_code -1). Pages used to say "Could not reach lattice-api" either way.
 */
export function loadErrorReason(res: ApiError): string {
  if (res.error_code === -1) {
    return "No response from lattice-api (network error or timeout).";
  }
  return `${res.error_message || "Unexpected error"} (HTTP ${res.status})`;
}

/**
 * Shown when an initial data load fails, so a fetch error renders as an error
 * (with a Retry affordance) instead of masquerading as an empty state.
 */
export function LoadError({
  title = "Failed to load",
  message = "Something went wrong while loading this data.",
  reason,
  onRetry,
  retrying,
}: LoadErrorProps) {
  return (
    <div className="panel flex min-h-[240px] flex-col items-center justify-center gap-3 text-center px-6 py-12">
      <FontAwesomeIcon
        icon={faTriangleExclamation}
        className="h-6 w-6 text-failed"
      />
      <div>
        <div className="text-sm font-semibold text-primary">{title}</div>
        <div className="mt-1 max-w-md text-xs text-muted leading-relaxed">
          {message}
        </div>
        {reason && (
          <div className="mono mt-2 max-w-md text-xs text-secondary break-words">
            {reason}
          </div>
        )}
      </div>
      {onRetry && (
        <Button
          variant="secondary"
          size="sm"
          onClick={onRetry}
          loading={retrying}
        >
          Retry
        </Button>
      )}
    </div>
  );
}
