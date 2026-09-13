import { describe, expect, it } from "vitest";
import type { AutomationAction, AutomationRun } from "@/types";
import {
    canonicalJSON,
    describeAction,
    describeRunOutcome,
    fromDraft,
    newHttpDraft,
    newRedeployDraft,
    parseHeaders,
    toDraft,
    withoutToken,
} from "./automations";

const baseRun: AutomationRun = {
    id: 12,
    automation_id: 3,
    trigger_source: "webhook",
    trigger_detail: null,
    scheduled_at: null,
    status: "succeeded",
    skip_reason: null,
    failed_step: null,
    error: null,
    steps: [],
    run_as_user_id: 1,
    triggered_by: null,
    started_at: "2026-09-12T10:00:00Z",
    finished_at: "2026-09-12T10:00:01Z",
    inserted_at: "2026-09-12T10:00:00Z",
    updated_at: "2026-09-12T10:00:01Z",
};

describe("parseHeaders", () => {
    it("parses Name: value lines and ignores blanks", () => {
        expect(parseHeaders("Authorization: Bearer x\n\nX-Env: prod")).toEqual({
            headers: { Authorization: "Bearer x", "X-Env": "prod" },
            error: null,
        });
    });

    it("keeps colons inside the value", () => {
        expect(parseHeaders("X-Url: https://a.example.com").headers["X-Url"]).toBe("https://a.example.com");
    });

    it("rejects a line with no name", () => {
        expect(parseHeaders("just-a-value").error).toMatch(/line 1/);
    });
});

describe("fromDraft", () => {
    it("requires a stack and a container for a redeploy", () => {
        expect(fromDraft(newRedeployDraft()).error).toMatch(/stack/);
        expect(fromDraft({ ...newRedeployDraft(), stack_id: 2 }).error).toMatch(/container/);
    });

    it("bounds an http timeout to 0-30 seconds", () => {
        const draft = { ...newHttpDraft(), url: "https://hooks.example.com/x" };
        expect(fromDraft({ ...draft, timeout_seconds: "31" }).error).toMatch(/0 to 30/);
        expect(fromDraft({ ...draft, timeout_seconds: "2.5" }).error).toMatch(/whole number/);
        expect(fromDraft({ ...draft, timeout_seconds: "15" }).action).toMatchObject({
            config: { timeout_seconds: 15 },
        });
    });

    it("round-trips an action through a draft unchanged", () => {
        const actions: AutomationAction[] = [
            { type: "redeploy_container", continue_on_error: true, config: { stack_id: 2, container_name: "monitor-core" } },
            {
                type: "http_request",
                continue_on_error: false,
                config: { method: "POST", url: "https://hooks.example.com/x", headers: { "X-A": "1" }, body: "{}" },
            },
        ];
        for (const action of actions) {
            expect(canonicalJSON(fromDraft(toDraft(action)).action)).toBe(canonicalJSON(action));
        }
    });
});

describe("canonicalJSON", () => {
    it("ignores key order, so an untouched definition is not sent back as a change", () => {
        expect(canonicalJSON({ b: 1, a: { d: 2, c: 3 } })).toBe(canonicalJSON({ a: { c: 3, d: 2 }, b: 1 }));
    });
});

describe("describeAction", () => {
    it("names the stack for a redeploy", () => {
        const action: AutomationAction = {
            type: "redeploy_container",
            continue_on_error: false,
            config: { stack_id: 2, container_name: "monitor-core" },
        };
        expect(describeAction(action, new Map([[2, "monitor-zone-2"]]))).toBe("Redeploy monitor-zone-2 / monitor-core");
    });

    it("never shows an http path, where chat webhooks keep their secret", () => {
        const action: AutomationAction = {
            type: "http_request",
            continue_on_error: false,
            config: { method: "post", url: "https://hooks.slack.com/services/T0/B0/SECRET" },
        };
        expect(describeAction(action)).toBe("POST https://hooks.slack.com");
    });
});

describe("describeRunOutcome", () => {
    it("names the failed step", () => {
        const run: AutomationRun = {
            ...baseRun,
            status: "failed",
            failed_step: 2,
            steps: [
                { step: 1, type: "redeploy_container", status: "succeeded", continue_on_error: false, summary: "ok", duration_ms: 3 },
                {
                    step: 2,
                    type: "redeploy_container",
                    status: "failed",
                    continue_on_error: false,
                    summary: "recreate monitor-zone-2/monitor-core",
                    error: "worker #12 did not accept the recreate",
                    duration_ms: 4,
                },
            ],
        };
        expect(describeRunOutcome(run)).toBe("step 2 failed: worker #12 did not accept the recreate");
    });

    it("gives the reason a firing was skipped", () => {
        expect(describeRunOutcome({ ...baseRun, status: "skipped", skip_reason: "automation is disabled" })).toBe(
            "automation is disabled",
        );
    });

    it("falls back to the run-level error when no step failed", () => {
        expect(describeRunOutcome({ ...baseRun, status: "failed", error: "refused before any step ran" })).toBe(
            "refused before any step ran",
        );
    });
});

describe("withoutToken", () => {
    it("drops the show-once secret", () => {
        const saved = withoutToken({
            id: 1,
            name: "x",
            description: null,
            enabled: true,
            trigger: { type: "webhook" },
            actions: [],
            webhook_last_used_at: null,
            run_as_user_id: 1,
            created_by: 1,
            running_run_id: null,
            running_since: null,
            active: true,
            updated_at: "",
            inserted_at: "",
            webhook_token: "secret",
            webhook_path: "/api/automations/secret",
        });
        expect(JSON.stringify(saved)).not.toContain("secret");
    });
});
