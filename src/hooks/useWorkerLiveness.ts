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
import { adminSocketOpenSince, useAdminSocket, type AdminSocketEvent } from "./useAdminSocket";
import { reportWarnRateLimited } from "@/services/monitor.service";

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

    // The current map, for the staleness ticker to read outside a state updater.
    const livenessRef = useRef<LivenessMap>(liveness);
    useEffect(() => {
        livenessRef.current = liveness;
    }, [liveness]);

    // Stable key derived from workers data — avoids re-seeding on every render
    // when callers pass a freshly-created array with the same contents.
    const workersKey = workers
        .map((w) => `${w.id}:${w.status}:${w.last_heartbeat_at}`)
        .join(",");

    // When the actual worker data changes (re-fetch), re-sync liveness seed.
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
    }, [workersKey]); // eslint-disable-line react-hooks/exhaustive-deps

    const handleEvent = useCallback((event: AdminSocketEvent) => {
        const wId = event.worker_id;
        if (!wId) return;

        if (event.type === "worker_connected" || event.type === "worker_heartbeat") {
            lastSeenRef.current[wId] = Date.now();
            setLiveness((prev) => {
                if (prev[wId] === true) return prev;
                if (process.env.NODE_ENV === "development") console.log(`[WorkerLiveness] worker ${wId} → online (${event.type})`);
                return { ...prev, [wId]: true };
            });
        } else if (event.type === "worker_disconnected") {
            setLiveness((prev) => {
                if (prev[wId] === false) return prev;
                if (process.env.NODE_ENV === "development") console.log(`[WorkerLiveness] worker ${wId} → offline`);
                return { ...prev, [wId]: false };
            });
        }
    }, []);

    useAdminSocket(handleEvent);

    // Periodic staleness check — if no heartbeat in 90s, mark offline
    useEffect(() => {
        const interval = setInterval(() => {
            const STALE_MS = 90_000;
            const now = Date.now();
            const stale: number[] = [];
            for (const [idStr, online] of Object.entries(livenessRef.current)) {
                if (!online) continue;
                const id = Number(idStr);
                const lastSeen = lastSeenRef.current[id] ?? 0;
                if (now - lastSeen > STALE_MS) stale.push(id);
            }
            if (stale.length === 0) return;

            // With the socket down (or only just back) every worker looks stale
            // here; that outage is reported as ws.* instead.
            const openSince = adminSocketOpenSince();
            const socketHealthy = openSince !== null && now - openSince > STALE_MS;
            for (const id of stale) {
                if (process.env.NODE_ENV === "development") console.warn(`[WorkerLiveness] worker ${id} → stale (no heartbeat for 90s)`);
                // A worker that stops heartbeating without a disconnect is a
                // hung runner or a dropped link the API has not noticed yet.
                if (socketHealthy) reportWarnRateLimited(
                    "worker.stale",
                    { worker_id: id, last_seen_ms_ago: now - (lastSeenRef.current[id] ?? 0) },
                    `worker.stale:${id}`,
                    5 * 60_000,
                );
            }
            setLiveness((prev) => {
                const next = { ...prev };
                for (const id of stale) next[id] = false;
                return next;
            });
        }, 15_000);
        return () => clearInterval(interval);
    }, []);

    return liveness;
}
