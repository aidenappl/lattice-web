import type { User, Worker, HealthCheckConfig } from "@/types";

/**
 * Returns true if `latest` is a newer semver than `current`.
 * Strips a leading "v" and compares major.minor.patch numerically.
 */
export function isNewerVersion(current: string, latest: string): boolean {
  const parse = (v: string) =>
    v.replace(/^v/, "").split(".").map(Number);
  const [cMaj = 0, cMin = 0, cPat = 0] = parse(current);
  const [lMaj = 0, lMin = 0, lPat = 0] = parse(latest);
  if (lMaj !== cMaj) return lMaj > cMaj;
  if (lMin !== cMin) return lMin > cMin;
  return lPat > cPat;
}

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

/**
 * Reads a stack's `secret_env_keys` (a JSON array). Anything malformed is
 * treated as "no secrets", matching lattice-api.
 */
export function parseSecretKeys(raw: string | null | undefined): Set<string> {
    if (!raw) return new Set();
    try {
        const list: unknown = JSON.parse(raw);
        return new Set(
            Array.isArray(list) ? list.filter((k): k is string => typeof k === "string" && k !== "") : [],
        );
    } catch {
        return new Set();
    }
}

/**
 * Drops samples that are much older than the newest one in the set.
 *
 * "Latest sample per container" endpoints keep returning the last row for a
 * container that no longer exists — a rolling deploy's temporary
 * `<name>-lattice-updating` container, say — and without this it is listed
 * as running, hours after it was removed.
 */
export function dropStaleSamples<T extends { recorded_at: string }>(
    rows: T[],
    maxLagMs = 5 * 60_000,
): T[] {
    if (rows.length === 0) return rows;
    const newest = Math.max(...rows.map((r) => new Date(r.recorded_at).getTime()));
    return rows.filter((r) => newest - new Date(r.recorded_at).getTime() <= maxLagMs);
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

/**
 * Formats a container's stored ulimits JSON ({"nofile":{"soft":n,"hard":n}})
 * as "nofile=262144" (or "nofile=1024:4096" when soft and hard differ).
 * Returns "" when there are none or the value can't be read.
 */
export function formatUlimits(raw: string | null | undefined): string {
    if (!raw) return "";
    try {
        const parsed = JSON.parse(raw) as Record<string, { soft: number; hard: number }>;
        return Object.keys(parsed)
            .sort()
            .map((name) => {
                const { soft, hard } = parsed[name];
                return soft === hard ? `${name}=${soft}` : `${name}=${soft}:${hard}`;
            })
            .join(", ");
    } catch {
        return "";
    }
}

/**
 * Renders a stored command/entrypoint (JSON array) as a shell string that
 * lattice-api parses back to the same argv: ["sh","-c","a && b"] -> sh -c 'a && b'.
 * Arguments with spaces or shell characters are single-quoted. Non-array values
 * are returned unchanged.
 */
export function formatArgv(raw: string | null | undefined): string {
    if (!raw) return "";
    let argv: unknown;
    try {
        argv = JSON.parse(raw);
    } catch {
        return raw;
    }
    if (!Array.isArray(argv)) return raw;
    return argv
        .map((a) => {
            const s = String(a);
            if (s !== "" && /^[A-Za-z0-9_@%+=:,./-]+$/.test(s)) return s;
            return `'${s.replace(/'/g, `'\\''`)}'`;
        })
        .join(" ");
}
