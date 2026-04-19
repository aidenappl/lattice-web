import { memo } from "react";
import { Handle, Position } from "@xyflow/react";
import { Logo } from "@/components/ui/logo";
import type { SystemNodeData } from "../types";

function SystemNodeComponent({ data }: { data: SystemNodeData }) {
  return (
    <div className="rounded-xl border border-border-strong bg-surface-alt shadow-lg px-5 py-4 min-w-[200px]">
      <Handle
        type="source"
        position={Position.Bottom}
        className="!bg-accent !w-2 !h-2 !border-0"
      />
      <div className="flex items-center gap-3 mb-3">
        <Logo size="sm" />
        <div>
          <p className="text-sm font-semibold text-primary leading-tight">
            {data.label}
          </p>
          <p className="text-[10px] text-muted">Control Plane</p>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[10px]">
        <span className="text-muted">Workers</span>
        <span className="text-right font-medium text-[#22c55e]">
          {data.onlineWorkers}/{data.totalWorkers}
        </span>
        <span className="text-muted">Stacks</span>
        <span className="text-right font-medium text-secondary">
          {data.totalStacks}
        </span>
        <span className="text-muted">Containers</span>
        <span className="text-right font-medium text-secondary">
          {data.totalContainers}
        </span>
      </div>
    </div>
  );
}

export const SystemNode = memo(SystemNodeComponent);
