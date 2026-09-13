"use client";

import { useEffect } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faTriangleExclamation } from "@fortawesome/free-solid-svg-icons";
import { reportError } from "@/services/monitor.service";

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    reportError("client.error.boundary", error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] items-center justify-center p-4">
      <div className="card w-full max-w-md p-8 text-center">
        <div className="mb-5 flex justify-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-failed/10 ring-1 ring-[#ef4444]/20">
            <FontAwesomeIcon
              icon={faTriangleExclamation}
              className="h-7 w-7 text-failed"
              aria-hidden="true"
            />
          </div>
        </div>

        <h1 className="page-title mb-2 text-xl">This page hit an error</h1>
        <p className="mb-6 text-sm leading-relaxed text-secondary">
          It has been reported. Try again, or reload the page if it keeps
          happening.
        </p>
        {error.digest && (
          <p className="mb-6 font-mono text-xs text-muted">
            Reference: {error.digest}
          </p>
        )}

        <button
          type="button"
          onClick={reset}
          className="flex h-10 w-full items-center justify-center rounded-lg bg-info px-4 text-sm font-medium text-primary transition-colors hover:bg-[#2563eb] cursor-pointer"
        >
          Try again
        </button>
      </div>
    </div>
  );
}
