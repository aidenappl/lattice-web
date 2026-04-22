"use client";

import { useState } from "react";
import Link from "next/link";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faEllipsisVertical,
  faPlay,
  faStop,
  faRotateRight,
  faTrash,
  faClock,
} from "@fortawesome/free-solid-svg-icons";
import { Container } from "@/types";
import { StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatUptime } from "@/lib/utils";
import { CreateContainerForm } from "./CreateContainerForm";

interface StackContainersListProps {
  containers: Container[];
  canEdit: boolean;
  workerOnline: boolean;
  actionLoading: Record<string, boolean>;
  onAction: (containerId: number, action: string) => void;
  onDelete: (containerId: number) => void;
  onCreateContainer: (data: { name: string; image: string; tag: string }) => Promise<void>;
}

function getUptime(startedAt: string | null): string | null {
  if (!startedAt) return null;
  const seconds = Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000);
  if (seconds < 0) return null;
  return formatUptime(seconds);
}

export function StackContainersList({
  containers,
  canEdit: userCanEdit,
  workerOnline,
  actionLoading,
  onAction,
  onDelete,
  onCreateContainer,
}: StackContainersListProps) {
  const [openActionMenu, setOpenActionMenu] = useState<number | null>(null);
  const [showCreateContainer, setShowCreateContainer] = useState(false);

  const statusColor = (status: string) => {
    if (status === "running") return "bg-healthy";
    if (status === "stopped" || status === "error") return "bg-failed";
    if (status === "paused") return "bg-pending";
    return "bg-muted/40";
  };

  return (
    <div className="space-y-4">
      {showCreateContainer && userCanEdit && (
        <CreateContainerForm
          onSubmit={async (data) => {
            await onCreateContainer(data);
            setShowCreateContainer(false);
          }}
          onCancel={() => setShowCreateContainer(false)}
        />
      )}

      {containers.length === 0 ? (
        <div className="card p-8 text-center">
          <p className="text-sm text-muted mb-3">
            No containers in this stack
          </p>
          {userCanEdit && (
            <Button
              size="sm"
              variant="secondary"
              onClick={() => setShowCreateContainer(true)}
            >
              Add Container
            </Button>
          )}
        </div>
      ) : (
        <div className="stack-container-grid">
          {containers.map((container) => {
            const uptime = container.status === "running" ? getUptime(container.started_at) : null;

            return (
              <div key={container.id} className="stack-container-card group">
                {/* Top: status indicator bar */}
                <div className={`h-0.5 rounded-full mb-3 ${statusColor(container.status)}`} />

                {/* Header: name + actions */}
                <div className="flex items-start justify-between gap-2 mb-2">
                  <Link
                    href={`/containers/${container.id}`}
                    className="text-sm font-medium text-primary hover:text-info transition-colors truncate"
                  >
                    {container.name}
                  </Link>
                  {userCanEdit && (
                    <div className="relative shrink-0">
                      <button
                        onClick={() =>
                          setOpenActionMenu(
                            openActionMenu === container.id ? null : container.id,
                          )
                        }
                        className="p-1 rounded text-muted hover:text-primary hover:bg-surface-elevated transition-colors opacity-0 group-hover:opacity-100"
                      >
                        <FontAwesomeIcon icon={faEllipsisVertical} className="h-3.5 w-3.5" />
                      </button>
                      {openActionMenu === container.id && (
                        <div
                          className="stack-action-menu"
                          onMouseLeave={() => setOpenActionMenu(null)}
                        >
                          {(container.status === "stopped" || container.status === "error") && (
                            <button
                              onClick={() => { onAction(container.id, "start"); setOpenActionMenu(null); }}
                              disabled={!workerOnline || !!actionLoading[`${container.id}-start`]}
                              className="stack-action-item text-healthy"
                            >
                              <FontAwesomeIcon icon={faPlay} className="h-3 w-3" />
                              <span>{actionLoading[`${container.id}-start`] ? "Starting..." : "Start"}</span>
                            </button>
                          )}
                          {container.status === "paused" && (
                            <button
                              onClick={() => { onAction(container.id, "unpause"); setOpenActionMenu(null); }}
                              disabled={!workerOnline || !!actionLoading[`${container.id}-unpause`]}
                              className="stack-action-item text-healthy"
                            >
                              <FontAwesomeIcon icon={faPlay} className="h-3 w-3" />
                              <span>{actionLoading[`${container.id}-unpause`] ? "Resuming..." : "Resume"}</span>
                            </button>
                          )}
                          {container.status === "running" && (
                            <>
                              <button
                                onClick={() => { onAction(container.id, "restart"); setOpenActionMenu(null); }}
                                disabled={!workerOnline || !!actionLoading[`${container.id}-restart`]}
                                className="stack-action-item text-info"
                              >
                                <FontAwesomeIcon icon={faRotateRight} className="h-3 w-3" />
                                <span>{actionLoading[`${container.id}-restart`] ? "..." : "Restart"}</span>
                              </button>
                              <button
                                onClick={() => { onAction(container.id, "stop"); setOpenActionMenu(null); }}
                                disabled={!workerOnline || !!actionLoading[`${container.id}-stop`]}
                                className="stack-action-item text-pending"
                              >
                                <FontAwesomeIcon icon={faStop} className="h-3 w-3" />
                                <span>{actionLoading[`${container.id}-stop`] ? "..." : "Stop"}</span>
                              </button>
                            </>
                          )}
                          <button
                            onClick={() => { onAction(container.id, "recreate"); setOpenActionMenu(null); }}
                            disabled={!workerOnline || !!actionLoading[`${container.id}-recreate`]}
                            className="stack-action-item text-violet"
                          >
                            <FontAwesomeIcon icon={faRotateRight} className="h-3 w-3" />
                            <span>{actionLoading[`${container.id}-recreate`] ? "..." : "Recreate"}</span>
                          </button>
                          <div className="stack-action-divider" />
                          <button
                            onClick={() => { onDelete(container.id); setOpenActionMenu(null); }}
                            className="stack-action-item text-failed"
                          >
                            <FontAwesomeIcon icon={faTrash} className="h-3 w-3" />
                            <span>Delete</span>
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Image */}
                <p className="text-[11px] font-mono text-muted truncate mb-3">
                  {container.image}:{container.tag}
                </p>

                {/* Footer: status + uptime */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <StatusBadge status={container.status} />
                    {container.registry_id && (
                      <span className="text-[10px] text-info bg-info/10 px-1.5 py-0.5 rounded font-mono">
                        watching
                      </span>
                    )}
                  </div>
                  {uptime && (
                    <span className="flex items-center gap-1 text-[10px] text-muted/50 font-mono">
                      <FontAwesomeIcon icon={faClock} className="h-2.5 w-2.5" />
                      {uptime}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
          {userCanEdit && !showCreateContainer && (
            <button
              onClick={() => setShowCreateContainer(true)}
              className="stack-container-card stack-container-card-add"
            >
              <span className="text-2xl text-muted">+</span>
              <span className="text-xs text-muted">Add Container</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}
