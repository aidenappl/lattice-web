"use client";

import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faTriangleExclamation } from "@fortawesome/free-solid-svg-icons";
import { Button } from "./button";

interface LoadErrorProps {
  title?: string;
  message?: string;
  onRetry?: () => void;
  retrying?: boolean;
}

/**
 * Shown when an initial data load fails, so a fetch error renders as an error
 * (with a Retry affordance) instead of masquerading as an empty state.
 */
export function LoadError({
  title = "Failed to load",
  message = "Something went wrong while loading this data.",
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
