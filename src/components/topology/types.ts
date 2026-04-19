import { type Node, type Edge } from "@xyflow/react";

export type ViewMode = "system" | "worker" | "stack" | "container";

export type SystemNodeData = {
    label: string;
    totalWorkers: number;
    onlineWorkers: number;
    totalStacks: number;
    totalContainers: number;
};

export type WorkerNodeData = {
    workerId: number;
    label: string;
    status: "online" | "offline" | "maintenance";
    hostname: string;
    containerCount: number;
    stackCount: number;
    lastHeartbeat: string | null;
};

export type StackNodeData = {
    stackId: number;
    label: string;
    status: string;
    workerName: string | null;
    containerCount: number;
};

export type ContainerNodeData = {
    containerId: number;
    label: string;
    status: "running" | "stopped" | "error" | "pending" | "paused";
    image: string;
    tag: string;
    healthStatus: string;
    stackName: string;
};

export type TopologyNode =
    | Node<SystemNodeData, "system">
    | Node<WorkerNodeData, "worker">
    | Node<StackNodeData, "stack">
    | Node<ContainerNodeData, "container">;

export type EdgeStatus = "active" | "idle" | "error" | "offline";

export type DataFlowEdgeData = {
    status: EdgeStatus;
    animated: boolean;
};

export type TopologyEdge = Edge<DataFlowEdgeData>;
