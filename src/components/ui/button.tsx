import { ButtonHTMLAttributes, forwardRef } from "react";
import { cn } from "@/lib/utils";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "destructive" | "warning" | "ghost";
  size?: "sm" | "md" | "lg";
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    { className, variant = "primary", size = "md", disabled, ...props },
    ref,
  ) => {
    const baseStyles =
      "inline-flex items-center justify-center font-medium rounded-lg transition-colors cursor-pointer focus:outline-none disabled:opacity-40 disabled:cursor-not-allowed";

    const variants = {
      primary: "bg-white text-black hover:bg-zinc-100",
      secondary:
        "border border-[#2a2a2a] bg-[#111111] text-white hover:bg-[#161616] hover:border-[#333333]",
      destructive:
        "bg-red-600/10 border border-red-600/30 text-[#f87171] hover:bg-red-600/20 hover:border-red-600/50",
      warning:
        "bg-yellow-600/10 border border-yellow-600/30 text-yellow-400 hover:bg-yellow-600/20 hover:border-yellow-600/50",
      ghost: "text-[#888888] hover:bg-[#161616] hover:text-white",
    };

    const sizes = {
      sm: "h-7 px-3 text-xs",
      md: "h-8 px-3.5 text-sm",
      lg: "h-10 px-5 text-sm",
    };

    return (
      <button
        ref={ref}
        className={cn(baseStyles, variants[variant], sizes[size], className)}
        disabled={disabled}
        {...props}
      />
    );
  },
);

Button.displayName = "Button";
