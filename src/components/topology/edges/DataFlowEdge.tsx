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
    curvature: 0.25,
  });

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        style={{
          stroke,
          strokeWidth: isAnimated ? 1.8 : 1.4,
          strokeDasharray: isAnimated ? "6 4" : "none",
          opacity: status === "offline" ? 0.25 : 0.6,
          transition: "stroke 0.4s ease, opacity 0.4s ease, stroke-width 0.3s ease",
        }}
      />
      {isAnimated && (
        <>
          {/* Primary dot */}
          <circle r="3" fill={stroke} opacity="0">
            <animateMotion
              dur="3s"
              repeatCount="indefinite"
              path={edgePath}
              calcMode="spline"
              keyPoints="0;1"
              keyTimes="0;1"
              keySplines="0.4 0 0.2 1"
            />
            <animate
              attributeName="opacity"
              values="0;0.85;0.85;0"
              keyTimes="0;0.08;0.88;1"
              dur="3s"
              repeatCount="indefinite"
              calcMode="spline"
              keySplines="0.4 0 0.6 1;0.4 0 0.6 1;0.4 0 0.6 1"
            />
          </circle>
          {/* Secondary dot — offset by half the cycle */}
          <circle r="2.5" fill={stroke} opacity="0">
            <animateMotion
              dur="3s"
              repeatCount="indefinite"
              path={edgePath}
              calcMode="spline"
              keyPoints="0;1"
              keyTimes="0;1"
              keySplines="0.4 0 0.2 1"
              begin="1.5s"
            />
            <animate
              attributeName="opacity"
              values="0;0.6;0.6;0"
              keyTimes="0;0.08;0.88;1"
              dur="3s"
              repeatCount="indefinite"
              begin="1.5s"
              calcMode="spline"
              keySplines="0.4 0 0.6 1;0.4 0 0.6 1;0.4 0 0.6 1"
            />
          </circle>
        </>
      )}
    </>
  );
}

export const DataFlowEdge = memo(DataFlowEdgeComponent);
