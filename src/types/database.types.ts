export type DatabaseEngine = "mysql" | "mariadb" | "postgres";

/**
 * Lifecycle state of a managed database instance. Mirrors the Go
 * `structs.DatabaseStatus` enum — keep the two in step.
 *
 * `provisioning` means a worker has accepted the create and is pulling the
 * image; `degraded` means the container exists but is impaired (usually a
 * restart loop) and is non-terminal.
 */
export type DatabaseStatus =
    | "pending"
    | "provisioning"
    | "running"
    | "stopped"
    | "restarting"
    | "degraded"
    | "deleting"
    | "error";

export type DatabaseHealth = "healthy" | "unhealthy" | "starting" | "none";

/** Structured failure detail attached to an instance in `error`/`degraded`. */
export type DatabaseError = {
    code: string;
    message: string;
    occurred_at: string;
    retryable: boolean;
};

export type DatabaseInstance = {
    id: number;
    name: string;
    engine: DatabaseEngine;
    engine_version: string;
    worker_id: number;
    status: DatabaseStatus;
    port: number;
    database_name: string;
    username: string;
    cpu_limit: number | null;
    memory_limit: number | null;
    health_status: DatabaseHealth;
    last_error: DatabaseError | null;
    snapshot_schedule: string | null;
    retention_count: number | null;
    backup_destination_id: number | null;
    container_name: string;
    volume_name: string;
    /** Refuses DELETE while set — deleting destroys the data volume. */
    deletion_protection: boolean;
    /** A delete is waiting on a final snapshot before the volume is destroyed. */
    pending_final_snapshot: boolean;
    /** Data volume size as last observed by the worker; null until reported. */
    volume_size_bytes: number | null;
    volume_size_checked_at: string | null;
    active: boolean;
    started_at: string | null;
    updated_at: string;
    inserted_at: string;
};

/** One entry in an instance's append-only lifecycle history. */
export type DatabaseInstanceEvent = {
    id: number;
    database_instance_id: number;
    kind:
        | "requested"
        | "accepted"
        | "transition"
        | "health"
        | "failed"
        | "reconciled"
        | "console_open"
        | "reveal";
    status: string | null;
    message: string;
    code: string | null;
    actor: string | null;
    recorded_at: string;
};

/** Connection details that contain no secrets — safe to load on page view. */
export type DatabaseConnection = {
    host: string;
    port: number;
    database_name: string;
    username: string;
    engine: DatabaseEngine;
};

/**
 * Credentials returned only from the explicit, audited reveal endpoint.
 * `root_password` is present only when it was explicitly requested.
 */
export type DatabaseCredentials = {
    root_password?: string;
    username: string;
    password: string;
    connection_string: string;
    host: string;
    port: number;
    database_name?: string;
};

/** What currently holds a host port on a worker. */
export type PortConflict = {
    kind: "database" | "container";
    id: number;
    name: string;
    port: number;
};

export type PortAvailability = {
    worker_id: number;
    claimed: PortConflict[];
    suggested_port: number | null;
    range_min: number;
    range_max: number;
};

export type SinglePortAvailability = {
    port: number;
    available: boolean;
    conflict?: PortConflict;
};

/** Everything the browser terminal needs to open a console session. */
export type DatabaseConsoleSession = {
    worker_id: number;
    container_name: string;
    cmd: string[];
    engine: DatabaseEngine;
    database_name: string;
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
