"use client";

import { useCallback } from "react";
import toast from "react-hot-toast";
import { useAdminSocket, AdminSocketEvent } from "./useAdminSocket";

const STORAGE_KEY = "lattice-notifications-enabled";

export function getNotificationsEnabled(): boolean {
    if (typeof window === "undefined") return true;
    const v = localStorage.getItem(STORAGE_KEY);
    return v === null || v === "true";
}

export function setNotificationsEnabled(enabled: boolean): void {
    localStorage.setItem(STORAGE_KEY, String(enabled));
}

/**
 * Subscribes to the admin WebSocket and shows toast notifications for
 * important events: container status changes, deployment completion,
 * worker connect/disconnect, and worker crashes.
 */
export function useNotifications(): void {
    const handler = useCallback((event: AdminSocketEvent) => {
        if (!getNotificationsEnabled()) return;

        switch (event.type) {
            case "container_status": {
                const name = (event.payload?.["container_name"] as string) ?? "container";
                const status = (event.payload?.["status"] as string) ?? "";
                if (status === "running") {
                    toast.success(`${name} is now running`);
                } else if (status === "stopped" || status === "exited") {
                    toast(`${name} stopped`, { icon: "⏹" });
                } else if (status === "error" || status === "dead") {
                    toast.error(`${name} entered ${status} state`);
                }
                break;
            }
            case "deployment_progress": {
                const status = (event.payload?.["status"] as string) ?? "";
                const stackName = (event.payload?.["stack_name"] as string) ?? "stack";
                if (status === "deployed") {
                    toast.success(`${stackName} deployed successfully`);
                } else if (status === "failed") {
                    toast.error(`${stackName} deployment failed`);
                }
                break;
            }
            case "worker_connected": {
                const name = (event.payload?.["name"] as string) ?? `Worker ${event.worker_id}`;
                toast.success(`${name} connected`);
                break;
            }
            case "worker_disconnected": {
                const name = (event.payload?.["name"] as string) ?? `Worker ${event.worker_id}`;
                toast(`${name} disconnected`, { icon: "⚠️" });
                break;
            }
            case "worker_crash": {
                const name = (event.payload?.["name"] as string) ?? `Worker ${event.worker_id}`;
                toast.error(`${name} crashed`);
                break;
            }
        }
    }, []);

    useAdminSocket(handler);
}
