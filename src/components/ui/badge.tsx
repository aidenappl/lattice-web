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
    default: "text-secondary",
    success: "text-healthy",
    warning: "text-pending",
    error: "text-failed",
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
  | "online"
  | "offline"
  | "maintenance"
  | "running"
  | "stopped"
  | "error"
  | "pending"
  | "paused"
  | "active"
  | "sending"
  | "deploying"
  | "validating"
  | "deployed"
  | "failed"
  | "rolled_back"
  | "approved"
  | "healthy"
  | "unhealthy"
  | "starting"
  | "restarting"
  | "completed"
  | "uploading"
  | "none";

const statusVariantMap: Record<
  StatusType,
  "success" | "error" | "warning" | "default"
> = {
  online: "success",
  running: "success",
  active: "success",
  deployed: "success",
  approved: "success",
  healthy: "success",
  completed: "success",
  offline: "error",
  error: "error",
  failed: "error",
  unhealthy: "error",
  sending: "warning",
  deploying: "warning",
  validating: "warning",
  pending: "warning",
  starting: "warning",
  restarting: "error",
  uploading: "warning",
  stopped: "default",
  maintenance: "default",
  rolled_back: "default",
  paused: "default",
  none: "default",
};

const statusDotMap: Record<StatusType, string> = {
  online: "bg-[#22c55e]",
  running: "bg-[#22c55e]",
  active: "bg-[#22c55e]",
  deployed: "bg-[#22c55e]",
  approved: "bg-[#22c55e]",
  healthy: "bg-[#22c55e]",
  completed: "bg-[#22c55e]",
  offline: "bg-[#ef4444]",
  error: "bg-[#ef4444]",
  failed: "bg-[#ef4444]",
  unhealthy: "bg-[#ef4444]",
  sending: "bg-[#eab308]",
  deploying: "bg-[#eab308]",
  validating: "bg-[#eab308]",
  pending: "bg-[#eab308]",
  starting: "bg-[#eab308]",
  restarting: "bg-[#ef4444]",
  uploading: "bg-[#eab308]",
  stopped: "bg-[#888888]",
  maintenance: "bg-[#888888]",
  rolled_back: "bg-[#888888]",
  paused: "bg-[#888888]",
  none: "bg-[#888888]",
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
