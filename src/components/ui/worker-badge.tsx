import Link from "next/link";
import { WorkerIcon } from "./worker-icon";

type WorkerBadgeProps = {
  id: number;
  name: string;
  size?: "sm" | "md";
};

const WorkerBadge = ({ id, name, size = "md" }: WorkerBadgeProps) => {
  const sizeClasses =
    size === "sm"
      ? "px-2 py-1 gap-2 text-xs"
      : "px-3 py-2 gap-3 text-sm";

  return (
    <Link
      href={`/workers/${id}`}
      title={`View worker: ${name}`}
      className={`border flex items-center w-fit rounded-md font-medium bg-surface border-border-strong text-primary hover:bg-surface-elevated transition-colors ${sizeClasses}`}
    >
      <WorkerIcon size="xs" />
      {name}
    </Link>
  );
};

export default WorkerBadge;
