import { type Node, type Edge } from "@xyflow/react";
import type { NodeScale } from "./layout";

export type ViewMode = "system" | "worker" | "stack" | "container";

export type SystemNodeData = {
    label: string;
    totalWorkers: number;
    onlineWorkers: number;
    totalStacks: number;
    totalContainers: number;
    scale: NodeScale;
};

export type WorkerNodeData = {
    workerId: number;
    label: string;
    status: "online" | "offline" | "maintenance";
    hostname: string;
    containerCount: number;
    stackCount: number;
    lastHeartbeat: string | null;
    scale: NodeScale;
};

export type StackNodeData = {
    stackId: number;
    label: string;
    status: string;
    workerName: string | null;
    containerCount: number;
    scale: NodeScale;
};

export type ContainerNodeData = {
    containerId: number;
    label: string;
    status: "running" | "stopped" | "error" | "pending" | "paused";
    image: string;
    tag: string;
    healthStatus: string;
    stackName: string;
    scale: NodeScale;
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
