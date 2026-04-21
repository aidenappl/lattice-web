import { useState, useCallback, useRef, useEffect } from "react";
import type { ContainerLog } from "@/types";
import {
    reqGetContainerLogs,
    reqGetLifecycleLogs,
} from "@/services/stacks.service";
import {
    LogLimit,
    sortLogs,
    downloadLogsAsTxt,
    isNewSession,
    isSynthetic,
    syntheticId,
    lifecycleToContainerLog,
} from "@/components/ui/log-viewer";
import type { AdminSocketEvent } from "@/hooks/useAdminSocket";

export interface ContainerLogsState {
    logs: ContainerLog[];
    logsLoading: boolean;
    logLimit: LogLimit;
    setLogLimit: (limit: LogLimit) => void;
    streamFilter: string;
    setStreamFilter: (filter: string) => void;
    loadLogs: (containerId: number, stream?: string, limit?: number) => Promise<void>;
    handleDownloadVisible: (containerName: string) => void;
    handleDownloadLastRun: (containerName: string) => void;
    handleDownloadAll: (containerId: number, containerName: string) => Promise<void>;
    handleLogSocketEvent: (event: AdminSocketEvent, containerName: string) => void;
    logLimitRef: React.RefObject<LogLimit>;
}

/**
 * Manages container log state, including fetching, filtering, streaming via
 * WebSocket, and downloading. Extracted from the duplicate patterns in
 * stacks/[id]/page.tsx and containers/[id]/page.tsx.
 */
export function useContainerLogs(): ContainerLogsState {
    const [logs, setLogs] = useState<ContainerLog[]>([]);
    const [logsLoading, setLogsLoading] = useState(false);
    const [streamFilter, setStreamFilter] = useState("all");
    const [logLimit, setLogLimit] = useState<LogLimit>(250);
    const logLimitRef = useRef<LogLimit>(250);

    useEffect(() => {
        logLimitRef.current = logLimit;
    }, [logLimit]);

    const loadLogs = useCallback(
        async (containerId: number, stream?: string, limit?: number) => {
            setLogsLoading(true);
            const params: { limit: number; stream?: string } = {
                limit: limit ?? logLimitRef.current,
            };
            if (stream && stream !== "all") params.stream = stream;
            const [logRes, lcRes] = await Promise.all([
                reqGetContainerLogs(containerId, params),
                reqGetLifecycleLogs(containerId, { limit: params.limit }),
            ]);
            const dbLogs = logRes.success ? (logRes.data ?? []) : [];
            const lcLogs = lcRes.success
                ? (lcRes.data ?? []).map(lifecycleToContainerLog)
                : [];
            if (logRes.success || lcRes.success) {
                const seen = new Set<string>();
                const unique = [...dbLogs, ...lcLogs].filter((l) => {
                    const key = `${l.recorded_at}|${l.message}`;
                    if (seen.has(key)) return false;
                    seen.add(key);
                    return true;
                });
                setLogs(sortLogs(unique));
            }
            setLogsLoading(false);
        },
        [],
    );

    const handleDownloadVisible = useCallback(
        (containerName: string) => {
            downloadLogsAsTxt(logs, `${containerName}-logs-visible.txt`);
        },
        [logs],
    );

    const handleDownloadLastRun = useCallback(
        (containerName: string) => {
            let startIdx = 0;
            for (let i = logs.length - 1; i > 0; i--) {
                if (isNewSession(logs[i - 1], logs[i])) {
                    startIdx = i;
                    break;
                }
            }
            downloadLogsAsTxt(logs.slice(startIdx), `${containerName}-logs-last-run.txt`);
        },
        [logs],
    );

    const handleDownloadAll = useCallback(
        async (containerId: number, containerName: string) => {
            const [logRes, lcRes] = await Promise.all([
                reqGetContainerLogs(containerId, { limit: 9999 }),
                reqGetLifecycleLogs(containerId, { limit: 9999 }),
            ]);
            if (logRes.success) {
                const dbLogs = (logRes.data ?? []).slice();
                const lcLogs = lcRes.success
                    ? (lcRes.data ?? []).map(lifecycleToContainerLog)
                    : [];
                const all = sortLogs([...dbLogs, ...lcLogs]);
                downloadLogsAsTxt(all, `${containerName}-logs-all.txt`);
            }
        },
        [],
    );

    const handleLogSocketEvent = useCallback(
        (event: AdminSocketEvent, containerName: string) => {
            const payload = event.payload ?? {};

            // Live stdout/stderr log lines
            if (event.type === "container_logs") {
                const message = payload["message"] as string | undefined;
                const rawStream = (payload["stream"] as string | undefined) ?? "stdout";
                const stream: "stdout" | "stderr" =
                    rawStream === "stderr" ? "stderr" : "stdout";
                if (message) {
                    const entry: ContainerLog = {
                        id: syntheticId() as unknown as number,
                        container_id: null,
                        container_name: containerName,
                        worker_id: event.worker_id ?? 0,
                        stream,
                        message,
                        recorded_at: new Date().toISOString(),
                    };
                    const limit = logLimitRef.current;
                    setLogs((prev) => {
                        const now = Date.now();
                        const dominated = prev.some(
                            (l) =>
                                !isSynthetic(l) &&
                                l.message === message &&
                                Math.abs(now - new Date(l.recorded_at).getTime()) < 2_000,
                        );
                        if (dominated) return prev;
                        return sortLogs([...prev.slice(-(limit - 1)), entry]);
                    });
                }
            }

            // Live lifecycle_log entries
            if (event.type === "lifecycle_log") {
                const message = (payload["message"] as string) ?? "";
                if (message) {
                    const entry: ContainerLog = {
                        id: `lc_${syntheticId()}` as unknown as number,
                        container_id: null,
                        container_name: containerName,
                        worker_id: event.worker_id ?? 0,
                        stream: "lifecycle" as "stdout",
                        message,
                        recorded_at: new Date().toISOString(),
                    };
                    const limit = logLimitRef.current;
                    setLogs((prev) => sortLogs([...prev.slice(-(limit - 1)), entry]));
                }
            }
        },
        [],
    );

    return {
        logs,
        logsLoading,
        logLimit,
        setLogLimit,
        streamFilter,
        setStreamFilter,
        loadLogs,
        handleDownloadVisible,
        handleDownloadLastRun,
        handleDownloadAll,
        handleLogSocketEvent,
        logLimitRef,
    };
}
