"use client";

import { useMemo } from "react";
import type { Container } from "@/types";
import { parseJSON } from "@/lib/utils";

interface Props {
  containers: Container[];
}

export function StackDependencyGraph({ containers }: Props) {
  const { nodes, edges, hasEdges } = useMemo(() => {
    const nameToIdx = new Map<string, number>();
    containers.forEach((c, i) => nameToIdx.set(c.name, i));

    const edges: { from: number; to: number }[] = [];
    for (const c of containers) {
      if (!c.depends_on) continue;
      const deps = parseJSON<string[]>(c.depends_on) ?? [];
      for (const dep of deps) {
        const fromIdx = nameToIdx.get(dep);
        const toIdx = nameToIdx.get(c.name);
        if (fromIdx !== undefined && toIdx !== undefined) {
          edges.push({ from: fromIdx, to: toIdx });
        }
      }
    }

    return { nodes: containers, edges, hasEdges: edges.length > 0 };
  }, [containers]);

  if (!hasEdges) return null;

  // Calculate layers (topological sort)
  const inDegree = new Map<number, number>();
  containers.forEach((_, i) => inDegree.set(i, 0));
  for (const e of edges) {
    inDegree.set(e.to, (inDegree.get(e.to) ?? 0) + 1);
  }

  const layers: number[][] = [];
  const assigned = new Set<number>();
  while (assigned.size < containers.length) {
    const layer: number[] = [];
    for (let i = 0; i < containers.length; i++) {
      if (assigned.has(i)) continue;
      if ((inDegree.get(i) ?? 0) <= 0) {
        layer.push(i);
      }
    }
    if (layer.length === 0) {
      // Cycle — add remaining
      for (let i = 0; i < containers.length; i++) {
        if (!assigned.has(i)) layer.push(i);
      }
    }
    layers.push(layer);
    for (const idx of layer) {
      assigned.add(idx);
      for (const e of edges) {
        if (e.from === idx) {
          inDegree.set(e.to, (inDegree.get(e.to) ?? 0) - 1);
        }
      }
    }
  }

  // Layout constants
  const nodeW = 160,
    nodeH = 36,
    layerGap = 60,
    nodeGap = 20,
    padX = 30,
    padY = 30;
  const maxLayerWidth = Math.max(...layers.map((l) => l.length));
  const svgW = maxLayerWidth * (nodeW + nodeGap) - nodeGap + padX * 2;
  const svgH = layers.length * (nodeH + layerGap) - layerGap + padY * 2;

  // Compute positions
  const positions = new Map<number, { x: number; y: number }>();
  layers.forEach((layer, li) => {
    const totalW = layer.length * (nodeW + nodeGap) - nodeGap;
    const offsetX = (svgW - totalW) / 2;
    layer.forEach((idx, ni) => {
      positions.set(idx, {
        x: offsetX + ni * (nodeW + nodeGap),
        y: padY + li * (nodeH + layerGap),
      });
    });
  });

  const statusColor = (status: string) => {
    if (status === "running") return "var(--healthy)";
    if (status === "stopped" || status === "error") return "var(--failed)";
    if (status === "paused") return "var(--pending)";
    return "var(--text-muted)";
  };

  return (
    <div className="panel mb-5">
      <div className="panel-header">
        <span>Dependency Graph</span>
      </div>
      <div className="p-4 overflow-x-auto">
        <svg width={svgW} height={svgH} className="mx-auto">
          <defs>
            <marker
              id="arrow"
              viewBox="0 0 10 7"
              refX="10"
              refY="3.5"
              markerWidth="8"
              markerHeight="6"
              orient="auto-start-reverse"
            >
              <polygon points="0 0, 10 3.5, 0 7" fill="var(--text-muted)" />
            </marker>
          </defs>
          {/* Edges */}
          {edges.map((e, i) => {
            const from = positions.get(e.from)!;
            const to = positions.get(e.to)!;
            return (
              <line
                key={i}
                x1={from.x + nodeW / 2}
                y1={from.y + nodeH}
                x2={to.x + nodeW / 2}
                y2={to.y}
                stroke="var(--border-strong)"
                strokeWidth={1.5}
                markerEnd="url(#arrow)"
              />
            );
          })}
          {/* Nodes */}
          {containers.map((c, i) => {
            const pos = positions.get(i);
            if (!pos) return null;
            return (
              <g key={c.id}>
                <rect
                  x={pos.x}
                  y={pos.y}
                  width={nodeW}
                  height={nodeH}
                  rx={6}
                  fill="var(--surface-elevated)"
                  stroke="var(--border)"
                  strokeWidth={1}
                />
                <circle
                  cx={pos.x + 14}
                  cy={pos.y + nodeH / 2}
                  r={4}
                  fill={statusColor(c.status)}
                />
                <text
                  x={pos.x + 26}
                  y={pos.y + nodeH / 2 + 4}
                  fontSize={11}
                  fontFamily="var(--font-mono)"
                  fill="var(--text-primary)"
                  className="select-none"
                >
                  {c.name.length > 18 ? c.name.slice(0, 16) + "\u2026" : c.name}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}
