"use client";

export function WorkerContainerStats({ stats }: { stats: any[] }) {
  if (!stats || stats.length === 0) return null;
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
          </tr>
        </thead>
        <tbody className="divide-y divide-border-subtle">
          {stats.map((s: any) => (
            <tr key={s.id || s.name}>
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
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
