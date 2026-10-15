"use client";

import { ReactNode, useEffect } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faXmark } from "@fortawesome/free-solid-svg-icons";
import { cn } from "@/lib/utils";

export interface BulkAction {
  label: string;
  icon?: Parameters<typeof FontAwesomeIcon>[0]["icon"];
  onClick: () => void;
  variant?: "default" | "danger";
  disabled?: boolean;
  /** Shown as a tooltip — say why it is disabled, not just that it is. */
  title?: string;
  hidden?: boolean;
}

/**
 * The floating bar that appears once at least one row is selected.
 *
 * It floats over the bottom of the content area instead of sitting above the
 * table so that selecting a row never shifts the table under the cursor, and
 * so the actions stay reachable after scrolling down a long list.
 */
export function BulkActionBar({
  count,
  noun,
  nounPlural,
  actions,
  onClear,
  busy,
  children,
}: {
  count: number;
  noun: string;
  nounPlural?: string;
  actions: BulkAction[];
  onClear: () => void;
  /** Label of the action in flight; disables the bar while it runs. */
  busy?: string | null;
  children?: ReactNode;
}) {
  // Escape clears the selection — but only when no dialog is open, since the
  // confirm modal also listens for Escape and must win.
  useEffect(() => {
    if (count === 0) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (document.querySelector('[role="dialog"]')) return;
      onClear();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [count, onClear]);

  if (count === 0) return null;

  return (
    <div className="bulk-bar" role="toolbar" aria-label="Bulk actions">
      <span className="bulk-bar-count">
        <strong>{count}</strong>{" "}
        {count === 1 ? noun : (nounPlural ?? `${noun}s`)} selected
      </span>
      <span className="bulk-bar-sep" aria-hidden />
      <div className="flex items-center gap-1 flex-wrap">
        {actions
          .filter((a) => !a.hidden)
          .map((a) => (
            <button
              key={a.label}
              type="button"
              onClick={a.onClick}
              disabled={a.disabled || !!busy}
              title={a.title}
              className={cn(
                "bulk-bar-btn",
                a.variant === "danger" && "bulk-bar-btn-danger",
              )}
            >
              {a.icon && <FontAwesomeIcon icon={a.icon} className="h-3 w-3" />}
              {busy === a.label ? `${a.label}…` : a.label}
            </button>
          ))}
        {children}
      </div>
      <span className="bulk-bar-sep" aria-hidden />
      <button
        type="button"
        onClick={onClear}
        className="bulk-bar-btn"
        aria-label="Clear selection"
        title="Clear selection (Esc)"
      >
        <FontAwesomeIcon icon={faXmark} className="h-3 w-3" />
      </button>
    </div>
  );
}
