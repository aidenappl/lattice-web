import dagre from "dagre";
import { type Node, type Edge } from "@xyflow/react";

export type NodeScale = "sm" | "md" | "lg";

const SCALE_FACTORS: Record<NodeScale, number> = {
    sm: 0.85,
    md: 1,
    lg: 1.2,
};

const BASE_DIMENSIONS: Record<string, { width: number; height: number }> = {
    system: { width: 240, height: 110 },
    worker: { width: 280, height: 100 },
    stack: { width: 260, height: 90 },
    container: { width: 260, height: 86 },
};

const DEFAULT_DIM = { width: 260, height: 90 };

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
    const nodesep = Math.round(80 * scaleFactor);
    const ranksep = Math.round(220 * scaleFactor);

    g.setGraph({
        rankdir: direction,
        nodesep,
        ranksep,
        edgesep: 20,
        marginx: 40,
        marginy: 40,
    });

    for (const node of nodes) {
        const dims = getNodeDimensions(node.type ?? "", scale);
        g.setNode(node.id, { width: dims.width, height: dims.height });
    }

    for (const edge of edges) {
        g.setEdge(edge.source, edge.target);
    }

    dagre.layout(g);

    // Group nodes by rank (y position for TB, x for LR) to apply staggering
    const posKey = direction === "TB" ? "y" : "x";
    const staggerKey = direction === "TB" ? "y" : "x";
    const rankMap = new Map<number, number[]>();
    const nodePositions = new Map<string, { x: number; y: number }>();

    for (const node of nodes) {
        const pos = g.node(node.id);
        nodePositions.set(node.id, { x: pos.x, y: pos.y });
        const rankValue = Math.round(pos[posKey]);
        if (!rankMap.has(rankValue)) rankMap.set(rankValue, []);
        rankMap.get(rankValue)!.push(nodes.indexOf(node));
    }

    // Apply staggering within each rank to prevent perfect alignment
    const laidOut = nodes.map((node) => {
        const pos = nodePositions.get(node.id)!;
        const dims = getNodeDimensions(node.type ?? "", scale);
        const rankValue = Math.round(pos[posKey]);
        const rankNodes = rankMap.get(rankValue) ?? [];
        const indexInRank = rankNodes.indexOf(nodes.indexOf(node));

        // Alternate stagger: odd nodes shift down/right, even stay
        let stagger = 0;
        if (rankNodes.length > 1) {
            stagger = indexInRank % 2 === 1 ? 18 * scaleFactor : 0;
        }

        const finalPos = { ...pos };
        finalPos[staggerKey] += stagger;

        return {
            ...node,
            position: {
                x: finalPos.x - dims.width / 2,
                y: finalPos.y - dims.height / 2,
            },
        };
    });

    return { nodes: laidOut, edges };
}
