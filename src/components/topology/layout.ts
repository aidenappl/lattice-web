import dagre from "dagre";
import { type Node, type Edge } from "@xyflow/react";

const NODE_WIDTH = 220;
const NODE_HEIGHT = 80;

const NODE_DIMENSIONS: Record<string, { width: number; height: number }> = {
    system: { width: 200, height: 90 },
    worker: { width: 240, height: 88 },
    stack: { width: 220, height: 80 },
    container: { width: 220, height: 76 },
};

export function applyDagreLayout(
    nodes: Node[],
    edges: Edge[],
    direction: "TB" | "LR" = "TB",
): { nodes: Node[]; edges: Edge[] } {
    const g = new dagre.graphlib.Graph();
    g.setDefaultEdgeLabel(() => ({}));
    g.setGraph({
        rankdir: direction,
        nodesep: 16,
        ranksep: 50,
        edgesep: 8,
        marginx: 16,
        marginy: 16,
    });

    for (const node of nodes) {
        const dims = NODE_DIMENSIONS[node.type ?? ""] ?? {
            width: NODE_WIDTH,
            height: NODE_HEIGHT,
        };
        g.setNode(node.id, { width: dims.width, height: dims.height });
    }

    for (const edge of edges) {
        g.setEdge(edge.source, edge.target);
    }

    dagre.layout(g);

    const laidOut = nodes.map((node, index) => {
        const pos = g.node(node.id);
        const dims = NODE_DIMENSIONS[node.type ?? ""] ?? {
            width: NODE_WIDTH,
            height: NODE_HEIGHT,
        };
        const stagger = (index % 3 === 1 ? 6 : index % 3 === 2 ? -6 : 0);
        return {
            ...node,
            position: {
                x: pos.x - dims.width / 2,
                y: pos.y - dims.height / 2 + stagger,
            },
        };
    });

    return { nodes: laidOut, edges };
}
