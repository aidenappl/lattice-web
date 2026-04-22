import type { User, VersionInfo, OverviewData, FleetMetricsPoint, AuditLogEntry, WebhookConfig, GlobalEnvVar, HealthAnomaly } from "@/types";
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

export const reqGetAnomalies = () =>
    fetchApi<HealthAnomaly[]>({
        method: "GET",
        url: "/admin/anomalies",
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

// Webhooks
export const reqGetWebhooks = () =>
    fetchApi<WebhookConfig[]>({
        method: "GET",
        url: "/admin/webhooks",
    });

export const reqCreateWebhook = (data: { name: string; url: string; events: string[]; secret?: string }) =>
    fetchApi<WebhookConfig>({
        method: "POST",
        url: "/admin/webhooks",
        data: { ...data, events: JSON.stringify(data.events) },
    });

export const reqUpdateWebhook = (id: number, data: Partial<{ name: string; url: string; events: string; active: boolean; secret: string }>) =>
    fetchApi<WebhookConfig>({
        method: "PUT",
        url: `/admin/webhooks/${id}`,
        data,
    });

export const reqDeleteWebhook = (id: number) =>
    fetchApi<null>({
        method: "DELETE",
        url: `/admin/webhooks/${id}`,
    });

export const reqTestWebhook = (id: number) =>
    fetchApi<null>({
        method: "POST",
        url: `/admin/webhooks/${id}/test`,
    });

// Global Environment Variables
export const reqGetGlobalEnvVars = () =>
    fetchApi<GlobalEnvVar[]>({
        method: "GET",
        url: "/admin/env-vars",
    });

export const reqCreateGlobalEnvVar = (data: { key: string; value: string; is_secret: boolean }) =>
    fetchApi<GlobalEnvVar>({
        method: "POST",
        url: "/admin/env-vars",
        data,
    });

export const reqUpdateGlobalEnvVar = (id: number, data: { value?: string; is_secret?: boolean }) =>
    fetchApi<null>({
        method: "PUT",
        url: `/admin/env-vars/${id}`,
        data,
    });

export const reqDeleteGlobalEnvVar = (id: number) =>
    fetchApi<null>({
        method: "DELETE",
        url: `/admin/env-vars/${id}`,
    });

// SMTP Configuration
export type SMTPConfigData = {
    enabled: boolean;
    host: string;
    port: string;
    username: string;
    password: string;
    from_email: string;
    from_name: string;
    recipients: string;
};

export const reqGetSMTPConfig = () =>
    fetchApi<SMTPConfigData>({ method: "GET", url: "/admin/smtp-config" });

export const reqUpdateSMTPConfig = (data: Partial<SMTPConfigData>) =>
    fetchApi<null>({ method: "PUT", url: "/admin/smtp-config", data });

export const reqTestSMTP = () =>
    fetchApi<null>({ method: "POST", url: "/admin/smtp-config/test" });

// SSO Configuration
export type SSOConfigData = {
    enabled: boolean;
    client_id: string;
    client_secret: string;
    authorize_url: string;
    token_url: string;
    userinfo_url: string;
    redirect_url: string;
    logout_url: string;
    scopes: string;
    user_identifier: string;
    button_label: string;
    auto_provision: boolean;
    post_login_url: string;
};

export const reqGetSSOConfig = () =>
    fetchApi<SSOConfigData>({ method: "GET", url: "/admin/sso-config" });

export const reqUpdateSSOConfig = (data: Partial<SSOConfigData>) =>
    fetchApi<null>({ method: "PUT", url: "/admin/sso-config", data });
