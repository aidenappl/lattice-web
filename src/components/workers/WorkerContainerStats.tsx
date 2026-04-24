"use client";

import { useState } from "react";
import type { ContainerResourceUsage } from "@/types";

export function WorkerContainerStats({
  stats,
  onForceRemove,
  workerOnline,
}: {
  stats: ContainerResourceUsage[];
  onForceRemove?: (containerName: string) => Promise<void>;
  workerOnline?: boolean;
}) {
  const [removing, setRemoving] = useState<string | null>(null);

  const handleRemove = async (name: string) => {
    if (!onForceRemove) return;
    setRemoving(name);
    try {
      await onForceRemove(name);
    } finally {
      setRemoving(null);
    }
  };

  const hasData = stats && stats.length > 0;

  return (
    <div className="panel">
      <div className="panel-header">
        <span>Container Resources</span>
        {hasData && (
          <span className="badge badge-neutral ml-2">{stats.length}</span>
        )}
      </div>
      {!hasData ? (
        <div className="flex items-center justify-center py-10 gap-2 text-sm text-muted">
          {workerOnline ? (
            <>
              <span className="h-4 w-4 border-2 border-muted/30 border-t-muted rounded-full animate-spin" />
              Waiting for container stats...
            </>
          ) : (
            "Worker is offline"
          )}
        </div>
      ) : (
        <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border-subtle">
              <th className="px-3 sm:px-4 py-2 text-left text-xs font-medium text-muted uppercase">
                Container
              </th>
              <th className="px-3 sm:px-4 py-2 text-left text-xs font-medium text-muted uppercase">
                CPU %
              </th>
              <th className="px-3 sm:px-4 py-2 text-left text-xs font-medium text-muted uppercase hidden sm:table-cell">
                Memory
              </th>
              <th className="px-3 sm:px-4 py-2 text-left text-xs font-medium text-muted uppercase">
                Mem %
              </th>
              {onForceRemove && (
                <th className="px-4 py-2 text-right text-xs font-medium text-muted uppercase w-20">
                </th>
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-border-subtle">
            {stats.map((s) => (
              <tr key={s.id || s.name} className="group">
                <td className="px-3 sm:px-4 py-2 text-sm font-mono text-primary truncate max-w-[120px] sm:max-w-[200px]">
                  {s.name}
                </td>
                <td className="px-3 sm:px-4 py-2 text-sm font-mono whitespace-nowrap">
                  {s.cpu_percent?.toFixed(1) ?? "\u2014"}%
                </td>
                <td className="px-3 sm:px-4 py-2 text-sm font-mono whitespace-nowrap hidden sm:table-cell">
                  {s.mem_usage_mb?.toFixed(0) ?? "\u2014"} /{" "}
                  {s.mem_limit_mb?.toFixed(0) ?? "\u2014"} MB
                </td>
                <td className="px-3 sm:px-4 py-2 text-sm font-mono whitespace-nowrap">
                  {s.mem_percent?.toFixed(1) ?? "\u2014"}%
                </td>
                {onForceRemove && (
                  <td className="px-4 py-2 text-right">
                    <button
                      onClick={() => handleRemove(s.name)}
                      disabled={removing === s.name}
                      className="opacity-0 group-hover:opacity-100 transition-opacity text-xs px-2 py-1 rounded bg-destructive/10 text-destructive hover:bg-destructive/20 disabled:opacity-50"
                    >
                      {removing === s.name ? "Removing..." : "Kill"}
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      )}
    </div>
  );
}
