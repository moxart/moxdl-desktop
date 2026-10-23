import { revealItemInDir } from "@tauri-apps/plugin-opener";
import { Folder, History } from "lucide-react";
import { useEffect } from "react";

import type { Command, KnownFile } from "../engine/types";
import { humanSize } from "../lib/format";
import { currentLang, useT } from "../lib/i18n";

type KnownDialogProps = {
  items: KnownFile[];
  send: (command: Command) => void;
  onClose: () => void;
};

const when = (time: string | null): string => {
  if (!time) return "";
  const date = new Date(time);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(currentLang() === "fa" ? "fa-IR" : undefined, { dateStyle: "medium" }).format(date);
};

/**
 * Files that were added but are on disk from before, so they were left out: download them again,
 * or not. Saves a night's data plan on a list copied twice.
 */
export const KnownDialog = ({ items, send, onClose }: KnownDialogProps) => {
  const t = useT();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const again = () => {
    send({ cmd: "add", urls: items.map((item) => item.url) });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-20 grid place-items-center bg-black/55 p-6" onMouseDown={onClose}>
      <div
        role="dialog"
        aria-label={t.knownTitle(items.length)}
        onMouseDown={(e) => e.stopPropagation()}
        className="w-full max-w-lg rounded-card border border-line bg-surface shadow-2xl"
      >
        <div className="flex items-start gap-3 border-b border-line px-5 py-4">
          <History className="mt-0.5 size-5 shrink-0 text-accent" />
          <div>
            <h2 className="font-semibold">{t.knownTitle(items.length)}</h2>
            <p className="mt-0.5 text-sm text-muted">{t.knownAbout}</p>
          </div>
        </div>
        <ul className="max-h-72 divide-y divide-line/60 overflow-y-auto px-5">
          {items.map((item) => (
            <li key={item.url} className="flex items-center gap-3 py-2.5 text-sm">
              <div className="min-w-0 flex-1">
                <div dir="auto" className="truncate font-semibold">
                  {item.name}
                </div>
                <div className="text-xs text-muted tabular">
                  {[item.size != null && humanSize(item.size), when(item.time) && t.knownWhen(when(item.time))]
                    .filter(Boolean)
                    .join(" · ")}
                </div>
              </div>
              <button
                type="button"
                onClick={() => revealItemInDir(item.path).catch(() => {})}
                aria-label={t.showInFolder}
                title={t.showInFolder}
                className="grid size-8 place-items-center rounded-control text-muted hover:bg-hover hover:text-text"
              >
                <Folder className="size-4" />
              </button>
            </li>
          ))}
        </ul>
        <div className="flex justify-end gap-2 border-t border-line px-5 py-3">
          <button type="button" onClick={onClose} className="rounded-control px-4 py-2 text-muted hover:bg-hover hover:text-text">
            {t.skip}
          </button>
          <button type="button" autoFocus onClick={again} className="rounded-control button-primary px-4 py-2 font-semibold">
            {t.downloadAgain}
          </button>
        </div>
      </div>
    </div>
  );
};
