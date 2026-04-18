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

export const reqCreateRegistry = (data: { name: string; url: string; type: string; keyring_secret_key?: string }) =>
    fetchApi<Registry>({
        method: "POST",
        url: "/admin/registries",
        data,
    });

export const reqUpdateRegistry = (id: number, data: Partial<{ name: string; url: string; type: string; keyring_secret_key: string; active: boolean }>) =>
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
