import { describe, expect, it } from "vitest";
import { ReconnectTracker } from "./ws-reconnect";

describe("ReconnectTracker", () => {
    it("escalates once to warn and once to error, then goes quiet", () => {
        const t = new ReconnectTracker({ warnAfter: 5, errorAfter: 20, stableAfterMs: 30_000 });
        const reports = Array.from({ length: 50 }, (_, i) => t.failed({ close_code: 1006 }, 1000 + i * 3000));

        const emitted = reports.filter((r) => r !== null);
        expect(emitted.map((r) => `${r!.name}:${r!.level}`)).toEqual([
            "ws.reconnect:info",
            "ws.reconnect:info",
            "ws.reconnect:info",
            "ws.reconnect:info",
            "ws.unavailable:warn",
            "ws.unavailable:error",
        ]);
        expect(reports[0]?.data).toMatchObject({ attempt: 1, close_code: 1006, down_ms: 0 });
        expect(reports[4]?.data).toMatchObject({ attempt: 5, down_ms: 12_000 });
        expect(reports[19]?.data).toMatchObject({ attempt: 20, down_ms: 57_000 });
        expect(t.consecutiveFailures).toBe(50);
    });

    const cases: { name: string; failures: number; want: string | null }[] = [
        { name: "a stable open with no failures reports nothing", failures: 0, want: null },
        { name: "a stable open after one failure reports ws.reconnected", failures: 1, want: "ws.reconnected:info" },
        { name: "a stable open after an outage reports ws.reconnected", failures: 25, want: "ws.reconnected:info" },
    ];
    cases.forEach(({ name, failures, want }) => {
        it(name, () => {
            const t = new ReconnectTracker();
            for (let i = 0; i < failures; i++) t.failed({}, i * 1000);
            const openAt = failures * 1000;
            t.opened(openAt);
            expect(t.stable(openAt + 29_999)).toBeNull();
            const r = t.stable(openAt + 30_000);
            expect(r ? `${r.name}:${r.level}` : null).toBe(want);
            if (r) expect(r.data).toMatchObject({ failures, down_ms: failures * 1000 });
            expect(t.consecutiveFailures).toBe(0);
        });
    });

    it("keeps counting and escalates while the socket flaps open and shut", () => {
        const t = new ReconnectTracker({ warnAfter: 5, errorAfter: 20, stableAfterMs: 30_000 });
        const reports = [];
        let now = 0;
        for (let i = 0; i < 40; i++) {
            t.opened(now);
            now += 50; // rejected right after the upgrade
            expect(t.stable(now)).toBeNull();
            reports.push(t.failed({ close_code: 1008 }, now));
            now += 3000;
        }
        const emitted = reports.filter((r) => r !== null).map((r) => `${r!.name}:${r!.level}`);
        expect(emitted).toEqual([
            "ws.reconnect:info",
            "ws.reconnect:info",
            "ws.reconnect:info",
            "ws.reconnect:info",
            "ws.unavailable:warn",
            "ws.unavailable:error",
        ]);
        expect(reports[4]).toMatchObject({ name: "ws.unavailable", level: "warn", data: { attempt: 5, open_ms: 50 } });
        expect(reports[19]).toMatchObject({ name: "ws.unavailable", level: "error", data: { attempt: 20 } });
        expect(t.consecutiveFailures).toBe(40);
    });

    it("a long-lived open resets the count even if the stable timer never ran", () => {
        const t = new ReconnectTracker({ warnAfter: 5, errorAfter: 20, stableAfterMs: 30_000 });
        for (let i = 0; i < 4; i++) t.failed({}, i * 3000);
        t.opened(12_000);
        const r = t.failed({}, 12_000 + 60_000);
        expect(r).toMatchObject({ name: "ws.reconnect", level: "info", data: { attempt: 1, down_ms: 0 } });
        expect(r?.data).not.toHaveProperty("open_ms");
        expect(t.consecutiveFailures).toBe(1);
    });

    it("starts escalation over after a stable open", () => {
        const t = new ReconnectTracker({ warnAfter: 2, errorAfter: 3, stableAfterMs: 1000 });
        t.failed({}, 0);
        expect(t.failed({}, 10)?.level).toBe("warn");
        t.opened(20);
        expect(t.stable(1020)).toMatchObject({ name: "ws.reconnected", data: { failures: 2 } });
        expect(t.failed({}, 5000)).toMatchObject({ name: "ws.reconnect", level: "info", data: { attempt: 1 } });
        expect(t.failed({}, 5010)).toMatchObject({ name: "ws.unavailable", level: "warn" });
        expect(t.failed({}, 5020)).toMatchObject({ name: "ws.unavailable", level: "error" });
    });

    it("reset clears the count without reporting", () => {
        const t = new ReconnectTracker();
        t.failed({}, 0);
        t.failed({}, 1);
        t.reset();
        t.opened(2);
        expect(t.stable(100_000)).toBeNull();
    });
});
