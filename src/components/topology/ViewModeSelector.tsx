"use client";

import { cn } from "@/lib/utils";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faSitemap,
  faServer,
  faLayerGroup,
  faCubes,
} from "@fortawesome/free-solid-svg-icons";
import type { ViewMode } from "./types";

interface ViewModeSelectorProps {
  value: ViewMode;
  onChange: (mode: ViewMode) => void;
}

const modes: { value: ViewMode; label: string; icon: typeof faSitemap }[] = [
  { value: "system", label: "System", icon: faSitemap },
  { value: "worker", label: "Workers", icon: faServer },
  { value: "stack", label: "Stacks", icon: faLayerGroup },
  { value: "container", label: "Containers", icon: faCubes },
];

export function ViewModeSelector({ value, onChange }: ViewModeSelectorProps) {
  return (
    <div className="flex items-center gap-1 rounded-lg border border-border-strong bg-surface-alt p-1">
      {modes.map((mode) => (
        <button
          key={mode.value}
          onClick={() => onChange(mode.value)}
          className={cn(
            "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer",
            value === mode.value
              ? "bg-surface-active text-primary shadow-sm"
              : "text-muted hover:text-secondary",
          )}
        >
          <FontAwesomeIcon icon={mode.icon} className="h-3 w-3" />
          {mode.label}
        </button>
      ))}
    </div>
  );
}
