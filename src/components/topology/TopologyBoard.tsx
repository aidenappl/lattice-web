"use client";

import { useState, useCallback, useEffect, useRef } from "react";
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
  type Node,
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
import type { NodeScale } from "./layout";

const nodeTypes: NodeTypes = {
  system: SystemNode,
  worker: WorkerNode,
  stack: StackNode,
  container: ContainerNode,
};

const edgeTypes: EdgeTypes = {
  dataFlow: DataFlowEdge,
};

const SCALE_OPTIONS: { value: NodeScale; label: string }[] = [
  { value: "sm", label: "S" },
  { value: "md", label: "M" },
  { value: "lg", label: "L" },
];

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
  const [nodeScale, setNodeScale] = useState<NodeScale>("md");
  const prevViewMode = useRef(viewMode);
  const prevScale = useRef(nodeScale);
  const hasFitted = useRef(false);
  const userDragged = useRef(false);

  const {
    nodes: layoutNodes,
    edges: layoutEdges,
    loading,
    refresh,
  } = useTopologyData(viewMode, nodeScale);

  const [nodes, setNodes, onNodesChange] = useNodesState(layoutNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(layoutEdges);

  // Full layout reset when viewMode or scale changes
  const layoutChanged =
    viewMode !== prevViewMode.current || nodeScale !== prevScale.current;

  useEffect(() => {
    if (layoutChanged) {
      // Reset everything on view/scale change
      setNodes(layoutNodes);
      setEdges(layoutEdges);
      userDragged.current = false;
      prevViewMode.current = viewMode;
      prevScale.current = nodeScale;
      hasFitted.current = false;
    } else if (!userDragged.current) {
      // Initial load or data refresh when user hasn't dragged — apply positions
      setNodes(layoutNodes);
      setEdges(layoutEdges);
    } else {
      // User has dragged nodes — only update data, preserve positions
      setNodes((prev) => {
        const layoutMap = new Map(layoutNodes.map((n) => [n.id, n]));
        const updated: Node[] = [];
        const existingIds = new Set(prev.map((n) => n.id));

        for (const existing of prev) {
          const fresh = layoutMap.get(existing.id);
          if (fresh) {
            updated.push({
              ...existing,
              data: fresh.data,
              style: fresh.style,
            });
          }
        }

        // Add any new nodes that appeared
        for (const ln of layoutNodes) {
          if (!existingIds.has(ln.id)) {
            updated.push(ln);
          }
        }

        return updated;
      });
      setEdges(layoutEdges);
    }
  }, [
    layoutNodes,
    layoutEdges,
    setNodes,
    setEdges,
    layoutChanged,
    viewMode,
    nodeScale,
  ]);

  // fitView after layout settles
  useEffect(() => {
    if (loading || layoutNodes.length === 0) return;
    if (!hasFitted.current || layoutChanged) {
      const t = requestAnimationFrame(() => {
        fitView({
          padding: 0.02,
          maxZoom: 1.5,
          duration: hasFitted.current ? 500 : 0,
        });
        hasFitted.current = true;
      });
      return () => cancelAnimationFrame(t);
    }
  }, [loading, layoutNodes, fitView, layoutChanged]);

  const handleNodesChange: typeof onNodesChange = useCallback(
    (changes) => {
      const hasDrag = changes.some((c) => c.type === "position" && c.dragging);
      if (hasDrag) userDragged.current = true;
      onNodesChange(changes);
    },
    [onNodesChange],
  );

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
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-0.5 rounded-lg border border-border-strong bg-surface-alt p-0.5">
            {SCALE_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setNodeScale(opt.value)}
                title={`Node size: ${opt.label === "S" ? "Small" : opt.label === "M" ? "Medium" : "Large"}`}
                className={`flex items-center justify-center rounded-md w-7 h-7 text-[10px] font-semibold transition-colors cursor-pointer ${
                  nodeScale === opt.value
                    ? "bg-surface-active text-primary shadow-sm"
                    : "text-muted hover:text-secondary"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <button
            onClick={() => {
              userDragged.current = false;
              refresh().then(() => {
                requestAnimationFrame(() =>
                  fitView({ padding: 0.02, maxZoom: 1.5, duration: 500 }),
                );
              });
            }}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-border-strong text-secondary hover:text-primary hover:bg-surface-active transition-colors cursor-pointer"
            title="Refresh topology"
            aria-label="Refresh"
          >
            <FontAwesomeIcon icon={faRotate} className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Canvas */}
      <div className="flex-1 rounded-xl border border-border-subtle overflow-hidden bg-background">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={handleNodesChange}
          onEdgesChange={onEdgesChange}
          onNodeClick={onNodeClick}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          minZoom={0.05}
          maxZoom={3}
          proOptions={{ hideAttribution: true }}
          className="topology-flow"
        >
          <Background
            variant={BackgroundVariant.Dots}
            gap={24}
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
