import { Plus, Search, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import type { Command, Download, EngineState } from "../engine/types";
import { Details } from "./Details";
import { DownloadRow } from "./DownloadRow";

type DownloadListProps = {
  state: EngineState | null;
  send: (command: Command) => void;
  onAdd: () => void;
};

// The keys, as close to the terminal's as a window allows. Shown in the empty list and as the
// search box's hint.
const KEYS: [string, string][] = [
  ["↑ ↓", "select"],
  ["Enter", "download next"],
  ["Shift ↑ ↓", "move"],
  ["F", "only this"],
  ["W", "watch while downloading"],
  ["P / Space", "pause"],
  ["O", "open"],
  ["I", "details"],
  ["Delete twice", "remove"],
  ["/", "search"],
];

const EmptyList = ({ onAdd }: { onAdd: () => void }) => (
  <div className="grid min-h-0 flex-1 place-items-center">
    <div className="text-center">
      <p className="text-muted">Nothing downloading.</p>
      <p className="mt-1 text-sm text-faint">Copy some links and press Ctrl+V here, drop them on the window, or</p>
      <button
        type="button"
        onClick={onAdd}
        className="mt-4 inline-flex items-center gap-2 rounded-control button-primary px-4 py-2 font-semibold"
      >
        <Plus className="size-4" /> Add links
      </button>
    </div>
  </div>
);

const typing = (target: EventTarget | null) =>
  target instanceof HTMLElement && !!target.closest("input, textarea, select, [contenteditable]");

const finished = (d: Download) => d.status === "done" || d.status === "error";

export const DownloadList = ({ state, send, onAdd }: DownloadListProps) => {
  const [dragged, setDragged] = useState<number | null>(null);
  const [target, setTarget] = useState<number | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [armed, setArmed] = useState<number | null>(null); // Delete pressed once on it
  const [query, setQuery] = useState("");
  const [details, setDetails] = useState(false); // the selected row's panel is open
  const search = useRef<HTMLInputElement>(null);
  const downloads = state?.downloads ?? [];
  const shown = query ? downloads.filter((d) => d.name.toLowerCase().includes(query.toLowerCase())) : downloads;

  useEffect(() => {
    if (armed === null) return;
    const timer = setTimeout(() => setArmed(null), 3000);
    return () => clearTimeout(timer);
  }, [armed]);

  useEffect(() => {
    document.querySelector(`[data-download="${selected}"]`)?.scrollIntoView({ block: "nearest" });
  }, [selected]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "/" || (e.key === "f" && (e.ctrlKey || e.metaKey))) {
        if (typing(e.target) && e.key === "/") return;
        e.preventDefault();
        search.current?.focus();
        return;
      }
      if (e.key === "Escape" && typing(e.target) && e.target === search.current) {
        setQuery("");
        search.current?.blur();
        return;
      }
      if (e.key === "Escape" && details && !typing(e.target)) {
        setDetails(false);
        return;
      }
      // Not while typing, and not under the add dialog.
      if (typing(e.target) || e.ctrlKey || e.metaKey || e.altKey || document.querySelector('[role="dialog"]')) return;
      const at = shown.findIndex((d) => d.id === selected);
      const d = shown[at];
      const step = e.key === "ArrowDown" || e.key === "j" ? 1 : e.key === "ArrowUp" || e.key === "k" ? -1 : 0;
      if (step && e.shiftKey && d) {
        e.preventDefault();
        const neighbour = shown[at + step];
        if (neighbour) send({ cmd: "move", id: d.id, to: downloads.findIndex((x) => x.id === neighbour.id) });
        return;
      }
      if (step) {
        e.preventDefault();
        const next = shown[Math.max(0, Math.min(shown.length - 1, at < 0 ? 0 : at + step))];
        if (next) setSelected(next.id);
        return;
      }
      if (!d) return;
      const key = e.key.toLowerCase();
      if (key !== "delete" && key !== "backspace" && key !== "x") setArmed(null);
      if (e.key === "Enter" && !finished(d)) send({ cmd: "next", id: d.id });
      else if (key === "f" && !finished(d)) send({ cmd: "focus", id: state?.focus === d.id ? null : d.id });
      else if (key === "w" && !finished(d)) send({ cmd: "stream", id: d.id, on: !d.stream });
      else if ((key === "p" || e.key === " ") && !finished(d)) send({ cmd: "hold", id: d.id, on: d.status !== "held" });
      else if (key === "o") send({ cmd: "open", id: d.id });
      else if (key === "i") setDetails((open) => !open);
      else if (key === "delete" || key === "backspace" || key === "x") {
        if (armed === d.id) {
          send({ cmd: "remove", id: d.id });
          setArmed(null);
          setSelected(shown[at + 1]?.id ?? shown[at - 1]?.id ?? null);
        } else {
          setArmed(d.id); // one stray key must not take a download off the list
        }
      } else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [shown, downloads, selected, armed, send, state?.focus, details]);

  if (!downloads.length) return <EmptyList onAdd={onAdd} />;

  const waiting = downloads.filter((d) => d.status === "waiting");
  const firstUnfinished = downloads.find((d) => !finished(d));

  const drop = () => {
    if (dragged !== null && target !== null && dragged !== target) {
      // The list is the queue: its order is the order they download in.
      send({ cmd: "move", id: dragged, to: downloads.findIndex((d) => d.id === target) });
    }
    setDragged(null);
    setTarget(null);
  };

  const chosen = details ? downloads.find((d) => d.id === selected) : undefined;

  return (
    <div className="flex min-h-0 flex-1">
      <div className="min-w-0 flex-1 overflow-y-auto p-3">
        <label className="mb-2 flex items-center gap-2 rounded-control border border-line bg-surface px-3 py-1.5 focus-within:border-accent">
          <Search className="size-4 shrink-0 text-faint" />
          <input
            ref={search}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search downloads"
            title={KEYS.map(([key, does]) => `${key}: ${does}`).join("\n")}
            className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-faint"
          />
          {query ? (
            <button
              type="button"
              onClick={() => setQuery("")}
              aria-label="Clear the search"
              className="text-faint hover:text-text"
            >
              <X className="size-4" />
            </button>
          ) : (
            <kbd className="rounded border border-line px-1.5 font-mono text-xs text-faint">/</kbd>
          )}
        </label>
        {shown.length === 0 && <p className="px-3 py-6 text-sm text-muted">No download has “{query}” in its name.</p>}
        <ul className="flex flex-col gap-1">
          {shown.map((d) => (
            <DownloadRow
              key={d.id}
              download={d}
              place={d.status === "waiting" ? waiting.indexOf(d) + 1 : null}
              focused={state?.focus === d.id}
              first={firstUnfinished?.id === d.id}
              selected={selected === d.id}
              armed={armed === d.id}
              onSelect={() => setSelected(d.id)}
              onOpenDetails={() => {
                setSelected(d.id);
                setDetails(true);
              }}
              send={send}
              dragging={dragged === d.id}
              dropAbove={dragged !== null && target === d.id && dragged !== d.id}
              onDragStart={() => setDragged(d.id)}
              onDragOver={() => setTarget(d.id)}
              onDrop={drop}
              onDragEnd={() => {
                setDragged(null);
                setTarget(null);
              }}
            />
          ))}
        </ul>
      </div>
      {chosen && <Details download={chosen} send={send} onClose={() => setDetails(false)} />}
    </div>
  );
};
