import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { Copy, Folder, Link2, X } from "lucide-react";
import { type ReactNode, useState } from "react";

import type { Command, Download } from "../engine/types";
import { cn, humanSize, humanTime, percent } from "../lib/format";
import { SpeedGraph } from "./SpeedGraph";

type DetailsProps = {
  download: Download;
  send: (command: Command) => void;
  onClose: () => void;
};

// The piece map again, larger, each cell a seed: the file fills seed by seed, like a pomegranate.
const SEEDS = ["bg-piece-0", "bg-piece-1", "bg-piece-2", "bg-piece-3"];

const Row = ({ label, children }: { label: string; children: ReactNode }) => (
  <div className="flex justify-between gap-4 py-1.5 text-sm">
    <span className="text-muted">{label}</span>
    <span className="min-w-0 truncate text-right tabular">{children}</span>
  </div>
);

const STATUS: Record<Download["status"], string> = {
  waiting: "Waiting its turn",
  held: "Paused",
  connecting: "Connecting",
  downloading: "Downloading",
  verifying: "Checking the file",
  done: "Done",
  error: "Failed",
  paused: "Paused",
};

/** Everything about one download, beside the list: press I, or double-click a row. */
export const Details = ({ download: d, send, onClose }: DetailsProps) => {
  const [fresh, setFresh] = useState("");
  const [copied, setCopied] = useState(false);
  const running = d.status === "downloading";

  const copy = () =>
    writeText(d.url).then(
      () => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      },
      () => {},
    );

  // A fresh link for the same file updates this row (mox matches it by server and path) and
  // restarts it if the old link had failed.
  const applyFresh = () => {
    if (!fresh.trim()) return;
    send({ cmd: "add", urls: [fresh.trim()] });
    setFresh("");
  };

  return (
    <aside className="flex w-96 shrink-0 flex-col overflow-y-auto border-l border-line bg-surface">
      <div className="flex items-start gap-3 border-b border-line p-4">
        <div className="min-w-0 flex-1">
          <h2 className="break-all font-semibold leading-snug">{d.name}</h2>
          <p className={cn("mt-1 text-xs", d.status === "error" ? "text-danger" : "text-muted")}>
            {d.status === "error" ? d.message : STATUS[d.status]}
            {d.total && d.status !== "done" ? ` · ${percent(d.done, d.total)}` : ""}
          </p>
        </div>
        <button type="button" onClick={onClose} aria-label="Close" className="text-muted hover:text-text">
          <X className="size-4" />
        </button>
      </div>

      <div className="space-y-5 p-4">
        {d.pieces && (
          <div
            className="grid grid-cols-[repeat(20,minmax(0,1fr))] gap-1"
            aria-label="Which parts of the file are on disk"
          >
            {d.pieces.map((shade, i) => (
              <span
                key={i}
                className={cn("aspect-square rounded-full", d.status === "done" ? "bg-piece-3" : SEEDS[shade])}
              />
            ))}
          </div>
        )}

        {running && (
          <div>
            <div className="mb-1 flex justify-between text-xs text-muted">
              <span>Speed, last minute</span>
              <span className="tabular text-text">{humanSize(d.speed)}/s</span>
            </div>
            <SpeedGraph speed={d.speed} width={350} height={48} />
          </div>
        )}

        <div className="divide-y divide-line/60">
          <Row label="Size">
            {d.status === "done" ? humanSize(d.total ?? d.done) : `${humanSize(d.done)} of ${humanSize(d.total)}`}
          </Row>
          {running && <Row label="Time left">{humanTime(d.eta)}</Row>}
          {running && <Row label="Connections">{d.connections}</Row>}
          <Row label="Kind">{d.kind}</Row>
          {d.stream && d.ready != null && d.total && <Row label="Playable to">{percent(d.ready, d.total)}</Row>}
        </div>

        <div>
          <div className="mb-1 flex items-center justify-between text-xs text-muted">
            <span>Link</span>
            <button type="button" onClick={copy} className="inline-flex items-center gap-1 hover:text-text">
              <Copy className="size-3.5" /> {copied ? "Copied" : "Copy"}
            </button>
          </div>
          <p className="break-all rounded-control bg-bg p-2 font-mono text-xs text-muted select-text">{d.url}</p>
        </div>

        {d.path && (
          <div>
            <div className="mb-1 flex items-center justify-between text-xs text-muted">
              <span>Saved to</span>
              <button
                type="button"
                onClick={() => send({ cmd: "reveal", id: d.id })}
                className="inline-flex items-center gap-1 hover:text-text"
              >
                <Folder className="size-3.5" /> Show
              </button>
            </div>
            <p className="break-all rounded-control bg-bg p-2 font-mono text-xs text-muted select-text">{d.path}</p>
          </div>
        )}

        {d.status !== "done" && (
          <div>
            <label className="mb-1 block text-xs text-muted" htmlFor="fresh-link">
              {d.expired
                ? "The link has expired. Paste a fresh one for the same file:"
                : "A fresh link for the same file"}
            </label>
            <div className="flex gap-2">
              <input
                id="fresh-link"
                value={fresh}
                onChange={(e) => setFresh(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && applyFresh()}
                placeholder="https://…"
                className={cn(
                  "min-w-0 flex-1 rounded-control border bg-bg px-2 py-1.5 font-mono text-xs outline-none focus:border-accent",
                  d.expired ? "border-danger/50" : "border-line",
                )}
              />
              <button
                type="button"
                onClick={applyFresh}
                disabled={!fresh.trim()}
                className="inline-flex items-center gap-1.5 rounded-control bg-raised px-3 text-sm hover:bg-hover disabled:opacity-40"
              >
                <Link2 className="size-4" /> Use
              </button>
            </div>
          </div>
        )}
      </div>
    </aside>
  );
};
