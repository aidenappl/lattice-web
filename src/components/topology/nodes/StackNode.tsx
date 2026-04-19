import { memo } from "react";
import { Handle, Position } from "@xyflow/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faLayerGroup } from "@fortawesome/free-solid-svg-icons";
import type { StackNodeData } from "../types";

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
    <div className="rounded-xl border border-border-strong bg-surface-alt px-5 py-4 min-w-[260px] cursor-pointer transition-all duration-200 hover:shadow-lg hover:border-[#a855f7]/30">
      <Handle
        type="target"
        position={Position.Top}
        className="!bg-accent !w-2.5 !h-2.5 !border-0"
      />
      <Handle
        type="source"
        position={Position.Bottom}
        className="!bg-accent !w-2.5 !h-2.5 !border-0"
      />
      <div className="flex items-center gap-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#a855f7]/10">
          <FontAwesomeIcon
            icon={faLayerGroup}
            className="h-4 w-4 text-[#a855f7]"
          />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-sm font-semibold text-primary truncate">
              {data.label}
            </p>
            <span className={`h-2 w-2 rounded-full shrink-0 ${dotClass}`} />
          </div>
          <p className="text-[11px] text-muted">
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
