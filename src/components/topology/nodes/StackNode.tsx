import { memo } from "react";
import { Handle, Position } from "@xyflow/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faLayerGroup } from "@fortawesome/free-solid-svg-icons";
import type { StackNodeData } from "../types";

const statusColors: Record<string, string> = {
  active: "text-[#22c55e]",
  deployed: "text-[#22c55e]",
  deploying: "text-[#eab308]",
  stopped: "text-secondary",
  failed: "text-[#ef4444]",
  error: "text-[#ef4444]",
};

const statusDots: Record<string, string> = {
  active: "bg-[#22c55e]",
  deployed: "bg-[#22c55e]",
  deploying: "bg-[#eab308]",
  stopped: "bg-[#888888]",
  failed: "bg-[#ef4444]",
  error: "bg-[#ef4444]",
};

function StackNodeComponent({ data }: { data: StackNodeData }) {
  const dotClass = statusDots[data.status] ?? "bg-[#888888]";

  return (
    <div className="rounded-xl border border-border-strong bg-surface-alt px-4 py-3 min-w-[220px]">
      <Handle
        type="target"
        position={Position.Top}
        className="!bg-accent !w-2 !h-2 !border-0"
      />
      <Handle
        type="source"
        position={Position.Bottom}
        className="!bg-accent !w-2 !h-2 !border-0"
      />
      <div className="flex items-center gap-2.5">
        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#a855f7]/10">
          <FontAwesomeIcon
            icon={faLayerGroup}
            className="h-3.5 w-3.5 text-[#a855f7]"
          />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-sm font-semibold text-primary truncate">
              {data.label}
            </p>
            <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${dotClass}`} />
          </div>
          <p className="text-[10px] text-muted">
            {data.containerCount} container
            {data.containerCount !== 1 ? "s" : ""}
            {data.workerName ? ` on ${data.workerName}` : ""}
          </p>
        </div>
      </div>
    </div>
  );
}

export const StackNode = memo(StackNodeComponent);
