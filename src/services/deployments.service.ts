import { Deployment, DeploymentLog } from "@/types";
import { fetchApi } from "./api.service";

export const reqGetDeployments = (params?: { stack_id?: number; status?: string; limit?: number; offset?: number }) =>
    fetchApi<Deployment[]>({
        method: "GET",
        url: "/admin/deployments",
        params,
    });

export const reqGetDeployment = (id: number) =>
    fetchApi<Deployment>({
        method: "GET",
        url: `/admin/deployments/${id}`,
    });

export const reqGetDeploymentLogs = (id: number) =>
    fetchApi<DeploymentLog[]>({
        method: "GET",
        url: `/admin/deployments/${id}/logs`,
    });

export const reqApproveDeployment = (id: number) =>
    fetchApi<Deployment>({
        method: "POST",
        url: `/admin/deployments/${id}/approve`,
    });

export const reqRollbackDeployment = (id: number) =>
    fetchApi<Deployment>({
        method: "POST",
        url: `/admin/deployments/${id}/rollback`,
    });
