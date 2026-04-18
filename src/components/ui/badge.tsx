import { cn } from "@/lib/utils";

interface BadgeProps {
  variant?: "default" | "success" | "warning" | "error";
  children: React.ReactNode;
  className?: string;
}

export function Badge({
  variant = "default",
  children,
  className,
}: BadgeProps) {
  const variants = {
    default: "text-[#888888]",
    success: "text-[#22c55e]",
    warning: "text-[#eab308]",
    error: "text-[#ef4444]",
  };

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 text-xs font-medium",
        variants[variant],
        className,
      )}
    >
      {children}
    </span>
  );
}

type StatusType =
  | "online" | "offline" | "maintenance"
  | "running" | "stopped" | "error" | "pending"
  | "active" | "deploying"
  | "deployed" | "failed" | "rolled_back" | "approved";

const statusVariantMap: Record<StatusType, "success" | "error" | "warning" | "default"> = {
  online: "success",
  running: "success",
  active: "success",
  deployed: "success",
  approved: "success",
  offline: "error",
  error: "error",
  failed: "error",
  deploying: "warning",
  pending: "warning",
  stopped: "default",
  maintenance: "default",
  rolled_back: "default",
};

const statusDotMap: Record<StatusType, string> = {
  online: "bg-[#22c55e]",
  running: "bg-[#22c55e]",
  active: "bg-[#22c55e]",
  deployed: "bg-[#22c55e]",
  approved: "bg-[#22c55e]",
  offline: "bg-[#ef4444]",
  error: "bg-[#ef4444]",
  failed: "bg-[#ef4444]",
  deploying: "bg-[#eab308]",
  pending: "bg-[#eab308]",
  stopped: "bg-[#888888]",
  maintenance: "bg-[#888888]",
  rolled_back: "bg-[#888888]",
};

function isStatusType(s: string): s is StatusType {
  return s in statusVariantMap;
}

export function StatusBadge({ status }: { status: string }) {
  const variant = isStatusType(status) ? statusVariantMap[status] : "default";
  const dotColor = isStatusType(status) ? statusDotMap[status] : "bg-[#888888]";

  return (
    <Badge variant={variant}>
      <span className={cn("h-1.5 w-1.5 rounded-full", dotColor)} />
      {status.replace(/_/g, " ")}
    </Badge>
  );
}
