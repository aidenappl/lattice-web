"use client";

import { useState, useCallback, useEffect } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  useReactFlow,
  ReactFlowProvider,
  type NodeTypes,
  type EdgeTypes,
  type NodeMouseHandler,
  BackgroundVariant,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useRouter } from "next/navigation";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faRotate } from "@fortawesome/free-solid-svg-icons";
import { PageLoader } from "@/components/ui/loading";
import { useTopologyData } from "./useTopologyData";
import { ViewModeSelector } from "./ViewModeSelector";
import { SystemNode } from "./nodes/SystemNode";
import { WorkerNode } from "./nodes/WorkerNode";
import { StackNode } from "./nodes/StackNode";
import { ContainerNode } from "./nodes/ContainerNode";
import { DataFlowEdge } from "./edges/DataFlowEdge";
import type { ViewMode } from "./types";

const nodeTypes: NodeTypes = {
  system: SystemNode,
  worker: WorkerNode,
  stack: StackNode,
  container: ContainerNode,
};

const edgeTypes: EdgeTypes = {
  dataFlow: DataFlowEdge,
};

export function TopologyBoard() {
  return (
    <ReactFlowProvider>
      <TopologyBoardInner />
    </ReactFlowProvider>
  );
}

function TopologyBoardInner() {
  const router = useRouter();
  const { fitView } = useReactFlow();
  const [viewMode, setViewMode] = useState<ViewMode>("system");
  const {
    nodes: layoutNodes,
    edges: layoutEdges,
    loading,
    refresh,
  } = useTopologyData(viewMode);

  const [nodes, setNodes, onNodesChange] = useNodesState(layoutNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(layoutEdges);

  // Sync layout changes into React Flow state
  useEffect(() => {
    setNodes(layoutNodes);
    setEdges(layoutEdges);
    // Give React Flow a tick to render, then fit
    requestAnimationFrame(() => fitView({ padding: 0.2 }));
  }, [layoutNodes, layoutEdges, setNodes, setEdges, fitView]);

  const onNodeClick: NodeMouseHandler = useCallback(
    (_event, node) => {
      if (node.type === "worker") {
        const data = node.data as { workerId?: number };
        if (data.workerId) router.push(`/workers/${data.workerId}`);
      } else if (node.type === "stack") {
        const data = node.data as { stackId?: number };
        if (data.stackId) router.push(`/stacks/${data.stackId}`);
      } else if (node.type === "container") {
        const data = node.data as { containerId?: number };
        if (data.containerId) router.push(`/containers/${data.containerId}`);
      }
    },
    [router],
  );

  if (loading) return <PageLoader />;

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center justify-between mb-3">
        <ViewModeSelector value={viewMode} onChange={setViewMode} />
        <button
          onClick={refresh}
          className="flex h-8 w-8 items-center justify-center rounded-lg border border-border-strong text-secondary hover:text-primary hover:bg-surface-active transition-colors cursor-pointer"
          aria-label="Refresh"
        >
          <FontAwesomeIcon icon={faRotate} className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Canvas */}
      <div className="flex-1 rounded-xl border border-border-subtle overflow-hidden bg-background">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onNodeClick={onNodeClick}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          fitView
          fitViewOptions={{ padding: 0.2 }}
          minZoom={0.1}
          maxZoom={2}
          proOptions={{ hideAttribution: true }}
          className="topology-flow"
        >
          <Background
            variant={BackgroundVariant.Dots}
            gap={20}
            size={1}
            color="var(--border-subtle)"
          />
          <Controls
            showInteractive={false}
            className="!bg-surface-alt !border-border-strong !rounded-lg !shadow-lg [&>button]:!bg-surface-alt [&>button]:!border-border-strong [&>button]:!text-secondary [&>button:hover]:!bg-surface-active [&>button:hover]:!text-primary [&>button]:!w-7 [&>button]:!h-7"
          />
          <MiniMap
            nodeStrokeWidth={3}
            nodeColor={(node) => {
              if (node.type === "system") return "#3b82f6";
              if (node.type === "worker") return "#22c55e";
              if (node.type === "stack") return "#a855f7";
              return "#6b7280";
            }}
            maskColor="rgba(0,0,0,0.15)"
            className="!bg-surface-alt !border-border-strong !rounded-lg"
          />
        </ReactFlow>
      </div>
    </div>
  );
}
