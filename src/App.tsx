import { Plus } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { AddLinks } from "./components/AddLinks";
import { ClipboardOffer } from "./components/ClipboardOffer";
import { DownloadList } from "./components/DownloadList";
import { DropOverlay } from "./components/DropOverlay";
import { HistoryView } from "./components/HistoryView";
import { Logo } from "./components/Logo";
import { SettingsView } from "./components/SettingsView";
import { StatusBar } from "./components/StatusBar";
import { Toasts } from "./components/Toasts";
import { useIncomingLinks } from "./engine/useIncomingLinks";
import { type Engine, useEngine } from "./engine/useEngine";
import { useAppSetting, useAppValue } from "./lib/appSettings";

export type Schedule = { on: boolean; from: string; until: string };
export type Quota = { on: boolean; gb: number };
import { cn } from "./lib/format";

type Tab = "downloads" | "history" | "settings";
const TABS: [Tab, string][] = [
  ["downloads", "Downloads"],
  ["history", "History"],
  ["settings", "Settings"],
];

/** Shown instead of the list when mox itself cannot be reached. */
const EngineProblem = ({ engine }: { engine: Engine }) => (
  <div className="grid h-full place-items-center p-8">
    <div className="max-w-md text-center">
      <p className="font-semibold">{engine.connection === "missing" ? "Mox could not be started" : "Mox stopped"}</p>
      <p className="mt-2 text-sm text-muted">
        {engine.problem ||
          "The download engine exited. Downloads keep their progress and continue when it starts again."}
      </p>
      <button
        type="button"
        onClick={engine.restart}
        className="mt-5 rounded-control bg-raised px-4 py-2 hover:bg-hover"
      >
        Start Mox again
      </button>
    </div>
  </div>
);

export const App = () => {
  const engine = useEngine();
  const [tab, setTab] = useState<Tab>("downloads");
  const [adding, setAdding] = useState<string | null>(null); // the text to add, while the dialog is open
  const [addKey, setAddKey] = useState(0); // a new key reopens the dialog with what arrived since
  const [watchClipboard, setWatchClipboard] = useAppSetting("watchClipboard", true);
  const [schedule, setSchedule] = useAppValue<Schedule>("schedule", { on: false, from: "02:00", until: "07:00" });
  const [quota, setQuota] = useAppValue<Quota>("quota", { on: false, gb: 5 });

  // The schedule and the quota are the app's to keep: mox hears them each time it starts.
  useEffect(() => {
    if (engine.connection !== "running") return;
    engine.send({
      cmd: "set",
      window: schedule.on ? { from: schedule.from, until: schedule.until } : null,
      quota: quota.on && quota.gb > 0 ? Math.round(quota.gb * 1024 ** 3) : null,
    });
  }, [engine.connection, engine.send, schedule, quota]);
  const busy =
    engine.state?.downloads.some((d) => ["connecting", "downloading", "verifying"].includes(d.status)) ?? false;

  useEffect(() => engine.send({ cmd: "config" }), [engine.send]);

  // Links from anywhere join whatever the dialog already holds.
  const addLinks = useCallback((text: string) => {
    setTab("downloads");
    setAdding((current) => (current?.trim() ? `${current}\n${text}` : text));
    setAddKey((key) => key + 1);
  }, []);
  const incoming = useIncomingLinks(engine, addLinks, watchClipboard);

  // Ctrl+V anywhere outside a text field opens the dialog with what was pasted.
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const target = e.target as HTMLElement;
      if (adding !== null || target.closest("input, textarea")) return;
      const text = e.clipboardData?.getData("text") ?? "";
      if (text.trim()) addLinks(text);
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [adding, addLinks]);

  const openAdd = useCallback(() => setAdding(""), []);
  const down = engine.connection === "missing" || engine.connection === "stopped";

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center gap-6 border-b border-line px-4 py-2.5">
        <Logo busy={busy} />
        <nav className="flex gap-1">
          {TABS.map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={cn(
                "rounded-control px-3 py-1.5 text-sm transition-colors",
                tab === id ? "bg-raised text-text" : "text-muted hover:text-text",
              )}
            >
              {label}
            </button>
          ))}
        </nav>
        <span className="ml-auto text-xs text-faint">{engine.version && `Mox ${engine.version}`}</span>
        <button
          type="button"
          onClick={openAdd}
          disabled={down}
          className="inline-flex items-center gap-2 rounded-control button-primary px-3.5 py-1.5 text-sm font-semibold"
        >
          <Plus className="size-4" /> Add links
        </button>
      </header>

      <main className="flex min-h-0 flex-1 flex-col">
        {down ? (
          <EngineProblem engine={engine} />
        ) : tab === "downloads" ? (
          <>
            {incoming.offer.length > 0 && (
              <ClipboardOffer urls={incoming.offer} onTake={incoming.takeOffer} onDismiss={incoming.dismissOffer} />
            )}
            <DownloadList state={engine.state} send={engine.send} onAdd={openAdd} />
          </>
        ) : tab === "history" ? (
          <div className="min-h-0 flex-1 overflow-y-auto">
            <HistoryView engine={engine} />
          </div>
        ) : (
          <div className="min-h-0 flex-1 overflow-y-auto">
            <SettingsView
              engine={engine}
              watchClipboard={watchClipboard}
              onWatchClipboard={setWatchClipboard}
              schedule={schedule}
              onSchedule={setSchedule}
              quota={quota}
              onQuota={setQuota}
            />
          </div>
        )}
      </main>

      <StatusBar engine={engine} />
      <Toasts toasts={engine.toasts} />
      {adding !== null && (
        <AddLinks key={addKey} engine={engine} initialText={adding} onClose={() => setAdding(null)} />
      )}
      {incoming.dropping && <DropOverlay />}
    </div>
  );
};
