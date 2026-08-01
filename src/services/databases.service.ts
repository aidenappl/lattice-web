import {
    ContainerLog,
    ContainerMetrics,
    DatabaseConnection,
    DatabaseConsoleSession,
    DatabaseCredentials,
    DatabaseInstance,
    DatabaseInstanceEvent,
    DatabaseSnapshot,
    LifecycleLog,
    PortAvailability,
    SinglePortAvailability,
} from "@/types";
import { fetchApi } from "./api.service";

export const reqGetDatabaseInstances = (params?: { worker_id?: number; engine?: string; status?: string }) =>
    fetchApi<DatabaseInstance[]>({
        method: "GET",
        url: "/admin/database-instances",
        params,
    });

export const reqGetDatabaseInstance = (id: number) =>
    fetchApi<DatabaseInstance>({
        method: "GET",
        url: `/admin/database-instances/${id}`,
    });

export const reqCreateDatabaseInstance = (data: {
    name: string;
    engine: string;
    engine_version?: string;
    worker_id: number;
    port?: number;
    root_password?: string;
    database_name: string;
    username: string;
    password?: string;
    cpu_limit?: number;
    memory_limit?: number;
    snapshot_schedule?: string;
    retention_count?: number;
    backup_destination_id?: number;
}) =>
    fetchApi<DatabaseInstance>({
        method: "POST",
        url: "/admin/database-instances",
        data,
    });

export const reqUpdateDatabaseInstance = (
    id: number,
    data: Partial<{
        name: string;
        port: number | null;
        cpu_limit: number | null;
        memory_limit: number | null;
        snapshot_schedule: string | null;
        retention_count: number | null;
        backup_destination_id: number | null;
        deletion_protection: boolean;
    }>,
) =>
    fetchApi<DatabaseInstance>({
        method: "PUT",
        url: `/admin/database-instances/${id}`,
        data,
    });

/**
 * Destroy a database for good: the container *and* its data volume are removed
 * on the worker, and the record is retired once the worker confirms. Async —
 * the instance sits in `deleting` until then, and a failure leaves it visible in
 * `error` rather than silently orphaning a full volume.
 *
 * Snapshots are never touched; they are the only recovery path afterwards.
 *
 * `force` is for a worker that is gone for good: it retires the record and
 * abandons the container and volume on disk. Without it, deleting a database on
 * a disconnected worker returns 409 rather than leaking resources.
 */
export const reqDeleteDatabaseInstance = (
    id: number,
    opts: { force?: boolean; finalSnapshot?: boolean } = {},
) => {
    const params = new URLSearchParams();
    if (opts.force) params.set("force", "true");
    // A final snapshot defers the teardown: the API takes the backup first and
    // destroys the volume only once it completes, so this call returns with the
    // database still present.
    if (opts.finalSnapshot) params.set("final_snapshot", "true");
    const qs = params.toString();
    return fetchApi<void>({
        method: "DELETE",
        url: `/admin/database-instances/${id}${qs ? `?${qs}` : ""}`,
    });
};

/**
 * Lifecycle actions on the container only. `remove` destroys the container but
 * preserves the data volume, so the database can be started again — it is not
 * a delete. See reqDeleteDatabaseInstance for that.
 */
export const reqDatabaseAction = (id: number, action: "start" | "stop" | "restart" | "remove") =>
    fetchApi<void>({
        method: "POST",
        url: `/admin/database-instances/${id}/${action}`,
    });

/**
 * Connection details with no secrets in them — safe to load whenever the
 * detail page renders.
 */
export const reqGetDatabaseConnection = (id: number) =>
    fetchApi<DatabaseConnection>({
        method: "GET",
        url: `/admin/database-instances/${id}/connection`,
    });

/**
 * Reveal live credentials. Deliberately a POST: every reveal is audited and
 * recorded against the instance, so credentials only leave the control plane
 * when somebody explicitly asks. Root is included only on request.
 */
export const reqRevealDatabaseCredentials = (id: number, includeRoot = false) =>
    fetchApi<DatabaseCredentials>({
        method: "POST",
        url: `/admin/database-instances/${id}/reveal`,
        data: { include_root: includeRoot },
    });

/**
 * @deprecated Returns root credentials from a plain GET. Use
 * {@link reqRevealDatabaseCredentials} instead.
 */
export const reqGetDatabaseCredentials = (id: number) =>
    fetchApi<DatabaseCredentials>({
        method: "GET",
        url: `/admin/database-instances/${id}/credentials`,
    });

/** Lifecycle history — how the instance reached its current state. */
export const reqGetDatabaseEvents = (id: number, params?: { kind?: string; limit?: number }) =>
    fetchApi<DatabaseInstanceEvent[]>({
        method: "GET",
        url: `/admin/database-instances/${id}/events`,
        params,
    });

/** Container stdout/stderr for a database instance. */
export const reqGetDatabaseLogs = (id: number, params?: { stream?: string; limit?: number }) =>
    fetchApi<ContainerLog[]>({
        method: "GET",
        url: `/admin/database-instances/${id}/logs`,
        params,
    });

/** Worker-emitted lifecycle logs, including provisioning progress and failures. */
export const reqGetDatabaseLifecycleLogs = (id: number, params?: { limit?: number }) =>
    fetchApi<LifecycleLog[]>({
        method: "GET",
        url: `/admin/database-instances/${id}/lifecycle`,
        params,
    });

/**
 * CPU/memory samples for a database instance, newest first.
 *
 * Addressed by instance rather than by container id: managed databases have no
 * row in the containers table, so the generic container-metrics endpoint cannot
 * reach these samples even though they have been stored all along.
 */
export const reqGetDatabaseMetrics = (id: number, params?: { limit?: number; since?: string }) =>
    fetchApi<ContainerMetrics[]>({
        method: "GET",
        url: `/admin/database-instances/${id}/metrics`,
        params,
    });

/** Authorise an interactive console session against a running instance. */
export const reqOpenDatabaseConsole = (id: number) =>
    fetchApi<DatabaseConsoleSession>({
        method: "POST",
        url: `/admin/database-instances/${id}/console`,
    });

/** Every host port already claimed on a worker, plus a free suggestion. */
export const reqGetWorkerPortAvailability = (workerId: number) =>
    fetchApi<PortAvailability>({
        method: "GET",
        url: `/admin/workers/${workerId}/port-availability`,
    });

/** Whether one specific host port is free on a worker. */
export const reqCheckWorkerPort = (workerId: number, port: number) =>
    fetchApi<SinglePortAvailability>({
        method: "GET",
        url: `/admin/workers/${workerId}/port-availability`,
        params: { port },
    });

export const reqGetDatabaseSnapshots = (id: number) =>
    fetchApi<DatabaseSnapshot[]>({
        method: "GET",
        url: `/admin/database-instances/${id}/snapshots`,
    });

export const reqCreateDatabaseSnapshot = (id: number) =>
    fetchApi<DatabaseSnapshot>({
        method: "POST",
        url: `/admin/database-instances/${id}/snapshots`,
    });

export const reqRestoreDatabaseSnapshot = (instanceId: number, snapshotId: number) =>
    fetchApi<void>({
        method: "POST",
        url: `/admin/database-instances/${instanceId}/restore`,
        data: { snapshot_id: snapshotId },
    });

export const reqDeleteDatabaseSnapshot = (id: number) =>
    fetchApi<void>({
        method: "DELETE",
        url: `/admin/database-snapshots/${id}`,
    });
