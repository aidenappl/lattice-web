import { fetchApi } from "./api.service";
import type { LatticeNetwork } from "@/types";

export const reqListAllNetworks = () =>
    fetchApi<LatticeNetwork[]>({
        method: "GET",
        url: "/admin/networks",
    });

export const reqListNetworks = (workerId: number) =>
    fetchApi<void>({
        method: "GET",
        url: `/admin/workers/${workerId}/networks`,
    });

export const reqCreateNetwork = (workerId: number, data: { name: string; driver?: string }) =>
    fetchApi<void>({
        method: "POST",
        url: `/admin/workers/${workerId}/networks`,
        data,
    });

export const reqDeleteNetwork = (workerId: number, name: string) =>
    fetchApi<void>({
        method: "DELETE",
        url: `/admin/workers/${workerId}/networks/${encodeURIComponent(name)}`,
    });
