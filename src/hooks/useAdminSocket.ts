import { useEffect, useRef } from "react";
import { monitor, reportWarnRateLimited } from "@/services/monitor.service";
import { ReconnectTracker, type ReconnectReport } from "@/lib/ws-reconnect";

export type AdminSocketEvent = {
    type: string;
    worker_id?: number;
    payload?: Record<string, unknown>;
};

type EventHandler = (event: AdminSocketEvent) => void;

function getWsUrl(): string {
    const base = process.env.NEXT_PUBLIC_LATTICE_API ?? "";
    return (
        base.replace(/^https:\/\//, "wss://").replace(/^http:\/\//, "ws://") +
        "/ws/admin"
    );
}

// ─── Singleton WebSocket manager ─────────────────────────────────────────────
// A single shared connection is maintained for the lifetime of the page.
// All useAdminSocket() consumers register a subscriber and share it.

const isDev = process.env.NODE_ENV === "development";

const subscribers = new Set<EventHandler>();
let ws: WebSocket | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let intentionalClose = false;
let sawError = false;
let openSince: number | null = null;

/** When the shared socket last opened, or null while it is not open. */
export function adminSocketOpenSince(): number | null {
    return openSince;
}

// Bounds WebSocket telemetry to a handful of events per outage.
const reconnects = new ReconnectTracker();
// Fires once the socket has stayed open long enough to count as recovered.
let stableTimer: ReturnType<typeof setTimeout> | null = null;

const clearStableTimer = (): void => {
    if (stableTimer) {
        clearTimeout(stableTimer);
        stableTimer = null;
    }
};

const emitReport = (report: ReconnectReport | null): void => {
    if (report) monitor?.emit(report.name, report.level, { data: { ...report.data, socket: "admin" } });
};

function connect() {
    if (ws && (ws.readyState === WebSocket.CONNECTING || ws.readyState === WebSocket.OPEN)) {
        return;
    }

    intentionalClose = false;
    const url = getWsUrl();
    if (isDev) console.log("[AdminSocket] connecting to", url);

    ws = new WebSocket(url);

    ws.onopen = () => {
        if (isDev) console.log("[AdminSocket] connected");
        openSince = Date.now();
        reconnects.opened(openSince);
        clearStableTimer();
        stableTimer = setTimeout(() => {
            stableTimer = null;
            emitReport(reconnects.stable());
        }, reconnects.stableAfterMs);
    };

    ws.onmessage = (e) => {
        let data: AdminSocketEvent;
        try {
            data = JSON.parse(e.data as string) as AdminSocketEvent;
        } catch (err) {
            if (isDev) console.warn("[AdminSocket] unparseable message:", e.data, err);
            // Never the payload itself: container log lines can carry secrets.
            reportWarnRateLimited("ws.message_invalid", {
                socket: "admin",
                length: typeof e.data === "string" ? e.data.length : undefined,
                error_message: err instanceof Error ? err.message : String(err),
            });
            return;
        }
        if (isDev) console.debug("[AdminSocket] ←", data.type);
        subscribers.forEach((fn) => fn(data));
    };

    ws.onerror = () => {
        // Errors are always followed by onclose — let onclose handle reconnect
        // and reporting. The browser exposes no detail beyond the fact.
        sawError = true;
    };

    ws.onclose = (e) => {
        const hadError = sawError;
        sawError = false;
        openSince = null;
        clearStableTimer();
        if (intentionalClose) return;
        if (isDev) console.log(`[AdminSocket] closed (code=${e.code}), reconnecting in 3s…`);
        if (subscribers.size > 0) {
            emitReport(
                reconnects.failed({ close_code: e.code, was_clean: e.wasClean, had_error: hadError }),
            );
            reconnectTimer = setTimeout(connect, 3000);
        }
    };
}

function ensureConnected() {
    if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
    }
    connect();
}

function maybeDisconnect() {
    if (subscribers.size === 0) {
        intentionalClose = true;
        reconnects.reset();
        clearStableTimer();
        if (reconnectTimer) {
            clearTimeout(reconnectTimer);
            reconnectTimer = null;
        }
        openSince = null;
        if (ws) {
            ws.onclose = null;
            ws.close();
            ws = null;
        }
    }
}

// ─── Send helper ─────────────────────────────────────────────────────────────

export function sendAdminMessage(msg: Record<string, unknown>): void {
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(msg));
    }
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

/**
 * Subscribes to the shared Lattice admin WebSocket at /ws/admin.
 * All hook consumers share a single connection. Automatically reconnects.
 *
 * Events emitted by the server:
 *  - container_status        { container_name, action, status }
 *  - container_sync          { container_name, state, status }
 *  - container_health_status { container_name, health_status }
 *  - container_logs          { container_name, stream, message }
 *  - deployment_progress     { deployment_id, status, message, ... }
 *  - worker_heartbeat        { ... metrics }
 *  - worker_connected        { worker_id }
 *  - worker_disconnected     { worker_id }
 */
export function useAdminSocket(onEvent: EventHandler): void {
    // Keep the handler ref up to date without changing the subscriber identity
    const onEventRef = useRef<EventHandler>(onEvent);
    useEffect(() => {
        onEventRef.current = onEvent;
    }, [onEvent]);

    useEffect(() => {
        // Wrap in a stable function so the subscriber set entry stays the same
        const handler: EventHandler = (event) => onEventRef.current(event);
        subscribers.add(handler);
        ensureConnected();

        return () => {
            subscribers.delete(handler);
            maybeDisconnect();
        };
    }, []);
}
