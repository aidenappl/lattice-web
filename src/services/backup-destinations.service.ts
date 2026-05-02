import { BackupDestination } from "@/types";
import { fetchApi } from "./api.service";

export const reqGetBackupDestinations = () =>
    fetchApi<BackupDestination[]>({
        method: "GET",
        url: "/admin/backup-destinations",
    });

export const reqGetBackupDestination = (id: number) =>
    fetchApi<BackupDestination>({
        method: "GET",
        url: `/admin/backup-destinations/${id}`,
    });

export const reqCreateBackupDestination = (data: {
    name: string;
    type: string;
    config: Record<string, string>;
}) =>
    fetchApi<BackupDestination>({
        method: "POST",
        url: "/admin/backup-destinations",
        data,
    });

export const reqUpdateBackupDestination = (
    id: number,
    data: Partial<{
        name: string;
        type: string;
        config: Record<string, string>;
        active: boolean;
    }>,
) =>
    fetchApi<BackupDestination>({
        method: "PUT",
        url: `/admin/backup-destinations/${id}`,
        data,
    });

export const reqDeleteBackupDestination = (id: number) =>
    fetchApi<void>({
        method: "DELETE",
        url: `/admin/backup-destinations/${id}`,
    });

export const reqTestBackupDestination = (id: number, workerId: number) =>
    fetchApi<void>({
        method: "POST",
        url: `/admin/backup-destinations/${id}/test`,
        params: { worker_id: workerId },
    });
