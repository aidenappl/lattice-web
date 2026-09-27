import type { LogLevel } from "@aidenappleby/monitor-js";

/** One Monitor event the tracker asks the caller to emit. */
export type ReconnectReport = { name: string; level: LogLevel; data: Record<string, unknown> };

export type ReconnectEscalation = {
    /** Consecutive failures that raise one `ws.unavailable` warning. */
    warnAfter: number;
    /** Consecutive failures that raise one `ws.unavailable` error. */
    errorAfter: number;
    /**
     * How long a connection must stay open before it counts as recovered. A
     * socket that opens and closes sooner (an auth reject after the upgrade)
     * is one more consecutive failure, not a recovery.
     */
    stableAfterMs: number;
};

export const DEFAULT_ESCALATION: ReconnectEscalation = { warnAfter: 5, errorAfter: 20, stableAfterMs: 30_000 };

/**
 * Turns a WebSocket's close/open stream into a bounded number of events per
 * outage, however long it lasts:
 *
 *   - `ws.reconnect` (info) for each of the first warnAfter-1 failures — a
 *     single blip (an API redeploy) stays informational;
 *   - one `ws.unavailable` warning at warnAfter consecutive failures;
 *   - one `ws.unavailable` error at errorAfter; nothing more after that;
 *   - `ws.reconnected` (info) with the failure count once a connection has
 *     stayed open for stableAfterMs after any failure, which also resets the
 *     count. A connection that closes before then counts as another failure
 *     and reports no `ws.reconnected`, so a flapping socket still escalates.
 *
 * The caller calls opened() on open and stable() once stableAfterMs later
 * (a timer it clears on close). failed() also resets the count itself when
 * the connection it follows was open long enough, in case that timer never ran.
 */
export class ReconnectTracker {
    private failures = 0;
    private firstFailureAt = 0;
    private openedAt: number | null = null;

    constructor(private readonly escalation: ReconnectEscalation = DEFAULT_ESCALATION) {}

    /** The number of consecutive failed connections so far. */
    get consecutiveFailures(): number {
        return this.failures;
    }

    /** How long a connection must stay open to count as recovered. */
    get stableAfterMs(): number {
        return this.escalation.stableAfterMs;
    }

    /** A connection closed (or never opened) and a reconnect is scheduled. */
    failed(detail: Record<string, unknown> = {}, now: number = Date.now()): ReconnectReport | null {
        const openedAt = this.openedAt;
        this.openedAt = null;
        const extra: Record<string, unknown> = {};
        if (openedAt !== null) {
            const openMs = now - openedAt;
            if (openMs >= this.escalation.stableAfterMs) {
                this.failures = 0;
                this.firstFailureAt = 0;
            } else {
                extra.open_ms = openMs;
            }
        }
        this.failures++;
        if (this.failures === 1) this.firstFailureAt = now;
        const attempt = this.failures;
        const data = { ...detail, ...extra, attempt, down_ms: now - this.firstFailureAt };
        if (attempt === this.escalation.errorAfter) return { name: "ws.unavailable", level: "error", data };
        if (attempt === this.escalation.warnAfter) return { name: "ws.unavailable", level: "warn", data };
        if (attempt < this.escalation.warnAfter) return { name: "ws.reconnect", level: "info", data };
        return null;
    }

    /** A connection opened. It does not count as recovered until stable(). */
    opened(now: number = Date.now()): void {
        this.openedAt = now;
    }

    /**
     * The connection is still open stableAfterMs after opening: reset the
     * count and report the recovery, if there were failures. Returns null for
     * a connection that is not open or not yet open long enough.
     */
    stable(now: number = Date.now()): ReconnectReport | null {
        const openedAt = this.openedAt;
        if (openedAt === null || now - openedAt < this.escalation.stableAfterMs) return null;
        const failures = this.failures;
        const downMs = openedAt - this.firstFailureAt;
        this.failures = 0;
        this.firstFailureAt = 0;
        if (failures === 0) return null;
        return { name: "ws.reconnected", level: "info", data: { failures, down_ms: downMs } };
    }

    /** The socket was closed on purpose (no subscribers left). */
    reset(): void {
        this.failures = 0;
        this.firstFailureAt = 0;
        this.openedAt = null;
    }
}
