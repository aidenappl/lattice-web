/**
 * Maps deployment status + step metadata to a progress percentage (0-100).
 * Modeled after RunnerUpgradePanel.progressPercent().
 */
export function deploymentProgressPercent(
  status: string,
  step?: string,
  verifyCheck?: number,
  verifyTotal?: number,
  containerIndex?: number,
  containerTotal?: number,
): number {
  switch (status) {
    case "pending":
      return 0;
    case "approved":
      return 5;
    case "sending":
      return 10;
    case "deploying": {
      // 15-75 range, subdivided by container progress
      const base = 15;
      const range = 60;
      if (!containerTotal || containerTotal <= 0) {
        if (step === "pulling") return 25;
        if (step === "pulled") return 40;
        if (step === "starting") return 55;
        if (step === "running") return 70;
        if (step === "network" || step === "volume") return 18;
        if (step === "cleanup") return 20;
        return 30;
      }
      const idx = (containerIndex ?? 1) - 1;
      const perContainer = range / containerTotal;
      const stepOffset =
        step === "pulling"
          ? 0.1
          : step === "pulled"
            ? 0.4
            : step === "starting"
              ? 0.6
              : step === "running"
                ? 1.0
                : 0.5;
      return Math.min(Math.round(base + (idx + stepOffset) * perContainer), 75);
    }
    case "validating": {
      // 75-95 range
      if (verifyCheck && verifyTotal && verifyTotal > 0) {
        return Math.round(75 + (verifyCheck / verifyTotal) * 20);
      }
      return 80;
    }
    case "deployed":
      return 100;
    case "failed":
    case "rolled_back":
      return 100;
    default:
      return 0;
  }
}
