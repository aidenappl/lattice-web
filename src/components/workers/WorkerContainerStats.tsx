"use client";

import { useState } from "react";
import type { ContainerResourceUsage } from "@/types";

export function WorkerContainerStats({
  stats,
  onForceRemove,
}: {
  stats: ContainerResourceUsage[];
  onForceRemove?: (containerName: string) => Promise<void>;
}) {
  const [removing, setRemoving] = useState<string | null>(null);

  if (!stats || stats.length === 0) return null;

  const handleRemove = async (name: string) => {
    if (!onForceRemove) return;
    setRemoving(name);
    try {
      await onForceRemove(name);
    } finally {
      setRemoving(null);
    }
  };

  return (
    <div className="panel">
      <div className="panel-header">
        <span>Container Resources</span>
      </div>
      <table className="w-full">
        <thead>
          <tr className="border-b border-border-subtle">
            <th className="px-4 py-2 text-left text-xs font-medium text-muted uppercase">
              Container
            </th>
            <th className="px-4 py-2 text-left text-xs font-medium text-muted uppercase">
              CPU %
            </th>
            <th className="px-4 py-2 text-left text-xs font-medium text-muted uppercase">
              Memory
            </th>
            <th className="px-4 py-2 text-left text-xs font-medium text-muted uppercase">
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
              <td className="px-4 py-2 text-sm font-mono text-primary">
                {s.name}
              </td>
              <td className="px-4 py-2 text-sm font-mono">
                {s.cpu_percent?.toFixed(1) ?? "\u2014"}%
              </td>
              <td className="px-4 py-2 text-sm font-mono">
                {s.mem_usage_mb?.toFixed(0) ?? "\u2014"} /{" "}
                {s.mem_limit_mb?.toFixed(0) ?? "\u2014"} MB
              </td>
              <td className="px-4 py-2 text-sm font-mono">
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
  );
}
