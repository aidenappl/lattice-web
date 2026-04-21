"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { timeAgo } from "@/lib/utils";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faChevronRight } from "@fortawesome/free-solid-svg-icons";
import type { Deployment } from "@/types";

export function DeploymentTimelineMini({
  deployments,
  stackNames,
}: {
  deployments: Deployment[] | null;
  stackNames: Record<number, string>;
}) {
  const router = useRouter();

  const active = useMemo(
    () =>
      (deployments ?? []).filter(
        (d) => d.status === "deploying" || d.status === "pending",
      ),
    [deployments],
  );

  const recent = useMemo(
    () =>
      (deployments ?? [])
        .filter((d) => d.status !== "deploying" && d.status !== "pending")
        .slice(0, 5),
    [deployments],
  );

  return (
    <div
      className="panel"
      style={{ display: "flex", flexDirection: "column", height: "100%" }}
    >
      <div className="panel-header">
        <span>Deployments</span>
        <span className="muted">· recent</span>
        <div className="panel-header-right">
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => router.push("/deployments")}
          >
            View all{" "}
            <FontAwesomeIcon icon={faChevronRight} style={{ width: 9 }} />
          </button>
        </div>
      </div>

      {/* Active deployments */}
      <div
        style={{
          padding: "12px 16px",
          borderBottom: "1px solid var(--border)",
          flexShrink: 0,
        }}
      >
        {active.map((d) => (
          <div key={d.id} style={{ marginBottom: 10 }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                marginBottom: 6,
              }}
            >
              <span className="pulse-dot pending" />
              <span style={{ fontSize: 12, fontWeight: 500 }}>
                {stackNames[d.stack_id] ?? `Stack #${d.stack_id}`}
              </span>
              <span className="mono text-muted" style={{ fontSize: 11 }}>
                {d.strategy}
              </span>
            </div>
            <div className="progress-bar">
              <div
                className="progress-bar-fill pending"
                style={{ width: "50%" }}
              />
            </div>
            <div
              className="mono text-muted"
              style={{ fontSize: 10, marginTop: 4 }}
            >
              started {d.started_at ? timeAgo(d.started_at) : "just now"}
            </div>
          </div>
        ))}
        {active.length === 0 && (
          <div className="text-muted" style={{ fontSize: 12 }}>
            No active deployments.
          </div>
        )}
      </div>

      {/* Recent deployments */}
      <div style={{ flex: 1, overflowY: "auto" }}>
        {recent.map((d) => {
          const dur =
            d.started_at && d.completed_at
              ? Math.round(
                  (new Date(d.completed_at).getTime() -
                    new Date(d.started_at).getTime()) /
                    1000,
                )
              : 0;
          return (
            <div
              key={d.id}
              onClick={() => router.push(`/deployments/${d.id}`)}
              style={{
                padding: "10px 16px",
                borderBottom: "1px solid var(--border-subtle)",
                display: "flex",
                alignItems: "center",
                gap: 10,
                cursor: "pointer",
              }}
              className="hover:bg-surface"
            >
              <span
                className={`status-dot ${d.status === "deployed" ? "healthy" : d.status === "rolled_back" ? "pending" : "failed"}`}
              />
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
                  <span>
                    {stackNames[d.stack_id] ?? `Stack #${d.stack_id}`}
                  </span>
                  <span
                    className="mono text-muted"
                    style={{
                      fontSize: 10,
                      padding: "1px 5px",
                      background: "var(--surface-alt)",
                      borderRadius: 3,
                    }}
                  >
                    {d.strategy}
                  </span>
                </div>
              </div>
              <div
                style={{
                  textAlign: "right",
                  fontSize: 11,
                  fontFamily: "var(--font-mono)",
                  color: "var(--text-muted)",
                }}
              >
                <div>{d.started_at ? timeAgo(d.started_at) : "-"}</div>
                {dur > 0 && (
                  <div style={{ fontSize: 10, color: "var(--text-dimmed)" }}>
                    {dur}s
                  </div>
                )}
              </div>
            </div>
          );
        })}
        {recent.length === 0 && (
          <div
            className="text-muted mono"
            style={{ padding: 16, fontSize: 11 }}
          >
            No recent deployments.
          </div>
        )}
      </div>
    </div>
  );
}
