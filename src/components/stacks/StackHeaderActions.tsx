"use client";

import { useState } from "react";
import toast from "react-hot-toast";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm-modal";
import {
    reqRestartStack,
    reqStopStack,
    reqStartStack,
    reqExportStack,
} from "@/services/stacks.service";
import { reqCreateTemplateFromStack } from "@/services/templates.service";
import type { Stack, Container } from "@/types";

interface StackHeaderActionsProps {
    stack: Stack;
    stackId: number;
    containers: Container[];
    workerOnline: boolean;
    deploying: boolean;
    hasPendingChanges: boolean;
    deleting: boolean;
    canEditUser: boolean;
    onDeploy: () => void;
    onEdit: () => void;
    onDelete: () => void;
}

export function StackHeaderActions({
    stack,
    stackId,
    containers,
    workerOnline,
    deploying,
    hasPendingChanges,
    deleting,
    canEditUser,
    onDeploy,
    onEdit,
    onDelete,
}: StackHeaderActionsProps) {
    const showConfirm = useConfirm();
    const [forceDeployHovered, setForceDeployHovered] = useState(false);

    const runningCount = containers.filter((c) => c.status === "running").length;
    const stoppedCount = containers.filter((c) => c.status === "stopped").length;

    const isDeploying = deploying || stack.status === "deploying";
    const isFailed = stack.status === "failed";
    const needsDeploy = hasPendingChanges || isFailed;
    const showForce = !needsDeploy && !isDeploying;

    return (
        <div className="stack-header-actions">
            {canEditUser && (
                <Button
                    onClick={onDeploy}
                    disabled={isDeploying || !workerOnline}
                    title={
                        !workerOnline
                            ? "Worker is offline -- cannot deploy"
                            : undefined
                    }
                    onMouseEnter={() => showForce && setForceDeployHovered(true)}
                    onMouseLeave={() => setForceDeployHovered(false)}
                    className={
                        showForce
                            ? "opacity-50 hover:opacity-80 transition-opacity"
                            : ""
                    }
                >
                    {isDeploying
                        ? "Deploying..."
                        : forceDeployHovered
                            ? "Force Re-deploy"
                            : isFailed
                                ? "Redeploy"
                                : needsDeploy
                                    ? "Deploy"
                                    : "Re-deploy"}
                </Button>
            )}
            {canEditUser && (
                <div className="flex items-center gap-1">
                    <Button
                        variant="secondary"
                        size="sm"
                        onClick={async () => {
                            const ok = await showConfirm({
                                title: "Restart all containers",
                                message: `Restart all running containers in "${stack.name}"?`,
                                confirmLabel: "Restart All",
                                variant: "warning",
                            });
                            if (!ok) return;
                            const res = await reqRestartStack(stackId);
                            if (res.success)
                                toast.success(
                                    `Restarted ${res.data.restarted} containers`,
                                );
                            else toast.error(res.error_message || "Failed");
                        }}
                        disabled={!workerOnline || runningCount === 0}
                    >
                        Restart All
                    </Button>
                    <Button
                        variant="secondary"
                        size="sm"
                        onClick={async () => {
                            const ok = await showConfirm({
                                title: "Stop all containers",
                                message: `Stop all running containers in "${stack.name}"?`,
                                confirmLabel: "Stop All",
                                variant: "warning",
                            });
                            if (!ok) return;
                            const res = await reqStopStack(stackId);
                            if (res.success)
                                toast.success(
                                    `Stopped ${res.data.stopped} containers`,
                                );
                            else toast.error(res.error_message || "Failed");
                        }}
                        disabled={!workerOnline || runningCount === 0}
                    >
                        Stop All
                    </Button>
                    <Button
                        variant="secondary"
                        size="sm"
                        onClick={async () => {
                            const res = await reqStartStack(stackId);
                            if (res.success)
                                toast.success(
                                    `Started ${res.data.started} containers`,
                                );
                            else toast.error(res.error_message || "Failed");
                        }}
                        disabled={!workerOnline || stoppedCount === 0}
                    >
                        Start All
                    </Button>
                </div>
            )}
            <Button
                variant="ghost"
                size="sm"
                onClick={async () => {
                    const res = await reqExportStack(stackId);
                    if (res.success) {
                        const blob = new Blob(
                            [JSON.stringify(res.data, null, 2)],
                            { type: "application/json" },
                        );
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement("a");
                        a.href = url;
                        a.download = `${stack.name}-export.json`;
                        a.click();
                        URL.revokeObjectURL(url);
                        toast.success("Stack exported");
                    }
                }}
            >
                Export
            </Button>
            {canEditUser && (
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={async () => {
                        const templateName = window.prompt(
                            "Template name:",
                            `${stack.name} template`,
                        );
                        if (!templateName) return;
                        const res = await reqCreateTemplateFromStack(stackId, {
                            name: templateName,
                        });
                        if (res.success) {
                            toast.success("Saved as template");
                        } else {
                            toast.error(
                                res.error_message || "Failed to save template",
                            );
                        }
                    }}
                >
                    Save as Template
                </Button>
            )}
            {canEditUser && (
                <Button variant="ghost" size="sm" onClick={onEdit}>
                    Edit
                </Button>
            )}
            {canEditUser && (
                <Button
                    variant="destructive"
                    size="sm"
                    onClick={onDelete}
                    disabled={deleting}
                >
                    {deleting ? "..." : "Delete"}
                </Button>
            )}
        </div>
    );
}
