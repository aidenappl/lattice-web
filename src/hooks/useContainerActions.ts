import { useState, useCallback } from "react";
import toast from "react-hot-toast";
import {
    reqStartContainer,
    reqStopContainer,
    reqRestartContainer,
    reqRecreateContainer,
    reqUnpauseContainer,
} from "@/services/stacks.service";
import { useConfirm } from "@/components/ui/confirm-modal";

const actionFns: Record<
    string,
    (id: number) => Promise<{ success: boolean; error_message?: string }>
> = {
    start: reqStartContainer,
    stop: reqStopContainer,
    restart: reqRestartContainer,
    recreate: reqRecreateContainer,
    unpause: reqUnpauseContainer,
};

const confirmMap: Record<
    string,
    { title: string; messageFn: (name: string) => string; variant: "danger" | "warning" }
> = {
    stop: {
        title: "Stop container",
        messageFn: (name) => `Stop "${name}"? The container will be gracefully shut down.`,
        variant: "warning",
    },
    restart: {
        title: "Restart container",
        messageFn: (name) => `Restart "${name}"? The container will be stopped and started.`,
        variant: "warning",
    },
    recreate: {
        title: "Recreate container",
        messageFn: (name) => `Recreate "${name}"? The container will be removed and created fresh.`,
        variant: "warning",
    },
};

/**
 * Shared hook for container actions (start, stop, restart, recreate, unpause).
 * Used by both the container list page and detail pages.
 */
export function useContainerActions(onRefresh?: () => void) {
    const showConfirm = useConfirm();
    const [actionLoading, setActionLoading] = useState<Record<number, string>>({});

    const performAction = useCallback(
        async (containerId: number, action: string, containerName?: string) => {
            const name = containerName ?? String(containerId);
            const label = action.charAt(0).toUpperCase() + action.slice(1);

            // Confirmation for destructive/disruptive actions
            const conf = confirmMap[action];
            if (conf) {
                const ok = await showConfirm({
                    title: conf.title,
                    message: conf.messageFn(name),
                    confirmLabel: label,
                    variant: conf.variant,
                });
                if (!ok) return;
            }

            setActionLoading((p) => ({ ...p, [containerId]: action }));
            const toastId = toast.loading(`Sending ${label.toLowerCase()} to ${name}\u2026`);

            try {
                const fn = actionFns[action];
                if (!fn) {
                    toast.error(`Unknown action: ${action}`, { id: toastId });
                    setActionLoading((p) => {
                        const n = { ...p };
                        delete n[containerId];
                        return n;
                    });
                    return;
                }
                const res = await fn(containerId);
                if (res.success) {
                    toast.success(`${label} command sent to ${name}`, { id: toastId });
                } else {
                    const msg = res.error_message ?? "Unknown error";
                    toast.error(`${label} failed: ${msg}`, { id: toastId });
                }
            } catch (err) {
                toast.error(`${label} error: ${String(err)}`, { id: toastId });
            }

            setActionLoading((p) => {
                const n = { ...p };
                delete n[containerId];
                return n;
            });

            if (onRefresh) {
                setTimeout(onRefresh, 2500);
            }
        },
        [showConfirm, onRefresh],
    );

    return { actionLoading, performAction };
}
