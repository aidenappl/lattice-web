import { Stack, Container } from "@/types";
import { fetchApi } from "./api.service";

export const reqGetStacks = () =>
    fetchApi<Stack[]>({
        method: "GET",
        url: "/admin/stacks",
    });

export const reqGetStack = (id: number) =>
    fetchApi<Stack>({
        method: "GET",
        url: `/admin/stacks/${id}`,
    });

export const reqCreateStack = (data: { name: string; description?: string; worker_id?: number; deployment_strategy?: string; auto_deploy?: boolean }) =>
    fetchApi<Stack>({
        method: "POST",
        url: "/admin/stacks",
        data,
    });

export const reqUpdateStack = (id: number, data: Partial<{ name: string; description: string; worker_id: number; deployment_strategy: string; auto_deploy: boolean; active: boolean }>) =>
    fetchApi<Stack>({
        method: "PUT",
        url: `/admin/stacks/${id}`,
        data,
    });

export const reqDeleteStack = (id: number) =>
    fetchApi<void>({
        method: "DELETE",
        url: `/admin/stacks/${id}`,
    });

export const reqDeployStack = (id: number) =>
    fetchApi<{ deployment_id: number }>({
        method: "POST",
        url: `/admin/stacks/${id}/deploy`,
    });

export const reqGetContainers = (stackId: number) =>
    fetchApi<Container[]>({
        method: "GET",
        url: `/admin/stacks/${stackId}/containers`,
    });

export const reqCreateContainer = (stackId: number, data: Partial<Container>) =>
    fetchApi<Container>({
        method: "POST",
        url: `/admin/stacks/${stackId}/containers`,
        data,
    });

export const reqUpdateContainer = (id: number, data: Partial<Container>) =>
    fetchApi<Container>({
        method: "PUT",
        url: `/admin/containers/${id}`,
        data,
    });

export const reqDeleteContainer = (id: number) =>
    fetchApi<void>({
        method: "DELETE",
        url: `/admin/containers/${id}`,
    });
