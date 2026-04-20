import Link from "next/link";
import { WorkerIcon } from "./worker-icon";

type WorkerBadgeProps = {
  id: number;
  name: string;
  size?: "sm" | "md";
  /** When false, renders as a plain span instead of a Link (avoids nested <a> issues) */
  linkable?: boolean;
};

const WorkerBadge = ({
  id,
  name,
  size = "md",
  linkable = true,
}: WorkerBadgeProps) => {
  const sizeClasses =
    size === "sm" ? "px-2 py-1 gap-2 text-xs" : "px-3 py-2 gap-3 text-sm";

  const className = `border flex items-center w-fit rounded-md font-medium bg-surface border-border-strong text-primary hover:bg-surface-elevated transition-colors ${sizeClasses}`;

  if (!linkable) {
    return (
      <span className={className}>
        <WorkerIcon size="xs" />
        {name}
      </span>
    );
  }

  return (
    <Link
      href={`/workers/${id}`}
      title={`View worker: ${name}`}
      className={className}
    >
      <WorkerIcon size="xs" />
      {name}
    </Link>
  );
};

export default WorkerBadge;
