import type { ReactNode } from "react";
import { cn } from "../../lib/cn";
import type { ApiStatus } from "../../hooks/useEnvironments";

const STATUS_META: Record<ApiStatus, { label: string; dot: string; text: string }> = {
  online: { label: "Local service connected", dot: "bg-status-running", text: "text-status-running" },
  offline: { label: "Local service not running", dot: "bg-status-failed", text: "text-status-failed" },
  checking: { label: "Checking local service...", dot: "bg-status-neutral", text: "text-status-neutral" },
};

export interface TopBarProps {
  title: ReactNode;
  subtitle?: ReactNode;
  apiStatus: ApiStatus;
  actions?: ReactNode;
}

export function TopBar({ title, subtitle, apiStatus, actions }: TopBarProps) {
  const meta = STATUS_META[apiStatus];
  return (
    <header className="flex items-center justify-between gap-4 h-14 px-6 border-b border-border bg-surface shrink-0">
      <div className="min-w-0">
        <h1 className="text-base font-semibold text-ink leading-tight truncate">{title}</h1>
        {subtitle && <p className="text-xs text-ink-subtle truncate">{subtitle}</p>}
      </div>
      <div className="flex items-center gap-3 shrink-0">
        {actions}
        <span
          className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium bg-surface-muted", meta.text)}
          title={meta.label}
        >
          <span className={cn("h-1.5 w-1.5 rounded-full", meta.dot, apiStatus === "checking" && "animate-pulse")} />
          {meta.label}
        </span>
      </div>
    </header>
  );
}
