import { InputHTMLAttributes, forwardRef } from "react";
import { cn } from "@/lib/utils";

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, label, error, id, ...props }, ref) => {
    return (
      <div className="flex flex-col gap-1.5">
        {label && (
          <label
            htmlFor={id}
            className="text-xs font-medium text-[#888888] uppercase tracking-wider"
          >
            {label}
          </label>
        )}
        <input
          ref={ref}
          id={id}
          className={cn(
            "h-9 w-full rounded-lg border border-[#2a2a2a] bg-[#161616] px-3 text-sm text-white placeholder:text-[#555555]",
            "focus:border-[#444444] focus:outline-none focus:ring-1 focus:ring-[#444444]/50",
            "disabled:cursor-not-allowed disabled:opacity-40",
            error &&
              "border-red-600/50 focus:border-red-600/50 focus:ring-red-600/20",
            className,
          )}
          {...props}
        />
        {error && <p className="text-xs text-[#f87171]">{error}</p>}
      </div>
    );
  },
);

Input.displayName = "Input";
