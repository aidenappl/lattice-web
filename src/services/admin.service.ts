import { User, VersionInfo } from "@/types";
import { fetchApi } from "./api.service";

export type OverviewData = {
    total_workers: number;
    online_workers: number;
    total_stacks: number;
    active_stacks: number;
    recent_deployment_count: number;
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
