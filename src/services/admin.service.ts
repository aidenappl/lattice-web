import type { User, VersionInfo, OverviewData, FleetMetricsPoint, AuditLogEntry } from "@/types";
import { fetchApi } from "./api.service";

export const reqGetOverview = () =>
    fetchApi<OverviewData>({
        method: "GET",
        url: "/admin/overview",
    });

export const reqGetFleetMetrics = (range?: string) =>
    fetchApi<FleetMetricsPoint[]>({
        method: "GET",
        url: `/admin/fleet-metrics${range ? `?range=${range}` : ""}`,
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
