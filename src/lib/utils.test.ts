import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { Worker, User } from "@/types";
import {
  isNewerVersion,
  cn,
  timeAgo,
  isWorkerOnline,
  workerStaleReason,
  formatDisk,
  formatBytes,
  formatUptime,
  parseJSON,
  parsePortMappings,
  parseEnvVars,
  parseVolumes,
  formatTestCommand,
  prettyField,
  isAdmin,
  canEdit,
  barColor,
  sparkColor,
} from "./utils";

// ── isNewerVersion ──────────────────────────────────────────────────

describe("isNewerVersion", () => {
  it("returns true when latest is newer (patch)", () => {
    expect(isNewerVersion("1.0.0", "1.0.1")).toBe(true);
  });
  it("returns false when current is newer", () => {
    expect(isNewerVersion("1.0.1", "1.0.0")).toBe(false);
  });
  it("returns false when equal", () => {
    expect(isNewerVersion("1.0.0", "1.0.0")).toBe(false);
  });
  it("strips v prefix", () => {
    expect(isNewerVersion("v1.0.0", "v2.0.0")).toBe(true);
  });
  it("compares numerically not lexicographically", () => {
    expect(isNewerVersion("1.9.0", "1.10.0")).toBe(true);
  });
  it("handles major bump", () => {
    expect(isNewerVersion("0.9.9", "1.0.0")).toBe(true);
  });
  it("handles minor bump", () => {
    expect(isNewerVersion("2.3.0", "2.4.0")).toBe(true);
  });
});

// ── cn ──────────────────────────────────────────────────────────────

describe("cn", () => {
  it("merges classes", () => {
    expect(cn("a", "b")).toBe("a b");
  });
  it("filters falsy values", () => {
    expect(cn("a", false, undefined, null, "b")).toBe("a b");
  });
  it("handles single class", () => {
    expect(cn("a")).toBe("a");
  });
  it("handles all falsy", () => {
    expect(cn(false, null, undefined)).toBe("");
  });
});

// ── timeAgo ─────────────────────────────────────────────────────────

describe("timeAgo", () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it("returns 'just now' for <60s", () => {
    const now = new Date("2026-01-01T00:00:30Z");
    vi.setSystemTime(now);
    expect(timeAgo("2026-01-01T00:00:00Z")).toBe("just now");
  });
  it("returns minutes", () => {
    const now = new Date("2026-01-01T00:05:00Z");
    vi.setSystemTime(now);
    expect(timeAgo("2026-01-01T00:00:00Z")).toBe("5m ago");
  });
  it("returns hours", () => {
    const now = new Date("2026-01-01T03:00:00Z");
    vi.setSystemTime(now);
    expect(timeAgo("2026-01-01T00:00:00Z")).toBe("3h ago");
  });
  it("returns days", () => {
    const now = new Date("2026-01-03T00:00:00Z");
    vi.setSystemTime(now);
    expect(timeAgo("2026-01-01T00:00:00Z")).toBe("2d ago");
  });
});

// ── isWorkerOnline ──────────────────────────────────────────────────

describe("isWorkerOnline", () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  const makeWorker = (overrides: Partial<Worker>): Worker => ({
    id: 1,
    name: "w1",
    hostname: "host",
    ip_address: null,
    status: "online",
    os: null,
    arch: null,
    docker_version: null,
    runner_version: null,
    last_heartbeat_at: null,
    labels: null,
    pending_action: null,
    active: true,
    inserted_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  });

  it("returns true for online with recent heartbeat", () => {
    vi.setSystemTime(new Date("2026-01-01T00:01:00Z"));
    const w = makeWorker({
      status: "online",
      last_heartbeat_at: "2026-01-01T00:00:30Z",
    });
    expect(isWorkerOnline(w)).toBe(true);
  });

  it("returns false for offline", () => {
    vi.setSystemTime(new Date("2026-01-01T00:01:00Z"));
    const w = makeWorker({
      status: "offline",
      last_heartbeat_at: "2026-01-01T00:00:30Z",
    });
    expect(isWorkerOnline(w)).toBe(false);
  });

  it("returns false for stale heartbeat (>90s)", () => {
    vi.setSystemTime(new Date("2026-01-01T00:02:00Z"));
    const w = makeWorker({
      status: "online",
      last_heartbeat_at: "2026-01-01T00:00:00Z",
    });
    expect(isWorkerOnline(w)).toBe(false);
  });

  it("returns false for null heartbeat", () => {
    vi.setSystemTime(new Date("2026-01-01T00:01:00Z"));
    const w = makeWorker({ status: "online", last_heartbeat_at: null });
    expect(isWorkerOnline(w)).toBe(false);
  });
});

// ── workerStaleReason ───────────────────────────────────────────────

describe("workerStaleReason", () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  const makeWorker = (overrides: Partial<Worker>): Worker => ({
    id: 1, name: "w1", hostname: "host", ip_address: null,
    status: "online", os: null, arch: null, docker_version: null,
    runner_version: null, last_heartbeat_at: null, labels: null,
    pending_action: null, active: true,
    inserted_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  });

  it("returns offline message", () => {
    const w = makeWorker({ status: "offline" });
    expect(workerStaleReason(w)).toBe("Worker is offline");
  });

  it("returns no heartbeat message", () => {
    const w = makeWorker({ status: "online", last_heartbeat_at: null });
    expect(workerStaleReason(w)).toBe("No heartbeat received");
  });

  it("returns stale heartbeat message", () => {
    vi.setSystemTime(new Date("2026-01-01T00:02:00Z"));
    const w = makeWorker({
      status: "online",
      last_heartbeat_at: "2026-01-01T00:00:00Z",
    });
    const reason = workerStaleReason(w);
    expect(reason).toContain("No heartbeat for");
  });

  it("returns null for healthy worker", () => {
    vi.setSystemTime(new Date("2026-01-01T00:00:30Z"));
    const w = makeWorker({
      status: "online",
      last_heartbeat_at: "2026-01-01T00:00:00Z",
    });
    expect(workerStaleReason(w)).toBeNull();
  });
});

// ── formatDisk ──────────────────────────────────────────────────────

describe("formatDisk", () => {
  it("formats MB", () => {
    expect(formatDisk(500, 1000)).toBe("500 / 1000 MB");
  });
  it("formats GB when >=1024", () => {
    expect(formatDisk(2048, 4096)).toBe("2.0 / 4.0 GB");
  });
});

// ── formatBytes ─────────────────────────────────────────────────────

describe("formatBytes", () => {
  it("formats bytes", () => {
    expect(formatBytes(500)).toBe("500 B");
  });
  it("formats KB", () => {
    expect(formatBytes(1024)).toBe("1 KB");
  });
  it("formats MB", () => {
    expect(formatBytes(1048576)).toBe("1.0 MB");
  });
  it("formats GB", () => {
    expect(formatBytes(1073741824)).toBe("1.00 GB");
  });
});

// ── formatUptime ────────────────────────────────────────────────────

describe("formatUptime", () => {
  it("formats minutes only", () => {
    expect(formatUptime(59)).toBe("0m");
  });
  it("formats hours and minutes", () => {
    expect(formatUptime(3660)).toBe("1h 1m");
  });
  it("formats days and hours", () => {
    expect(formatUptime(90000)).toBe("1d 1h");
  });
});

// ── parseJSON ───────────────────────────────────────────────────────

describe("parseJSON", () => {
  it("returns null for null", () => {
    expect(parseJSON(null)).toBeNull();
  });
  it("returns null for empty string", () => {
    expect(parseJSON("")).toBeNull();
  });
  it("parses valid JSON", () => {
    expect(parseJSON('{"a":1}')).toEqual({ a: 1 });
  });
  it("returns null for invalid JSON", () => {
    expect(parseJSON("not json")).toBeNull();
  });
});

// ── parsePortMappings ───────────────────────────────────────────────

describe("parsePortMappings", () => {
  it("returns [] for null", () => {
    expect(parsePortMappings(null)).toEqual([]);
  });
  it("parses valid JSON array", () => {
    const raw = JSON.stringify([{ host_port: "80", container_port: "8080" }]);
    expect(parsePortMappings(raw)).toEqual([
      { host_port: "80", container_port: "8080" },
    ]);
  });
  it("returns [] for invalid JSON", () => {
    expect(parsePortMappings("not json")).toEqual([]);
  });
});

// ── parseEnvVars ────────────────────────────────────────────────────

describe("parseEnvVars", () => {
  it("returns {} for null", () => {
    expect(parseEnvVars(null)).toEqual({});
  });
  it("parses valid JSON object", () => {
    expect(parseEnvVars('{"KEY":"value"}')).toEqual({ KEY: "value" });
  });
});

// ── parseVolumes ────────────────────────────────────────────────────

describe("parseVolumes", () => {
  it("returns [] for null", () => {
    expect(parseVolumes(null)).toEqual([]);
  });
  it("returns array format as-is", () => {
    const raw = JSON.stringify([{ host: "/data", container: "/app" }]);
    expect(parseVolumes(raw)).toEqual([{ host: "/data", container: "/app" }]);
  });
  it("converts object format to array", () => {
    const raw = JSON.stringify({ "/host": "/container" });
    expect(parseVolumes(raw)).toEqual([
      { host: "/host", container: "/container" },
    ]);
  });
});

// ── formatTestCommand ───────────────────────────────────────────────

describe("formatTestCommand", () => {
  it("returns empty for undefined", () => {
    expect(formatTestCommand(undefined)).toBe("");
  });
  it("returns string as-is", () => {
    expect(formatTestCommand("curl localhost")).toBe("curl localhost");
  });
  it("extracts CMD-SHELL command", () => {
    expect(formatTestCommand(["CMD-SHELL", "curl localhost"])).toBe(
      "curl localhost",
    );
  });
  it("joins CMD args", () => {
    expect(formatTestCommand(["CMD", "curl", "localhost"])).toBe(
      "curl localhost",
    );
  });
});

// ── prettyField ─────────────────────────────────────────────────────

describe("prettyField", () => {
  it("returns empty for null", () => {
    expect(prettyField(null)).toBe("");
  });
  it("joins arrays", () => {
    expect(prettyField('["a","b"]')).toBe("a b");
  });
  it("formats objects", () => {
    expect(prettyField('{"key":"val"}')).toBe('{\n  "key": "val"\n}');
  });
  it("returns plain string for non-JSON", () => {
    expect(prettyField("hello")).toBe("hello");
  });
});

// ── role checks ─────────────────────────────────────────────────────

describe("isAdmin", () => {
  it("returns false for null", () => {
    expect(isAdmin(null)).toBe(false);
  });
  it("returns true for admin", () => {
    expect(isAdmin({ role: "admin" } as User)).toBe(true);
  });
  it("returns false for viewer", () => {
    expect(isAdmin({ role: "viewer" } as User)).toBe(false);
  });
  it("returns false for editor", () => {
    expect(isAdmin({ role: "editor" } as User)).toBe(false);
  });
});

describe("canEdit", () => {
  it("returns false for null", () => {
    expect(canEdit(null)).toBe(false);
  });
  it("returns true for admin", () => {
    expect(canEdit({ role: "admin" } as User)).toBe(true);
  });
  it("returns true for editor", () => {
    expect(canEdit({ role: "editor" } as User)).toBe(true);
  });
  it("returns false for viewer", () => {
    expect(canEdit({ role: "viewer" } as User)).toBe(false);
  });
});

// ── barColor / sparkColor ───────────────────────────────────────────

describe("barColor", () => {
  it("returns failed for >90", () => {
    expect(barColor(95)).toBe("bg-failed");
  });
  it("returns yellow for >70", () => {
    expect(barColor(75)).toBe("bg-[#eab308]");
  });
  it("returns info for <=70", () => {
    expect(barColor(50)).toBe("bg-info");
  });
});

describe("sparkColor", () => {
  it("returns red for >90", () => {
    expect(sparkColor(95)).toBe("#ef4444");
  });
  it("returns yellow for >70", () => {
    expect(sparkColor(75)).toBe("#eab308");
  });
  it("returns blue for <=70", () => {
    expect(sparkColor(50)).toBe("#3b82f6");
  });
});
