import { describe, it, expect } from "vitest";
import reducer, {
  setCurrent,
  updateCurrent,
  addToken,
  removeToken,
  pushMetricsSnapshot,
  fetchWorkers,
} from "./workersSlice";
import type { Worker, WorkerToken, WorkerMetrics } from "@/types";

const mockWorker: Worker = {
  id: 1,
  name: "worker-1",
  hostname: "host-1",
  ip_address: "10.0.0.1",
  status: "online",
  os: "linux",
  arch: "amd64",
  docker_version: "24.0.0",
  runner_version: "0.1.0",
  last_heartbeat_at: "2026-01-01T00:00:00Z",
  labels: null,
  pending_action: null,
  active: true,
  inserted_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};

const mockToken: WorkerToken = {
  id: 10,
  worker_id: 1,
  name: "deploy-token",
  last_used_at: null,
  active: true,
  inserted_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};

describe("workersSlice reducers", () => {
  it("has correct initial state", () => {
    const state = reducer(undefined, { type: "unknown" });
    expect(state.list).toEqual([]);
    expect(state.current).toBeNull();
    expect(state.metrics).toEqual([]);
    expect(state.tokens).toEqual([]);
    expect(state.loading).toBe(true);
    expect(state.error).toBeNull();
  });

  it("setCurrent sets the worker", () => {
    const state = reducer(undefined, setCurrent(mockWorker));
    expect(state.current).toEqual(mockWorker);
  });

  it("updateCurrent merges partial", () => {
    const withCurrent = reducer(undefined, setCurrent(mockWorker));
    const updated = reducer(withCurrent, updateCurrent({ name: "renamed" }));
    expect(updated.current?.name).toBe("renamed");
    expect(updated.current?.hostname).toBe("host-1");
  });

  it("updateCurrent does nothing without current", () => {
    const state = reducer(undefined, updateCurrent({ name: "renamed" }));
    expect(state.current).toBeNull();
  });

  it("addToken prepends", () => {
    const withToken = reducer(undefined, addToken(mockToken));
    expect(withToken.tokens).toHaveLength(1);
    const newToken = { ...mockToken, id: 11, name: "new-token" };
    const withTwo = reducer(withToken, addToken(newToken));
    expect(withTwo.tokens).toHaveLength(2);
    expect(withTwo.tokens[0].id).toBe(11);
  });

  it("removeToken filters by id", () => {
    const withToken = reducer(undefined, addToken(mockToken));
    const removed = reducer(withToken, removeToken(10));
    expect(removed.tokens).toHaveLength(0);
  });

  it("pushMetricsSnapshot caps at 100", () => {
    let state = reducer(undefined, { type: "unknown" });
    for (let i = 0; i < 105; i++) {
      state = reducer(
        state,
        pushMetricsSnapshot({ id: i } as WorkerMetrics),
      );
    }
    expect(state.metrics).toHaveLength(100);
    expect(state.metrics[0].id).toBe(104); // most recent first
  });
});

describe("workersSlice extraReducers", () => {
  it("fetchWorkers.fulfilled sets list and clears loading", () => {
    const action = {
      type: fetchWorkers.fulfilled.type,
      payload: [mockWorker],
    };
    const state = reducer(undefined, action);
    expect(state.list).toEqual([mockWorker]);
    expect(state.loading).toBe(false);
  });

  it("fetchWorkers.rejected sets error and clears loading", () => {
    const action = {
      type: fetchWorkers.rejected.type,
      error: { message: "Network error" },
    };
    const state = reducer(undefined, action);
    expect(state.error).toBe("Network error");
    expect(state.loading).toBe(false);
  });
});
