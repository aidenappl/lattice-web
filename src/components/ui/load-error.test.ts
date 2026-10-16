import { describe, expect, it } from "vitest";
import { loadErrorReason } from "./load-error";
import type { ApiError } from "@/types";

const err = (over: Partial<ApiError>): ApiError => ({
    success: false,
    status: 500,
    error: "internal",
    error_message: "database unavailable",
    error_code: 500,
    ...over,
});

describe("loadErrorReason", () => {
    it.each([
        ["an API error shows its message and status", err({}), "database unavailable (HTTP 500)"],
        ["a missing message falls back", err({ error_message: "", status: 502 }), "Unexpected error (HTTP 502)"],
        ["no response is not reported as HTTP 500", err({ error_code: -1, error_message: "Network Error" }), "No response from lattice-api (network error or timeout)."],
    ])("%s", (_name, res, want) => {
        expect(loadErrorReason(res)).toBe(want);
    });
});
