import { describe, it, expect } from "vitest";
import reducer, {
  setCurrent,
  updateCurrent,
  fetchStacks,
  selectStackNameMap,
} from "./stacksSlice";
import type { Stack } from "@/types";

const mockStack: Stack = {
  id: 1,
  name: "web-stack",
  description: "Production web stack",
  worker_id: 1,
  status: "active",
  deployment_strategy: "rolling",
  auto_deploy: false,
  placement_constraints: null,
  env_vars: null,
  compose_yaml: null,
  active: true,
  inserted_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};

describe("stacksSlice reducers", () => {
  it("has correct initial state", () => {
    const state = reducer(undefined, { type: "unknown" });
    expect(state.list).toEqual([]);
    expect(state.current).toBeNull();
    expect(state.loading).toBe(true);
    expect(state.error).toBeNull();
  });

  it("setCurrent sets the stack", () => {
    const state = reducer(undefined, setCurrent(mockStack));
    expect(state.current).toEqual(mockStack);
  });

  it("setCurrent can clear", () => {
    const withStack = reducer(undefined, setCurrent(mockStack));
    const cleared = reducer(withStack, setCurrent(null));
    expect(cleared.current).toBeNull();
  });

  it("updateCurrent merges partial", () => {
    const withStack = reducer(undefined, setCurrent(mockStack));
    const updated = reducer(
      withStack,
      updateCurrent({ name: "renamed-stack" }),
    );
    expect(updated.current?.name).toBe("renamed-stack");
    expect(updated.current?.status).toBe("active");
  });

  it("updateCurrent does nothing without current", () => {
    const state = reducer(undefined, updateCurrent({ name: "renamed" }));
    expect(state.current).toBeNull();
  });
});

describe("stacksSlice extraReducers", () => {
  it("fetchStacks.fulfilled sets list", () => {
    const state = reducer(undefined, {
      type: fetchStacks.fulfilled.type,
      payload: [mockStack],
    });
    expect(state.list).toEqual([mockStack]);
    expect(state.loading).toBe(false);
  });

  it("fetchStacks.rejected sets error", () => {
    const state = reducer(undefined, {
      type: fetchStacks.rejected.type,
      error: { message: "Network error" },
    });
    expect(state.error).toBe("Network error");
    expect(state.loading).toBe(false);
  });
});

describe("selectStackNameMap", () => {
  it("builds id->name map", () => {
    const stack2 = { ...mockStack, id: 2, name: "api-stack" };
    const rootState = {
      stacks: { list: [mockStack, stack2], current: null, loading: false, error: null },
    };
    const map = selectStackNameMap(rootState as any);
    expect(map).toEqual({ 1: "web-stack", 2: "api-stack" });
  });

  it("returns empty map for empty list", () => {
    const rootState = {
      stacks: { list: [], current: null, loading: false, error: null },
    };
    const map = selectStackNameMap(rootState as any);
    expect(map).toEqual({});
  });
});
