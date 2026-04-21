import type { User, Worker, HealthCheckConfig } from "@/types";

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

// ── Format helpers ──────────────────────────────────────────────────

export function formatDisk(usedMB: number, totalMB: number): string {
    if (totalMB >= 1024)
        return `${(usedMB / 1024).toFixed(1)} / ${(totalMB / 1024).toFixed(1)} GB`;
    return `${Math.round(usedMB)} / ${Math.round(totalMB)} MB`;
}

export function formatBytes(bytes: number): string {
    if (bytes >= 1073741824) return `${(bytes / 1073741824).toFixed(2)} GB`;
    if (bytes >= 1048576) return `${(bytes / 1048576).toFixed(1)} MB`;
    if (bytes >= 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${bytes} B`;
}

export function formatUptime(seconds: number): string {
    const d = Math.floor(seconds / 86400);
    const h = Math.floor((seconds % 86400) / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    if (d > 0) return `${d}d ${h}h`;
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m`;
}

// ── JSON parse helpers ──────────────────────────────────────────────

export function parseJSON<T>(raw: string | null): T | null {
    if (!raw) return null;
    try {
        return JSON.parse(raw) as T;
    } catch {
        return null;
    }
}

export function parsePortMappings(
    raw: string | null,
): { host_port?: string; container_port?: string; protocol?: string }[] {
    return (
        parseJSON<{ host_port?: string; container_port?: string; protocol?: string }[]>(raw) ?? []
    );
}

export function parseEnvVars(raw: string | null): Record<string, string> {
    return parseJSON<Record<string, string>>(raw) ?? {};
}

export function parseVolumes(
    raw: string | null,
): { host?: string; container?: string }[] {
    const data = parseJSON<Record<string, string> | { host?: string; container?: string }[]>(raw);
    if (!data) return [];
    if (Array.isArray(data)) return data;
    return Object.entries(data).map(([host, container]) => ({ host, container }));
}

export function parseHealthCheck(raw: string | null): HealthCheckConfig | null {
    return parseJSON<HealthCheckConfig>(raw);
}

export function formatTestCommand(test: string[] | string | undefined): string {
    if (!test) return "";
    if (typeof test === "string") return test;
    if (test[0] === "CMD-SHELL" && test.length === 2) return test[1];
    if (test[0] === "CMD") return test.slice(1).join(" ");
    return test.join(" ");
}

export function prettyField(raw: string | null): string {
    if (!raw) return "";
    try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed.join(" ");
        return JSON.stringify(parsed, null, 2);
    } catch {
        return raw;
    }
}

// ── Metric color helpers ────────────────────────────────────────────

export function barColor(pct: number): string {
    if (pct > 90) return "bg-failed";
    if (pct > 70) return "bg-[#eab308]";
    return "bg-info";
}

export function sparkColor(pct: number): string {
    if (pct > 90) return "#ef4444";
    if (pct > 70) return "#eab308";
    return "#3b82f6";
}
