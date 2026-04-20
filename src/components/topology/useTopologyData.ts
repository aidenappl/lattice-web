import { useEffect, useState, useCallback, useRef } from "react";
import { Worker, Stack, Container, ComposeNetwork } from "@/types";
import { reqGetWorkers } from "@/services/workers.service";
import { reqGetStacks, reqGetAllContainers, reqGetAllNetworks } from "@/services/stacks.service";
import { useAdminSocket, AdminSocketEvent } from "@/hooks/useAdminSocket";

export type ViewMode = "system" | "worker" | "stack" | "container";

export type TopologyState = {
    workers: Worker[];
    stacks: Stack[];
    containers: Container[];
    networks: ComposeNetwork[];
    loading: boolean;
};

export function useTopologyData() {
    const [state, setState] = useState<TopologyState>({
        workers: [],
        stacks: [],
        containers: [],
        networks: [],
        loading: true,
    });

    const recentHeartbeats = useRef<Set<number>>(new Set());
    const recentContainerChanges = useRef<Set<number>>(new Set());

    const load = useCallback(async () => {
        const [wRes, sRes, cRes, nRes] = await Promise.all([
            reqGetWorkers(),
            reqGetStacks(),
            reqGetAllContainers(),
            reqGetAllNetworks(),
        ]);

        setState({
            workers: wRes.success ? wRes.data : [],
            stacks: sRes.success ? sRes.data : [],
            containers: cRes.success ? cRes.data : [],
            networks: nRes.success ? (nRes.data ?? []) : [],
            loading: false,
        });
    }, []);

    useEffect(() => {
        load();
    }, [load]);

    const handleSocketEvent = useCallback((event: AdminSocketEvent) => {
        if (event.type === "worker_heartbeat" && event.worker_id) {
            const wid = event.worker_id;
            recentHeartbeats.current.add(wid);
            setTimeout(() => {
                recentHeartbeats.current.delete(wid);
            }, 6500);

            setState((prev) => ({
                ...prev,
                workers: prev.workers.map((w) =>
                    w.id === wid
                        ? { ...w, status: "online" as const, last_heartbeat_at: new Date().toISOString() }
                        : w,
                ),
            }));
        }

        if (event.type === "worker_connected" && event.worker_id) {
            const wid = event.worker_id;
            setState((prev) => ({
                ...prev,
                workers: prev.workers.map((w) =>
                    w.id === wid
                        ? { ...w, status: "online" as const, last_heartbeat_at: new Date().toISOString() }
                        : w,
                ),
                // Restore stacks to deployed when worker comes back
                stacks: prev.stacks.map((s) =>
                    s.worker_id === wid ? { ...s, status: "deployed" as const } : s,
                ),
            }));
        }

        if (event.type === "worker_disconnected" && event.worker_id) {
            const wid = event.worker_id;
            setState((prev) => {
                const workerStackIds = new Set(
                    prev.stacks.filter((s) => s.worker_id === wid).map((s) => s.id),
                );
                return {
                    ...prev,
                    workers: prev.workers.map((w) =>
                        w.id === wid ? { ...w, status: "offline" as const } : w,
                    ),
                    stacks: prev.stacks.map((s) =>
                        s.worker_id === wid ? { ...s, status: "failed" as const } : s,
                    ),
                    containers: prev.containers.map((c) =>
                        workerStackIds.has(c.stack_id)
                            ? { ...c, status: "stopped" as const }
                            : c,
                    ),
                };
            });
        }

        if (event.type === "worker_shutdown" && event.worker_id) {
            const wid = event.worker_id;
            setState((prev) => {
                const workerStackIds = new Set(
                    prev.stacks.filter((s) => s.worker_id === wid).map((s) => s.id),
                );
                return {
                    ...prev,
                    workers: prev.workers.map((w) =>
                        w.id === wid ? { ...w, status: "offline" as const } : w,
                    ),
                    stacks: prev.stacks.map((s) =>
                        s.worker_id === wid ? { ...s, status: "failed" as const } : s,
                    ),
                    containers: prev.containers.map((c) =>
                        workerStackIds.has(c.stack_id)
                            ? { ...c, status: "stopped" as const }
                            : c,
                    ),
                };
            });
        }

        if (event.type === "container_status" && event.payload) {
            const payload = event.payload as {
                container_id?: number;
                container_name?: string;
                container_state?: string;
                action?: string;
                status?: string;
                health_status?: string;
            };
            // Use enriched container_state (the resolved DB state like "running"/"stopped")
            // Only update if the action was successful
            const newState = payload.container_state;
            if (payload.status === "success" && newState && payload.container_id) {
                const cid = payload.container_id;
                recentContainerChanges.current.add(cid);
                setTimeout(() => {
                    recentContainerChanges.current.delete(cid);
                }, 3000);

                setState((prev) => ({
                    ...prev,
                    containers: prev.containers.map((c) =>
                        c.id === cid
                            ? {
                                ...c,
                                status: newState as Container["status"],
                                ...(payload.health_status ? { health_status: payload.health_status as Container["health_status"] } : {}),
                            }
                            : c,
                    ),
                }));
            }
        }

        if (event.type === "container_health_status" && event.payload) {
            const payload = event.payload as { container_id?: number; health_status?: string };
            if (payload.container_id && payload.health_status) {
                setState((prev) => ({
                    ...prev,
                    containers: prev.containers.map((c) =>
                        c.id === payload.container_id
                            ? { ...c, health_status: payload.health_status as Container["health_status"] }
                            : c,
                    ),
                }));
            }
        }
    }, []);

    useAdminSocket(handleSocketEvent);

    return { ...state, refresh: load };
}
