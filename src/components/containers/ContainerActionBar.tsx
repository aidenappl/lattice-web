"use client";

import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faPlay,
  faStop,
  faXmark,
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

        <ActionButton
          label="Remove"
          title="Permanently remove container from Docker"
          icon={<FontAwesomeIcon icon={faTrash} className="h-3.5 w-3.5" />}
          disabled={controlsDisabled}
          loading={actionLoading === "remove"}
          color="text-failed hover:bg-failed/10"
          onClick={async () => {
            const ok = await showConfirm({
              title: "Remove container",
              message: `Permanently remove "${containerName}" from Docker? This cannot be undone.`,
              confirmLabel: "Remove",
              variant: "danger",
            });
            if (ok) onAction("remove");
          }}
        />

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
