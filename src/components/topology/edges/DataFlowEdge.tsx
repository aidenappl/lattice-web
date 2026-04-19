import { memo } from "react";
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

  const [edgePath] = getBezierPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    curvature: 0.3,
  });

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        style={{
          stroke,
          strokeWidth: 1.5,
          strokeDasharray: isAnimated ? "6 4" : "none",
          opacity: status === "offline" ? 0.3 : 0.7,
        }}
      />
      {isAnimated && (
        <circle r="2.5" fill={stroke}>
          <animateMotion dur="2.5s" repeatCount="indefinite" path={edgePath} />
          <animate
            attributeName="opacity"
            values="0;0.9;0.9;0"
            keyTimes="0;0.1;0.85;1"
            dur="2.5s"
            repeatCount="indefinite"
          />
        </circle>
      )}
    </>
  );
}

export const DataFlowEdge = memo(DataFlowEdgeComponent);
