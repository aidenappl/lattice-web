import { describe, expect, it } from "vitest";
import { diskFree, formatFree, pruneChoices, pruneLabel } from "./disk";

describe("diskFree", () => {
    const cases: [string, number | null, number | null, boolean | null][] = [
        ["no sample", null, 100, null],
        ["no total", 10, 0, null],
        ["plenty free", 20 * 1024, 61 * 1024, false],
        ["under 10%", 56 * 1024, 61 * 1024, true],
        ["under 5 GB on a big disk", 497 * 1024, 500 * 1024, true],
        ["10% but under 5 GB", 36 * 1024, 40 * 1024, true],
        ["worker-6 at 100%", 61 * 1024, 61 * 1024, true],
    ];
    for (const [name, used, total, low] of cases) {
        it(name, () => {
            const d = diskFree(used, total);
            expect(d === null ? null : d.low).toBe(low);
        });
    }
    it("never reports negative free space", () => {
        expect(diskFree(70, 61)?.freeMB).toBe(0);
    });
    it("formats GB and MB", () => {
        expect(formatFree(diskFree(51 * 1024, 61 * 1024)!)).toBe("10.0 GB free (16%)");
        expect(formatFree(diskFree(61 * 1024 - 82, 61 * 1024)!)).toBe("82 MB free (0%)");
    });
});

describe("prune setting", () => {
    it("offers off, none and the usual counts, plus the current value", () => {
        expect(pruneChoices(2)).toEqual([-1, 0, 1, 2, 3, 5, 10, 20]);
        expect(pruneChoices(7)).toContain(7);
    });
    it("labels each choice", () => {
        expect(pruneLabel(-1)).toMatch(/Off/);
        expect(pruneLabel(0)).toMatch(/re-pull/);
        expect(pruneLabel(2)).toBe("Keep 2 previous (default)");
        expect(pruneLabel(5)).toBe("Keep 5 previous");
    });
});
