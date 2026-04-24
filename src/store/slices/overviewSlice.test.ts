import { describe, it, expect } from "vitest";
import reducer, {
  updateOverviewField,
  incrementOverviewField,
  pushFleetHistoryPoint,
  fetchOverview,
} from "./overviewSlice";
import type { OverviewData, FleetMetricsPoint } from "@/types";

const mockOverview: OverviewData = {
  total_workers: 3,
  online_workers: 2,
  total_stacks: 5,
  active_stacks: 4,
  deploying_stacks: 0,
  failed_stacks: 1,
  total_containers: 10,
  running_containers: 8,
  recent_deployments: null,
  recent_deployment_count: 0,
  fleet_cpu_avg: 25.5,
  fleet_memory_avg: 60.0,
  fleet_container_count: 10,
  fleet_running_count: 8,
  worker_metrics: null,
};

const mockPoint: FleetMetricsPoint = {
  timestamp: "2026-01-01T00:00:00Z",
  cpu_avg: 30,
  memory_avg: 55,
  network_rx_rate: 100,
  network_tx_rate: 50,
  container_count: 10,
  running_count: 8,
  online_workers: 2,
};

describe("overviewSlice reducers", () => {
  it("has correct initial state", () => {
    const state = reducer(undefined, { type: "unknown" });
    expect(state.data).toBeNull();
    expect(state.fleetHistory).toEqual([]);
    expect(state.auditLog).toEqual([]);
    expect(state.loading).toBe(true);
  });

  it("updateOverviewField merges data", () => {
    const withData = reducer(undefined, {
      type: fetchOverview.fulfilled.type,
      payload: mockOverview,
    });
    const updated = reducer(
      withData,
      updateOverviewField({ online_workers: 3 }),
    );
    expect(updated.data?.online_workers).toBe(3);
    expect(updated.data?.total_workers).toBe(3); // unchanged
  });

  it("updateOverviewField does nothing without data", () => {
    const state = reducer(
      undefined,
      updateOverviewField({ online_workers: 3 }),
    );
    expect(state.data).toBeNull();
  });

  it("incrementOverviewField increments", () => {
    const withData = reducer(undefined, {
      type: fetchOverview.fulfilled.type,
      payload: mockOverview,
    });
    const incremented = reducer(
      withData,
      incrementOverviewField({ field: "running_containers", delta: 1 }),
    );
    expect(incremented.data?.running_containers).toBe(9);
  });

  it("incrementOverviewField clamps at 0", () => {
    const withData = reducer(undefined, {
      type: fetchOverview.fulfilled.type,
      payload: { ...mockOverview, running_containers: 0 },
    });
    const decremented = reducer(
      withData,
      incrementOverviewField({ field: "running_containers", delta: -1 }),
    );
    expect(decremented.data?.running_containers).toBe(0);
  });

  it("pushFleetHistoryPoint appends", () => {
    let state = reducer(undefined, { type: "unknown" });
    state = reducer(state, pushFleetHistoryPoint(mockPoint));
    expect(state.fleetHistory).toHaveLength(1);
  });

  it("pushFleetHistoryPoint caps at 300", () => {
    let state = reducer(undefined, { type: "unknown" });
    for (let i = 0; i < 310; i++) {
      state = reducer(
        state,
        pushFleetHistoryPoint({ ...mockPoint, cpu_avg: i }),
      );
    }
    expect(state.fleetHistory).toHaveLength(300);
    // Most recent should be last (slice keeps last 299 + new)
    expect(state.fleetHistory[299].cpu_avg).toBe(309);
  });
});

describe("overviewSlice extraReducers", () => {
  it("fetchOverview.fulfilled sets data", () => {
    const state = reducer(undefined, {
      type: fetchOverview.fulfilled.type,
      payload: mockOverview,
    });
    expect(state.data).toEqual(mockOverview);
    expect(state.loading).toBe(false);
  });

  it("fetchOverview.rejected sets error", () => {
    const state = reducer(undefined, {
      type: fetchOverview.rejected.type,
      error: { message: "Failed" },
    });
    expect(state.error).toBe("Failed");
    expect(state.loading).toBe(false);
  });
});
