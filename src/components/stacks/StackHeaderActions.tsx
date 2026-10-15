"use client";

import { useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
    faTriangleExclamation,
    faEllipsis,
    faDownload,
    faFileCode,
    faTrash,
} from "@fortawesome/free-solid-svg-icons";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { useConfirm } from "@/components/ui/confirm-modal";
import {
    reqRestartStack,
    reqStopStack,
    reqStartStack,
    reqExportStack,
} from "@/services/stacks.service";
import { reqCreateTemplateFromStack } from "@/services/templates.service";
import type { Stack, Container, StackBulkActionResult } from "@/types";

const plural = (n: number) => `${n} container${n === 1 ? "" : "s"}`;

/** Success toast for a stack-wide action, or a warning when some containers failed. */
const toastBulkResult = (verb: string, result: StackBulkActionResult) => {
    const failed = result.failed ?? 0;
    if (failed > 0) {
        toast(`${verb} ${plural(result.count)}, ${failed} failed`, {
            icon: <FontAwesomeIcon icon={faTriangleExclamation} className="text-warning" />,
        });
        return;
    }
    toast.success(`${verb} ${plural(result.count)}`);
};

interface StackHeaderActionsProps {
    stack: Stack;
    stackId: number;
    containers: Container[];
    workerOnline: boolean;
    deploying: boolean;
    hasPendingChanges: boolean;
    deleting: boolean;
    canEditUser: boolean;
    hasActiveDeployment: boolean;
    onDeploy: (containerIds?: number[], force?: boolean) => void;
    onCancelDeploy: () => void;
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
    hasActiveDeployment,
    onDeploy,
    onCancelDeploy,
    onEdit,
    onDelete,
}: StackHeaderActionsProps) {
    const showConfirm = useConfirm();
    const [forceDeployHovered, setForceDeployHovered] = useState(false);
    const [menuOpen, setMenuOpen] = useState(false);
    const [templateOpen, setTemplateOpen] = useState(false);
    const [templateName, setTemplateName] = useState("");
    const [templateDesc, setTemplateDesc] = useState("");
    const [savingTemplate, setSavingTemplate] = useState(false);
    const menuRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!menuOpen) return;
        const onDown = (e: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
        };
        const onKey = (e: KeyboardEvent) => e.key === "Escape" && setMenuOpen(false);
        document.addEventListener("mousedown", onDown);
        window.addEventListener("keydown", onKey);
        return () => {
            document.removeEventListener("mousedown", onDown);
            window.removeEventListener("keydown", onKey);
        };
    }, [menuOpen]);

    const exportStack = async () => {
        setMenuOpen(false);
        const res = await reqExportStack(stackId);
        if (!res.success) {
            toast.error(res.error_message || "Export failed");
            return;
        }
        const blob = new Blob([JSON.stringify(res.data, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${stack.name}-export.json`;
        a.click();
        URL.revokeObjectURL(url);
        toast.success("Stack exported");
    };

    const saveTemplate = async () => {
        setSavingTemplate(true);
        const res = await reqCreateTemplateFromStack(stackId, {
            name: templateName.trim(),
            description: templateDesc.trim() || undefined,
        });
        setSavingTemplate(false);
        if (res.success) {
            toast.success(`Saved "${templateName.trim()}" as a template`);
            setTemplateOpen(false);
        } else {
            toast.error(res.error_message || "Failed to save template");
        }
    };

    const runningCount = containers.filter((c) => c.status === "running").length;
    const stoppedCount = containers.filter((c) => c.status === "stopped").length;

    const isDeploying = deploying || stack.status === "deploying";
    const isStuckDeploying = isDeploying && !hasActiveDeployment && !deploying;
    const isFailed = stack.status === "failed";
    const needsDeploy = hasPendingChanges || isFailed;
    const showForce = !needsDeploy && !isDeploying;

    return (
        <div className="stack-header-actions">
            {canEditUser && isStuckDeploying ? (
                <Button
                    variant="warning"
                    onClick={onCancelDeploy}
                >
                    Cancel Deploy
                </Button>
            ) : canEditUser && (
                <>
                    <Button
                        onClick={() => onDeploy()}
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
                    {isFailed && (
                        <Button
                            variant="destructive"
                            onClick={async () => {
                                const ok = await showConfirm({
                                    title: "Force Redeploy",
                                    message: `This will stop and remove ALL containers in "${stack.name}" and recreate them from scratch. Use this after a failed deployment left containers in a bad state.`,
                                    confirmLabel: "Force Redeploy",
                                    variant: "danger",
                                });
                                if (!ok) return;
                                onDeploy(undefined, true);
                            }}
                            disabled={isDeploying || !workerOnline}
                        >
                            Force Redeploy
                        </Button>
                    )}
                </>
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
                            if (res.success) toastBulkResult("Restarted", res.data);
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
                            if (res.success) toastBulkResult("Stopped", res.data);
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
                            if (res.success) toastBulkResult("Started", res.data);
                            else toast.error(res.error_message || "Failed");
                        }}
                        disabled={!workerOnline || stoppedCount === 0}
                    >
                        Start All
                    </Button>
                </div>
            )}
            {canEditUser && (
                <Button variant="secondary" size="sm" onClick={onEdit}>
                    Edit
                </Button>
            )}
            {/* Export, Save as Template and Delete were three more loose ghost
                buttons in an already crowded row, with Delete one slip away from
                Edit. They live in an overflow menu now. */}
            <div className="relative" ref={menuRef}>
                <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => setMenuOpen((o) => !o)}
                    aria-label="More stack actions"
                    aria-haspopup="menu"
                    aria-expanded={menuOpen}
                    title="More actions"
                >
                    <FontAwesomeIcon icon={faEllipsis} className="h-3.5 w-3.5" />
                </Button>
                {menuOpen && (
                    <div
                        role="menu"
                        className="absolute right-0 top-full mt-1 z-30 w-48 rounded-lg border border-border-strong bg-background-alt p-1 shadow-lg"
                    >
                        <button
                            role="menuitem"
                            onClick={exportStack}
                            className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-secondary hover:bg-surface hover:text-primary cursor-pointer"
                        >
                            <FontAwesomeIcon icon={faDownload} className="h-3 w-3" />
                            Export JSON
                        </button>
                        {canEditUser && (
                            <button
                                role="menuitem"
                                onClick={() => {
                                    setMenuOpen(false);
                                    setTemplateName(`${stack.name} template`);
                                    setTemplateDesc(stack.description ?? "");
                                    setTemplateOpen(true);
                                }}
                                className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-secondary hover:bg-surface hover:text-primary cursor-pointer"
                            >
                                <FontAwesomeIcon icon={faFileCode} className="h-3 w-3" />
                                Save as template
                            </button>
                        )}
                        {canEditUser && (
                            <>
                                <div className="my-1 h-px bg-border-subtle" />
                                <button
                                    role="menuitem"
                                    onClick={() => {
                                        setMenuOpen(false);
                                        onDelete();
                                    }}
                                    disabled={deleting}
                                    className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-failed hover:bg-failed/10 cursor-pointer disabled:opacity-50"
                                >
                                    <FontAwesomeIcon icon={faTrash} className="h-3 w-3" />
                                    {deleting ? "Deleting…" : "Delete stack"}
                                </button>
                            </>
                        )}
                    </div>
                )}
            </div>

            {/* Replaces a window.prompt(), which can't be styled, can't take a
                description and blocks the whole tab. */}
            <Modal
                open={templateOpen}
                onClose={() => !savingTemplate && setTemplateOpen(false)}
                title="Save as template"
                description="Captures this stack's compose, containers and environment so new stacks can start from it."
                footer={
                    <>
                        <Button variant="ghost" size="sm" onClick={() => setTemplateOpen(false)} disabled={savingTemplate}>
                            Cancel
                        </Button>
                        <Button size="sm" loading={savingTemplate} disabled={!templateName.trim()} onClick={saveTemplate}>
                            Save template
                        </Button>
                    </>
                }
            >
                <div className="space-y-3">
                    <div>
                        <label className="form-label" htmlFor="tpl-name">Name</label>
                        <input
                            id="tpl-name"
                            className="form-input"
                            value={templateName}
                            onChange={(e) => setTemplateName(e.target.value)}
                        />
                    </div>
                    <div>
                        <label className="form-label" htmlFor="tpl-desc">Description</label>
                        <input
                            id="tpl-desc"
                            className="form-input"
                            value={templateDesc}
                            onChange={(e) => setTemplateDesc(e.target.value)}
                            placeholder="Optional"
                        />
                    </div>
                </div>
            </Modal>
        </div>
    );
}
