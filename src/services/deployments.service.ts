import { Deployment } from "@/types";
import { fetchApi } from "./api.service";

export const reqGetDeployments = () =>
    fetchApi<Deployment[]>({
        method: "GET",
        url: "/admin/deployments",
    });

export const reqGetDeployment = (id: number) =>
    fetchApi<Deployment>({
        method: "GET",
        url: `/admin/deployments/${id}`,
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
