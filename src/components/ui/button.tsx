import { ButtonHTMLAttributes, forwardRef } from "react";
import { cn } from "@/lib/utils";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "destructive" | "warning" | "ghost";
  size?: "sm" | "md" | "lg";
  loading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    { className, variant = "primary", size = "md", disabled, loading, children, ...props },
    ref,
  ) => {
    const baseStyles =
      "inline-flex items-center justify-center font-medium rounded-lg transition-colors cursor-pointer focus:outline-none disabled:opacity-40 disabled:cursor-not-allowed";

    const variants = {
      primary: "bg-white text-black hover:bg-zinc-100",
      secondary:
        "border border-border-strong bg-surface text-primary hover:bg-surface-elevated hover:border-border-strong",
      destructive:
        "bg-red-600/10 border border-red-600/30 text-destructive-soft hover:bg-red-600/20 hover:border-red-600/50",
      warning:
        "bg-yellow-600/10 border border-yellow-600/30 text-yellow-400 hover:bg-yellow-600/20 hover:border-yellow-600/50",
      ghost: "text-secondary hover:bg-surface-elevated hover:text-primary",
    };

    const sizes = {
      sm: "h-7 px-3 text-xs",
      md: "h-8 px-3.5 text-sm",
      lg: "h-10 px-5 text-sm",
    };

    return (
      <button
        ref={ref}
        className={cn(baseStyles, variants[variant], sizes[size], loading && "gap-1.5", className)}
        disabled={disabled || loading}
        {...props}
      >
        {loading && (
          <svg className="h-3.5 w-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4l3-3-3-3v4a8 8 0 00-8 8h4z" />
          </svg>
        )}
        {children}
      </button>
    );
  },
);

Button.displayName = "Button";
