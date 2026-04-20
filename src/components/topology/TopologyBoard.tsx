"use client";

import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useTopologyData, type ViewMode } from "./useTopologyData";
import { Sparkline, generateSparkData } from "@/components/ui/sparkline";
import { PageLoader } from "@/components/ui/loading";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faServer,
  faLayerGroup,
  faCube,
  faNetworkWired,
} from "@fortawesome/free-solid-svg-icons";
import type { Worker, Stack, Container, ComposeNetwork } from "@/types";

// ── Layout types ────────────────────────────────────────────────────

type TopoNode = {
  id: string;
  kind: "worker" | "stack" | "container";
  entityId: number;
  x: number;
  y: number;
  w: number;
  h: number;
  status: string;
  label: string;
  meta?: Record<string, unknown>;
};

type TopoEdge = {
  from: TopoNode;
  to: TopoNode;
  status: string;
};

type NetworkGroup = {
  stackId: number;
  networkName: string;
  x: number;
  y: number;
  w: number;
  h: number;
};

// ── Dimensions ──────────────────────────────────────────────────────

const WORKER_W = 230;
const WORKER_H = 68;
const STACK_W = 260;
const STACK_H = 60;
const CONTAINER_W = 200;
const CONTAINER_H = 46;
const COL_HEADER_H = 28;
const NET_PAD = 8;
const NET_LABEL_H = 18;

// ── Status helpers ──────────────────────────────────────────────────

function workerStatusClass(status: string) {
  if (status === "online") return "healthy";
  if (status === "maintenance") return "pending";
  return "failed";
}

function stackStatusClass(status: string) {
  if (status === "active" || status === "deployed") return "healthy";
  if (status === "deploying") return "pending";
  if (status === "failed" || status === "error") return "failed";
  return "off";
}

function containerStatusClass(status: string) {
  if (status === "running") return "healthy";
  if (status === "pending" || status === "paused") return "pending";
  return "failed";
}

function isActiveEdge(status: string) {
  return (
    status === "running" ||
    status === "active" ||
    status === "deployed" ||
    status === "deploying" ||
    status === "online"
  );
}

// ── Layout builder ──────────────────────────────────────────────────

function buildLayout(
  workers: Worker[],
  stacks: Stack[],
  containers: Container[],
  networks: ComposeNetwork[],
  viewMode: ViewMode,
): {
  nodes: TopoNode[];
  edges: TopoEdge[];
  networkGroups: NetworkGroup[];
  totalW: number;
  totalH: number;
} {
  const wNodes: TopoNode[] = [];
  const sNodes: TopoNode[] = [];
  const cNodes: TopoNode[] = [];
  const networkGroups: NetworkGroup[] = [];

  // Build a map of stack_id -> network names
  const stackNetworks = new Map<number, string[]>();
  for (const n of networks) {
    const existing = stackNetworks.get(n.stack_id) ?? [];
    existing.push(n.name);
    stackNetworks.set(n.stack_id, existing);
  }

  if (viewMode === "system") {
    // ── SYSTEM VIEW: Workers → Stacks → Containers ──────────────

    // Workers column
    const wGap = 20;
    const wTop = COL_HEADER_H + 8;
    workers.forEach((w, i) => {
      const containerCount = containers.filter((c) => {
        const stack = stacks.find((s) => s.id === c.stack_id);
        return stack?.worker_id === w.id;
      }).length;
      wNodes.push({
        id: `worker-${w.id}`,
        kind: "worker",
        entityId: w.id,
        x: 32,
        y: wTop + i * (WORKER_H + wGap),
        w: WORKER_W,
        h: WORKER_H,
        status: w.status,
        label: w.name,
        meta: {
          hostname: w.hostname,
          containerCount,
          stackCount: stacks.filter((s) => s.worker_id === w.id).length,
        },
      });
    });

    // Stacks column — sorted by worker_id to align with workers and minimize crossing
    const sortedStacks = [...stacks].sort((a, b) => {
      const aIdx = workers.findIndex((w) => w.id === a.worker_id);
      const bIdx = workers.findIndex((w) => w.id === b.worker_id);
      return (aIdx === -1 ? 999 : aIdx) - (bIdx === -1 ? 999 : bIdx);
    });

    const sGap = 12;
    const sTop = COL_HEADER_H + 8;
    const sX = 340;
    sortedStacks.forEach((s, i) => {
      const sContainers = containers.filter((c) => c.stack_id === s.id);
      const runningCount = sContainers.filter(
        (c) => c.status === "running",
      ).length;
      sNodes.push({
        id: `stack-${s.id}`,
        kind: "stack",
        entityId: s.id,
        x: sX,
        y: sTop + i * (STACK_H + sGap),
        w: STACK_W,
        h: STACK_H,
        status: s.status,
        label: s.name,
        meta: {
          workerId: s.worker_id,
          containerCount: sContainers.length,
          runningCount,
          strategy: s.deployment_strategy,
        },
      });
    });

    // Container column — group by stack, with network boxes
    const cGap = 6;
    const cGroupGap = 16;
    const cX = 700;
    let cY = COL_HEADER_H + 8;

    // Group containers by stack (using sorted stack order)
    for (const stack of sortedStacks) {
      const stackContainers = containers.filter((c) => c.stack_id === stack.id);
      if (stackContainers.length === 0) continue;

      const netNames = stackNetworks.get(stack.id);
      const networkLabel =
        netNames && netNames.length > 0 ? netNames.join(", ") : null;

      const groupStartY = cY;
      if (networkLabel) {
        cY += NET_LABEL_H + 4;
      }

      for (let ci = 0; ci < stackContainers.length; ci++) {
        const c = stackContainers[ci];
        cNodes.push({
          id: `container-${c.id}`,
          kind: "container",
          entityId: c.id,
          x: networkLabel ? cX + NET_PAD : cX,
          y: cY,
          w: CONTAINER_W,
          h: CONTAINER_H,
          status: c.status,
          label: c.name,
          meta: { stackId: c.stack_id },
        });
        cY += CONTAINER_H + cGap;
      }

      if (networkLabel) {
        // Remove last gap and add padding
        const groupH = cY - groupStartY + NET_PAD - cGap;
        networkGroups.push({
          stackId: stack.id,
          networkName: networkLabel,
          x: cX,
          y: groupStartY,
          w: CONTAINER_W + NET_PAD * 2,
          h: groupH,
        });
        cY = groupStartY + groupH + cGroupGap;
      } else {
        cY += cGroupGap - cGap;
      }
    }
  } else if (viewMode === "worker") {
    // ── WORKER VIEW: Workers + their containers ─────────────────
    const wGap = 20;
    const wTop = COL_HEADER_H + 8;
    workers.forEach((w, i) => {
      const containerCount = containers.filter((c) => {
        const stack = stacks.find((s) => s.id === c.stack_id);
        return stack?.worker_id === w.id;
      }).length;
      wNodes.push({
        id: `worker-${w.id}`,
        kind: "worker",
        entityId: w.id,
        x: 32,
        y: wTop + i * (WORKER_H + wGap),
        w: WORKER_W,
        h: WORKER_H,
        status: w.status,
        label: w.name,
        meta: {
          hostname: w.hostname,
          containerCount,
          stackCount: stacks.filter((s) => s.worker_id === w.id).length,
        },
      });
    });

    // Containers grouped by worker
    const cGap = 6;
    const cGroupGap = 16;
    const cX = 340;
    let cY = COL_HEADER_H + 8;

    for (const w of workers) {
      const wContainers = containers.filter((c) => {
        const stack = stacks.find((s) => s.id === c.stack_id);
        return stack?.worker_id === w.id;
      });
      for (const c of wContainers) {
        cNodes.push({
          id: `container-${c.id}`,
          kind: "container",
          entityId: c.id,
          x: cX,
          y: cY,
          w: CONTAINER_W,
          h: CONTAINER_H,
          status: c.status,
          label: c.name,
          meta: { stackId: c.stack_id },
        });
        cY += CONTAINER_H + cGap;
      }
      cY += cGroupGap;
    }
  } else if (viewMode === "stack") {
    // ── STACK VIEW: Stacks → Containers ─────────────────────────
    const sortedStacks = [...stacks].sort((a, b) => {
      const aIdx = workers.findIndex((w) => w.id === a.worker_id);
      const bIdx = workers.findIndex((w) => w.id === b.worker_id);
      return (aIdx === -1 ? 999 : aIdx) - (bIdx === -1 ? 999 : bIdx);
    });

    const sGap = 12;
    const sTop = COL_HEADER_H + 8;
    sortedStacks.forEach((s, i) => {
      const sContainers = containers.filter((c) => c.stack_id === s.id);
      const runningCount = sContainers.filter(
        (c) => c.status === "running",
      ).length;
      sNodes.push({
        id: `stack-${s.id}`,
        kind: "stack",
        entityId: s.id,
        x: 32,
        y: sTop + i * (STACK_H + sGap),
        w: STACK_W,
        h: STACK_H,
        status: s.status,
        label: s.name,
        meta: {
          workerId: s.worker_id,
          containerCount: sContainers.length,
          runningCount,
          strategy: s.deployment_strategy,
        },
      });
    });

    // Containers grouped by stack
    const cGap = 6;
    const cGroupGap = 16;
    const cX = 380;
    let cY = COL_HEADER_H + 8;

    for (const stack of sortedStacks) {
      const stackContainers = containers.filter((c) => c.stack_id === stack.id);
      if (stackContainers.length === 0) continue;

      const netNames = stackNetworks.get(stack.id);
      const networkLabel =
        netNames && netNames.length > 0 ? netNames.join(", ") : null;

      const groupStartY = cY;
      if (networkLabel) {
        cY += NET_LABEL_H + 4;
      }

      for (const c of stackContainers) {
        cNodes.push({
          id: `container-${c.id}`,
          kind: "container",
          entityId: c.id,
          x: networkLabel ? cX + NET_PAD : cX,
          y: cY,
          w: CONTAINER_W,
          h: CONTAINER_H,
          status: c.status,
          label: c.name,
          meta: { stackId: c.stack_id },
        });
        cY += CONTAINER_H + cGap;
      }

      if (networkLabel) {
        const groupH = cY - groupStartY + NET_PAD - cGap;
        networkGroups.push({
          stackId: stack.id,
          networkName: networkLabel,
          x: cX,
          y: groupStartY,
          w: CONTAINER_W + NET_PAD * 2,
          h: groupH,
        });
        cY = groupStartY + groupH + cGroupGap;
      } else {
        cY += cGroupGap - cGap;
      }
    }
  } else {
    // ── CONTAINER VIEW: flat list ───────────────────────────────
    const cGap = 6;
    const cGroupGap = 16;
    const cX = 32;
    let cY = COL_HEADER_H + 8;

    // Group by stack
    const stackIds = [...new Set(containers.map((c) => c.stack_id))];
    for (const sid of stackIds) {
      const stackContainers = containers.filter((c) => c.stack_id === sid);
      const netNames = stackNetworks.get(sid);
      const networkLabel =
        netNames && netNames.length > 0 ? netNames.join(", ") : null;

      const groupStartY = cY;
      if (networkLabel) {
        cY += NET_LABEL_H + 4;
      }

      for (const c of stackContainers) {
        cNodes.push({
          id: `container-${c.id}`,
          kind: "container",
          entityId: c.id,
          x: networkLabel ? cX + NET_PAD : cX,
          y: cY,
          w: CONTAINER_W,
          h: CONTAINER_H,
          status: c.status,
          label: c.name,
          meta: { stackId: c.stack_id },
        });
        cY += CONTAINER_H + cGap;
      }

      if (networkLabel) {
        const groupH = cY - groupStartY + NET_PAD - cGap;
        networkGroups.push({
          stackId: sid,
          networkName: networkLabel,
          x: cX,
          y: groupStartY,
          w: CONTAINER_W + NET_PAD * 2,
          h: groupH,
        });
        cY = groupStartY + groupH + cGroupGap;
      } else {
        cY += cGroupGap - cGap;
      }
    }
  }

  const allNodes = [...wNodes, ...sNodes, ...cNodes];

  // Build edges
  const edges: TopoEdge[] = [];

  if (viewMode === "system") {
    // Workers → Stacks
    for (const s of sNodes) {
      const wId = s.meta?.workerId as number | null;
      if (wId) {
        const w = wNodes.find((n) => n.entityId === wId);
        if (w) edges.push({ from: w, to: s, status: s.status });
      }
    }
    // Stacks → Containers
    for (const c of cNodes) {
      const sId = c.meta?.stackId as number;
      const s = sNodes.find((n) => n.entityId === sId);
      if (s) edges.push({ from: s, to: c, status: c.status });
    }
  } else if (viewMode === "worker") {
    for (const c of cNodes) {
      const sId = c.meta?.stackId as number;
      const stack = stacks.find((s) => s.id === sId);
      if (stack?.worker_id) {
        const w = wNodes.find((n) => n.entityId === stack.worker_id);
        if (w) edges.push({ from: w, to: c, status: c.status });
      }
    }
  } else if (viewMode === "stack") {
    for (const c of cNodes) {
      const sId = c.meta?.stackId as number;
      const s = sNodes.find((n) => n.entityId === sId);
      if (s) edges.push({ from: s, to: c, status: c.status });
    }
  }

  // Calculate total bounds
  let totalW = 0;
  let totalH = 0;
  for (const n of allNodes) {
    totalW = Math.max(totalW, n.x + n.w + 48);
    totalH = Math.max(totalH, n.y + n.h + 48);
  }
  for (const g of networkGroups) {
    totalW = Math.max(totalW, g.x + g.w + 48);
    totalH = Math.max(totalH, g.y + g.h + 48);
  }

  return { nodes: allNodes, edges, networkGroups, totalW, totalH };
}

// ── SVG Edges ───────────────────────────────────────────────────────

function EdgesSVG({
  edges,
  totalW,
  totalH,
  hoveredTree,
}: {
  edges: TopoEdge[];
  totalW: number;
  totalH: number;
  hoveredTree: Set<string> | null;
}) {
  return (
    <svg
      width={totalW}
      height={totalH}
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        pointerEvents: "none",
      }}
    >
      {edges.map((e, i) => {
        const x1 = e.from.x + e.from.w;
        const y1 = e.from.y + e.from.h / 2;
        const x2 = e.to.x;
        const y2 = e.to.y + e.to.h / 2;
        const cx = (x1 + x2) / 2;
        const d = `M${x1},${y1} C${cx},${y1} ${cx},${y2} ${x2},${y2}`;
        const active = isActiveEdge(e.status);
        const dimmed =
          hoveredTree != null &&
          !hoveredTree.has(e.from.id) &&
          !hoveredTree.has(e.to.id);
        return (
          <path
            key={i}
            d={d}
            className={`flow-edge ${active ? "active" : ""}`}
            style={dimmed ? { opacity: 0.1 } : undefined}
          />
        );
      })}
    </svg>
  );
}

// ── Network group box ───────────────────────────────────────────────

function NetworkGroupBox({
  group,
  dimmed,
}: {
  group: NetworkGroup;
  dimmed: boolean;
}) {
  return (
    <div
      className="topo-network-group"
      style={{
        position: "absolute",
        left: group.x,
        top: group.y,
        width: group.w,
        height: group.h,
        transition: "opacity 0.2s",
        opacity: dimmed ? 0.15 : 1,
      }}
    >
      <div className="topo-network-label">
        <FontAwesomeIcon icon={faNetworkWired} style={{ fontSize: 9 }} />
        {group.networkName}
      </div>
    </div>
  );
}

// ── Node components ─────────────────────────────────────────────────

function WorkerNodeEl({
  node,
  selected,
  dimmed,
  onSelect,
  onNavigate,
  onHoverStart,
  onHoverEnd,
}: {
  node: TopoNode;
  selected: boolean;
  dimmed: boolean;
  onSelect: () => void;
  onNavigate: () => void;
  onHoverStart: () => void;
  onHoverEnd: () => void;
}) {
  const st = workerStatusClass(node.status);
  const meta = node.meta as {
    hostname: string;
    containerCount: number;
    stackCount: number;
  };

  return (
    <div
      className={`topo-node ${selected ? "selected" : ""}`}
      style={{
        left: node.x,
        top: node.y,
        width: node.w,
        height: node.h,
        transition: "opacity 0.2s",
        opacity: dimmed ? 0.15 : 1,
      }}
      onClick={onSelect}
      onDoubleClick={onNavigate}
      onMouseEnter={onHoverStart}
      onMouseLeave={onHoverEnd}
    >
      <div
        style={{
          padding: "8px 10px",
          display: "flex",
          flexDirection: "column",
          gap: 4,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span className={`status-dot ${st}`} />
          <FontAwesomeIcon
            icon={faServer}
            style={{ fontSize: 10, color: "var(--text-muted)", flexShrink: 0 }}
          />
          <span
            style={{
              fontSize: 12,
              fontWeight: 500,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
              minWidth: 0,
              flex: 1,
            }}
          >
            {node.label}
          </span>
          <span
            className="mono"
            style={{
              fontSize: 10,
              color: "var(--text-muted)",
              whiteSpace: "nowrap",
              flexShrink: 0,
            }}
          >
            {meta.hostname?.split(".")[0] ?? ""}
          </span>
        </div>
        <div
          style={{
            display: "flex",
            gap: 10,
            fontSize: 10,
            fontFamily: "var(--font-mono)",
            color: "var(--text-muted)",
            whiteSpace: "nowrap",
            overflow: "hidden",
            alignItems: "center",
          }}
        >
          <span>{meta.stackCount}s</span>
          <span>{meta.containerCount}c</span>
          <Sparkline
            data={generateSparkData(12, node.entityId, 0.5, 0.2)}
            width={28}
            height={12}
            color="var(--healthy)"
            fill={false}
          />
        </div>
      </div>
    </div>
  );
}

function StackNodeEl({
  node,
  selected,
  dimmed,
  onSelect,
  onNavigate,
  onHoverStart,
  onHoverEnd,
}: {
  node: TopoNode;
  selected: boolean;
  dimmed: boolean;
  onSelect: () => void;
  onNavigate: () => void;
  onHoverStart: () => void;
  onHoverEnd: () => void;
}) {
  const st = stackStatusClass(node.status);
  const meta = node.meta as {
    containerCount: number;
    runningCount: number;
    strategy: string;
  };

  return (
    <div
      className={`topo-node ${selected ? "selected" : ""}`}
      style={{
        left: node.x,
        top: node.y,
        width: node.w,
        height: node.h,
        transition: "opacity 0.2s",
        opacity: dimmed ? 0.15 : 1,
        borderColor:
          st === "failed"
            ? "var(--failed-dim)"
            : st === "pending"
              ? "var(--pending-dim)"
              : undefined,
      }}
      onClick={onSelect}
      onDoubleClick={onNavigate}
      onMouseEnter={onHoverStart}
      onMouseLeave={onHoverEnd}
    >
      <div
        style={{
          padding: "8px 10px",
          display: "flex",
          flexDirection: "column",
          gap: 4,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <FontAwesomeIcon
            icon={faLayerGroup}
            style={{ fontSize: 10, color: "var(--text-muted)", flexShrink: 0 }}
          />
          <span
            style={{
              fontSize: 12,
              fontWeight: 500,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
              minWidth: 0,
              flex: 1,
            }}
          >
            {node.label}
          </span>
          <span className={`status-dot ${st}`} style={{ marginLeft: "auto" }} />
        </div>
        <div
          style={{
            display: "flex",
            gap: 8,
            alignItems: "center",
            fontSize: 10,
            fontFamily: "var(--font-mono)",
            color: "var(--text-muted)",
            whiteSpace: "nowrap",
            overflow: "hidden",
          }}
        >
          <span>
            {meta.runningCount}/{meta.containerCount} running
          </span>
          <span style={{ opacity: 0.4 }}>·</span>
          <span>{meta.strategy}</span>
          {node.status === "deploying" && (
            <span style={{ color: "var(--pending)", marginLeft: "auto" }}>
              deploying
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function ContainerNodeEl({
  node,
  dimmed,
  onNavigate,
  onHoverStart,
  onHoverEnd,
}: {
  node: TopoNode;
  dimmed: boolean;
  onNavigate: () => void;
  onHoverStart: () => void;
  onHoverEnd: () => void;
}) {
  const st = containerStatusClass(node.status);

  return (
    <div
      className="topo-node"
      style={{
        left: node.x,
        top: node.y,
        width: node.w,
        height: node.h,
        background: "var(--background)",
        transition: "opacity 0.2s",
        opacity: dimmed ? 0.15 : 1,
      }}
      onDoubleClick={onNavigate}
      onMouseEnter={onHoverStart}
      onMouseLeave={onHoverEnd}
    >
      <div
        style={{
          padding: "6px 8px",
          display: "flex",
          alignItems: "center",
          gap: 6,
        }}
      >
        <span className={`status-dot ${st}`} />
        <FontAwesomeIcon
          icon={faCube}
          style={{ fontSize: 9, color: "var(--text-muted)", flexShrink: 0 }}
        />
        <span
          style={{
            fontSize: 11,
            fontFamily: "var(--font-mono)",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {node.label}
        </span>
      </div>
    </div>
  );
}

// ── Zoom / Scale ────────────────────────────────────────────────────

const MIN_ZOOM = 0.3;
const MAX_ZOOM = 2.5;

// ── View mode options ───────────────────────────────────────────────

const VIEW_MODES: { value: ViewMode; label: string }[] = [
  { value: "system", label: "System" },
  { value: "worker", label: "Workers" },
  { value: "stack", label: "Stacks" },
  { value: "container", label: "Containers" },
];

// ── Main component ──────────────────────────────────────────────────

/** Compute the set of node IDs in the same tree as the given node. */
function getTreeIds(
  nodeId: string,
  nodes: TopoNode[],
  edges: TopoEdge[],
): Set<string> {
  const ids = new Set<string>();
  ids.add(nodeId);
  const node = nodes.find((n) => n.id === nodeId);
  if (!node) return ids;

  if (node.kind === "worker") {
    // Worker → its stacks → their containers
    for (const s of nodes) {
      if (
        s.kind === "stack" &&
        (s.meta?.workerId as number) === node.entityId
      ) {
        ids.add(s.id);
        for (const c of nodes) {
          if (
            c.kind === "container" &&
            (c.meta?.stackId as number) === s.entityId
          ) {
            ids.add(c.id);
          }
        }
      }
    }
  } else if (node.kind === "stack") {
    // Parent worker + stack + its containers
    const workerId = node.meta?.workerId as number | undefined;
    if (workerId) {
      const w = nodes.find(
        (n) => n.kind === "worker" && n.entityId === workerId,
      );
      if (w) ids.add(w.id);
    }
    for (const c of nodes) {
      if (
        c.kind === "container" &&
        (c.meta?.stackId as number) === node.entityId
      ) {
        ids.add(c.id);
      }
    }
  } else if (node.kind === "container") {
    // Parent stack + grandparent worker
    const stackId = node.meta?.stackId as number | undefined;
    if (stackId) {
      const s = nodes.find((n) => n.kind === "stack" && n.entityId === stackId);
      if (s) {
        ids.add(s.id);
        const workerId = s.meta?.workerId as number | undefined;
        if (workerId) {
          const w = nodes.find(
            (n) => n.kind === "worker" && n.entityId === workerId,
          );
          if (w) ids.add(w.id);
        }
      }
    }
  }

  return ids;
}

export function TopologyBoard() {
  const router = useRouter();
  const { workers, stacks, containers, networks, loading } = useTopologyData();
  const [viewMode, setViewMode] = useState<ViewMode>("system");
  const [selected, setSelected] = useState<string | null>(null);
  const [hoveredTree, setHoveredTree] = useState<Set<string> | null>(null);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const containerRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const dragStart = useRef({ x: 0, y: 0, panX: 0, panY: 0 });

  // Reset pan/zoom on view mode change
  useEffect(() => {
    setPan({ x: 0, y: 0 });
    setZoom(1);
    setSelected(null);
    setHoveredTree(null);
  }, [viewMode]);

  const { nodes, edges, networkGroups, totalW, totalH } = useMemo(
    () => buildLayout(workers, stacks, containers, networks, viewMode),
    [workers, stacks, containers, networks, viewMode],
  );

  const onNodeHover = useCallback(
    (nodeId: string | null) => {
      if (!nodeId) {
        setHoveredTree(null);
        return;
      }
      setHoveredTree(getTreeIds(nodeId, nodes, edges));
    },
    [nodes, edges],
  );

  const handleNavigate = useCallback(
    (kind: string, id: number) => {
      if (kind === "worker") router.push(`/workers/${id}`);
      else if (kind === "stack") router.push(`/stacks/${id}`);
      else if (kind === "container") router.push(`/containers/${id}`);
    },
    [router],
  );

  // Pan handlers
  const onMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if ((e.target as HTMLElement).closest(".topo-node")) return;
      if ((e.target as HTMLElement).closest(".topo-network-group")) return;
      dragging.current = true;
      dragStart.current = {
        x: e.clientX,
        y: e.clientY,
        panX: pan.x,
        panY: pan.y,
      };
      e.preventDefault();
    },
    [pan],
  );

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (!dragging.current) return;
      const dx = e.clientX - dragStart.current.x;
      const dy = e.clientY - dragStart.current.y;
      setPan({
        x: dragStart.current.panX + dx,
        y: dragStart.current.panY + dy,
      });
    };
    const onMouseUp = () => {
      dragging.current = false;
    };
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, []);

  // Zoom via scroll wheel
  const onWheel = useCallback(
    (e: React.WheelEvent) => {
      e.preventDefault();
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;

      // Mouse position relative to container
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;

      const delta = e.deltaY > 0 ? 0.92 : 1.08;
      const newZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom * delta));

      // Adjust pan so zoom is centered on cursor
      const scale = newZoom / zoom;
      setPan({
        x: mx - (mx - pan.x) * scale,
        y: my - (my - pan.y) * scale,
      });
      setZoom(newZoom);
    },
    [zoom, pan],
  );

  if (loading) return <PageLoader />;

  const workerCount = workers.length;
  const stackCount = stacks.length;
  const containerCount = containers.length;

  return (
    <div className="flex flex-col h-full select-none">
      {/* Header */}
      <div
        className="panel-header"
        style={{ whiteSpace: "nowrap", minWidth: 0 }}
      >
        <span>Topology</span>
        <div className="panel-header-right">
          <div className="segmented">
            {VIEW_MODES.map((m) => (
              <div
                key={m.value}
                className={`segmented-option ${viewMode === m.value ? "active" : ""}`}
                onClick={() => setViewMode(m.value)}
              >
                {m.label}
              </div>
            ))}
          </div>
          <span
            className="mono"
            style={{
              fontSize: 10,
              color: "var(--text-muted)",
              marginLeft: 8,
              minWidth: 32,
              textAlign: "center",
            }}
          >
            {Math.round(zoom * 100)}%
          </span>
        </div>
      </div>

      {/* Canvas */}
      <div
        ref={containerRef}
        className="topology"
        style={{
          flex: 1,
          position: "relative",
          overflow: "hidden",
          cursor: dragging.current ? "grabbing" : "grab",
        }}
        onMouseDown={onMouseDown}
        onWheel={onWheel}
      >
        {/* Dot grid background */}
        <div className="topology-grid" />

        {/* Pannable + zoomable inner content */}
        <div
          style={{
            position: "absolute",
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            transformOrigin: "0 0",
            width: totalW,
            height: totalH,
          }}
        >
          {/* Column headers */}
          {viewMode === "system" && (
            <>
              <div className="topo-column-header" style={{ left: 40, top: 8 }}>
                <FontAwesomeIcon icon={faServer} style={{ marginRight: 4 }} />
                Workers · {workerCount}
              </div>
              <div className="topo-column-header" style={{ left: 348, top: 8 }}>
                <FontAwesomeIcon
                  icon={faLayerGroup}
                  style={{ marginRight: 4 }}
                />
                Stacks · {stackCount}
              </div>
              <div className="topo-column-header" style={{ left: 708, top: 8 }}>
                <FontAwesomeIcon icon={faCube} style={{ marginRight: 4 }} />
                Containers · {containerCount}
              </div>
            </>
          )}
          {viewMode === "worker" && (
            <>
              <div className="topo-column-header" style={{ left: 40, top: 8 }}>
                <FontAwesomeIcon icon={faServer} style={{ marginRight: 4 }} />
                Workers · {workerCount}
              </div>
              <div className="topo-column-header" style={{ left: 348, top: 8 }}>
                <FontAwesomeIcon icon={faCube} style={{ marginRight: 4 }} />
                Containers · {containerCount}
              </div>
            </>
          )}
          {viewMode === "stack" && (
            <>
              <div className="topo-column-header" style={{ left: 40, top: 8 }}>
                <FontAwesomeIcon
                  icon={faLayerGroup}
                  style={{ marginRight: 4 }}
                />
                Stacks · {stackCount}
              </div>
              <div className="topo-column-header" style={{ left: 388, top: 8 }}>
                <FontAwesomeIcon icon={faCube} style={{ marginRight: 4 }} />
                Containers · {containerCount}
              </div>
            </>
          )}
          {viewMode === "container" && (
            <div className="topo-column-header" style={{ left: 40, top: 8 }}>
              <FontAwesomeIcon icon={faCube} style={{ marginRight: 4 }} />
              Containers · {containerCount}
            </div>
          )}

          {/* SVG edges */}
          <EdgesSVG
            edges={edges}
            totalW={totalW}
            totalH={totalH}
            hoveredTree={hoveredTree}
          />

          {/* Network group boxes (rendered behind nodes) */}
          {networkGroups.map((g) => {
            const netDimmed =
              hoveredTree != null &&
              !nodes.some(
                (n) =>
                  n.kind === "container" &&
                  (n.meta?.stackId as number) === g.stackId &&
                  hoveredTree.has(n.id),
              );
            return (
              <NetworkGroupBox
                key={`net-${g.stackId}`}
                group={g}
                dimmed={netDimmed}
              />
            );
          })}

          {/* Nodes */}
          {nodes.map((node) => {
            const isDimmed = hoveredTree != null && !hoveredTree.has(node.id);
            if (node.kind === "worker") {
              return (
                <WorkerNodeEl
                  key={node.id}
                  node={node}
                  selected={selected === node.id}
                  dimmed={isDimmed}
                  onSelect={() => setSelected(node.id)}
                  onNavigate={() => handleNavigate("worker", node.entityId)}
                  onHoverStart={() => onNodeHover(node.id)}
                  onHoverEnd={() => onNodeHover(null)}
                />
              );
            }
            if (node.kind === "stack") {
              return (
                <StackNodeEl
                  key={node.id}
                  node={node}
                  selected={selected === node.id}
                  dimmed={isDimmed}
                  onSelect={() => setSelected(node.id)}
                  onNavigate={() => handleNavigate("stack", node.entityId)}
                  onHoverStart={() => onNodeHover(node.id)}
                  onHoverEnd={() => onNodeHover(null)}
                />
              );
            }
            return (
              <ContainerNodeEl
                key={node.id}
                node={node}
                dimmed={isDimmed}
                onNavigate={() => handleNavigate("container", node.entityId)}
                onHoverStart={() => onNodeHover(node.id)}
                onHoverEnd={() => onNodeHover(null)}
              />
            );
          })}
        </div>

        {/* Status legend */}
        <div className="topo-legend">
          <span className="topo-legend-item">
            <span className="status-dot healthy" />
            healthy
          </span>
          <span className="topo-legend-item">
            <span className="status-dot pending" />
            pending
          </span>
          <span className="topo-legend-item">
            <span className="status-dot failed" />
            failed
          </span>
          <span style={{ opacity: 0.4 }}>· scroll to zoom · drag to pan</span>
        </div>
      </div>
    </div>
  );
}
