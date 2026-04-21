"use client";

import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faTriangleExclamation } from "@fortawesome/free-solid-svg-icons";

export function FailingStacksBanner({
  count,
  onViewDeployments,
}: {
  count: number;
  onViewDeployments: () => void;
}) {
  if (count === 0) return null;
  return (
    <div
      style={{
        marginBottom: 16,
        padding: "10px 14px",
        background: "var(--failed-bg)",
        border: "1px solid var(--failed-dim)",
        borderRadius: 6,
        display: "flex",
        alignItems: "center",
        gap: 10,
        fontSize: 12,
      }}
    >
      <FontAwesomeIcon
        icon={faTriangleExclamation}
        style={{ width: 14, color: "var(--failed)" }}
      />
      <div style={{ flex: 1 }}>
        <span style={{ fontWeight: 500 }}>
          {count} stack{count > 1 ? "s" : ""} need attention
        </span>
        <span className="text-muted" style={{ marginLeft: 8 }}>
          healthcheck failures — consider rollback.
        </span>
      </div>
      <button className="btn btn-sm btn-secondary" onClick={onViewDeployments}>
        View deployments
      </button>
    </div>
  );
}
