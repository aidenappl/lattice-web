import { memo } from "react";
import { Handle, Position } from "@xyflow/react";
import { Logo } from "@/components/ui/logo";
import type { SystemNodeData } from "../types";

function SystemNodeComponent({ data }: { data: SystemNodeData }) {
  return (
    <div className="rounded-xl border border-border-strong bg-surface-alt shadow-lg px-6 py-5 w-full h-full cursor-pointer transition-all duration-300 hover:shadow-xl hover:border-accent/30">
      <Handle
        type="source"
        position={Position.Bottom}
        className="!bg-accent !w-2.5 !h-2.5 !border-0"
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
      <div className="grid grid-cols-2 gap-x-5 gap-y-1.5 text-[11px]">
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
