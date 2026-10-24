import { Plus, Smartphone, Sparkles, WifiOff, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { AddLinks } from "./components/AddLinks";
import { ClipboardOffer } from "./components/ClipboardOffer";
import { DownloadList } from "./components/DownloadList";
import { DropOverlay } from "./components/DropOverlay";
import { HistoryView } from "./components/HistoryView";
import { KnownDialog } from "./components/KnownDialog";
import { PhoneDialog } from "./components/PhoneDialog";
import { Welcome } from "./components/Welcome";
import { Logo } from "./components/Logo";
import { SettingsView } from "./components/SettingsView";
import { StatusBar } from "./components/StatusBar";
import { Toasts } from "./components/Toasts";
import { CountdownDialog, useWhenDone } from "./components/WhenDone";
import { useIncomingLinks } from "./engine/useIncomingLinks";
import { type Engine, useEngine } from "./engine/useEngine";
import { usePhone } from "./engine/usePhone";
import { useSystem } from "./engine/useSystem";
import { type Updates, useUpdates } from "./engine/useUpdates";
import { useAppSetting, useAppValue } from "./lib/appSettings";
import { cn, humanTime, num } from "./lib/format";
import { useT } from "./lib/i18n";
import { APP_VERSION } from "./lib/version";

export type Schedule = { on: boolean; from: string; until: string };
export type Quota = { on: boolean; gb: number };
export type Slow = { on: boolean; from: string; until: string; limit: number }; // limit in bytes a second

type Tab = "downloads" | "history" | "settings";
const TABS: Tab[] = ["downloads", "history", "settings"];
// ?tab=settings in a plain browser (npm run dev) opens on that tab, for screenshots.
const FIRST_TAB = ("__TAURI_INTERNALS__" in window ? null : new URLSearchParams(location.search).get("tab")) as Tab | null;
// ?welcome=2 shows the welcome at that step; outside the app it shows only when asked, so
// screenshots of the rest are not covered by it.
const WELCOME_STEP = "__TAURI_INTERNALS__" in window ? null : new URLSearchParams(location.search).get("welcome");
// ?add=<links> opens the add dialog with them, for screenshots of it.
const FIRST_ADD = "__TAURI_INTERNALS__" in window ? null : new URLSearchParams(location.search).get("add");

/** Shown instead of the list when mox itself cannot be reached. */
const EngineProblem = ({ engine }: { engine: Engine }) => {
  const t = useT();
  return (
    <div className="grid h-full place-items-center p-8">
      <div className="max-w-md text-center">
        <p className="font-semibold">{engine.connection === "missing" ? t.engineMissing : t.engineStopped}</p>
        <p className="mt-2 text-sm text-muted">{engine.problem || t.engineExited}</p>
        <button type="button" onClick={engine.restart} className="mt-5 rounded-control bg-raised px-4 py-2 hover:bg-hover">
          {t.startAgain}
        </button>
      </div>
    </div>
  );
};

/** The internet is down: the downloads wait for it, and say so once here rather than on every row. */
const OfflineBar = ({ seconds }: { seconds: number }) => {
  const t = useT();
  return (
    <div className="mx-3 mt-3 flex items-center gap-3 rounded-card border border-warn/30 bg-warn/10 px-4 py-2.5 text-sm" role="status">
      <WifiOff className="size-4 shrink-0 text-warn" />
      <span>{t.offlineFor(humanTime(seconds))}</span>
    </div>
  );
};

/** A newer version is out: one press downloads it, installs it and starts it. */
const UpdateBar = ({ updates }: { updates: Updates }) => {
  const t = useT();
  const { available, status, progress, problem } = updates;
  if (!available) return null; // a failed check is for Settings to show
  const part = progress?.[1] ? `${num(Math.floor((100 * progress[0]) / progress[1]))}%` : "";
  return (
    <div className="mx-3 mt-3 flex items-center gap-3 rounded-card border border-accent/30 bg-accent/10 px-4 py-2.5 text-sm">
      <Sparkles className="size-4 shrink-0 text-accent" />
      <span className="min-w-0 truncate">
        {status === "installing"
          ? t.updating(part)
          : status === "failed"
            ? t.updateFailed(problem)
            : t.updateReady(available.version)}
      </span>
      {status !== "installing" && (
        <>
          <button type="button" onClick={updates.install} className="ms-auto shrink-0 rounded-control button-primary px-3 py-1 font-semibold">
            {t.updateInstall}
          </button>
          <button type="button" onClick={updates.dismiss} aria-label={t.notNow} title={t.notNow} className="shrink-0 text-muted hover:text-text">
            <X className="size-4" />
          </button>
        </>
      )}
    </div>
  );
};

export const App = () => {
  const t = useT();
  const engine = useEngine();
  const updates = useUpdates();
  const whenDone = useWhenDone();
  const phone = usePhone(); // on from the start, not only once Settings is open
  const system = useSystem();
  const [tab, setTab] = useState<Tab>(FIRST_TAB && TABS.includes(FIRST_TAB) ? FIRST_TAB : "downloads");
  const [adding, setAdding] = useState<string | null>(FIRST_ADD); // the text to add, while the dialog is open
  const [showPhone, setShowPhone] = useState(false);
  const [addKey, setAddKey] = useState(0); // a new key reopens the dialog with what arrived since
  const [watchClipboard, setWatchClipboard] = useAppSetting("watchClipboard", true);
  const [welcomed, setWelcomed] = useAppSetting("welcomed", !("__TAURI_INTERNALS__" in window) && WELCOME_STEP === null);
  const [schedule, setSchedule] = useAppValue<Schedule>("schedule", { on: false, from: "02:00", until: "07:00" });
  const [quota, setQuota] = useAppValue<Quota>("quota", { on: false, gb: 5 });
  const [slow, setSlow] = useAppValue<Slow>("slow", { on: false, from: "08:00", until: "01:00", limit: 1024 ** 2 });

  // The schedule, the quota and the slow hours are the app's to keep: mox hears them each time it starts.
  useEffect(() => {
    if (engine.connection !== "running") return;
    engine.send({
      cmd: "set",
      window: schedule.on ? { from: schedule.from, until: schedule.until } : null,
      quota: quota.on && quota.gb > 0 ? Math.round(quota.gb * 1024 ** 3) : null,
      slow: slow.on && slow.from !== slow.until ? { from: slow.from, until: slow.until, limit: slow.limit } : null,
    });
  }, [engine.connection, engine.send, schedule, quota, slow]);
  // What the logo shows: green when the last download finishes, grey while the rest only waits.
  const downloads = engine.state?.downloads ?? [];
  const running = downloads.filter((d) => ["connecting", "downloading", "verifying"].includes(d.status)).length;
  const waiting = !running && downloads.some((d) => d.status !== "done" && d.status !== "error");
  const finished = downloads.filter((d) => d.status === "done").length;

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
        <Logo running={running} waiting={waiting} finished={finished} />
        <nav className="flex gap-1">
          {TABS.map((id) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={cn(
                "rounded-control px-3 py-1.5 text-sm transition-colors",
                tab === id ? "bg-raised text-text" : "text-muted hover:text-text",
              )}
            >
              {t.tabs[id]}
            </button>
          ))}
        </nav>
        {/* The app's version, as its releases are numbered; the engine's is on hover and in Settings. */}
        <span className="ms-auto text-xs text-faint" title={engine.version ? t.engineVersion(engine.version) : undefined}>
          Mox {APP_VERSION}
        </span>
        {/* Links from a phone, one click away: it switches the page on, and shows its code. */}
        <button
          type="button"
          onClick={() => {
            if (!phone.on) phone.change(true);
            setShowPhone(true);
          }}
          title={t.phoneOn}
          aria-label={t.phoneOn}
          className={cn(
            "grid size-8 place-items-center rounded-control transition-colors",
            phone.on ? "bg-accent/12 text-accent-text" : "text-muted hover:bg-hover hover:text-text",
          )}
        >
          <Smartphone className="size-4" />
        </button>
        <button
          type="button"
          onClick={openAdd}
          disabled={down}
          className="inline-flex items-center gap-2 rounded-control button-primary px-3.5 py-1.5 text-sm font-semibold"
        >
          <Plus className="size-4" /> {t.addLinks}
        </button>
      </header>

      <main className="flex min-h-0 flex-1 flex-col">
        {down ? (
          <EngineProblem engine={engine} />
        ) : tab === "downloads" ? (
          <>
            <UpdateBar updates={updates} />
            {engine.state?.offline != null && <OfflineBar seconds={engine.state.offline} />}
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
              updates={updates}
              phone={phone}
              slow={slow}
              onSlow={setSlow}
              system={system}
              onWelcome={() => setWelcomed(false)}
            />
          </div>
        )}
      </main>

      <StatusBar engine={engine} whenDone={whenDone} system={system} />
      <Toasts toasts={engine.toasts} />
      {adding !== null && (
        <AddLinks key={addKey} engine={engine} initialText={adding} onClose={() => setAdding(null)} />
      )}
      {incoming.dropping && <DropOverlay />}
      {showPhone && <PhoneDialog phone={phone} onClose={() => setShowPhone(false)} />}
      {engine.known.length > 0 && adding === null && (
        <KnownDialog items={engine.known} send={engine.send} onClose={engine.clearKnown} />
      )}
      {!welcomed && (
        <Welcome
          schedule={schedule}
          onSchedule={setSchedule}
          system={system}
          firstStep={Number(WELCOME_STEP) || 0}
          onDone={() => {
            setWelcomed(true);
            setTab("downloads");
          }}
        />
      )}
      {whenDone.countdown && (
        <CountdownDialog countdown={whenDone.countdown} onCancel={whenDone.cancel} onNow={whenDone.now} />
      )}
    </div>
  );
};
