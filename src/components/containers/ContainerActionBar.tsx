"use client";

import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faPlay,
  faStop,
  faXmark,
  faCircleMinus,
  faRotate,
  faPause,
  faTrash,
  faSpinner,
} from "@fortawesome/free-solid-svg-icons";
import { Alert } from "@/components/ui/alert";

export function ActionButton({
  label,
  icon,
  disabled,
  loading,
  color,
  onClick,
  title,
}: {
  label: string;
  icon: React.ReactNode;
  disabled: boolean;
  loading: boolean;
  color: string;
  onClick: () => void;
  title?: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      // The visible label is the accessible name; the longer title is only a
      // tooltip. Using title as aria-label hid the label from speech control
      // ("click Remove from Docker" matched nothing).
      title={title ?? label}
      className={`inline-flex items-center gap-1.5 rounded-lg border border-border-strong px-3 h-8 text-sm font-medium transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed ${color}`}
    >
      {loading ? (
        <FontAwesomeIcon
          icon={faSpinner}
          className="h-3.5 w-3.5 animate-spin"
        />
      ) : (
        icon
      )}
      {label}
    </button>
  );
}

export interface ContainerActionBarProps {
  containerName: string;
  containerId: number;
  isRunning: boolean;
  isStopped: boolean;
  isPaused: boolean;
  controlsDisabled: boolean;
  actionLoading: string | null;
  actionError: string | null;
  onAction: (action: string) => void;
  /** Deletes the container from its stack's config (and Docker). */
  onDelete?: () => void;
  stackName?: string;
  onClearError: () => void;
  showConfirm: (opts: {
    title: string;
    message: string;
    confirmLabel: string;
    variant: "warning" | "danger";
  }) => Promise<boolean>;
}

export function ContainerActionBar({
  containerName,
  containerId,
  isRunning,
  isStopped,
  isPaused,
  controlsDisabled,
  actionLoading,
  actionError,
  onDelete,
  stackName,
  onAction,
  onClearError,
  showConfirm,
}: ContainerActionBarProps) {
  return (
    <div className="panel">
      <div className="flex flex-wrap items-center gap-2 p-3">
        <ActionButton
          label="Start"
          icon={<FontAwesomeIcon icon={faPlay} className="h-3.5 w-3.5" />}
          disabled={!isStopped || controlsDisabled}
          loading={actionLoading === "start"}
          color="text-healthy hover:bg-healthy/10"
          onClick={() => onAction("start")}
        />
        <ActionButton
          label="Stop"
          icon={<FontAwesomeIcon icon={faStop} className="h-3.5 w-3.5" />}
          disabled={!isRunning || controlsDisabled}
          loading={actionLoading === "stop"}
          color="text-secondary hover:bg-border-strong"
          onClick={async () => {
            const ok = await showConfirm({
              title: "Stop container",
              message: `Stop "${containerName}"? The container will be gracefully shut down.`,
              confirmLabel: "Stop",
              variant: "warning",
            });
            if (ok) onAction("stop");
          }}
        />
        <ActionButton
          label="Kill"
          title="Force-kill container (SIGKILL)"
          icon={<FontAwesomeIcon icon={faXmark} className="h-3.5 w-3.5" />}
          disabled={!isRunning || controlsDisabled}
          loading={actionLoading === "kill"}
          color="text-failed hover:bg-failed/10"
          onClick={async () => {
            const ok = await showConfirm({
              title: "Kill container",
              message: `Force-kill "${containerName}"? This sends SIGKILL immediately.`,
              confirmLabel: "Kill",
              variant: "danger",
            });
            if (ok) onAction("kill");
          }}
        />
        <ActionButton
          label="Restart"
          icon={<FontAwesomeIcon icon={faRotate} className="h-3.5 w-3.5" />}
          disabled={!isRunning || controlsDisabled}
          loading={actionLoading === "restart"}
          color="text-info hover:bg-info/10"
          onClick={async () => {
            const ok = await showConfirm({
              title: "Restart container",
              message: `Restart "${containerName}"? The container will be stopped and started.`,
              confirmLabel: "Restart",
              variant: "warning",
            });
            if (ok) onAction("restart");
          }}
        />
        <ActionButton
          label="Pause"
          icon={<FontAwesomeIcon icon={faPause} className="h-3.5 w-3.5" />}
          disabled={!isRunning || controlsDisabled}
          loading={actionLoading === "pause"}
          color="text-secondary hover:bg-border-strong"
          onClick={() => onAction("pause")}
        />
        <ActionButton
          label="Resume"
          icon={<FontAwesomeIcon icon={faPlay} className="h-3.5 w-3.5" />}
          disabled={!isPaused || controlsDisabled}
          loading={actionLoading === "unpause"}
          color="text-healthy hover:bg-healthy/10"
          onClick={() => onAction("unpause")}
        />

        <div className="h-5 w-px bg-border-strong mx-1 hidden sm:block" />

        {/* Remove and Delete are different operations and used to be one
            button with wording that fit neither: "Remove" only deletes the
            Docker container, and the next deploy recreates it from config. */}
        <ActionButton
          label="Remove from Docker"
          title="Remove the Docker container. It stays in the stack and the next deploy recreates it."
          icon={<FontAwesomeIcon icon={faCircleMinus} className="h-3.5 w-3.5" />}
          disabled={controlsDisabled}
          loading={actionLoading === "remove"}
          color="text-pending hover:bg-pending/10"
          onClick={async () => {
            const ok = await showConfirm({
              title: `Remove ${containerName} from Docker?`,
              message: `The Docker container is stopped and removed. "${containerName}" stays in ${stackName ? `the ${stackName} stack` : "its stack"}, and the next deploy or Recreate brings it back.`,
              confirmLabel: "Remove from Docker",
              variant: "warning",
            });
            if (ok) onAction("remove");
          }}
        />
        {onDelete && (
          <ActionButton
            label="Delete"
            title="Delete the container from the stack's config and from Docker"
            icon={<FontAwesomeIcon icon={faTrash} className="h-3.5 w-3.5" />}
            disabled={controlsDisabled || actionLoading !== null}
            loading={actionLoading === "delete"}
            color="text-failed hover:bg-failed/10"
            onClick={onDelete}
          />
        )}

        {actionError && (
          <div className="ml-auto">
            <Alert variant="error" onDismiss={onClearError}>
              {actionError}
            </Alert>
          </div>
        )}
      </div>
    </div>
  );
}
