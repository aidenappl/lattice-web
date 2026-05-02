import { DatabaseInstance, DatabaseCredentials, DatabaseSnapshot } from "@/types";
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
        port: number;
        cpu_limit: number | null;
        memory_limit: number | null;
        snapshot_schedule: string | null;
        retention_count: number | null;
        backup_destination_id: number | null;
    }>,
) =>
    fetchApi<DatabaseInstance>({
        method: "PUT",
        url: `/admin/database-instances/${id}`,
        data,
    });

export const reqDeleteDatabaseInstance = (id: number) =>
    fetchApi<void>({
        method: "DELETE",
        url: `/admin/database-instances/${id}`,
    });

export const reqDatabaseAction = (id: number, action: "start" | "stop" | "restart" | "remove") =>
    fetchApi<void>({
        method: "POST",
        url: `/admin/database-instances/${id}/${action}`,
    });

export const reqGetDatabaseCredentials = (id: number) =>
    fetchApi<DatabaseCredentials>({
        method: "GET",
        url: `/admin/database-instances/${id}/credentials`,
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
