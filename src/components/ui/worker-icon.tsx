import Image from "next/image";
import { cn } from "@/lib/utils";

type WorkerIconSize = "xs" | "sm" | "md" | "lg";

interface WorkerIconProps {
  size?: WorkerIconSize;
  className?: string;
}

const sizeMap: Record<WorkerIconSize, number> = {
  xs: 20,
  sm: 28,
  md: 36,
  lg: 48,
};

export function WorkerIcon({ size = "md", className }: WorkerIconProps) {
  const px = sizeMap[size];
  return (
    <>
      <Image
        src="/lattice-worker-light.png"
        alt="Worker"
        width={px}
        height={px}
        className={cn("shrink-0 dark:hidden rounded-md", className)}
      />
      <Image
        src="/lattice-worker-dark.png"
        alt="Worker"
        width={px}
        height={px}
        className={cn("shrink-0 hidden dark:block rounded-md", className)}
      />
    </>
  );
}
