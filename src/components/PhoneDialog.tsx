import { Smartphone, X } from "lucide-react";
import { useEffect } from "react";

import type { Phone } from "../engine/usePhone";
import { useT } from "../lib/i18n";
import { PhoneSettings } from "./PhoneSettings";

/** The phone's QR code from the header, without going to Settings. */
export const PhoneDialog = ({ phone, onClose }: { phone: Phone; onClose: () => void }) => {
  const t = useT();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-20 grid place-items-center bg-black/55 p-6" onMouseDown={onClose}>
      <div
        role="dialog"
        aria-label={t.fromPhone}
        onMouseDown={(e) => e.stopPropagation()}
        className="w-full max-w-xl rounded-card border border-line bg-surface shadow-2xl"
      >
        <div className="flex items-center justify-between border-b border-line px-5 py-3">
          <h2 className="inline-flex items-center gap-2 font-semibold">
            <Smartphone className="size-4 text-accent" />
            {t.fromPhone}
          </h2>
          <button type="button" onClick={onClose} aria-label={t.close} className="text-muted hover:text-text">
            <X className="size-4" />
          </button>
        </div>
        <div className="p-5 [&>div]:mb-0">
          <PhoneSettings phone={phone} />
        </div>
      </div>
    </div>
  );
};
