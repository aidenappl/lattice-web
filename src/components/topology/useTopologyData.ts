import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { type Node, type Edge } from "@xyflow/react";
import { Worker, Stack, Container } from "@/types";
import { reqGetWorkers } from "@/services/workers.service";
import { reqGetStacks, reqGetAllContainers } from "@/services/stacks.service";
import { useAdminSocket, AdminSocketEvent } from "@/hooks/useAdminSocket";
import { applyDagreLayout, type NodeScale } from "./layout";
import type {
    ViewMode,
    SystemNodeData,
    WorkerNodeData,
    StackNodeData,
    ContainerNodeData,
    DataFlowEdgeData,
    EdgeStatus,
} from "./types";

type TopologyState = {
    workers: Worker[];
    stacks: Stack[];
    containers: Container[];
    loading: boolean;
};

function edgeStatus(workerStatus: string): EdgeStatus {
    if (workerStatus === "online") return "active";
    if (workerStatus === "maintenance") return "idle";
    return "offline";
}

function buildSystemView(
    workers: Worker[],
    stacks: Stack[],
    containers: Container[],
    scale: NodeScale = "md",
    recentHeartbeats?: Set<number>,
    recentContainerChanges?: Set<number>,
): { nodes: Node[]; edges: Edge[] } {
    const nodes: Node[] = [];
    const edges: Edge[] = [];

    // System hub
    nodes.push({
        id: "system",
        type: "system",
        position: { x: 0, y: 0 },
        data: {
            label: "Lattice",
            totalWorkers: workers.length,
            onlineWorkers: workers.filter((w) => w.status === "online").length,
            totalStacks: stacks.length,
            totalContainers: containers.length,
            scale,
        } satisfies SystemNodeData,
    });

    // Workers
    for (const w of workers) {
        const wStacks = stacks.filter((s) => s.worker_id === w.id);
        const wContainers = containers.filter((c) => {
            const stack = stacks.find((s) => s.id === c.stack_id);
            return stack?.worker_id === w.id;
        });

        nodes.push({
            id: `worker-${w.id}`,
            type: "worker",
            position: { x: 0, y: 0 },
            data: {
                workerId: w.id,
                label: w.name,
                status: w.status,
                hostname: w.hostname,
                containerCount: wContainers.length,
                stackCount: wStacks.length,
                lastHeartbeat: w.last_heartbeat_at,
                scale,
                recentHeartbeat: recentHeartbeats?.has(w.id),
            } satisfies WorkerNodeData,
        });

        edges.push({
            id: `system-worker-${w.id}`,
            source: "system",
            target: `worker-${w.id}`,
            type: "dataFlow",
            data: {
                status: edgeStatus(w.status),
                animated: w.status === "online",
            } satisfies DataFlowEdgeData,
        });

        // Stacks under worker
        for (const s of wStacks) {
            const sContainers = containers.filter((c) => c.stack_id === s.id);
            nodes.push({
                id: `stack-${s.id}`,
                type: "stack",
                position: { x: 0, y: 0 },
                data: {
                    stackId: s.id,
                    label: s.name,
                    status: s.status,
                    workerName: w.name,
                    containerCount: sContainers.length,
                    scale: "md",
                } satisfies StackNodeData,
            });

            edges.push({
                id: `worker-${w.id}-stack-${s.id}`,
                source: `worker-${w.id}`,
                target: `stack-${s.id}`,
                type: "dataFlow",
                data: {
                    status: edgeStatus(w.status),
                    animated: w.status === "online" && s.status === "active",
                } satisfies DataFlowEdgeData,
            });

            // Containers under stack
            for (const c of sContainers) {
                nodes.push({
                    id: `container-${c.id}`,
                    type: "container",
                    position: { x: 0, y: 0 },
                    data: {
                        containerId: c.id,
                        label: c.name,
                        status: c.status,
                        healthStatus: c.health_status,
                        stackName: s.name,
                        scale,
                        recentStatusChange: recentContainerChanges?.has(c.id),
                    } satisfies ContainerNodeData,
                });

                edges.push({
                    id: `stack-${s.id}-container-${c.id}`,
                    source: `stack-${s.id}`,
                    target: `container-${c.id}`,
                    type: "dataFlow",
                    data: {
                        status: c.status === "running" ? "active" : c.status === "error" ? "error" : "idle",
                        animated: c.status === "running",
                    } satisfies DataFlowEdgeData,
                });
            }
        }
    }

    // Unassigned stacks (worker_id is null)
    const unassigned = stacks.filter((s) => !s.worker_id);
    for (const s of unassigned) {
        const sContainers = containers.filter((c) => c.stack_id === s.id);
        nodes.push({
            id: `stack-${s.id}`,
            type: "stack",
            position: { x: 0, y: 0 },
            data: {
                stackId: s.id,
                label: s.name,
                status: s.status,
                workerName: null,
                containerCount: sContainers.length,
                scale,
            } satisfies StackNodeData,
        });

        edges.push({
            id: `system-stack-${s.id}`,
            source: "system",
            target: `stack-${s.id}`,
            type: "dataFlow",
            data: { status: "idle", animated: false } satisfies DataFlowEdgeData,
        });
    }

    return applyDagreLayout(nodes, edges, "TB", scale);
}

function buildWorkerView(
    workers: Worker[],
    stacks: Stack[],
    containers: Container[],
    scale: NodeScale = "md",
    recentHeartbeats?: Set<number>,
    recentContainerChanges?: Set<number>,
): { nodes: Node[]; edges: Edge[] } {
    const nodes: Node[] = [];
    const edges: Edge[] = [];

    for (const w of workers) {
        const wContainers = containers.filter((c) => {
            const stack = stacks.find((s) => s.id === c.stack_id);
            return stack?.worker_id === w.id;
        });
        const wStacks = stacks.filter((s) => s.worker_id === w.id);

        nodes.push({
            id: `worker-${w.id}`,
            type: "worker",
            position: { x: 0, y: 0 },
            data: {
                workerId: w.id,
                label: w.name,
                status: w.status,
                hostname: w.hostname,
                containerCount: wContainers.length,
                stackCount: wStacks.length,
                lastHeartbeat: w.last_heartbeat_at,
                scale,
                recentHeartbeat: recentHeartbeats?.has(w.id),
            } satisfies WorkerNodeData,
        });

        for (const c of wContainers) {
            const stack = stacks.find((s) => s.id === c.stack_id);
            nodes.push({
                id: `container-${c.id}`,
                type: "container",
                position: { x: 0, y: 0 },
                data: {
                    containerId: c.id,
                    label: c.name,
                    status: c.status,
                    healthStatus: c.health_status,
                    stackName: stack?.name ?? "unknown",
                    scale,
                    recentStatusChange: recentContainerChanges?.has(c.id),
                } satisfies ContainerNodeData,
            });

            edges.push({
                id: `worker-${w.id}-container-${c.id}`,
                source: `worker-${w.id}`,
                target: `container-${c.id}`,
                type: "dataFlow",
                data: {
                    status: c.status === "running" ? "active" : c.status === "error" ? "error" : "idle",
                    animated: c.status === "running" && w.status === "online",
                } satisfies DataFlowEdgeData,
            });
        }
    }

    return applyDagreLayout(nodes, edges, "TB", scale);
}

function buildStackView(
    workers: Worker[],
    stacks: Stack[],
    containers: Container[],
    scale: NodeScale = "md",
    _recentHeartbeats?: Set<number>,
    recentContainerChanges?: Set<number>,
): { nodes: Node[]; edges: Edge[] } {
    const nodes: Node[] = [];
    const edges: Edge[] = [];

    for (const s of stacks) {
        const sContainers = containers.filter((c) => c.stack_id === s.id);
        const worker = workers.find((w) => w.id === s.worker_id);

        nodes.push({
            id: `stack-${s.id}`,
            type: "stack",
            position: { x: 0, y: 0 },
            data: {
                stackId: s.id,
                label: s.name,
                status: s.status,
                workerName: worker?.name ?? null,
                containerCount: sContainers.length,
                scale,
            } satisfies StackNodeData,
        });

        for (const c of sContainers) {
            nodes.push({
                id: `container-${c.id}`,
                type: "container",
                position: { x: 0, y: 0 },
                data: {
                    containerId: c.id,
                    label: c.name,
                    status: c.status,
                    healthStatus: c.health_status,
                    stackName: s.name,
                    scale,
                    recentStatusChange: recentContainerChanges?.has(c.id),
                } satisfies ContainerNodeData,
            });

            edges.push({
                id: `stack-${s.id}-container-${c.id}`,
                source: `stack-${s.id}`,
                target: `container-${c.id}`,
                type: "dataFlow",
                data: {
                    status: c.status === "running" ? "active" : c.status === "error" ? "error" : "idle",
                    animated: c.status === "running",
                } satisfies DataFlowEdgeData,
            });
        }
    }

    return applyDagreLayout(nodes, edges, "TB", scale);
}

function buildContainerView(
    workers: Worker[],
    stacks: Stack[],
    containers: Container[],
    scale: NodeScale = "md",
    recentHeartbeats?: Set<number>,
    recentContainerChanges?: Set<number>,
): { nodes: Node[]; edges: Edge[] } {
    const nodes: Node[] = [];
    const edges: Edge[] = [];

    // Show workers and stacks as context, with containers connected
    for (const w of workers) {
        const wStacks = stacks.filter((s) => s.worker_id === w.id);
        const wContainers = containers.filter((c) => {
            const stack = stacks.find((s) => s.id === c.stack_id);
            return stack?.worker_id === w.id;
        });

        nodes.push({
            id: `worker-${w.id}`,
            type: "worker",
            position: { x: 0, y: 0 },
            data: {
                workerId: w.id,
                label: w.name,
                status: w.status,
                hostname: w.hostname,
                containerCount: wContainers.length,
                stackCount: wStacks.length,
                lastHeartbeat: w.last_heartbeat_at,
                scale,
                recentHeartbeat: recentHeartbeats?.has(w.id),
            } satisfies WorkerNodeData,
        });
    }

    for (const s of stacks) {
        const sContainers = containers.filter((c) => c.stack_id === s.id);
        const worker = workers.find((w) => w.id === s.worker_id);

        nodes.push({
            id: `stack-${s.id}`,
            type: "stack",
            position: { x: 0, y: 0 },
            data: {
                stackId: s.id,
                label: s.name,
                status: s.status,
                workerName: worker?.name ?? null,
                containerCount: sContainers.length,
                scale,
            } satisfies StackNodeData,
        });

        if (s.worker_id) {
            edges.push({
                id: `worker-${s.worker_id}-stack-${s.id}`,
                source: `worker-${s.worker_id}`,
                target: `stack-${s.id}`,
                type: "dataFlow",
                data: {
                    status: edgeStatus(worker?.status ?? "offline"),
                    animated: worker?.status === "online",
                } satisfies DataFlowEdgeData,
            });
        }

        for (const c of sContainers) {
            nodes.push({
                id: `container-${c.id}`,
                type: "container",
                position: { x: 0, y: 0 },
                data: {
                    containerId: c.id,
                    label: c.name,
                    status: c.status,
                    healthStatus: c.health_status,
                    stackName: s.name,
                    scale,
                    recentStatusChange: recentContainerChanges?.has(c.id),
                } satisfies ContainerNodeData,
            });

            edges.push({
                id: `stack-${s.id}-container-${c.id}`,
                source: `stack-${s.id}`,
                target: `container-${c.id}`,
                type: "dataFlow",
                data: {
                    status: c.status === "running" ? "active" : c.status === "error" ? "error" : "idle",
                    animated: c.status === "running",
                } satisfies DataFlowEdgeData,
            });
        }
    }

    return applyDagreLayout(nodes, edges, "LR", scale);
}

type BuilderFn = (
    w: Worker[], s: Stack[], c: Container[], scale: NodeScale,
    recentHeartbeats?: Set<number>, recentContainerChanges?: Set<number>,
) => { nodes: Node[]; edges: Edge[] };

const builders: Record<ViewMode, BuilderFn> = {
    system: buildSystemView,
    worker: buildWorkerView,
    stack: buildStackView,
    container: buildContainerView,
};

export function useTopologyData(viewMode: ViewMode, scale: NodeScale = "md") {
    const [state, setState] = useState<TopologyState>({
        workers: [],
        stacks: [],
        containers: [],
        loading: true,
    });

    const recentHeartbeats = useRef<Set<number>>(new Set());
    const recentContainerChanges = useRef<Set<number>>(new Set());
    const [wsVersion, setWsVersion] = useState(0);

    const load = useCallback(async () => {
        const [wRes, sRes, cRes] = await Promise.all([
            reqGetWorkers(),
            reqGetStacks(),
            reqGetAllContainers(),
        ]);

        setState({
            workers: wRes.success ? wRes.data : [],
            stacks: sRes.success ? sRes.data : [],
            containers: cRes.success ? cRes.data : [],
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
            setWsVersion((v) => v + 1);
            setTimeout(() => {
                recentHeartbeats.current.delete(wid);
                setWsVersion((v) => v + 1);
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
            setState((prev) => ({
                ...prev,
                workers: prev.workers.map((w) =>
                    w.id === event.worker_id
                        ? { ...w, status: "online" as const, last_heartbeat_at: new Date().toISOString() }
                        : w,
                ),
            }));
        }

        if (event.type === "worker_disconnected" && event.worker_id) {
            setState((prev) => ({
                ...prev,
                workers: prev.workers.map((w) =>
                    w.id === event.worker_id ? { ...w, status: "offline" as const } : w,
                ),
            }));
        }

        if (event.type === "container_status" && event.payload) {
            const payload = event.payload as { container_id?: number; status?: string };
            if (payload.container_id && payload.status) {
                const cid = payload.container_id;
                recentContainerChanges.current.add(cid);
                setWsVersion((v) => v + 1);
                setTimeout(() => {
                    recentContainerChanges.current.delete(cid);
                    setWsVersion((v) => v + 1);
                }, 3000);

                setState((prev) => ({
                    ...prev,
                    containers: prev.containers.map((c) =>
                        c.id === cid
                            ? { ...c, status: payload.status as Container["status"] }
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

    const { nodes, edges } = useMemo(() => {
        if (state.loading) return { nodes: [], edges: [] };
        void wsVersion;
        return builders[viewMode](
            state.workers, state.stacks, state.containers, scale,
            recentHeartbeats.current, recentContainerChanges.current,
        );
    }, [state, viewMode, scale, wsVersion]);

    return { nodes, edges, loading: state.loading, refresh: load };
}
