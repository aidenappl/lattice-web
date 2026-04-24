import type { Deployment } from "./deployment.types";

export type WorkerMetricsSummary = {
    worker_id: number;
    worker_name: string;
    cpu: number | null;
    memory: number | null;
    disk_used: number | null;
    disk_total: number | null;
    net_rx_rate: number | null;
    net_tx_rate: number | null;
    containers: number | null;
    running: number | null;
    status: string;
};

export type OverviewData = {
    total_workers: number;
    online_workers: number;
    total_stacks: number;
    active_stacks: number;
    deploying_stacks: number;
    failed_stacks: number;
    total_containers: number;
    running_containers: number;
    recent_deployments: Deployment[] | null;
    recent_deployment_count: number;
    fleet_cpu_avg: number;
    fleet_memory_avg: number;
    fleet_container_count: number;
    fleet_running_count: number;
    worker_metrics: WorkerMetricsSummary[] | null;
};

export type AuditLogEntry = {
    id: number;
    user_id: number | null;
    action: string;
    resource_type: string;
    resource_id: number | null;
    details: string | null;
    ip_address: string | null;
    inserted_at: string;
};

export type FleetMetricsPoint = {
    timestamp: string;
    cpu_avg: number;
    memory_avg: number;
    network_rx_rate: number;
    network_tx_rate: number;
    container_count: number;
    running_count: number;
    online_workers: number;
};

export type HealthAnomaly = {
    id: string;
    type: "orphaned_container" | "missing_container" | "status_mismatch" | "unmanaged_container" | "stale_state";
    worker_id: number;
    worker_name: string;
    container_name?: string;
    message: string;
    detected_at: string;
    details?: Record<string, unknown>;
};

export type GlobalEnvVar = {
    id: number;
    key: string;
    value: string;
    is_secret: boolean;
    updated_at: string;
    inserted_at: string;
};
