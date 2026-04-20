import dagre from "dagre";
import { type Node, type Edge } from "@xyflow/react";

export type NodeScale = "sm" | "md" | "lg";

const SCALE_FACTORS: Record<NodeScale, number> = {
    sm: 0.85,
    md: 1,
    lg: 1.2,
};

const BASE_DIMENSIONS: Record<string, { width: number; height: number }> = {
    system: { width: 280, height: 130 },
    worker: { width: 320, height: 120 },
    stack: { width: 300, height: 100 },
    container: { width: 300, height: 96 },
};

const DEFAULT_DIM = { width: 300, height: 100 };

export function getNodeDimensions(
    type: string,
    scale: NodeScale = "md",
): { width: number; height: number } {
    const base = BASE_DIMENSIONS[type] ?? DEFAULT_DIM;
    const factor = SCALE_FACTORS[scale];
    return {
        width: Math.round(base.width * factor),
        height: Math.round(base.height * factor),
    };
}

export function applyDagreLayout(
    nodes: Node[],
    edges: Edge[],
    direction: "TB" | "LR" = "TB",
    scale: NodeScale = "md",
): { nodes: Node[]; edges: Edge[] } {
    if (nodes.length === 0) return { nodes, edges };

    const g = new dagre.graphlib.Graph();
    g.setDefaultEdgeLabel(() => ({}));

    const scaleFactor = SCALE_FACTORS[scale];
    const nodesep = Math.round(160 * scaleFactor);
    const ranksep = Math.round(350 * scaleFactor);

    g.setGraph({
        rankdir: direction,
        nodesep,
        ranksep,
        edgesep: 40,
        marginx: 20,
        marginy: 20,
    });

    for (const node of nodes) {
        const dims = getNodeDimensions(node.type ?? "", scale);
        g.setNode(node.id, { width: dims.width, height: dims.height });
    }

    for (const edge of edges) {
        g.setEdge(edge.source, edge.target);
    }

    dagre.layout(g);

    const laidOut = nodes.map((node) => {
        const pos = g.node(node.id);
        const dims = getNodeDimensions(node.type ?? "", scale);
        return {
            ...node,
            position: {
                x: pos.x - dims.width / 2,
                y: pos.y - dims.height / 2,
            },
            style: {
                width: dims.width,
                height: dims.height,
            },
        };
    });

    return { nodes: laidOut, edges };
}
