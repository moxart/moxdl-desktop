import { Plus } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { AddLinks } from "./components/AddLinks";
import { DownloadList } from "./components/DownloadList";
import { HistoryView } from "./components/HistoryView";
import { Logo } from "./components/Logo";
import { SettingsView } from "./components/SettingsView";
import { StatusBar } from "./components/StatusBar";
import { Toasts } from "./components/Toasts";
import { type Engine, useEngine } from "./engine/useEngine";
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
      <p className="font-medium">{engine.connection === "missing" ? "Mox could not be started" : "Mox stopped"}</p>
      <p className="mt-2 text-sm text-muted">
        {engine.problem || "The download engine exited. Downloads keep their progress and continue when it starts again."}
      </p>
      <button type="button" onClick={engine.restart} className="mt-5 rounded-control bg-raised px-4 py-2 hover:bg-hover">
        Start Mox again
      </button>
    </div>
  </div>
);

export const App = () => {
  const engine = useEngine();
  const [tab, setTab] = useState<Tab>("downloads");
  const [adding, setAdding] = useState<string | null>(null); // the text to add, while the dialog is open
  const busy = engine.state?.downloads.some((d) => ["connecting", "downloading", "verifying"].includes(d.status)) ?? false;

  useEffect(() => engine.send({ cmd: "config" }), [engine.send]);

  // Ctrl+V anywhere outside a text field opens the dialog with what was pasted.
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const target = e.target as HTMLElement;
      if (adding !== null || target.closest("input, textarea")) return;
      const text = e.clipboardData?.getData("text") ?? "";
      if (text.trim()) {
        setTab("downloads");
        setAdding(text);
      }
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [adding]);

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
          className="inline-flex items-center gap-2 rounded-control bg-accent px-3.5 py-1.5 text-sm font-medium text-on-accent transition-transform hover:bg-accent-strong active:scale-95 disabled:opacity-40"
        >
          <Plus className="size-4" /> Add links
        </button>
      </header>

      <main className="min-h-0 flex-1 overflow-y-auto">
        {down ? (
          <EngineProblem engine={engine} />
        ) : tab === "downloads" ? (
          <DownloadList state={engine.state} send={engine.send} onAdd={openAdd} />
        ) : tab === "history" ? (
          <HistoryView engine={engine} />
        ) : (
          <SettingsView engine={engine} />
        )}
      </main>

      <StatusBar engine={engine} />
      <Toasts toasts={engine.toasts} />
      {adding !== null && <AddLinks engine={engine} initialText={adding} onClose={() => setAdding(null)} />}
    </div>
  );
};
