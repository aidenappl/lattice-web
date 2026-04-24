import { useState, useCallback } from "react";
import { useAdminSocket, AdminSocketEvent } from "./useAdminSocket";
import { deploymentProgressPercent } from "@/lib/deployment-progress";

export type DeploymentProgress = {
  status: string;
  step?: string;
  message?: string;
  percent: number;
  verifyCheck?: number;
  verifyTotal?: number;
  containerIndex?: number;
  containerTotal?: number;
};

/**
 * Subscribes to deployment_progress WebSocket events and maintains a map
 * of deploymentId -> progress state. Components consume this for real-time
 * deployment progress without each implementing their own WS logic.
 */
export function useDeploymentProgress(): Record<number, DeploymentProgress> {
  const [progress, setProgress] = useState<Record<number, DeploymentProgress>>(
    {},
  );

  const handleEvent = useCallback((event: AdminSocketEvent) => {
    if (event.type !== "deployment_progress" && event.type !== "deployment_status")
      return;

    const payload = event.payload ?? {};
    const depId = payload["deployment_id"] as number | undefined;
    if (!depId) return;

    const status = (payload["status"] as string) ?? "";
    const step = payload["step"] as string | undefined;
    const message = payload["message"] as string | undefined;
    const verifyCheck = payload["verify_check"] as number | undefined;
    const verifyTotal = payload["verify_total"] as number | undefined;
    const containerIndex = payload["container_index"] as number | undefined;
    const containerTotal = payload["container_total"] as number | undefined;

    const percent = deploymentProgressPercent(
      status,
      step,
      verifyCheck,
      verifyTotal,
      containerIndex,
      containerTotal,
    );

    setProgress((prev) => ({
      ...prev,
      [depId]: {
        status,
        step,
        message,
        percent,
        verifyCheck,
        verifyTotal,
        containerIndex,
        containerTotal,
      },
    }));
  }, []);

  useAdminSocket(handleEvent);

  return progress;
}
