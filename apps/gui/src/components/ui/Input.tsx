import type { InputHTMLAttributes } from "react";
import { cn } from "../../lib/cn";

export function Input({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "rounded-lg border border-border bg-surface px-2.5 py-1.5 text-sm text-ink",
        "focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent",
        "disabled:opacity-50 disabled:cursor-not-allowed",
        "placeholder:text-ink-subtle",
        className,
      )}
      {...rest}
    />
  );
}
