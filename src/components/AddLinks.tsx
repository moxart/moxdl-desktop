import { open } from "@tauri-apps/plugin-dialog";
import { ClipboardPaste, FolderOpen, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import type { Engine } from "../engine/useEngine";
import { readClipboard, urlsIn } from "../lib/links";
import { useAppSetting } from "../lib/appSettings";
import { cn } from "../lib/format";
import { useT } from "../lib/i18n";

type AddLinksProps = {
  engine: Engine;
  initialText: string;
  onClose: () => void;
};

const isOn = (value: string | undefined) => ["on", "yes", "true", "1"].includes((value ?? "").toLowerCase());

// mox finds the links itself, anywhere in the text, so this only counts them for the button.
const countLinks = (text: string) => (text.match(/https?:\/\/[^\s<>"'`]+/g) ?? []).length;

const Toggle = ({ label, hint, checked, onChange }: { label: string; hint: string; checked: boolean; onChange: (on: boolean) => void }) => (
  <label className="flex cursor-pointer items-start gap-3">
    <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="mt-0.5 size-4 accent-accent" />
    <span>
      <span className="block">{label}</span>
      <span className="block text-xs text-muted">{hint}</span>
    </span>
  </label>
);

export const AddLinks = ({ engine, initialText, onClose }: AddLinksProps) => {
  const t = useT();
  const { settings, send } = engine;
  const [text, setText] = useState(initialText);
  const [dir, setDir] = useState(settings.dir ?? "");
  const [sort, setSort] = useState(isOn(settings.sort));
  const [stream, setStream] = useState(isOn(settings.stream));
  const [first, setFirst] = useAppSetting("addFirst", false); // remembered: some always want it
  const links = countLinks(text);

  const fromClipboard = useCallback(async () => {
    const urls = urlsIn(await readClipboard());
    if (urls.length) setText((current) => (current.trim() ? `${current}\n` : "") + urls.join("\n"));
  }, []);

  // Opening the dialog looks at the clipboard: links copied a moment ago are usually the ones wanted.
  useEffect(() => {
    if (!initialText) void fromClipboard();
  }, [initialText, fromClipboard]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const pickFolder = async () => {
    const chosen = await open({ directory: true, defaultPath: dir || undefined });
    if (typeof chosen === "string") setDir(chosen);
  };

  const add = () => {
    send({ cmd: "add", text, dir: dir || undefined, sort, stream, first });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-20 grid place-items-center bg-black/55 p-6" onMouseDown={onClose}>
      <div
        className="w-full max-w-xl rounded-card border border-line bg-surface shadow-2xl"
        onMouseDown={(e) => e.stopPropagation()}
        role="dialog"
        aria-label={t.addLinks}
      >
        <div className="flex items-center justify-between border-b border-line px-5 py-3">
          <h2 className="font-semibold">{t.addLinks}</h2>
          <button type="button" onClick={onClose} aria-label={t.close} className="text-muted hover:text-text">
            <X className="size-4" />
          </button>
        </div>

        <div className="space-y-4 p-5">
          <div>
            <textarea
              autoFocus
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && (e.ctrlKey || e.metaKey) && links && add()}
              dir="auto"
              placeholder={t.pasteHere}
              className="h-40 w-full resize-none rounded-control border border-line bg-bg p-3 font-mono text-xs leading-relaxed outline-none focus:border-accent"
            />
            <div className="mt-2 flex items-center justify-between text-xs text-muted">
              <span>{t.linkCount(links)}</span>
              <button type="button" onClick={() => void fromClipboard()} className="inline-flex items-center gap-1.5 hover:text-text">
                <ClipboardPaste className="size-3.5" />
                {t.fromClipboard}
              </button>
            </div>
          </div>

          <div>
            <span className="mb-1.5 block text-xs text-muted">{t.saveTo}</span>
            <div className="flex gap-2">
              <input
                value={dir}
                onChange={(e) => setDir(e.target.value)}
                dir="auto"
                placeholder={t.saveToPlaceholder}
                className="min-w-0 flex-1 rounded-control border border-line bg-bg px-3 py-2 text-sm outline-none focus:border-accent"
              />
              <button type="button" onClick={pickFolder} className="inline-flex items-center gap-2 rounded-control bg-raised px-3 hover:bg-hover">
                <FolderOpen className="size-4" /> {t.choose}
              </button>
            </div>
          </div>

          <div className="space-y-3">
            <Toggle label={t.sortFolders} hint={t.sortFoldersHint} checked={sort} onChange={setSort} />
            <Toggle label={t.watchWhileDownloading} hint={t.watchWhileHint} checked={stream} onChange={setStream} />
            <Toggle label={t.addFirst} hint={t.addFirstHint} checked={first} onChange={setFirst} />
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t border-line px-5 py-3">
          <button type="button" onClick={onClose} className="rounded-control px-4 py-2 text-muted hover:bg-hover hover:text-text">
            {t.cancel}
          </button>
          <button
            type="button"
            disabled={!links}
            onClick={add}
            className={cn(
              "rounded-control px-4 py-2 font-semibold",
              // With no link yet it waits quietly in grey rather than as a faded red one.
              links ? "button-primary" : "bg-raised text-faint",
            )}
          >
            {t.downloadCount(links)}
          </button>
        </div>
      </div>
    </div>
  );
};
