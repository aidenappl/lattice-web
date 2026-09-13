import toast from "react-hot-toast";
import type {
    Automation,
    AutomationAction,
    AutomationOutcome,
    AutomationRun,
    AutomationTrigger,
    AutomationWithToken,
    HttpRequestConfig,
} from "@/types";

export const CRON_PRESETS: { label: string; cron: string }[] = [
    { label: "Every 15 min", cron: "*/15 * * * *" },
    { label: "Hourly", cron: "0 * * * *" },
    { label: "Daily 03:00", cron: "0 3 * * *" },
    { label: "Weekdays 09:00", cron: "0 9 * * 1-5" },
];

export function describeTrigger(trigger: AutomationTrigger): string {
    if (trigger.type === "webhook") return "Webhook";
    return `Schedule · ${trigger.cron ?? "?"} UTC`;
}

/**
 * Scheme and host only — the same rule lattice-api applies in run history and
 * the audit log. Slack, Discord and most chat webhooks carry their secret in
 * the path, so the path is never shown in a summary.
 */
export function hostOf(rawUrl: string): string {
    try {
        const u = new URL(rawUrl);
        return `${u.protocol}//${u.host}`;
    } catch {
        return rawUrl || "(no url)";
    }
}

export function describeAction(action: AutomationAction, stackNames?: Map<number, string>): string {
    switch (action.type) {
        case "redeploy_container": {
            const stack = stackNames?.get(action.config.stack_id) ?? `stack #${action.config.stack_id}`;
            return `Redeploy ${stack} / ${action.config.container_name}`;
        }
        case "http_request":
            return `${(action.config.method || "POST").toUpperCase()} ${hostOf(action.config.url)}`;
        default: {
            // A type this build does not know — say so rather than render nothing.
            const unknownType = (action as { type: string }).type;
            return `Unknown action type "${unknownType}"`;
        }
    }
}

// ── Form drafts ─────────────────────────────────────────────────────────────
// The form edits drafts (strings as typed) and converts them to the API's
// action shape only on submit, so a half-typed header or timeout never has to
// be representable as a valid action.

export type RedeployDraft = {
    key: string;
    type: "redeploy_container";
    continue_on_error: boolean;
    stack_id: number | null;
    container_name: string;
};

export type HttpDraft = {
    key: string;
    type: "http_request";
    continue_on_error: boolean;
    method: string;
    url: string;
    /** One "Name: value" per line. */
    headers: string;
    body: string;
    timeout_seconds: string;
};

export type ActionDraft = RedeployDraft | HttpDraft;

let draftSeq = 0;
const nextDraftKey = () => `step-${++draftSeq}`;

export function newRedeployDraft(): RedeployDraft {
    return { key: nextDraftKey(), type: "redeploy_container", continue_on_error: false, stack_id: null, container_name: "" };
}

export function newHttpDraft(): HttpDraft {
    return {
        key: nextDraftKey(),
        type: "http_request",
        continue_on_error: false,
        method: "POST",
        url: "",
        headers: "",
        body: "",
        timeout_seconds: "",
    };
}

export function toDraft(action: AutomationAction): ActionDraft {
    if (action.type === "redeploy_container") {
        return {
            ...newRedeployDraft(),
            continue_on_error: action.continue_on_error,
            stack_id: action.config.stack_id,
            container_name: action.config.container_name,
        };
    }
    return {
        ...newHttpDraft(),
        continue_on_error: action.continue_on_error,
        method: action.config.method || "POST",
        url: action.config.url ?? "",
        headers: formatHeaders(action.config.headers),
        body: action.config.body ?? "",
        timeout_seconds: action.config.timeout_seconds ? String(action.config.timeout_seconds) : "",
    };
}

export function formatHeaders(headers?: Record<string, string>): string {
    return Object.entries(headers ?? {})
        .map(([name, value]) => `${name}: ${value}`)
        .join("\n");
}

export function parseHeaders(text: string): { headers: Record<string, string>; error: string | null } {
    const headers: Record<string, string> = {};
    const lines = text.split("\n");
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;
        const idx = line.indexOf(":");
        if (idx <= 0) {
            return { headers, error: `header line ${i + 1} must look like "Name: value"` };
        }
        headers[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
    }
    return { headers, error: null };
}

export function fromDraft(draft: ActionDraft): { action: AutomationAction | null; error: string | null } {
    if (draft.type === "redeploy_container") {
        if (!draft.stack_id) return { action: null, error: "choose a stack" };
        if (!draft.container_name) return { action: null, error: "choose a container" };
        return {
            action: {
                type: "redeploy_container",
                continue_on_error: draft.continue_on_error,
                config: { stack_id: draft.stack_id, container_name: draft.container_name },
            },
            error: null,
        };
    }

    if (!draft.url.trim()) return { action: null, error: "a URL is required" };
    const { headers, error } = parseHeaders(draft.headers);
    if (error) return { action: null, error };

    let timeout: number | undefined;
    if (draft.timeout_seconds.trim()) {
        const n = Number(draft.timeout_seconds);
        if (!Number.isInteger(n) || n < 0 || n > 30) {
            return { action: null, error: "the timeout must be a whole number of seconds from 0 to 30" };
        }
        timeout = n || undefined;
    }

    const config: HttpRequestConfig = { method: draft.method.toUpperCase(), url: draft.url.trim() };
    if (Object.keys(headers).length > 0) config.headers = headers;
    if (draft.body) config.body = draft.body;
    if (timeout) config.timeout_seconds = timeout;

    return { action: { type: "http_request", continue_on_error: draft.continue_on_error, config }, error: null };
}

/**
 * JSON with object keys sorted, so an unchanged definition compares equal
 * whatever order its keys arrived in. The form uses it to send trigger/actions
 * only when they changed — redefining an automation re-binds its run-as
 * identity to the person saving, and a rename should not.
 */
export function canonicalJSON(value: unknown): string {
    return JSON.stringify(value, (_key, v: unknown) =>
        v && typeof v === "object" && !Array.isArray(v)
            ? Object.fromEntries(Object.entries(v as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)))
            : v,
    );
}

/** Drops the show-once webhook secret before a saved automation goes into state. */
export function withoutToken(saved: AutomationWithToken): Automation {
    const copy: AutomationWithToken = { ...saved };
    delete copy.webhook_token;
    delete copy.webhook_path;
    return copy;
}

// ── Runs ────────────────────────────────────────────────────────────────────

export function formatRunDuration(run: AutomationRun): string {
    if (!run.finished_at) return run.status === "in_progress" ? "running…" : "—";
    const ms = new Date(run.finished_at).getTime() - new Date(run.started_at).getTime();
    if (!Number.isFinite(ms) || ms < 0) return "—";
    return ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} s`;
}

/** One line saying what happened: which step failed, or why it was skipped. */
export function describeRunOutcome(run: AutomationRun): string {
    switch (run.status) {
        case "skipped":
            return run.skip_reason ?? "skipped";
        case "failed": {
            const step = run.failed_step ? run.steps[run.failed_step - 1] : undefined;
            if (step) return `step ${step.step} failed: ${step.error ?? step.summary}`;
            return run.error ?? "failed";
        }
        case "in_progress": {
            const done = run.steps.filter((s) => s.status !== "pending").length;
            return `${done}/${run.steps.length} steps done`;
        }
        default:
            return `${run.steps.length} step${run.steps.length === 1 ? "" : "s"} succeeded`;
    }
}

export function describeOutcome(outcome: AutomationOutcome): { tone: "success" | "error" | "info"; message: string } {
    const { result, run } = outcome;
    switch (result) {
        case "succeeded":
            return { tone: "success", message: `Run #${run.id} succeeded` };
        case "disabled":
            return { tone: "info", message: `Automation is disabled — nothing ran (recorded as run #${run.id})` };
        case "skipped":
            return { tone: "info", message: `Run #${run.id} skipped: ${run.skip_reason ?? "no reason recorded"}` };
        default:
            return { tone: "error", message: `Run #${run.id} failed — ${describeRunOutcome(run)}` };
    }
}

export function toastOutcome(outcome: AutomationOutcome): void {
    const { tone, message } = describeOutcome(outcome);
    if (tone === "success") toast.success(message);
    else if (tone === "error") toast.error(message, { duration: 8000 });
    else toast(message);
}
