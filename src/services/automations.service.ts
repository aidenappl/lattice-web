import type {
    Automation,
    AutomationOutcome,
    AutomationPayload,
    AutomationRun,
    AutomationWithToken,
} from "@/types";
import { fetchApi } from "./api.service";

// A run is bounded by lattice-api's 50s run budget; the default 10s client
// timeout would abandon a run that is still legitimately going.
const RUN_TIMEOUT_MS = 60000;

export const reqGetAutomations = () =>
    fetchApi<Automation[]>({
        method: "GET",
        url: "/admin/automations",
    });

export const reqGetAutomation = (id: number) =>
    fetchApi<Automation>({
        method: "GET",
        url: `/admin/automations/${id}`,
    });

/** The response carries the webhook token, once, for a webhook trigger. */
export const reqCreateAutomation = (data: AutomationPayload) =>
    fetchApi<AutomationWithToken>({
        method: "POST",
        url: "/admin/automations",
        data,
    });

/**
 * Send `trigger`/`actions` only when they changed: redefining an automation
 * re-binds its run-as identity to you, a rename does not.
 */
export const reqUpdateAutomation = (id: number, data: Partial<AutomationPayload>) =>
    fetchApi<AutomationWithToken>({
        method: "PUT",
        url: `/admin/automations/${id}`,
        data,
    });

export const reqDeleteAutomation = (id: number) =>
    fetchApi<null>({
        method: "DELETE",
        url: `/admin/automations/${id}`,
    });

/** Enabling re-binds the run-as identity to you. */
export const reqEnableAutomation = (id: number) =>
    fetchApi<Automation>({
        method: "POST",
        url: `/admin/automations/${id}/enable`,
    });

export const reqDisableAutomation = (id: number) =>
    fetchApi<Automation>({
        method: "POST",
        url: `/admin/automations/${id}/disable`,
    });

/** Runs synchronously; resolves with the run once it has finished. */
export const reqRunAutomation = (id: number) =>
    fetchApi<AutomationOutcome>({
        method: "POST",
        url: `/admin/automations/${id}/run`,
        timeout: RUN_TIMEOUT_MS,
    });

/** The old token stops working immediately; the new one is returned once. */
export const reqRotateAutomationToken = (id: number) =>
    fetchApi<AutomationWithToken>({
        method: "POST",
        url: `/admin/automations/${id}/rotate-token`,
    });

export const reqGetAutomationRuns = (id: number, limit?: number) =>
    fetchApi<AutomationRun[]>({
        method: "GET",
        url: `/admin/automations/${id}/runs`,
        params: limit ? { limit } : undefined,
    });
