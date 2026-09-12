// Mirrors lattice-api structs/Automation.struct.go. Keep the status unions in
// step with the Go enums — and remember a new status token also needs an entry
// in components/ui/badge.tsx, or it renders as an unstyled grey badge.

export type AutomationTriggerType = "webhook" | "schedule";

export type AutomationTrigger = {
    type: AutomationTriggerType;
    /** 5-field cron, evaluated in UTC. Schedule triggers only. */
    cron?: string;
};

export type AutomationActionType = "redeploy_container" | "http_request";

/**
 * A container is named by (stack, name), never by id: a compose edit re-creates
 * every container row in the stack, so an id would go stale, and names are only
 * unique within a stack.
 */
export type RedeployContainerConfig = {
    stack_id: number;
    container_name: string;
};

export type HttpRequestConfig = {
    method: string;
    url: string;
    headers?: Record<string, string>;
    body?: string;
    timeout_seconds?: number;
};

export type RedeployContainerAction = {
    type: "redeploy_container";
    continue_on_error: boolean;
    config: RedeployContainerConfig;
};

export type HttpRequestAction = {
    type: "http_request";
    continue_on_error: boolean;
    config: HttpRequestConfig;
};

export type AutomationAction = RedeployContainerAction | HttpRequestAction;

/** The identity an automation's actions are authorised against at run time. */
export type AutomationActor = {
    id: number;
    email: string;
    name: string | null;
    role: string;
    active: boolean;
};

export type AutomationRunStatus = "in_progress" | "succeeded" | "failed" | "skipped";

export type AutomationStepStatus = "pending" | "succeeded" | "failed" | "skipped";

export type AutomationTriggerSource = "webhook" | "schedule" | "manual";

export type AutomationStepResult = {
    /** 1-based. */
    step: number;
    type: string;
    status: AutomationStepStatus;
    continue_on_error: boolean;
    summary: string;
    error?: string;
    started_at?: string;
    duration_ms: number;
};

export type AutomationRun = {
    id: number;
    automation_id: number;
    trigger_source: AutomationTriggerSource;
    trigger_detail: string | null;
    scheduled_at: string | null;
    status: AutomationRunStatus;
    skip_reason: string | null;
    /** 1-based index of the FIRST step that failed. */
    failed_step: number | null;
    /** A failure that belongs to the run, not a step: authorisation, budget, crash. */
    error: string | null;
    steps: AutomationStepResult[];
    run_as_user_id: number | null;
    triggered_by: number | null;
    started_at: string;
    finished_at: string | null;
    inserted_at: string;
    updated_at: string;
};

export type Automation = {
    id: number;
    name: string;
    description: string | null;
    enabled: boolean;
    trigger: AutomationTrigger;
    /** http_request header values and bodies arrive as "[redacted]" for non-admins. */
    actions: AutomationAction[];
    webhook_last_used_at: string | null;
    run_as_user_id: number;
    created_by: number;
    running_run_id: number | null;
    running_since: string | null;
    active: boolean;
    updated_at: string;
    inserted_at: string;
    run_as?: AutomationActor;
    last_run?: AutomationRun;
};

/** The webhook secret appears only here, only once: at creation or rotation. */
export type AutomationWithToken = Automation & {
    webhook_token?: string;
    webhook_path?: string;
};

export type AutomationOutcomeResult = "succeeded" | "failed" | "skipped" | "disabled";

export type AutomationOutcome = {
    result: AutomationOutcomeResult;
    run: AutomationRun;
};

export type AutomationPayload = {
    name: string;
    description?: string | null;
    enabled?: boolean;
    trigger: AutomationTrigger;
    actions: AutomationAction[];
};
