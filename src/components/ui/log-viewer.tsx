"use client";

import { useRef } from "react";
import { useEffect } from "react";
import { ContainerLog, LifecycleLog } from "@/types";

// ─── Synthetic log helpers ────────────────────────────────────────────────────

export const SYNTHETIC_ID_PREFIX = "syn_";

export function isSynthetic(log: ContainerLog): boolean {
  return (
    typeof log.id === "string" && String(log.id).startsWith(SYNTHETIC_ID_PREFIX)
  );
}

export function syntheticId(): string {
  return SYNTHETIC_ID_PREFIX + crypto.randomUUID();
}

// ─── Log limit ────────────────────────────────────────────────────────────────

export const LOG_LIMIT_OPTIONS = [100, 250, 500, 1000] as const;
export type LogLimit = (typeof LOG_LIMIT_OPTIONS)[number];

// ─── Sort / download helpers ──────────────────────────────────────────────────

export function sortLogs(arr: ContainerLog[]): ContainerLog[] {
  return arr.sort(
    (a, b) =>
      new Date(a.recorded_at).getTime() - new Date(b.recorded_at).getTime(),
  );
}

export function downloadLogsAsTxt(lines: ContainerLog[], filename: string) {
  const text = lines
    .map(
      (l) =>
        `${new Date(l.recorded_at).toISOString()}  [${l.stream.padEnd(6)}]  ${l.message}`,
    )
    .join("\n");
  const blob = new Blob([text], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── Lifecycle log helpers ─────────────────────────────────────────────────────

export function lifecycleToContainerLog(l: LifecycleLog): ContainerLog {
  return {
    id: `lc_${l.id}` as unknown as number,
    container_id: l.container_id,
    container_name: l.container_name,
    worker_id: l.worker_id,
    stream: "lifecycle" as "stdout",
    message: l.message,
    recorded_at: l.recorded_at,
  };
}

export function isLifecycleEntry(log: ContainerLog): boolean {
  return typeof log.id === "string" && String(log.id).startsWith("lc_");
}

// ─── Session break helpers ────────────────────────────────────────────────────

export const SESSION_GAP_MS = 5_000;

export function isNewSession(prev: ContainerLog, curr: ContainerLog): boolean {
  return (
    new Date(curr.recorded_at).getTime() -
      new Date(prev.recorded_at).getTime() >
    SESSION_GAP_MS
  );
}

export function SessionBreak({ at }: { at: string }) {
  return (
    <div className="flex items-center gap-2 px-2 py-2 my-1 select-none">
      <div className="flex-1 h-px bg-border-subtle" />
      <span className="text-[10px] font-mono text-muted whitespace-nowrap">
        new session &middot;{" "}
        {new Date(at).toLocaleTimeString([], {
          hour12: false,
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        })}
      </span>
      <div className="flex-1 h-px bg-border-subtle" />
    </div>
  );
}

// ─── LogLine ──────────────────────────────────────────────────────────────────

export function LogLine({ line }: { line: ContainerLog }) {
  const lifecycle = isLifecycleEntry(line);
  return (
    <div
      className={`flex gap-2 text-xs font-mono px-2 py-0.5 rounded ${lifecycle ? "bg-blue-500/10 border border-blue-500/20" : "hover:bg-surface-elevated"}`}
    >
      <span className="text-dimmed shrink-0 select-none w-40">
        {line.recorded_at
          ? new Date(line.recorded_at).toLocaleTimeString([], {
              hour12: false,
              hour: "2-digit",
              minute: "2-digit",
              second: "2-digit",
            })
          : ""}
      </span>
      {lifecycle ? (
        <span className="text-blue-400 font-medium">⚡ {line.message}</span>
      ) : (
        <span className="text-subtle">{line.message}</span>
      )}
    </div>
  );
}

// ─── LogViewer component ──────────────────────────────────────────────────────

interface LogViewerProps {
  logs: ContainerLog[];
  logLimit: LogLimit;
  onLimitChange: (limit: LogLimit) => void;
  onDownloadVisible: () => void;
  onDownloadLastRun: () => void;
  onDownloadAll: () => void;
  loading?: boolean;
}

export function LogViewer({
  logs,
  logLimit,
  onLimitChange,
  onDownloadVisible,
  onDownloadLastRun,
  onDownloadAll,
  loading,
}: LogViewerProps) {
  const logsEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs, loading]);

  return (
    <div className="flex flex-col">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-3 px-3 py-2 border-b border-border-subtle bg-surface">
        <span className="text-xs text-muted font-mono shrink-0">
          {logs.length} line{logs.length !== 1 ? "s" : ""}
        </span>
        <div className="flex items-center gap-2">
          {/* Limit selector */}
          <select
            value={logLimit}
            onChange={(e) => onLimitChange(Number(e.target.value) as LogLimit)}
            className="text-xs bg-surface border border-border-subtle rounded px-2 py-1 text-muted cursor-pointer focus:outline-none focus:border-border-strong"
          >
            {LOG_LIMIT_OPTIONS.map((n) => (
              <option key={n} value={n}>
                {n} lines
              </option>
            ))}
          </select>
          {/* Download buttons */}
          <div className="flex items-center gap-1">
            <button
              onClick={onDownloadVisible}
              title="Download visible logs as .txt"
              className="text-xs text-muted hover:text-primary px-2 py-1 border border-border-subtle rounded hover:border-border-strong transition-colors cursor-pointer"
            >
              ↓ Visible
            </button>
            <button
              onClick={onDownloadLastRun}
              title="Download logs since last session start as .txt"
              className="text-xs text-muted hover:text-primary px-2 py-1 border border-border-subtle rounded hover:border-border-strong transition-colors cursor-pointer"
            >
              ↓ Last Run
            </button>
            <button
              onClick={onDownloadAll}
              title="Download all logs from the database as .txt"
              className="text-xs text-muted hover:text-primary px-2 py-1 border border-border-subtle rounded hover:border-border-strong transition-colors cursor-pointer"
            >
              ↓ All Time
            </button>
          </div>
        </div>
      </div>
      {/* Log pane */}
      <div className="bg-background-alt min-h-[320px] max-h-[520px] overflow-y-auto p-3">
        {logs.length === 0 ? (
          <p className="text-xs text-dimmed font-mono p-2">No logs available</p>
        ) : (
          <>
            {logs.map((line, i) => (
              <div key={String(line.id)}>
                {i > 0 && isNewSession(logs[i - 1], line) && (
                  <SessionBreak at={line.recorded_at} />
                )}
                <LogLine line={line} />
              </div>
            ))}
            <div ref={logsEndRef} />
          </>
        )}
      </div>
    </div>
  );
}
