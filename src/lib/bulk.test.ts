import { describe, expect, it } from "vitest";
import { pluralize, runBulk, summarizeBulk } from "./bulk";

describe("runBulk", () => {
  it("attempts every item and splits successes from failures", async () => {
    const res = await runBulk([1, 2, 3, 4], async (n) =>
      n % 2 === 0
        ? { success: true as const }
        : { success: false as const, error_message: `odd ${n}` },
    );
    expect(res.succeeded).toEqual([2, 4]);
    expect(res.failed).toEqual([
      { item: 1, error: "odd 1" },
      { item: 3, error: "odd 3" },
    ]);
  });

  it("records a thrown error as a failure instead of aborting the batch", async () => {
    const res = await runBulk(["a", "b"], async (s) => {
      if (s === "a") throw new Error("boom");
      return { success: true as const };
    });
    expect(res.succeeded).toEqual(["b"]);
    expect(res.failed).toEqual([{ item: "a", error: "boom" }]);
  });

  it("never runs more than `concurrency` requests at once", async () => {
    let inFlight = 0;
    let peak = 0;
    await runBulk(
      Array.from({ length: 10 }, (_, i) => i),
      async () => {
        inFlight++;
        peak = Math.max(peak, inFlight);
        await new Promise((r) => setTimeout(r, 5));
        inFlight--;
        return { success: true as const };
      },
      { concurrency: 3 },
    );
    expect(peak).toBe(3);
  });

  it("keeps the caller's order even when requests finish out of order", async () => {
    const res = await runBulk([30, 10, 20], async (ms) => {
      await new Promise((r) => setTimeout(r, ms));
      return { success: true as const };
    });
    expect(res.succeeded).toEqual([30, 10, 20]);
  });

  it("reports progress once per item", async () => {
    const seen: number[] = [];
    await runBulk([1, 2, 3], async () => ({ success: true as const }), {
      onProgress: (done) => seen.push(done),
    });
    expect(seen).toEqual([1, 2, 3]);
  });

  it("handles an empty selection", async () => {
    const res = await runBulk([], async () => ({ success: true as const }));
    expect(res).toEqual({ succeeded: [], failed: [] });
  });
});

describe("summarizeBulk", () => {
  const name = (n: number) => `#${n}`;

  it("says how many succeeded when nothing failed", () => {
    expect(
      summarizeBulk(
        { succeeded: [1, 2], failed: [] },
        "Stopped",
        "container",
        name,
      ),
    ).toEqual({ ok: true, message: "Stopped 2 containers" });
  });

  it("names failures and counts the rest", () => {
    const s = summarizeBulk(
      {
        succeeded: [1],
        failed: [2, 3, 4, 5].map((n) => ({ item: n, error: "offline" })),
      },
      "Restarted",
      "container",
      name,
    );
    expect(s.ok).toBe(false);
    expect(s.message).toBe(
      "Restarted 1 of 5 containers — #2: offline; #3: offline; #4: offline (+1 more)",
    );
  });

  it("says when everything failed", () => {
    const s = summarizeBulk(
      { succeeded: [], failed: [{ item: 1, error: "nope" }] },
      "Deleted",
      "token",
      name,
    );
    expect(s.message).toBe("Failed for all 1 token — #1: nope");
  });
});

describe("pluralize", () => {
  it("handles singular, plural and irregular nouns", () => {
    expect(pluralize(1, "stack")).toBe("1 stack");
    expect(pluralize(2, "stack")).toBe("2 stacks");
    expect(pluralize(2, "registry", "registries")).toBe("2 registries");
  });
});
