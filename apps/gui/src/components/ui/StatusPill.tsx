import type { EnvironmentStatus } from "../../lib/types";
import { cn } from "../../lib/cn";

const STATUS_META: Record<EnvironmentStatus, { label: string; text: string; bg: string; dot: string; pulse?: boolean }> = {
  running: { label: "Running", text: "text-status-running", bg: "bg-status-running-bg", dot: "bg-status-running" },
  provisioning: {
    label: "Provisioning",
    text: "text-status-provisioning",
    bg: "bg-status-provisioning-bg",
    dot: "bg-status-provisioning",
    pulse: true,
  },
  destroying: {
    label: "Destroying",
    text: "text-status-provisioning",
    bg: "bg-status-provisioning-bg",
    dot: "bg-status-provisioning",
    pulse: true,
  },
  destroyed: { label: "Destroyed", text: "text-status-neutral", bg: "bg-status-neutral-bg", dot: "bg-status-neutral" },
  failed: { label: "Failed", text: "text-status-failed", bg: "bg-status-failed-bg", dot: "bg-status-failed" },
};

export function StatusPill({ status, className }: { status: EnvironmentStatus; className?: string }) {
  const meta = STATUS_META[status];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium",
        meta.text,
        meta.bg,
        className,
      )}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", meta.dot, meta.pulse && "animate-pulse")} />
      {meta.label}
    </span>
  );
}

export function KindBadge({ kind }: { kind: "container" | "vm" }) {
  const isVm = kind === "vm";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide",
        isVm ? "text-kind-vm bg-kind-vm/10" : "text-kind-container bg-kind-container/10",
      )}
    >
      {isVm ? "VM" : "Container"}
    </span>
  );
}
