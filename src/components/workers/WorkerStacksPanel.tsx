"use client";

import { useState } from "react";
import Link from "next/link";
import type { Stack, Container } from "@/types";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faServer, faChevronDown, faChevronRight } from "@fortawesome/free-solid-svg-icons";
import { StatusBadge } from "@/components/ui/badge";

export interface WorkerStacksPanelProps {
  stacks: Stack[];
  containers: Container[];
  loading?: boolean;
}

export default function WorkerStacksPanel({ stacks, containers, loading }: WorkerStacksPanelProps) {
  const [expandedStacks, setExpandedStacks] = useState<Set<number>>(new Set());

  return (
    <div className="panel">
      <div className="panel-header">
        <FontAwesomeIcon
          icon={faServer}
          className="h-3.5 w-3.5 text-muted"
        />
        <span>Stacks &amp; Containers</span>
        <span className="badge badge-neutral ml-2">{stacks.length}</span>
      </div>
      <div className="p-4 space-y-1">
        {loading ? (
          <div className="flex items-center justify-center py-8 gap-2 text-sm text-muted">
            <span className="h-4 w-4 border-2 border-muted/30 border-t-muted rounded-full animate-spin" />
            Loading stacks...
          </div>
        ) : stacks.length === 0 ? (
          <p className="text-xs text-muted py-6 text-center">
            No stacks assigned to this worker
          </p>
        ) : (
          stacks.map((stack) => {
            const stackContainers = containers.filter(
              (c) => c.stack_id === stack.id,
            );
            const isExpanded = expandedStacks.has(stack.id);
            return (
              <div key={stack.id}>
                <button
                  onClick={() =>
                    setExpandedStacks((prev) => {
                      const next = new Set(prev);
                      if (next.has(stack.id)) next.delete(stack.id);
                      else next.add(stack.id);
                      return next;
                    })
                  }
                  className="w-full flex items-center justify-between rounded-lg px-3 py-2.5 hover:bg-surface-elevated transition-colors text-left cursor-pointer"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <FontAwesomeIcon
                      icon={faChevronDown}
                      className={`h-2.5 w-2.5 text-dimmed transition-transform ${isExpanded ? "" : "-rotate-90"}`}
                    />
                    <StatusBadge status={stack.status} />
                    <span className="text-sm text-primary font-medium truncate">
                      {stack.name}
                    </span>
                    <span className="badge badge-neutral text-[10px]">
                      {stackContainers.length}
                    </span>
                  </div>
                  <span className="text-[10px] text-dimmed">
                    {stack.deployment_strategy}
                  </span>
                </button>
                {isExpanded && (
                  <div className="ml-7 mt-0.5 mb-2 space-y-0.5 border-l border-border pl-3">
                    {stackContainers.length === 0 ? (
                      <p className="text-xs text-dimmed py-1">
                        No containers
                      </p>
                    ) : (
                      stackContainers.map((c) => (
                        <Link
                          key={c.id}
                          href={`/containers/${c.id}`}
                          className="flex items-center justify-between rounded px-2 py-1.5 hover:bg-surface-elevated transition-colors group"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <StatusBadge status={c.status} />
                            <span className="text-xs text-primary truncate group-hover:text-info transition-colors">
                              {c.name}
                            </span>
                            <span className="text-[10px] text-dimmed font-mono truncate">
                              {c.image}:{c.tag}
                            </span>
                          </div>
                          <FontAwesomeIcon
                            icon={faChevronRight}
                            className="h-2.5 w-2.5 text-dimmed opacity-0 group-hover:opacity-100 transition-opacity"
                          />
                        </Link>
                      ))
                    )}
                    <Link
                      href={`/stacks/${stack.id}`}
                      className="block text-xs text-info hover:underline px-2 py-1 mt-1"
                    >
                      View stack details
                    </Link>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
