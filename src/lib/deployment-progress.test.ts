import { describe, it, expect } from "vitest";
import { deploymentProgressPercent } from "./deployment-progress";

describe("deploymentProgressPercent", () => {
  it("pending → 0", () => {
    expect(deploymentProgressPercent("pending")).toBe(0);
  });

  it("approved → 5", () => {
    expect(deploymentProgressPercent("approved")).toBe(5);
  });

  it("sending → 10", () => {
    expect(deploymentProgressPercent("sending")).toBe(10);
  });

  // deploying without container info — step-based fallbacks
  it("deploying/pulling → 25", () => {
    expect(deploymentProgressPercent("deploying", "pulling")).toBe(25);
  });

  it("deploying/pulled → 40", () => {
    expect(deploymentProgressPercent("deploying", "pulled")).toBe(40);
  });

  it("deploying/starting → 55", () => {
    expect(deploymentProgressPercent("deploying", "starting")).toBe(55);
  });

  it("deploying/running → 70", () => {
    expect(deploymentProgressPercent("deploying", "running")).toBe(70);
  });

  it("deploying/network → 18", () => {
    expect(deploymentProgressPercent("deploying", "network")).toBe(18);
  });

  it("deploying/cleanup → 20", () => {
    expect(deploymentProgressPercent("deploying", "cleanup")).toBe(20);
  });

  it("deploying/unknown step → 30", () => {
    expect(deploymentProgressPercent("deploying", "other")).toBe(30);
  });

  // deploying with container progress
  it("deploying with container progress stays in 15-75 range", () => {
    const pct = deploymentProgressPercent(
      "deploying",
      "pulling",
      undefined,
      undefined,
      1,
      3,
    );
    expect(pct).toBeGreaterThanOrEqual(15);
    expect(pct).toBeLessThanOrEqual(75);
  });

  it("deploying last container running approaches 75", () => {
    const pct = deploymentProgressPercent(
      "deploying",
      "running",
      undefined,
      undefined,
      3,
      3,
    );
    expect(pct).toBe(75);
  });

  // validating
  it("validating without counts → 80", () => {
    expect(deploymentProgressPercent("validating")).toBe(80);
  });

  it("validating with counts in 75-95 range", () => {
    const pct = deploymentProgressPercent("validating", undefined, 3, 6);
    expect(pct).toBeGreaterThanOrEqual(75);
    expect(pct).toBeLessThanOrEqual(95);
  });

  it("validating complete → 95", () => {
    const pct = deploymentProgressPercent("validating", undefined, 6, 6);
    expect(pct).toBe(95);
  });

  // terminal states
  it("deployed → 100", () => {
    expect(deploymentProgressPercent("deployed")).toBe(100);
  });

  it("failed → 100", () => {
    expect(deploymentProgressPercent("failed")).toBe(100);
  });

  it("rolled_back → 100", () => {
    expect(deploymentProgressPercent("rolled_back")).toBe(100);
  });

  // unknown
  it("unknown status → 0", () => {
    expect(deploymentProgressPercent("unknown")).toBe(0);
  });
});
