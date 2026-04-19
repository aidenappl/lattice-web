import Image from "next/image";
import { cn } from "@/lib/utils";

type LogoSize = "sm" | "md" | "lg";

interface LogoProps {
  size?: LogoSize;
  className?: string;
}

const sizeMap: Record<LogoSize, number> = {
  sm: 32,
  md: 40,
  lg: 48,
};

export function Logo({ size = "md", className }: LogoProps) {
  const px = sizeMap[size];
  return (
    <Image
      src="/lattice-dark-icon.png"
      alt="Lattice"
      width={px}
      height={px}
      className={cn("shrink-0", className)}
      priority
    />
  );
}
