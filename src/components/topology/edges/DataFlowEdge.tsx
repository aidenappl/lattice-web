import { memo, useId } from "react";
import { BaseEdge, getBezierPath, type EdgeProps } from "@xyflow/react";
import type { DataFlowEdgeData } from "../types";

const statusStroke: Record<string, string> = {
  active: "#22c55e",
  idle: "#555555",
  error: "#ef4444",
  offline: "#333333",
};

function DataFlowEdgeComponent({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
}: EdgeProps) {
  const edgeData = data as DataFlowEdgeData | undefined;
  const status = edgeData?.status ?? "idle";
  const isAnimated = edgeData?.animated ?? false;
  const stroke = statusStroke[status] ?? "#555555";
  const filterId = useId();

  const [edgePath] = getBezierPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    curvature: 0.25,
  });

  return (
    <>
      {isAnimated && (
        <defs>
          <filter id={filterId} x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="1.5" />
          </filter>
        </defs>
      )}
      <BaseEdge
        id={id}
        path={edgePath}
        style={{
          stroke,
          strokeWidth: isAnimated ? 2 : 1.4,
          opacity: status === "offline" ? 0.2 : isAnimated ? 0.7 : 0.45,
          transition:
            "stroke 0.6s ease, opacity 0.6s ease, stroke-width 0.6s ease",
        }}
      />
      {isAnimated && (
        <path
          d={edgePath}
          fill="none"
          stroke={stroke}
          strokeWidth="3"
          strokeLinecap="round"
          opacity="0.6"
          filter={`url(#${filterId})`}
          className="topology-edge-flow"
        />
      )}
    </>
  );
}

export const DataFlowEdge = memo(DataFlowEdgeComponent);
