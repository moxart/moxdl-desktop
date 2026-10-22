import type { Toast } from "../engine/useEngine";
import { cn } from "../lib/format";

export const Toasts = ({ toasts }: { toasts: Toast[] }) => (
  <div className="pointer-events-none fixed bottom-14 end-4 z-30 flex w-80 flex-col gap-2">
    {toasts.map((t) => (
      <div
        key={t.id}
        className={cn(
          "rounded-control border bg-raised px-3 py-2 text-sm shadow-lg",
          t.tone === "error" ? "border-danger/40" : t.tone === "ok" ? "border-ok/30" : "border-line",
        )}
      >
        {t.text}
      </div>
    ))}
  </div>
);
