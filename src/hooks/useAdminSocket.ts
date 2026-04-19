import { useEffect, useRef } from "react";

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

const subscribers = new Set<EventHandler>();
let ws: WebSocket | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let intentionalClose = false;

function connect() {
    if (ws && (ws.readyState === WebSocket.CONNECTING || ws.readyState === WebSocket.OPEN)) {
        return;
    }

    intentionalClose = false;
    const url = getWsUrl();
    console.log("[AdminSocket] connecting to", url);

    ws = new WebSocket(url);

    ws.onopen = () => {
        console.log("[AdminSocket] connected");
    };

    ws.onmessage = (e) => {
        let data: AdminSocketEvent;
        try {
            data = JSON.parse(e.data as string) as AdminSocketEvent;
        } catch (err) {
            console.warn("[AdminSocket] unparseable message:", e.data, err);
            return;
        }
        console.debug("[AdminSocket] ←", data.type, data);
        subscribers.forEach((fn) => fn(data));
    };

    ws.onerror = () => {
        // Errors are always followed by onclose — let onclose handle reconnect.
    };

    ws.onclose = (e) => {
        if (intentionalClose) return;
        console.log(
            `[AdminSocket] closed (code=${e.code}), reconnecting in 3s…`,
        );
        if (subscribers.size > 0) {
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
        if (reconnectTimer) {
            clearTimeout(reconnectTimer);
            reconnectTimer = null;
        }
        if (ws) {
            ws.onclose = null;
            ws.close();
            ws = null;
        }
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
    }, []); // eslint-disable-line react-hooks/exhaustive-deps
}
