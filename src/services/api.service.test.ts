import axios, { AxiosError, AxiosHeaders, type AxiosAdapter, type AxiosResponse, type InternalAxiosRequestConfig } from "axios";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchApi, stopProactiveRefresh } from "./api.service";
import { monitor } from "./monitor.service";

type Outcome = { status: number; data?: unknown; headers?: Record<string, string> } | "network";

/** An adapter that plays back one outcome per attempt and records the ids sent. */
const playback = (outcomes: Outcome[], sentIds: string[]): AxiosAdapter => {
    let i = 0;
    return async (config: InternalAxiosRequestConfig): Promise<AxiosResponse> => {
        sentIds.push(String(config.headers.get("X-Request-ID")));
        const outcome = outcomes[Math.min(i++, outcomes.length - 1)];
        if (outcome === "network") {
            throw new AxiosError("timeout of 10000ms exceeded", "ECONNABORTED", config);
        }
        return {
            data: outcome.data ?? {},
            status: outcome.status,
            statusText: "",
            headers: new AxiosHeaders(outcome.headers ?? {}),
            config,
        };
    };
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

describe("fetchApi Monitor reporting", () => {
    let emit: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        vi.useFakeTimers({ toFake: ["setTimeout"] });
        emit = vi.spyOn(monitor!, "emit");
    });

    afterEach(() => {
        emit.mockRestore();
        vi.useRealTimers();
    });

    const run = async <T,>(promise: Promise<T>): Promise<T> => {
        await vi.runAllTimersAsync();
        return promise;
    };

    const apiEvents = () => emit.mock.calls.filter((c) => String(c[0]).startsWith("api.request."));

    it("sends a fresh X-Request-ID on every attempt", async () => {
        const ids: string[] = [];
        await run(fetchApi({ method: "GET", url: "/admin/workers", adapter: playback([{ status: 503 }, { status: 200, data: { success: true, data: [] } }], ids) }));
        expect(ids).toHaveLength(2);
        ids.forEach((id) => expect(id).toMatch(UUID));
        expect(ids[0]).not.toBe(ids[1]);
    });

    it("keeps a caller-supplied X-Request-ID", async () => {
        const ids: string[] = [];
        const own = "0123456789abcdef0123456789abcdef";
        await run(fetchApi({ method: "POST", url: "/admin/stacks", headers: { "X-Request-ID": own }, adapter: playback([{ status: 200, data: { success: true, data: {} } }], ids) }));
        expect(ids).toEqual([own]);
    });

    it("reports a GET that times out on every attempt once, with the last request id", async () => {
        const ids: string[] = [];
        const res = await run(fetchApi({ method: "GET", url: "/admin/workers?token=secret", adapter: playback(["network"], ids) }));
        expect(res.success).toBe(false);
        expect(ids).toHaveLength(3);
        const events = apiEvents();
        expect(events).toHaveLength(1);
        const [name, level, opts] = events[0];
        expect(name).toBe("api.request.network_error");
        expect(level).toBe("error");
        expect(opts?.requestId).toBe(ids[2]);
        expect(opts?.data).toMatchObject({ method: "GET", url: "/admin/workers", error_code: "ECONNABORTED", attempts: 3 });
    });

    it("reports nothing when a retried GET recovers", async () => {
        await run(fetchApi({ method: "GET", url: "/admin/workers", adapter: playback(["network", { status: 500 }, { status: 200, data: { success: true, data: [] } }], []) }));
        expect(apiEvents()).toHaveLength(0);
    });

    it("reports a GET that 5xxs on every attempt once, with the numeric error_code", async () => {
        const ids: string[] = [];
        await run(fetchApi({ method: "GET", url: "/admin/stacks", adapter: playback([{ status: 500, data: { success: false, error: "query_error", error_message: "boom", error_code: 5001 } }], ids) }));
        const events = apiEvents();
        expect(events).toHaveLength(1);
        const [name, level, opts] = events[0];
        expect(name).toBe("api.request.server_error");
        expect(level).toBe("error");
        expect(opts?.requestId).toBe(ids[2]);
        expect(opts?.data).toMatchObject({ status_code: 500, error: "query_error", error_message: "boom", error_code: 5001, attempts: 3 });
    });

    it("reports a client error with the API's echoed ids", async () => {
        const echoed = "fedcba9876543210fedcba9876543210";
        const trace = "0af7651916cd43dd8448eb211c80319c";
        await run(fetchApi({ method: "POST", url: "/admin/stacks", adapter: playback([{ status: 400, data: { success: false, error: "bad_body", error_message: "nope", error_code: 4000 }, headers: { "X-Request-ID": echoed, "X-Trace-ID": trace } }], []) }));
        const events = apiEvents();
        expect(events).toHaveLength(1);
        const [name, level, opts] = events[0];
        expect(name).toBe("api.request.client_error");
        expect(level).toBe("warn");
        expect(opts?.requestId).toBe(echoed);
        expect(opts?.traceId).toBe(trace);
        expect(opts?.data).toMatchObject({ method: "POST", status_code: 400, error_code: 4000, attempts: 1 });
    });

    it("reports a POST network error once, without retrying", async () => {
        const ids: string[] = [];
        await run(fetchApi({ method: "POST", url: "/admin/stacks", adapter: playback(["network"], ids) }));
        expect(ids).toHaveLength(1);
        const events = apiEvents();
        expect(events).toHaveLength(1);
        expect(events[0][0]).toBe("api.request.network_error");
        expect(events[0][2]?.requestId).toBe(ids[0]);
        expect(events[0][2]?.data).toMatchObject({ attempts: 1 });
    });
    describe("after a 401 and a successful refresh", () => {
        let refresh: ReturnType<typeof vi.spyOn>;

        beforeEach(() => {
            refresh = vi.spyOn(axios, "post").mockResolvedValue({
                status: 200,
                data: { success: true, data: { token: "fresh-token", expires_at: null } },
            });
        });

        afterEach(() => {
            refresh.mockRestore();
            stopProactiveRefresh();
        });

        it("reports a retried request that 5xxs exactly once as a server_error", async () => {
            const ids: string[] = [];
            const res = await run(fetchApi({ method: "GET", url: "/admin/stacks", adapter: playback([{ status: 401 }, { status: 502, data: { success: false, error: "upstream", error_message: "bad gateway", error_code: 5002 } }], ids) }));
            expect(res.success).toBe(false);
            expect(res.status).toBe(502);
            expect(refresh).toHaveBeenCalledTimes(1);
            expect(ids).toHaveLength(2);
            const serverErrors = apiEvents().filter((c) => c[0] === "api.request.server_error");
            expect(serverErrors).toHaveLength(1);
            const [, level, opts] = serverErrors[0];
            expect(level).toBe("error");
            expect(opts?.requestId).toBe(ids[1]);
            expect(opts?.data).toMatchObject({ method: "GET", url: "/admin/stacks", status_code: 502, error_code: 5002, attempts: 1 });
        });

        it("reports a retried request that times out on the final attempt exactly once as a network_error", async () => {
            const ids: string[] = [];
            const res = await run(fetchApi({ method: "GET", url: "/admin/workers", adapter: playback(["network", "network", { status: 401 }, "network"], ids) }));
            expect(res.success).toBe(false);
            expect(refresh).toHaveBeenCalledTimes(1);
            expect(ids).toHaveLength(4);
            const networkErrors = apiEvents().filter((c) => c[0] === "api.request.network_error");
            expect(networkErrors).toHaveLength(1);
            const [, level, opts] = networkErrors[0];
            expect(level).toBe("error");
            expect(opts?.requestId).toBe(ids[3]);
            expect(opts?.data).toMatchObject({ method: "GET", url: "/admin/workers", error_code: "ECONNABORTED", attempts: 3 });
        });
    });
});
