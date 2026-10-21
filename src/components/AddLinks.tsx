import { open } from "@tauri-apps/plugin-dialog";
import { ClipboardPaste, FolderOpen, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import type { Engine } from "../engine/useEngine";
import { cn } from "../lib/format";

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
  const { settings, clipboard, send } = engine;
  const [text, setText] = useState(initialText);
  const [dir, setDir] = useState(settings.dir ?? "");
  const [sort, setSort] = useState(isOn(settings.sort));
  const [stream, setStream] = useState(isOn(settings.stream));
  const asked = useRef(false);
  const links = countLinks(text);

  // Opening the dialog looks at the clipboard: links copied a moment ago are usually the ones wanted.
  useEffect(() => {
    if (!initialText) send({ cmd: "clipboard" });
    asked.current = true;
  }, [initialText, send]);
  useEffect(() => {
    // Runs when the clipboard answer arrives, and fills in only an empty box.
    if (asked.current && clipboard?.urls.length && !text) setText(clipboard.urls.join("\n"));
  }, [clipboard]);

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
    send({ cmd: "add", text, dir: dir || undefined, sort, stream });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-20 grid place-items-center bg-black/55 p-6" onMouseDown={onClose}>
      <div
        className="w-full max-w-xl rounded-card border border-line bg-surface shadow-2xl"
        onMouseDown={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Add links"
      >
        <div className="flex items-center justify-between border-b border-line px-5 py-3">
          <h2 className="font-semibold">Add links</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="text-muted hover:text-text">
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
              placeholder="Paste links here, one per line, or text with links in it"
              className="h-40 w-full resize-none rounded-control border border-line bg-bg p-3 font-mono text-xs leading-relaxed outline-none focus:border-accent"
            />
            <div className="mt-2 flex items-center justify-between text-xs text-muted">
              <span>{links ? `${links} link${links === 1 ? "" : "s"}` : "No links yet"}</span>
              <button type="button" onClick={() => send({ cmd: "clipboard" })} className="inline-flex items-center gap-1.5 hover:text-text">
                <ClipboardPaste className="size-3.5" />
                {clipboard && !clipboard.tool ? "No clipboard tool: install wl-clipboard" : "From the clipboard"}
              </button>
            </div>
          </div>

          <div>
            <span className="mb-1.5 block text-xs text-muted">Save to</span>
            <div className="flex gap-2">
              <input
                value={dir}
                onChange={(e) => setDir(e.target.value)}
                placeholder="Downloads, unless Settings name another folder"
                className="min-w-0 flex-1 rounded-control border border-line bg-bg px-3 py-2 text-sm outline-none focus:border-accent"
              />
              <button type="button" onClick={pickFolder} className="inline-flex items-center gap-2 rounded-control bg-raised px-3 hover:bg-hover">
                <FolderOpen className="size-4" /> Choose
              </button>
            </div>
          </div>

          <div className="space-y-3">
            <Toggle label="Sort into folders" hint="In a mox folder there: Videos, Music and so on, and series by show and season" checked={sort} onChange={setSort} />
            <Toggle label="Watch while downloading" hint="Fill each file from the start, to play it before it is done" checked={stream} onChange={setStream} />
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t border-line px-5 py-3">
          <button type="button" onClick={onClose} className="rounded-control px-4 py-2 text-muted hover:bg-hover hover:text-text">
            Cancel
          </button>
          <button
            type="button"
            disabled={!links}
            onClick={add}
            className={cn(
              "rounded-control px-4 py-2 font-medium transition-transform active:scale-95",
              links ? "bg-accent text-on-accent hover:bg-accent-strong" : "bg-raised text-faint",
            )}
          >
            Download{links > 1 ? ` ${links}` : ""}
          </button>
        </div>
      </div>
    </div>
  );
};
