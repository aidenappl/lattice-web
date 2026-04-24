import { Worker, WorkerToken, WorkerMetrics, ContainerMetrics } from "@/types";
import { fetchApi } from "./api.service";

export const reqGetWorkers = () =>
    fetchApi<Worker[]>({
        method: "GET",
        url: "/admin/workers",
    });

export const reqGetWorker = (id: number) =>
    fetchApi<Worker>({
        method: "GET",
        url: `/admin/workers/${id}`,
    });

export const reqCreateWorker = (data: { name: string; hostname: string; labels?: string }) =>
    fetchApi<Worker>({
        method: "POST",
        url: "/admin/workers",
        data,
    });

export const reqUpdateWorker = (id: number, data: Partial<{ name: string; hostname: string; status: string; labels: string; active: boolean }>) =>
    fetchApi<Worker>({
        method: "PUT",
        url: `/admin/workers/${id}`,
        data,
    });

export const reqDeleteWorker = (id: number) =>
    fetchApi<void>({
        method: "DELETE",
        url: `/admin/workers/${id}`,
    });

export const reqGetWorkerTokens = (workerId: number) =>
    fetchApi<WorkerToken[]>({
        method: "GET",
        url: `/admin/workers/${workerId}/tokens`,
    });

export const reqCreateWorkerToken = (workerId: number, name: string) =>
    fetchApi<WorkerToken & { token: string }>({
        method: "POST",
        url: `/admin/workers/${workerId}/tokens`,
        data: { name },
    });

export const reqDeleteWorkerToken = (id: number) =>
    fetchApi<void>({
        method: "DELETE",
        url: `/admin/worker-tokens/${id}`,
    });

export const reqGetWorkerMetrics = (id: number, range?: string) =>
    fetchApi<WorkerMetrics[]>({
        method: "GET",
        url: `/admin/workers/${id}/metrics`,
        params: range ? { range } : undefined,
    });

export const reqRebootWorker = (id: number) =>
    fetchApi<void>({
        method: "POST",
        url: `/admin/workers/${id}/reboot`,
    });

export const reqUpgradeRunner = (id: number) =>
    fetchApi<void>({
        method: "POST",
        url: `/admin/workers/${id}/upgrade`,
    });

export const reqStopAllContainers = (id: number) =>
    fetchApi<void>({
        method: "POST",
        url: `/admin/workers/${id}/stop-all`,
    });

export const reqStartAllContainers = (id: number) =>
    fetchApi<void>({
        method: "POST",
        url: `/admin/workers/${id}/start-all`,
    });

export const reqGetWorkerContainerStats = (workerId: number) =>
    fetchApi<ContainerMetrics[]>({
        method: "GET",
        url: `/admin/workers/${workerId}/container-stats`,
    });

export const reqForceRemoveContainer = (workerId: number, containerName: string) =>
    fetchApi<null>({
        method: "POST",
        url: `/admin/workers/${workerId}/force-remove`,
        data: { container_name: containerName },
    });
