"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

export interface CheckboxProps {
  checked: boolean;
  /** Renders the "some but not all" dash; used by select-all headers. */
  indeterminate?: boolean;
  onChange: (
    checked: boolean,
    e: React.MouseEvent | React.KeyboardEvent,
  ) => void;
  /**
   * Accessible name — required. A bare checkbox in a table row is announced as
   * "checkbox, not checked" with nothing to say which row it selects.
   */
  label: string;
  disabled?: boolean;
  className?: string;
}

/**
 * A real `<input type="checkbox">`, restyled, so it keeps native keyboard
 * behaviour (Space toggles) and screen-reader semantics. The click handler is
 * on the input rather than a wrapper so a click never also lands on the row
 * underneath — rows navigate on click.
 */
export function Checkbox({
  checked,
  indeterminate = false,
  onChange,
  label,
  disabled,
  className,
}: CheckboxProps) {
  const ref = useRef<HTMLInputElement>(null);

  // `indeterminate` is a DOM property with no HTML attribute; it can only be set
  // imperatively.
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = indeterminate;
  }, [indeterminate]);

  return (
    <input
      ref={ref}
      type="checkbox"
      aria-label={label}
      title={label}
      checked={checked}
      disabled={disabled}
      onClick={(e) => {
        e.stopPropagation();
        onChange(!checked, e);
      }}
      onKeyDown={(e) => {
        if (e.key === " " || e.key === "Enter") {
          e.preventDefault();
          e.stopPropagation();
          onChange(!checked, e);
        }
      }}
      // Controlled through onClick so the shift key is available; React needs an
      // onChange on a controlled input or it warns.
      onChange={() => {}}
      className={cn("lt-checkbox", className)}
    />
  );
}
