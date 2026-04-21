import { fetchApi } from "./api.service";
import type { Template } from "@/types";

export const reqGetTemplates = () =>
    fetchApi<Template[]>({
        method: "GET",
        url: "/admin/templates",
    });

export const reqCreateTemplateFromStack = (
    stackId: number,
    data: { name: string; description?: string },
) =>
    fetchApi<Template>({
        method: "POST",
        url: `/admin/stacks/${stackId}/save-template`,
        data,
    });

export const reqCreateTemplate = (data: { name: string; description?: string; config: string }) =>
    fetchApi<Template>({
        method: "POST",
        url: "/admin/templates",
        data,
    });

export const reqDeleteTemplate = (id: number) =>
    fetchApi<null>({
        method: "DELETE",
        url: `/admin/templates/${id}`,
    });
