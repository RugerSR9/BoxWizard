import { useCallback, useRef, useState } from "react";
import { AlertCircle, CheckCircle2, Info, X } from "lucide-react";
import { cn } from "../lib/cn";

export type ToastVariant = "success" | "info" | "error";

export interface ToastItem {
  id: string;
  message: string;
  variant: ToastVariant;
}

const AUTO_DISMISS_MS = 8000;

function makeId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function useToasts() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
  }, []);

  const push = useCallback(
    (message: string, variant: ToastVariant) => {
      const id = makeId();
      setToasts((prev) => [...prev, { id, message, variant }]);
      const timer = setTimeout(() => dismiss(id), AUTO_DISMISS_MS);
      timers.current.set(id, timer);
    },
    [dismiss],
  );

  const pushError = useCallback((message: string) => push(message, "error"), [push]);
  const pushSuccess = useCallback((message: string) => push(message, "success"), [push]);
  const pushInfo = useCallback((message: string) => push(message, "info"), [push]);

  return { toasts, pushError, pushSuccess, pushInfo, dismiss };
}

const VARIANT_META: Record<ToastVariant, { icon: typeof AlertCircle; border: string; iconClass: string }> = {
  error: { icon: AlertCircle, border: "border-l-status-failed", iconClass: "text-status-failed" },
  success: { icon: CheckCircle2, border: "border-l-status-running", iconClass: "text-status-running" },
  info: { icon: Info, border: "border-l-accent", iconClass: "text-accent" },
};

interface ToastContainerProps {
  toasts: ToastItem[];
  onDismiss: (id: string) => void;
}

export function ToastContainer({ toasts, onDismiss }: ToastContainerProps) {
  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-6 right-6 z-[100] flex flex-col gap-2 max-w-sm" role="region" aria-live="polite">
      {toasts.map((t) => {
        const meta = VARIANT_META[t.variant];
        const Icon = meta.icon;
        return (
          <div
            key={t.id}
            role="alert"
            className={cn(
              "flex items-start gap-3 bg-surface border border-border rounded-lg px-3.5 py-3 shadow-popover border-l-4",
              meta.border,
            )}
          >
            <Icon size={18} className={cn("shrink-0 mt-0.5", meta.iconClass)} />
            <span className="flex-1 text-sm text-ink leading-snug break-words">{t.message}</span>
            <button
              onClick={() => onDismiss(t.id)}
              aria-label="Dismiss notification"
              className="text-ink-subtle hover:text-ink transition-colors shrink-0"
            >
              <X size={15} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
