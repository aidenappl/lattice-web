import { describe, it, expect } from "vitest";
import reducer, {
  setStackContainers,
  addStackContainer,
  fetchAllContainers,
} from "./containersSlice";
import type { Container } from "@/types";

const mockContainer: Container = {
  id: 1,
  stack_id: 1,
  name: "nginx",
  image: "nginx",
  tag: "latest",
  status: "running",
  port_mappings: null,
  env_vars: null,
  volumes: null,
  cpu_limit: null,
  memory_limit: null,
  replicas: 1,
  restart_policy: "always",
  command: null,
  entrypoint: null,
  health_check: null,
  health_status: "none",
  depends_on: null,
  registry_id: null,
  active: true,
  started_at: null,
  inserted_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};

describe("containersSlice reducers", () => {
  it("has correct initial state", () => {
    const state = reducer(undefined, { type: "unknown" });
    expect(state.list).toEqual([]);
    expect(state.stackContainers).toEqual([]);
    expect(state.loading).toBe(true);
    expect(state.error).toBeNull();
  });

  it("setStackContainers sets the list", () => {
    const state = reducer(undefined, setStackContainers([mockContainer]));
    expect(state.stackContainers).toEqual([mockContainer]);
  });

  it("setStackContainers replaces existing", () => {
    const withOne = reducer(undefined, setStackContainers([mockContainer]));
    const c2 = { ...mockContainer, id: 2, name: "redis" };
    const replaced = reducer(withOne, setStackContainers([c2]));
    expect(replaced.stackContainers).toHaveLength(1);
    expect(replaced.stackContainers[0].name).toBe("redis");
  });

  it("addStackContainer appends", () => {
    const withOne = reducer(undefined, setStackContainers([mockContainer]));
    const c2 = { ...mockContainer, id: 2, name: "redis" };
    const withTwo = reducer(withOne, addStackContainer(c2));
    expect(withTwo.stackContainers).toHaveLength(2);
    expect(withTwo.stackContainers[1].name).toBe("redis");
  });
});

describe("containersSlice extraReducers", () => {
  it("fetchAllContainers.fulfilled sets list", () => {
    const state = reducer(undefined, {
      type: fetchAllContainers.fulfilled.type,
      payload: [mockContainer],
    });
    expect(state.list).toEqual([mockContainer]);
    expect(state.loading).toBe(false);
  });

  it("fetchAllContainers.rejected sets error", () => {
    const state = reducer(undefined, {
      type: fetchAllContainers.rejected.type,
      error: { message: "Failed" },
    });
    expect(state.error).toBe("Failed");
    expect(state.loading).toBe(false);
  });
});
