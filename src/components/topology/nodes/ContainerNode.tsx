import { memo } from "react";
import { Handle, Position } from "@xyflow/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCube } from "@fortawesome/free-solid-svg-icons";
import type { ContainerNodeData } from "../types";

const statusDots: Record<string, string> = {
  running: "bg-[#22c55e]",
  stopped: "bg-[#888888]",
  error: "bg-[#ef4444]",
  pending: "bg-[#eab308]",
  paused: "bg-[#888888]",
};

const statusBorders: Record<string, string> = {
  running: "border-[#22c55e]/20",
  stopped: "border-border-strong",
  error: "border-[#ef4444]/20",
  pending: "border-[#eab308]/20",
  paused: "border-border-strong",
};

function ContainerNodeComponent({ data }: { data: ContainerNodeData }) {
  const dotClass = statusDots[data.status] ?? "bg-[#888888]";
  const borderClass = statusBorders[data.status] ?? "border-border-strong";

  return (
    <div
      className={`rounded-xl border bg-surface-alt px-4 py-3 min-w-[220px] ${borderClass}`}
    >
      <Handle
        type="target"
        position={Position.Top}
        className="!bg-accent !w-2 !h-2 !border-0"
      />
      <div className="flex items-center gap-2.5">
        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#3b82f6]/10">
          <FontAwesomeIcon
            icon={faCube}
            className="h-3.5 w-3.5 text-[#3b82f6]"
          />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-xs font-semibold text-primary truncate">
              {data.label}
            </p>
            <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${dotClass}`} />
          </div>
          <p className="text-[10px] text-muted truncate">
            {data.image}:{data.tag}
          </p>
        </div>
      </div>
    </div>
  );
}

export const ContainerNode = memo(ContainerNodeComponent);
