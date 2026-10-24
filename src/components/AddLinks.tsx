import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { AlertTriangle, Clapperboard, ClipboardPaste, FolderOpen, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { Quality, Then } from "../engine/types";
import type { Engine } from "../engine/useEngine";
import { readClipboard, urlsIn } from "../lib/links";
import { useAppSetting, useAppValue } from "../lib/appSettings";
import { cn, humanSize, num } from "../lib/format";
import { useT } from "../lib/i18n";
import { Select } from "./Select";
import { QUALITIES } from "./VideoSettings";

type AddLinksProps = {
  engine: Engine;
  initialText: string;
  onClose: () => void;
  defaultQuality: Quality; // Settings → Video sites
};

// Links that are pages of a video site, said before yt-dlp is there to read them.
const VIDEO_SITE = /^https?:\/\/([^/]+\.)?(youtube\.com|youtu\.be|aparat\.com|instagram\.com|vimeo\.com|x\.com|twitter\.com|tiktok\.com|dailymotion\.com|twitch\.tv)\//i;

const minutes = (seconds: number | null) =>
  seconds == null ? "" : num(`${Math.floor(seconds / 60)}:${String(Math.round(seconds % 60)).padStart(2, "0")}`);

const isOn = (value: string | undefined) => ["on", "yes", "true", "1"].includes((value ?? "").toLowerCase());

// mox finds the links itself, anywhere in the text; these are for the count and the check.
const linksIn = (text: string) => [...new Set(text.match(/https?:\/\/[^\s<>"'`]+/g) ?? [])];
// Servers are asked about the links a moment after typing stops, and not for a list this long.
const CHECK_AFTER_MS = 700;
const CHECK_AT_MOST = 100;

type ThenKind = "nothing" | "open" | "move" | "run";

const Toggle = ({ label, hint, checked, onChange }: { label: string; hint: string; checked: boolean; onChange: (on: boolean) => void }) => (
  <label className="flex cursor-pointer items-start gap-3">
    <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="mt-0.5 size-4 accent-accent" />
    <span>
      <span className="block">{label}</span>
      <span className="block text-xs text-muted">{hint}</span>
    </span>
  </label>
);

export const AddLinks = ({ engine, initialText, onClose, defaultQuality }: AddLinksProps) => {
  const t = useT();
  const { settings, send } = engine;
  const [text, setText] = useState(initialText);
  const [dir, setDir] = useState(settings.dir ?? "");
  const [sort, setSort] = useState(isOn(settings.sort));
  const [stream, setStream] = useState(isOn(settings.stream));
  const [first, setFirst] = useAppSetting("addFirst", false); // remembered: some always want it
  const [thenKind, setThenKind] = useState<ThenKind>("nothing");
  // The folder and the command are remembered: the same antivirus, the same Videos folder.
  const [thenMove, setThenMove] = useAppValue("thenMove", "");
  const [thenRun, setThenRun] = useAppValue("thenRun", "");
  const urls = useMemo(() => linksIn(text), [text]);
  const links = urls.length;

  // Ask each server about its file while the dialog is open: size, and whether it is there at all.
  const asked = useRef(new Set<string>());
  useEffect(() => {
    if (!urls.length || urls.length > CHECK_AT_MOST) return;
    const timer = setTimeout(() => {
      const fresh = urls.filter((url) => !asked.current.has(url) && !engine.checks[url]);
      if (!fresh.length) return;
      fresh.forEach((url) => asked.current.add(url));
      send({ cmd: "check", urls: fresh, dir: dir || undefined });
    }, CHECK_AFTER_MS);
    return () => clearTimeout(timer);
  }, [urls, dir, send, engine.checks]);
  const answered = urls.map((url) => engine.checks[url]).filter(Boolean);
  const pending = urls.length <= CHECK_AT_MOST && answered.length < urls.length;
  const good = answered.filter((c) => c.ok && !c.media); // videos are counted on their own, below
  const broken = answered.filter((c) => !c.ok);
  const total = good.reduce((sum, c) => sum + (c.size ?? 0), 0);
  const unknown = good.filter((c) => c.size == null).length;
  const free = engine.checkFree ?? engine.state?.free ?? null;
  const tooBig = free != null && total > free;
  // Pages yt-dlp read as videos: downloaded as video, at the quality picked here.
  const [quality, setQuality] = useState<Quality>(defaultQuality);
  const videos = urls.filter((url) => engine.checks[url]?.media);
  const videoSize = videos.reduce((sum, url) => {
    const offered = engine.checks[url]?.media?.qualities ?? [];
    const pick = quality === "audio" ? offered.find((q) => q.quality === "audio")
      : offered.find((q) => q.height != null && (quality === "best" || q.height <= Number(quality))) ??
        [...offered].reverse().find((q) => q.height != null); // none that low: the lowest there is
    return sum + (pick?.size ?? 0);
  }, 0);
  const needsTool = !engine.tools?.ytdlp.version && urls.some((url) => VIDEO_SITE.test(url));
  useEffect(() => {
    if (needsTool && !engine.tools) send({ cmd: "tools" });
  }, [needsTool, engine.tools, send]);
  const leaveOutBroken = () => {
    const gone = new Set(broken.map((c) => c.url));
    setText((current) => current.split(/\s+/).filter((word) => !gone.has(word)).join("\n"));
  };

  // Only links not in the box already: opening the dialog reads the clipboard, and that ran twice
  // in development (React's strict mode), which put every copied link in twice.
  const fromClipboard = useCallback(async () => {
    const urls = urlsIn(await readClipboard());
    setText((current) => {
      const there = new Set(linksIn(current));
      const fresh = [...new Set(urls)].filter((url) => !there.has(url));
      return fresh.length ? (current.trim() ? `${current}\n` : "") + fresh.join("\n") : current;
    });
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

  const then: Then =
    thenKind === "open" ? { open: true } : thenKind === "move" && thenMove ? { move: thenMove } : thenKind === "run" && thenRun ? { run: thenRun } : {};

  const pickThenFolder = async () => {
    const chosen = await open({ directory: true, defaultPath: thenMove || undefined });
    if (typeof chosen === "string") setThenMove(chosen);
  };

  const add = async () => {
    const options = { dir: dir || undefined, sort, stream, first, then, skip_known: true };
    // Links the browser extension sent here, rather than starting them, come with the browser's
    // cookies and Referer: each goes on its own with them, the rest together as the text.
    const withHeaders: Record<string, Record<string, string>> =
      "__TAURI_INTERNALS__" in window
        ? await invoke<Record<string, Record<string, string>>>("take_link_headers", { urls }).catch(() => ({}))
        : {};
    const own = Object.keys(withHeaders).filter((url) => Object.keys(withHeaders[url]).length && !videos.includes(url));
    if (videos.length) send({ cmd: "add", urls: videos, media: true, quality, ...options });
    // skip_known: files already on disk from before are left out, and asked about in a dialog.
    for (const url of own) send({ cmd: "add", urls: [url], headers: withHeaders[url], ...options });
    const rest = own.length || videos.length ? urls.filter((url) => !own.includes(url) && !videos.includes(url)) : null;
    if (rest === null) send({ cmd: "add", text, ...options });
    else if (rest.length) send({ cmd: "add", urls: rest, ...options });
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

        <div className="max-h-[65vh] space-y-4 overflow-y-auto p-5">
          <div>
            <textarea
              autoFocus
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && (e.ctrlKey || e.metaKey) && links && void add()}
              dir="auto"
              placeholder={t.pasteHere}
              className="h-40 w-full resize-none rounded-control border border-line bg-bg p-3 font-mono text-xs leading-relaxed outline-none focus:border-accent"
            />
            <div className="mt-2 flex items-center justify-between gap-3 text-xs text-muted">
              <span className="tabular">
                {t.linkCount(links)}
                {pending ? ` · ${t.checkingLinks}` : good.length > 0 && ` · ${t.checkTotal(good.length, humanSize(total))}`}
                {!pending && unknown > 0 && t.checkSizeUnknown(unknown)}
              </span>
              <button type="button" onClick={() => void fromClipboard()} className="inline-flex items-center gap-1.5 hover:text-text">
                <ClipboardPaste className="size-3.5" />
                {t.fromClipboard}
              </button>
            </div>
            {broken.length > 0 && (
              <div className="mt-2 rounded-control border border-danger/30 bg-danger/5 px-3 py-2 text-xs">
                <div className="flex items-center gap-2 text-danger">
                  <AlertTriangle className="size-3.5 shrink-0" />
                  <span className="flex-1">{t.checkBroken(broken.length)}</span>
                  <button type="button" onClick={leaveOutBroken} className="font-semibold hover:underline">
                    {t.leaveOut}
                  </button>
                </div>
                <ul className="mt-1 space-y-0.5 text-muted">
                  {broken.slice(0, 3).map((c) => (
                    <li key={c.url} dir="ltr" className="truncate text-start">
                      {decodeURIComponent(c.url.split("/").pop() || c.url)} · {c.message}
                    </li>
                  ))}
                  {broken.length > 3 && <li>…</li>}
                </ul>
              </div>
            )}
            {videos.length > 0 && (
              <div className="mt-2 rounded-control border border-accent/30 bg-accent/5 px-3 py-2.5 text-sm">
                <div className="flex items-center gap-3">
                  <Clapperboard className="size-4 shrink-0 text-accent" />
                  <span className="flex-1 font-semibold">
                    {t.videosFound(videos.length)}
                    {videoSize > 0 && <span className="font-normal text-muted tabular"> · {humanSize(videoSize)}</span>}
                  </span>
                  <Select
                    className="w-36"
                    label={t.quality}
                    value={quality}
                    options={QUALITIES.map((q) => [t.qualities[q], q])}
                    onChange={(v) => setQuality(v as Quality)}
                  />
                </div>
                <ul className="mt-1.5 space-y-0.5 text-xs text-muted">
                  {videos.slice(0, 4).map((url) => (
                    <li key={url} className="flex gap-2">
                      <span dir="auto" className="min-w-0 flex-1 truncate">
                        {engine.checks[url]?.media?.title ?? url}
                      </span>
                      <span className="shrink-0 tabular">{minutes(engine.checks[url]?.media?.duration ?? null)}</span>
                    </li>
                  ))}
                  {videos.length > 4 && <li>…</li>}
                </ul>
              </div>
            )}
            {needsTool && <p className="mt-2 text-xs text-warn">{t.videoNeedsTool}</p>}
            {tooBig && (
              <p className="mt-2 flex items-center gap-2 text-xs text-danger">
                <AlertTriangle className="size-3.5 shrink-0" />
                {t.notEnoughSpace(humanSize(total), humanSize(free))}
              </p>
            )}
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

          <div>
            <span className="mb-1.5 block text-xs text-muted">{t.afterDownload}</span>
            <div className="flex gap-2">
              <Select
                className="w-56 shrink-0"
                label={t.afterDownload}
                value={thenKind}
                options={(["nothing", "open", "move", "run"] as const).map((k) => [t.thenOptions[k], k])}
                onChange={(v) => setThenKind(v as ThenKind)}
              />
              {thenKind === "move" && (
                <>
                  <input
                    value={thenMove}
                    onChange={(e) => setThenMove(e.target.value)}
                    dir="auto"
                    placeholder={t.moveTo}
                    aria-label={t.moveTo}
                    className="min-w-0 flex-1 rounded-control border border-line bg-bg px-3 py-1.5 text-sm outline-none focus:border-accent"
                  />
                  <button type="button" onClick={pickThenFolder} className="inline-flex items-center gap-2 rounded-control bg-raised px-3 hover:bg-hover">
                    <FolderOpen className="size-4" />
                  </button>
                </>
              )}
              {thenKind === "run" && (
                <input
                  value={thenRun}
                  onChange={(e) => setThenRun(e.target.value)}
                  dir="ltr"
                  placeholder={t.thenRunPlaceholder}
                  aria-label={t.thenOptions.run}
                  title={t.thenRunHint}
                  className="min-w-0 flex-1 rounded-control border border-line bg-bg px-3 py-1.5 font-mono text-xs outline-none focus:border-accent"
                />
              )}
            </div>
            {thenKind === "run" && <p className="mt-1 text-xs text-faint">{t.thenRunHint}</p>}
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t border-line px-5 py-3">
          <button type="button" onClick={onClose} className="rounded-control px-4 py-2 text-muted hover:bg-hover hover:text-text">
            {t.cancel}
          </button>
          <button
            type="button"
            disabled={!links}
            onClick={() => void add()}
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
