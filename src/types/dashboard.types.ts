export type WorkerLatestMetrics = {
    cpu: number;
    memoryPct: number;
    netRxRate: number;
    netTxRate: number;
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

/** Per-container resource usage reported by the runner in heartbeat payloads. */
export type ContainerResourceUsage = {
    id?: string;
    name: string;
    cpu_percent: number | null;
    mem_usage_mb: number | null;
    mem_limit_mb: number | null;
    mem_percent: number | null;
};

/** Per-container metrics stored in the DB (from container_metrics table). */
export type ContainerMetrics = {
    id: number;
    worker_id: number;
    container_id: number | null;
    container_name: string;
    cpu_percent: number | null;
    mem_usage_mb: number | null;
    mem_limit_mb: number | null;
    mem_percent: number | null;
    recorded_at: string;
};

/** Payload shape returned by GET /admin/stacks/{id}/export */
export type StackExportPayload = {
    stack: {
        name: string;
        description: string | null;
        deployment_strategy: string;
        auto_deploy: boolean;
        env_vars: string | null;
        compose_yaml: string | null;
        placement_constraints: string | null;
    };
    containers: Array<{
        name: string;
        image: string;
        tag: string;
        port_mappings: string | null;
        env_vars: string | null;
        volumes: string | null;
        cpu_limit: number | null;
        memory_limit: number | null;
        replicas: number;
        restart_policy: string | null;
        command: string | null;
        entrypoint: string | null;
        health_check: string | null;
        depends_on: string | null;
        registry_id: number | null;
    }>;
    networks: Array<{
        name: string;
        driver: string;
        subnet: string | null;
        options: string | null;
    }>;
};

/** Payload shape accepted by POST /admin/stacks/import-export */
export type StackImportPayload = StackExportPayload;
