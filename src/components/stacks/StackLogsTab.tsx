"use client";

import { Container, ContainerLog } from "@/types";
import { LogViewer, LogLimit } from "@/components/ui/log-viewer";

interface StackLogsTabProps {
  containers: Container[];
  selectedContainer: number | null;
  onSelectContainer: (id: number | null) => void;
  logs: ContainerLog[];
  logsLoading: boolean;
  logLimit: LogLimit;
  onLimitChange: (limit: LogLimit) => void;
  streamFilter: string;
  onStreamFilterChange: (filter: string) => void;
  onRefresh: () => void;
  onDownloadVisible: () => void;
  onDownloadLastRun: () => void;
  onDownloadAll: () => void;
}

export function StackLogsTab({
  containers,
  selectedContainer,
  onSelectContainer,
  logs,
  logsLoading,
  logLimit,
  onLimitChange,
  streamFilter,
  onStreamFilterChange,
  onRefresh,
  onDownloadVisible,
  onDownloadLastRun,
  onDownloadAll,
}: StackLogsTabProps) {
  return (
    <div className="panel">
      <div className="panel-header">
        <span>Container Logs</span>
        <div className="panel-header-right">
          <select
            value={streamFilter}
            onChange={(e) => onStreamFilterChange(e.target.value)}
            className="bg-surface-elevated border border-border-strong text-foreground px-2 py-1 rounded-md text-xs cursor-pointer"
          >
            <option value="all">All streams</option>
            <option value="stdout">stdout</option>
            <option value="stderr">stderr</option>
          </select>
          <select
            value={selectedContainer ?? ""}
            onChange={(e) =>
              onSelectContainer(
                e.target.value ? Number(e.target.value) : null,
              )
            }
            className="bg-surface-elevated border border-border-strong text-foreground px-2 py-1 rounded-md text-xs cursor-pointer"
          >
            <option value="">Select container...</option>
            {containers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          {selectedContainer && (
            <button
              onClick={onRefresh}
              className="text-xs text-info hover:text-info transition-colors cursor-pointer"
            >
              Refresh
            </button>
          )}
        </div>
      </div>
      {!selectedContainer ? (
        <div className="px-5 py-8 text-center text-sm text-muted">
          Select a container to view logs
        </div>
      ) : logsLoading ? (
        <div className="px-5 py-8 text-center text-sm text-muted">
          Loading logs...
        </div>
      ) : (
        <LogViewer
          logs={logs}
          logLimit={logLimit}
          onLimitChange={onLimitChange}
          onDownloadVisible={onDownloadVisible}
          onDownloadLastRun={onDownloadLastRun}
          onDownloadAll={onDownloadAll}
          loading={logsLoading}
        />
      )}
    </div>
  );
}
