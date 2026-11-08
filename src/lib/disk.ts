// Worker disk figures. The thresholds mirror lattice-api's low_disk anomaly
// (healthscan/low_disk.go): a worker is low on disk under either.
export const LOW_DISK_FREE_PCT = 10;
export const LOW_DISK_FREE_MB = 5 * 1024;

export type DiskFree = { freeMB: number; freePct: number; low: boolean };

/** Free space from a heartbeat's disk_used_mb / disk_total_mb; null without a usable sample. */
export function diskFree(usedMB: number | null | undefined, totalMB: number | null | undefined): DiskFree | null {
    if (usedMB == null || totalMB == null || totalMB <= 0) return null;
    const freeMB = Math.max(0, totalMB - usedMB);
    const freePct = (freeMB / totalMB) * 100;
    return { freeMB, freePct, low: freePct < LOW_DISK_FREE_PCT || freeMB < LOW_DISK_FREE_MB };
}

export function formatFree({ freeMB, freePct }: DiskFree): string {
    const size = freeMB >= 1024 ? `${(freeMB / 1024).toFixed(1)} GB` : `${Math.round(freeMB)} MB`;
    return `${size} free (${freePct.toFixed(0)}%)`;
}

// Post-deploy image prune (stacks.image_prune_keep, APL-86): -1 is off,
// otherwise how many previous images per repository the runner keeps.
export const IMAGE_PRUNE_DISABLED = -1;
export const IMAGE_PRUNE_DEFAULT_KEEP = 2;
export const IMAGE_PRUNE_MAX_KEEP = 20;
const PRUNE_CHOICES = [IMAGE_PRUNE_DISABLED, 0, 1, 2, 3, 5, 10, 20];

/** The select's choices, always including the stack's current value. */
export function pruneChoices(current: number): number[] {
    return [...new Set([...PRUNE_CHOICES, current])].sort((a, b) => a - b);
}

export function pruneLabel(keep: number): string {
    if (keep === IMAGE_PRUNE_DISABLED) return "Off (keep every image)";
    if (keep === 0) return "Keep none (rollbacks re-pull)";
    return `Keep ${keep} previous${keep === IMAGE_PRUNE_DEFAULT_KEEP ? " (default)" : ""}`;
}
