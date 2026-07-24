"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faEllipsisVertical } from "@fortawesome/free-solid-svg-icons";
import { Button } from "@/components/ui/button";
import { isAdmin, canEdit } from "@/lib/utils";
import type { Worker, User } from "@/types";

interface WorkerHeaderActionsProps {
    worker: Worker;
    user: User | null;
    actionLoading: string | null;
    deleteLoading: boolean;
    onWorkerAction: (action: string) => void;
    onDeleteWorker: () => void;
    onEdit: () => void;
}

export function WorkerHeaderActions({
    worker,
    user,
    actionLoading,
    deleteLoading,
    onWorkerAction,
    onDeleteWorker,
    onEdit,
}: WorkerHeaderActionsProps) {
    const [actionsOpen, setActionsOpen] = useState(false);
    const menuRef = useRef<HTMLDivElement>(null);
    const triggerRef = useRef<HTMLButtonElement>(null);

    // Move focus to the first item when the menu opens.
    useEffect(() => {
        if (!actionsOpen) return;
        const items = menuRef.current?.querySelectorAll<HTMLButtonElement>(
            '[role="menuitem"]:not([disabled])',
        );
        items?.[0]?.focus();
    }, [actionsOpen]);

    const handleMenuKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
        const items = Array.from(
            menuRef.current?.querySelectorAll<HTMLButtonElement>(
                '[role="menuitem"]:not([disabled])',
            ) ?? [],
        );
        if (items.length === 0) return;
        const currentIndex = items.indexOf(
            document.activeElement as HTMLButtonElement,
        );
        switch (e.key) {
            case "ArrowDown":
                e.preventDefault();
                items[(currentIndex + 1) % items.length]?.focus();
                break;
            case "ArrowUp":
                e.preventDefault();
                items[
                    (currentIndex - 1 + items.length) % items.length
                ]?.focus();
                break;
            case "Home":
                e.preventDefault();
                items[0]?.focus();
                break;
            case "End":
                e.preventDefault();
                items[items.length - 1]?.focus();
                break;
            case "Escape":
                e.preventDefault();
                setActionsOpen(false);
                triggerRef.current?.focus();
                break;
        }
    };

    return (
        <div className="flex items-center gap-2 flex-shrink-0 flex-wrap relative">
            <Link href={`/workers/${worker.id}/metrics`}>
                <Button variant="secondary" size="sm">
                    Full Metrics
                </Button>
            </Link>
            {canEdit(user) && (
                <Button variant="secondary" size="sm" onClick={onEdit}>
                    Edit
                </Button>
            )}
            {canEdit(user) && (
                <div className="relative">
                    <button
                        ref={triggerRef}
                        className="icon-btn"
                        aria-label="Worker actions menu"
                        aria-haspopup="menu"
                        aria-expanded={actionsOpen}
                        onClick={() => setActionsOpen(!actionsOpen)}
                    >
                        <FontAwesomeIcon
                            icon={faEllipsisVertical}
                            className="h-4 w-4"
                        />
                    </button>
                    {actionsOpen && (
                        <>
                            <div
                                className="fixed inset-0 z-20"
                                onClick={() => setActionsOpen(false)}
                            />
                            <div
                                ref={menuRef}
                                role="menu"
                                aria-label="Worker actions"
                                className="menu right-0 top-9"
                                onKeyDown={handleMenuKeyDown}
                            >
                                {worker.status === "online" && (
                                    <>
                                        <button
                                            role="menuitem"
                                            className="menu-item w-full text-left"
                                            onClick={() => {
                                                setActionsOpen(false);
                                                onWorkerAction("start-all");
                                            }}
                                            disabled={!!actionLoading}
                                        >
                                            Start All Containers
                                        </button>
                                        <button
                                            role="menuitem"
                                            className="menu-item w-full text-left"
                                            onClick={() => {
                                                setActionsOpen(false);
                                                onWorkerAction("stop-all");
                                            }}
                                            disabled={!!actionLoading}
                                        >
                                            Stop All Containers
                                        </button>
                                        {isAdmin(user) && (
                                            <button
                                                role="menuitem"
                                                className="menu-item w-full text-left"
                                                onClick={() => {
                                                    setActionsOpen(false);
                                                    onWorkerAction("upgrade");
                                                }}
                                                disabled={!!actionLoading}
                                            >
                                                Upgrade Runner
                                            </button>
                                        )}
                                        {isAdmin(user) && (
                                            <button
                                                role="menuitem"
                                                className="menu-item w-full text-left text-failed"
                                                onClick={() => {
                                                    setActionsOpen(false);
                                                    onWorkerAction("reboot");
                                                }}
                                                disabled={!!actionLoading}
                                            >
                                                Reboot OS
                                            </button>
                                        )}
                                        <div className="border-t border-border my-1" />
                                    </>
                                )}
                                <button
                                    role="menuitem"
                                    className="menu-item w-full text-left text-failed"
                                    onClick={() => {
                                        setActionsOpen(false);
                                        onDeleteWorker();
                                    }}
                                    disabled={deleteLoading}
                                >
                                    {deleteLoading ? "Deleting..." : "Delete Worker"}
                                </button>
                            </div>
                        </>
                    )}
                </div>
            )}
        </div>
    );
}
