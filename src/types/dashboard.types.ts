export type WorkerLatestMetrics = {
    cpu: number;
    memoryPct: number;
    netRx: number;
    netTx: number;
    containers: number;
    running: number;
};

export type LiveEvent = {
    id: number;
    ts: number;
    level: "info" | "ok" | "warn" | "err";
    source: string;
    msg: string;
};

export type MetricKey = "cpu" | "mem" | "net" | "req";

export interface HealthCheckConfig {
    test?: string[] | string;
    interval?: string;
    timeout?: string;
    retries?: number;
    start_period?: string;
    disable?: boolean;
}
