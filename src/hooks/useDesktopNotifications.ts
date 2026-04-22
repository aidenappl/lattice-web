"use client";

import { useCallback, useEffect, useRef } from "react";
import { useAdminSocket, type AdminSocketEvent } from "./useAdminSocket";

const STORAGE_KEY = "lattice-desktop-notifications-enabled";

const NOTIFICATION_EVENTS: Record<
    string,
    {
        title: (p: Record<string, unknown>) => string;
        body: (p: Record<string, unknown>, e: AdminSocketEvent) => string;
    }
> = {
    deployment_progress: {
        title: (p) =>
            p?.status === "failed"
                ? "Deployment Failed"
                : p?.status === "deployed"
                  ? "Deployment Successful"
                  : "",
        body: (p) => (p?.message as string) || `Deployment ${p?.deployment_id}: ${p?.status}`,
    },
    container_health_status: {
        title: (p) => (p?.health_status === "unhealthy" ? "Container Unhealthy" : ""),
        body: (p) => `${p?.container_name}: health status is ${p?.health_status}`,
    },
    worker_disconnected: {
        title: () => "Worker Disconnected",
        body: (_p, e) => `Worker ${e?.worker_id} went offline`,
    },
    worker_crash: {
        title: () => "Worker Crashed",
        body: (p) => `Goroutine: ${p?.goroutine}, Panic: ${p?.panic}`,
    },
};

export function getDesktopNotificationsEnabled(): boolean {
    if (typeof window === "undefined") return false;
    const v = localStorage.getItem(STORAGE_KEY);
    return v === "true";
}

export function setDesktopNotificationsEnabled(enabled: boolean): void {
    localStorage.setItem(STORAGE_KEY, String(enabled));
}

export function useDesktopNotifications(): void {
    const permissionRef = useRef(
        typeof Notification !== "undefined" ? Notification.permission : ("default" as NotificationPermission),
    );

    useEffect(() => {
        if (typeof Notification === "undefined") return;
        permissionRef.current = Notification.permission;
    }, []);

    const handleEvent = useCallback((event: AdminSocketEvent) => {
        if (!getDesktopNotificationsEnabled()) return;
        if (permissionRef.current !== "granted") return;
        if (typeof Notification === "undefined") return;

        const config = NOTIFICATION_EVENTS[event.type];
        if (!config) return;

        const payload = (event.payload ?? {}) as Record<string, unknown>;
        const title = config.title(payload);
        if (!title) return; // Empty title = don't notify for this status

        const body = config.body(payload, event);

        new Notification(title, {
            body,
            icon: "/favicon.ico",
            tag: `lattice-${event.type}-${Date.now()}`,
            silent: false,
        });
    }, []);

    useAdminSocket(handleEvent);
}

export function requestNotificationPermission(): Promise<NotificationPermission> {
    if (typeof Notification === "undefined") return Promise.resolve("denied" as NotificationPermission);
    return Notification.requestPermission();
}

export function getNotificationPermission(): NotificationPermission {
    if (typeof Notification === "undefined") return "denied";
    return Notification.permission;
}
