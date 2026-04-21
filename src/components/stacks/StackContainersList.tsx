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
} from "@fortawesome/free-solid-svg-icons";
import { Container } from "@/types";
import { StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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

  const containerStatusIcon = (status: string) => {
    if (status === "running") return <span className="status-dot healthy" />;
    if (status === "stopped" || status === "error")
      return <span className="status-dot failed" />;
    if (status === "paused") return <span className="status-dot pending" />;
    return <span className="status-dot off" />;
  };

  return (
    <div className="space-y-4">
      {/* Add container form */}
      {showCreateContainer && userCanEdit && (
        <CreateContainerForm
          onSubmit={async (data) => {
            await onCreateContainer(data);
            setShowCreateContainer(false);
          }}
          onCancel={() => setShowCreateContainer(false)}
        />
      )}

      {/* Container cards */}
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
          {containers.map((container) => (
            <div key={container.id} className="stack-container-card">
              <div className="stack-container-card-header">
                <div className="flex items-center gap-2.5 min-w-0">
                  {containerStatusIcon(container.status)}
                  <Link
                    href={`/containers/${container.id}`}
                    className="text-sm font-medium text-primary hover:text-info transition-colors truncate"
                  >
                    {container.name}
                  </Link>
                </div>
                {userCanEdit && (
                  <div className="relative">
                    <button
                      onClick={() =>
                        setOpenActionMenu(
                          openActionMenu === container.id
                            ? null
                            : container.id,
                        )
                      }
                      className="p-1.5 rounded text-muted hover:text-primary hover:bg-surface-elevated transition-colors"
                    >
                      <FontAwesomeIcon
                        icon={faEllipsisVertical}
                        className="h-3.5 w-3.5"
                      />
                    </button>
                    {openActionMenu === container.id && (
                      <div
                        className="stack-action-menu"
                        onMouseLeave={() => setOpenActionMenu(null)}
                      >
                        {(container.status === "stopped" ||
                          container.status === "error") && (
                          <button
                            onClick={() => {
                              onAction(container.id, "start");
                              setOpenActionMenu(null);
                            }}
                            disabled={
                              !workerOnline ||
                              !!actionLoading[`${container.id}-start`]
                            }
                            className="stack-action-item text-healthy"
                          >
                            <FontAwesomeIcon
                              icon={faPlay}
                              className="h-3 w-3"
                            />
                            <span>
                              {actionLoading[`${container.id}-start`]
                                ? "Starting..."
                                : "Start"}
                            </span>
                          </button>
                        )}
                        {container.status === "paused" && (
                          <button
                            onClick={() => {
                              onAction(container.id, "unpause");
                              setOpenActionMenu(null);
                            }}
                            disabled={
                              !workerOnline ||
                              !!actionLoading[`${container.id}-unpause`]
                            }
                            className="stack-action-item text-healthy"
                          >
                            <FontAwesomeIcon
                              icon={faPlay}
                              className="h-3 w-3"
                            />
                            <span>
                              {actionLoading[`${container.id}-unpause`]
                                ? "Resuming..."
                                : "Resume"}
                            </span>
                          </button>
                        )}
                        {container.status === "running" && (
                          <>
                            <button
                              onClick={() => {
                                onAction(container.id, "restart");
                                setOpenActionMenu(null);
                              }}
                              disabled={
                                !workerOnline ||
                                !!actionLoading[`${container.id}-restart`]
                              }
                              className="stack-action-item text-info"
                            >
                              <FontAwesomeIcon
                                icon={faRotateRight}
                                className="h-3 w-3"
                              />
                              <span>
                                {actionLoading[`${container.id}-restart`]
                                  ? "..."
                                  : "Restart"}
                              </span>
                            </button>
                            <button
                              onClick={() => {
                                onAction(container.id, "stop");
                                setOpenActionMenu(null);
                              }}
                              disabled={
                                !workerOnline ||
                                !!actionLoading[`${container.id}-stop`]
                              }
                              className="stack-action-item text-pending"
                            >
                              <FontAwesomeIcon
                                icon={faStop}
                                className="h-3 w-3"
                              />
                              <span>
                                {actionLoading[`${container.id}-stop`]
                                  ? "..."
                                  : "Stop"}
                              </span>
                            </button>
                          </>
                        )}
                        <button
                          onClick={() => {
                            onAction(container.id, "recreate");
                            setOpenActionMenu(null);
                          }}
                          disabled={
                            !workerOnline ||
                            !!actionLoading[`${container.id}-recreate`]
                          }
                          className="stack-action-item text-violet"
                        >
                          <FontAwesomeIcon
                            icon={faRotateRight}
                            className="h-3 w-3"
                          />
                          <span>
                            {actionLoading[`${container.id}-recreate`]
                              ? "..."
                              : "Recreate"}
                          </span>
                        </button>
                        <div className="stack-action-divider" />
                        <button
                          onClick={() => {
                            onDelete(container.id);
                            setOpenActionMenu(null);
                          }}
                          className="stack-action-item text-failed"
                        >
                          <FontAwesomeIcon
                            icon={faTrash}
                            className="h-3 w-3"
                          />
                          <span>Delete</span>
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
              <div className="stack-container-card-body">
                <span className="text-xs font-mono text-muted truncate">
                  {container.image}:{container.tag}
                </span>
                <StatusBadge status={container.status} />
                {container.registry_id && (
                  <span className="text-[10px] text-info bg-info/10 px-1.5 py-0.5 rounded font-mono">
                    watching
                  </span>
                )}
              </div>
            </div>
          ))}
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
