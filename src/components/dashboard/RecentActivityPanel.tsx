"use client";

import { useRouter } from "next/navigation";
import { timeAgo } from "@/lib/utils";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faChevronRight } from "@fortawesome/free-solid-svg-icons";
import type { AuditLogEntry } from "@/types";

const activityColors: Record<string, string> = {
  create: "healthy",
  update: "info",
  delete: "failed",
  deploy: "violet",
  login: "pending",
  approve: "healthy",
  rollback: "pending",
  start: "healthy",
  stop: "failed",
  restart: "info",
};

function activityDotClass(action: string): string {
  const key = Object.keys(activityColors).find((k) =>
    action.toLowerCase().includes(k),
  );
  return key ? activityColors[key] : "muted";
}

export function RecentActivityPanel({ entries }: { entries: AuditLogEntry[] }) {
  const router = useRouter();
  const recent = entries.slice(0, 15);

  return (
    <div
      className="panel"
      style={{ display: "flex", flexDirection: "column", height: "100%" }}
    >
      <div className="panel-header">
        <span>Activity</span>
        <span className="muted">· recent</span>
        <div className="panel-header-right">
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => router.push("/audit-log")}
          >
            View all{" "}
            <FontAwesomeIcon icon={faChevronRight} style={{ width: 9 }} />
          </button>
        </div>
      </div>
      <div style={{ flex: 1, overflowY: "auto" }}>
        {recent.map((e) => (
          <div
            key={e.id}
            style={{
              padding: "8px 16px",
              borderBottom: "1px solid var(--border-subtle)",
              display: "flex",
              alignItems: "center",
              gap: 10,
            }}
          >
            <span className={`status-dot ${activityDotClass(e.action)}`} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  fontSize: 12,
                  fontWeight: 500,
                  display: "flex",
                  gap: 6,
                  alignItems: "center",
                }}
              >
                <span className="truncate">{e.action}</span>
                <span
                  className="mono text-muted"
                  style={{
                    fontSize: 10,
                    padding: "1px 5px",
                    background: "var(--surface-alt)",
                    borderRadius: 3,
                  }}
                >
                  {e.resource_type}
                </span>
              </div>
              {e.details && (
                <div
                  className="text-muted truncate"
                  style={{ fontSize: 10, marginTop: 1 }}
                >
                  {e.details}
                </div>
              )}
            </div>
            <div
              className="mono text-muted"
              style={{ fontSize: 11, textAlign: "right", flexShrink: 0 }}
            >
              {timeAgo(e.inserted_at)}
            </div>
          </div>
        ))}
        {recent.length === 0 && (
          <div
            className="text-muted mono"
            style={{ padding: 16, fontSize: 11 }}
          >
            No recent activity.
          </div>
        )}
      </div>
    </div>
  );
}
