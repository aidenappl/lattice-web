import type { User, Worker } from "@/types";

export function cn(...classes: (string | boolean | undefined | null)[]): string {
    return classes.filter(Boolean).join(' ');
}

export function formatDate(dateString: string): string {
    return new Date(dateString).toLocaleString();
}

export function timeAgo(dateString: string): string {
    const seconds = Math.floor((Date.now() - new Date(dateString).getTime()) / 1000);
    if (seconds < 60) return 'just now';
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    return `${Math.floor(seconds / 86400)}d ago`;
}

export function isAdmin(user: User | null): boolean {
    return user?.role === "admin";
}

export function canEdit(user: User | null): boolean {
    return user?.role === "admin" || user?.role === "editor";
}

// A worker is considered online only if its status is "online" AND
// it has sent a heartbeat within the last 90 seconds.
const HEARTBEAT_STALE_MS = 90_000;

export function isWorkerOnline(worker: Worker): boolean {
    if (worker.status !== "online") return false;
    if (!worker.last_heartbeat_at) return false;
    return Date.now() - new Date(worker.last_heartbeat_at).getTime() < HEARTBEAT_STALE_MS;
}

// Returns a human-readable staleness reason, or null if the worker is healthy.
export function workerStaleReason(worker: Worker): string | null {
    if (worker.status === "offline") return "Worker is offline";
    if (!worker.last_heartbeat_at) return "No heartbeat received";
    const ageMs = Date.now() - new Date(worker.last_heartbeat_at).getTime();
    if (ageMs >= HEARTBEAT_STALE_MS) {
        const secs = Math.floor(ageMs / 1000);
        return `No heartbeat for ${secs < 120 ? `${secs}s` : `${Math.floor(secs / 60)}m`}`;
    }
    return null;
}
