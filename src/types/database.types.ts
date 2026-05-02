export type DatabaseEngine = "mysql" | "mariadb" | "postgres";

export type DatabaseInstance = {
    id: number;
    name: string;
    engine: DatabaseEngine;
    engine_version: string;
    worker_id: number;
    status: "pending" | "running" | "stopped" | "error";
    port: number;
    database_name: string;
    username: string;
    cpu_limit: number | null;
    memory_limit: number | null;
    health_status: "healthy" | "unhealthy" | "starting" | "none";
    snapshot_schedule: string | null;
    retention_count: number | null;
    backup_destination_id: number | null;
    container_name: string;
    volume_name: string;
    active: boolean;
    started_at: string | null;
    updated_at: string;
    inserted_at: string;
};

export type DatabaseCredentials = {
    root_password: string;
    username: string;
    password: string;
    connection_string: string;
    host: string;
    port: number;
};

export type BackupDestinationType = "s3" | "google_drive" | "samba";

export type BackupDestination = {
    id: number;
    name: string;
    type: BackupDestinationType;
    active: boolean;
    updated_at: string;
    inserted_at: string;
};

export type DatabaseSnapshot = {
    id: number;
    database_instance_id: number;
    backup_destination_id: number | null;
    filename: string;
    size_bytes: number | null;
    engine: DatabaseEngine;
    database_name: string;
    status: "pending" | "uploading" | "completed" | "failed";
    trigger_type: "manual" | "scheduled";
    error_message: string | null;
    completed_at: string | null;
    active: boolean;
    updated_at: string;
    inserted_at: string;
};
