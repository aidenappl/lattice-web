"use client";

import { cn } from "@/lib/utils";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faXmark } from "@fortawesome/free-solid-svg-icons";

type AlertVariant = "error" | "warning" | "info" | "success";

const variants: Record<
  AlertVariant,
  { container: string; icon: string; dot: string }
> = {
  error: {
    container: "border-[#ef4444]/20 bg-[#ef4444]/5",
    icon: "text-[#ef4444]",
    dot: "bg-[#ef4444]",
  },
  warning: {
    container: "border-[#f59e0b]/20 bg-[#f59e0b]/5",
    icon: "text-[#f59e0b]",
    dot: "bg-[#f59e0b]",
  },
  info: {
    container: "border-[#3b82f6]/20 bg-[#3b82f6]/5",
    icon: "text-[#3b82f6]",
    dot: "bg-[#3b82f6]",
  },
  success: {
    container: "border-[#22c55e]/20 bg-[#22c55e]/5",
    icon: "text-[#22c55e]",
    dot: "bg-[#22c55e]",
  },
};

interface AlertProps {
  variant?: AlertVariant;
  children: React.ReactNode;
  className?: string;
  onDismiss?: () => void;
}

export function Alert({
  variant = "info",
  children,
  className,
  onDismiss,
}: AlertProps) {
  const v = variants[variant];
  return (
    <div
      className={cn(
        "flex items-start gap-2.5 rounded-lg border px-3.5 py-2.5 text-sm",
        v.container,
        className,
      )}
    >
      <span className={cn("mt-0.5 h-2 w-2 rounded-full shrink-0", v.dot)} />
      <span className="text-subtle flex-1 text-xs leading-relaxed">
        {children}
      </span>
      {onDismiss && (
        <button
          onClick={onDismiss}
          className="text-muted hover:text-primary transition-colors shrink-0"
        >
          <FontAwesomeIcon icon={faXmark} className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}
