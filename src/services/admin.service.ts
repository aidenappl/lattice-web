import { User } from "@/types";
import { fetchApi } from "./api.service";

export type OverviewData = {
    workers_online: number;
    workers_total: number;
    containers_running: number;
    stacks_active: number;
    recent_deployments: number;
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
