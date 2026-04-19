/**
 * useWorkerLiveness — tracks real-time online/offline state for workers.
 *
 * Initialises from the DB-sourced Worker objects (status + last_heartbeat_at),
 * then patches liveness in real-time as the admin WebSocket emits:
 *   - worker_connected    → mark online
 *   - worker_disconnected → mark offline
 *   - worker_heartbeat    → mark online + refresh last-seen timestamp
 *
 * A periodic ticker re-evaluates staleness every 15 seconds so a worker that
 * silently stops sending heartbeats is detected without a WS event.
 */
import { useEffect, useRef, useState, useCallback } from "react";
import type { Worker } from "@/types";
import { isWorkerOnline } from "@/lib/utils";
import { useAdminSocket, type AdminSocketEvent } from "./useAdminSocket";

type LivenessMap = Record<number, boolean>; // workerId → isOnline

function buildInitialLiveness(workers: Worker[]): LivenessMap {
    const map: LivenessMap = {};
    for (const w of workers) {
        map[w.id] = isWorkerOnline(w);
    }
    return map;
}

export function useWorkerLiveness(workers: Worker[]): LivenessMap {
    const [liveness, setLiveness] = useState<LivenessMap>(() =>
        buildInitialLiveness(workers),
    );

    // Track last-seen timestamps per worker so we can detect heartbeat gaps
    const lastSeenRef = useRef<Record<number, number>>({});

    // When the initial worker list changes (e.g. page re-fetch), re-sync
    useEffect(() => {
        setLiveness(buildInitialLiveness(workers));
        const now = Date.now();
        for (const w of workers) {
            if (w.last_heartbeat_at) {
                lastSeenRef.current[w.id] = new Date(w.last_heartbeat_at).getTime();
            } else {
                lastSeenRef.current[w.id] = now;
            }
        }
    }, [workers]);

    const handleEvent = useCallback((event: AdminSocketEvent) => {
        const wId = event.worker_id;
        if (!wId) return;

        if (event.type === "worker_connected" || event.type === "worker_heartbeat") {
            lastSeenRef.current[wId] = Date.now();
            setLiveness((prev) => {
                if (prev[wId] === true) return prev;
                console.log(`[WorkerLiveness] worker ${wId} → online (${event.type})`);
                return { ...prev, [wId]: true };
            });
        } else if (event.type === "worker_disconnected") {
            setLiveness((prev) => {
                if (prev[wId] === false) return prev;
                console.log(`[WorkerLiveness] worker ${wId} → offline`);
                return { ...prev, [wId]: false };
            });
        }
    }, []);

    useAdminSocket(handleEvent);

    // Periodic staleness check — if no heartbeat in 90s, mark offline
    useEffect(() => {
        const interval = setInterval(() => {
            const STALE_MS = 90_000;
            setLiveness((prev) => {
                let changed = false;
                const next = { ...prev };
                for (const [idStr, online] of Object.entries(prev)) {
                    if (!online) continue;
                    const id = Number(idStr);
                    const lastSeen = lastSeenRef.current[id] ?? 0;
                    if (Date.now() - lastSeen > STALE_MS) {
                        console.warn(`[WorkerLiveness] worker ${id} → stale (no heartbeat for 90s)`);
                        next[id] = false;
                        changed = true;
                    }
                }
                return changed ? next : prev;
            });
        }, 15_000);
        return () => clearInterval(interval);
    }, []);

    return liveness;
}
