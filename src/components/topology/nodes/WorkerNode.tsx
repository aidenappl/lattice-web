import { memo } from "react";
import { Handle, Position } from "@xyflow/react";
import { WorkerIcon } from "@/components/ui/worker-icon";
import type { WorkerNodeData } from "../types";

const statusColors: Record<string, string> = {
  online: "border-[#22c55e]/40 shadow-[0_0_12px_rgba(34,197,94,0.08)]",
  offline: "border-[#ef4444]/30",
  maintenance: "border-[#eab308]/30",
};

const dotColors: Record<string, string> = {
  online: "bg-[#22c55e]",
  offline: "bg-[#ef4444]",
  maintenance: "bg-[#eab308]",
};

function WorkerNodeComponent({ data }: { data: WorkerNodeData }) {
  const borderClass = statusColors[data.status] ?? "border-border-strong";
  const dotClass = dotColors[data.status] ?? "bg-[#888888]";

  return (
    <div
      className={`rounded-xl border bg-surface-alt px-4 py-3 min-w-[240px] transition-shadow ${borderClass}`}
    >
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
      <div className="flex items-center gap-3">
        <WorkerIcon size="sm" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-sm font-semibold text-primary truncate">
              {data.label}
            </p>
            <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${dotClass}`} />
          </div>
          <p className="text-[10px] text-muted truncate">{data.hostname}</p>
        </div>
      </div>
      <div className="mt-2 flex items-center gap-3 text-[10px]">
        <span className="text-muted">
          {data.stackCount} stack{data.stackCount !== 1 ? "s" : ""}
        </span>
        <span className="text-muted">
          {data.containerCount} container{data.containerCount !== 1 ? "s" : ""}
        </span>
      </div>
    </div>
  );
}

export const WorkerNode = memo(WorkerNodeComponent);
