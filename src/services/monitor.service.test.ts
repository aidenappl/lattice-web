import { Monitor } from "@aidenappleby/monitor-js";
import { afterEach, describe, expect, it, vi } from "vitest";
import { hasLoggedInCookie, monitor, normaliseRoute, rateLimit, RELEASE, sessionFailureLevel } from "./monitor.service";

describe("normaliseRoute", () => {
    const cases: [string, string][] = [
        ["/", "/"],
        ["", "/"],
        ["/stacks", "/stacks"],
        ["/stacks/42", "/stacks/[id]"],
        ["/stacks/42/", "/stacks/[id]"],
        ["/stacks/new", "/stacks/new"],
        ["/databases/new", "/databases/new"],
        ["/workers/7/metrics", "/workers/[id]/metrics"],
        ["/containers/my-container", "/containers/[id]"],
        ["/deployments/3f2b8c1e-9d4a-4b6f-8e2a-1c3d5e7f9a0b", "/deployments/[id]"],
        ["/automations/12?tab=runs#latest", "/automations/[id]"],
        ["/settings/0123456789abcdef", "/settings/[id]"],
        ["/settings/99", "/settings/[id]"],
        ["/audit-log", "/audit-log"],
    ];
    cases.forEach(([path, want]) => {
        it(`${JSON.stringify(path)} → ${want}`, () => {
            expect(normaliseRoute(path)).toBe(want);
        });
    });
});

describe("event context", () => {
    afterEach(() => {
        vi.restoreAllMocks();
        window.history.replaceState(null, "", "/");
    });

    it("adds route and release to every event, keeping the event's own data", () => {
        const base = vi.spyOn(Monitor.prototype, "emit").mockImplementation(() => {});
        window.history.replaceState(null, "", "/stacks/42?token=secret");
        monitor!.warn("test.event", { requestId: "abc", data: { foo: 1 } });
        expect(base).toHaveBeenCalledWith("test.event", "warn", {
            requestId: "abc",
            data: { release: RELEASE, route: "/stacks/[id]", foo: 1 },
        });
    });

    it("lets an event override route", () => {
        const base = vi.spyOn(Monitor.prototype, "emit").mockImplementation(() => {});
        monitor!.info("test.event", { data: { route: "/custom" } });
        expect(base.mock.calls[0][2]?.data).toMatchObject({ route: "/custom" });
    });
});

describe("rateLimit", () => {
    it("allows one call per interval and counts the ones it suppressed", () => {
        expect(rateLimit("k", 1000, 0)).toBe(0);
        expect(rateLimit("k", 1000, 10)).toBeNull();
        expect(rateLimit("k", 1000, 999)).toBeNull();
        expect(rateLimit("k", 1000, 1000)).toBe(2);
        expect(rateLimit("other", 1000, 1000)).toBe(0);
    });
});

describe("sessionFailureLevel", () => {
    const cases: [number | undefined, string][] = [
        [401, "info"],
        [403, "info"],
        [400, "warn"],
        [429, "warn"],
        [500, "error"],
        [503, "error"],
        [undefined, "error"],
    ];
    cases.forEach(([status, want]) => {
        it(`${status} → ${want}`, () => {
            expect(sessionFailureLevel(status)).toBe(want);
        });
    });
});

describe("hasLoggedInCookie", () => {
    afterEach(() => {
        document.cookie = "lattice-logged-in=; max-age=0; path=/";
        document.cookie = "lattice-appearance=; max-age=0; path=/";
    });

    it("is false without the marker cookie", () => {
        document.cookie = "lattice-appearance=dark; path=/";
        expect(hasLoggedInCookie()).toBe(false);
    });

    it("is true with the marker cookie", () => {
        document.cookie = "lattice-appearance=dark; path=/";
        document.cookie = "lattice-logged-in=1; path=/";
        expect(hasLoggedInCookie()).toBe(true);
    });
});
