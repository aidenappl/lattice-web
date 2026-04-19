import { useEffect, useRef, useCallback } from "react";

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

/**
 * Connects to the Lattice admin WebSocket at /ws/admin and calls onEvent
 * for each message received. Automatically reconnects on disconnect.
 *
 * Events emitted by the server:
 *  - container_status    { container_name, action, status }
 *  - container_sync      { container_name, state, status }
 *  - container_health_status { container_name, health_status }
 *  - container_logs      { container_name, stream, message }
 *  - deployment_progress { deployment_id, status, message, ... }
 *  - worker_heartbeat    { ... metrics }
 *  - worker_connected    { worker_id }
 *  - worker_disconnected { worker_id }
 */
export function useAdminSocket(onEvent: EventHandler): void {
    const onEventRef = useRef<EventHandler>(onEvent);
    const wsRef = useRef<WebSocket | null>(null);
    const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const mountedRef = useRef(true);

    // keep handler ref current without re-triggering connect
    useEffect(() => {
        onEventRef.current = onEvent;
    }, [onEvent]);

    const connect = useCallback(() => {
        if (!mountedRef.current) return;

        const url = getWsUrl();
        console.log("[AdminSocket] connecting to", url);

        const ws = new WebSocket(url);
        wsRef.current = ws;

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
            onEventRef.current(data);
        };

        ws.onerror = (e) => {
            console.error("[AdminSocket] error:", e);
        };

        ws.onclose = (e) => {
            console.log(
                `[AdminSocket] closed (code=${e.code} reason="${e.reason}"), reconnecting in 3s…`,
            );
            if (mountedRef.current) {
                reconnectTimerRef.current = setTimeout(connect, 3000);
            }
        };
    }, []);

    useEffect(() => {
        mountedRef.current = true;
        connect();

        return () => {
            mountedRef.current = false;
            if (reconnectTimerRef.current) {
                clearTimeout(reconnectTimerRef.current);
            }
            if (wsRef.current) {
                // Remove onclose so reconnect loop doesn't fire on intentional unmount
                wsRef.current.onclose = null;
                wsRef.current.close();
            }
        };
    }, [connect]);
}
