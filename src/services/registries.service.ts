import { Registry } from "@/types";
import { fetchApi } from "./api.service";

export const reqGetRegistries = () =>
    fetchApi<Registry[]>({
        method: "GET",
        url: "/admin/registries",
    });

export const reqGetRegistry = (id: number) =>
    fetchApi<Registry>({
        method: "GET",
        url: `/admin/registries/${id}`,
    });

export const reqCreateRegistry = (data: {
    name: string;
    url: string;
    type: "dockerhub" | "ghcr" | "custom";
    username?: string;
    password?: string;
}) =>
    fetchApi<Registry>({
        method: "POST",
        url: "/admin/registries",
        data,
    });

export const reqUpdateRegistry = (
    id: number,
    data: Partial<{
        name: string;
        url: string;
        type: string;
        username: string;
        password: string;
        active: boolean;
    }>,
) =>
    fetchApi<Registry>({
        method: "PUT",
        url: `/admin/registries/${id}`,
        data,
    });

export const reqDeleteRegistry = (id: number) =>
    fetchApi<void>({
        method: "DELETE",
        url: `/admin/registries/${id}`,
    });

export const reqTestRegistry = (id: number) =>
    fetchApi<{ status: string }>({
        method: "POST",
        url: `/admin/registries/${id}/test`,
    });

export const reqTestRegistryInline = (data: { url: string; username: string; password: string }) =>
    fetchApi<{ status: string }>({
        method: "POST",
        url: "/admin/registries/test",
        data,
    });

export const reqListRegistryRepos = (id: number) =>
    fetchApi<string[]>({
        method: "GET",
        url: `/admin/registries/${id}/repositories`,
    });

export const reqListRegistryTags = (id: number, repo: string) =>
    fetchApi<string[]>({
        method: "GET",
        url: `/admin/registries/${id}/tags?repo=${encodeURIComponent(repo)}`,
    });
