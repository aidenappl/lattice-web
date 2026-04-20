import { User, VersionInfo, Deployment } from "@/types";
import { fetchApi } from "./api.service";

export type WorkerMetricsSummary = {
    worker_id: number;
    worker_name: string;
    cpu: number | null;
    memory: number | null;
    disk_used: number | null;
    disk_total: number | null;
    net_rx: number | null;
    net_tx: number | null;
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

export const reqGetOverview = () =>
    fetchApi<OverviewData>({
        method: "GET",
        url: "/admin/overview",
    });

export const reqGetAuditLog = () =>
    fetchApi<AuditLogEntry[]>({
        method: "GET",
        url: "/admin/audit-log",
    });

export const reqGetUsers = () =>
    fetchApi<User[]>({
        method: "GET",
        url: "/admin/users",
    });

export const reqCreateUser = (data: { email: string; name?: string; password: string; role?: string }) =>
    fetchApi<User>({
        method: "POST",
        url: "/admin/users",
        data,
    });

export const reqUpdateUser = (id: number, data: Partial<{ name: string; role: string; active: boolean }>) =>
    fetchApi<User>({
        method: "PUT",
        url: `/admin/users/${id}`,
        data,
    });

export const reqDeleteUser = (id: number) =>
    fetchApi<null>({
        method: "DELETE",
        url: `/admin/users/${id}`,
    });

export const reqGetVersions = () =>
    fetchApi<VersionInfo>({
        method: "GET",
        url: "/admin/versions",
    });

export const reqRefreshVersions = () =>
    fetchApi<{ api: string; web: string; runner: string; last_checked: string }>({
        method: "POST",
        url: "/admin/versions/refresh",
    });

export const reqUpdateAPI = () =>
    fetchApi<{ service: string; pull: string; up: string }>({
        method: "POST",
        url: "/admin/update/api",
        timeout: 120000,
    });

export const reqUpdateWeb = () =>
    fetchApi<{ service: string; pull: string; up: string }>({
        method: "POST",
        url: "/admin/update/web",
        timeout: 120000,
    });
