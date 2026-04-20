import { fetchApi } from "./api.service";

export const reqListVolumes = (workerId: number) =>
    fetchApi<void>({
        method: "GET",
        url: `/admin/workers/${workerId}/volumes`,
    });

export const reqCreateVolume = (workerId: number, data: { name: string; driver?: string }) =>
    fetchApi<void>({
        method: "POST",
        url: `/admin/workers/${workerId}/volumes`,
        data,
    });

export const reqDeleteVolume = (workerId: number, name: string, force?: boolean) =>
    fetchApi<void>({
        method: "DELETE",
        url: `/admin/workers/${workerId}/volumes/${encodeURIComponent(name)}`,
        params: force ? { force: "true" } : undefined,
    });
