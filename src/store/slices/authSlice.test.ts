import { describe, it, expect } from "vitest";
import reducer, {
  setIsLogged,
  setUser,
  setIsLoading,
  selectIsLogged,
  selectUser,
  selectIsLoading,
} from "./authSlice";
import type { User } from "@/types";

const mockUser: User = {
  id: 1,
  email: "admin@example.com",
  name: "Admin",
  role: "admin",
  auth_type: "local",
  active: true,
  tokens_revoked_at: null,
  inserted_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};

describe("authSlice", () => {
  it("has correct initial state", () => {
    const state = reducer(undefined, { type: "unknown" });
    expect(state.is_logged).toBe(false);
    expect(state.is_loading).toBe(true);
    expect(state.user).toBeNull();
  });

  it("setIsLogged sets the flag", () => {
    const state = reducer(undefined, setIsLogged(true));
    expect(state.is_logged).toBe(true);
  });

  it("setUser sets the user", () => {
    const state = reducer(undefined, setUser(mockUser));
    expect(state.user).toEqual(mockUser);
  });

  it("setUser can clear user", () => {
    const withUser = reducer(undefined, setUser(mockUser));
    const cleared = reducer(withUser, setUser(null));
    expect(cleared.user).toBeNull();
  });

  it("setIsLoading clears loading", () => {
    const state = reducer(undefined, setIsLoading(false));
    expect(state.is_loading).toBe(false);
  });
});

describe("authSlice selectors", () => {
  const rootState = {
    auth: { is_logged: true, is_loading: false, user: mockUser },
  };

  it("selectIsLogged", () => {
    expect(selectIsLogged(rootState)).toBe(true);
  });

  it("selectUser", () => {
    expect(selectUser(rootState)).toEqual(mockUser);
  });

  it("selectIsLoading", () => {
    expect(selectIsLoading(rootState)).toBe(false);
  });
});
