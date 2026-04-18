export type Worker = {
    id: number;
    name: string;
    hostname: string;
    ip_address: string | null;
    status: "online" | "offline" | "maintenance";
    os: string | null;
    arch: string | null;
    docker_version: string | null;
    runner_version: string | null;
    last_heartbeat_at: string | null;
    labels: string | null;
    active: boolean;
    inserted_at: string;
    updated_at: string;
};

export type WorkerToken = {
    id: number;
    worker_id: number;
    name: string;
    last_used_at: string | null;
    active: boolean;
    inserted_at: string;
    updated_at: string;
};

export type WorkerMetrics = {
    id: number;
    worker_id: number;
    cpu_percent: number | null;
    cpu_cores: number | null;
    load_avg_1: number | null;
    load_avg_5: number | null;
    load_avg_15: number | null;
    memory_used_mb: number | null;
    memory_total_mb: number | null;
    memory_free_mb: number | null;
    swap_used_mb: number | null;
    swap_total_mb: number | null;
    disk_used_mb: number | null;
    disk_total_mb: number | null;
    container_count: number | null;
    container_running_count: number | null;
    network_rx_bytes: number | null;
    network_tx_bytes: number | null;
    uptime_seconds: number | null;
    process_count: number | null;
    recorded_at: string;
};
