import { ButtonHTMLAttributes, forwardRef } from "react";
import { cn } from "@/lib/utils";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faSpinner } from "@fortawesome/free-solid-svg-icons";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "destructive" | "warning" | "ghost";
  size?: "sm" | "md" | "lg";
  loading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant = "primary",
      size = "md",
      disabled,
      loading,
      children,
      ...props
    },
    ref,
  ) => {
    const baseStyles =
      "inline-flex items-center justify-center font-medium rounded-lg transition-colors cursor-pointer focus:outline-none disabled:opacity-40 disabled:cursor-not-allowed";

    const variants = {
      // Theme tokens, not white/black: in light mode a white button sat on a
      // near-white page with no border and all but disappeared.
      primary: "bg-primary text-background hover:opacity-85",
      secondary:
        "border border-border-strong bg-surface text-primary hover:bg-surface-elevated hover:border-border-strong",
      destructive:
        "bg-red-600/10 border border-red-600/30 text-destructive-soft hover:bg-red-600/20 hover:border-red-600/50",
      warning:
        "bg-pending/10 border border-pending/30 text-pending hover:bg-pending/20 hover:border-pending/50",
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
        className={cn(
          baseStyles,
          variants[variant],
          sizes[size],
          loading && "gap-1.5",
          className,
        )}
        disabled={disabled || loading}
        {...props}
      >
        {loading && (
          <FontAwesomeIcon
            icon={faSpinner}
            className="h-3.5 w-3.5 animate-spin"
          />
        )}
        {children}
      </button>
    );
  },
);

Button.displayName = "Button";
