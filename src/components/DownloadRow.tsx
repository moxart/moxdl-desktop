import {
  AlertTriangle,
  ArrowDown,
  Check,
  ChevronsUp,
  Clock,
  Folder,
  Pause,
  Play,
  RotateCw,
  SquareArrowOutUpRight,
  Tv,
  X,
  Zap,
} from "lucide-react";
import { useEffect, useState } from "react";

import type { Command, Download } from "../engine/types";
import { cn, humanSize, humanTime, num, percent, rate } from "../lib/format";
import { type Messages, useT } from "../lib/i18n";
import { IconButton } from "./IconButton";
import { PieceBar } from "./PieceBar";
import { Spinner } from "./Spinner";

type DownloadRowProps = {
  download: Download;
  place: number | null; // its place in line while waiting: 1 is next
  focused: boolean;
  first: boolean; // first unfinished in the list, so "download next" means nothing
  selected: boolean; // the row the keys act on
  armed: boolean; // Delete was pressed once on it
  onSelect: () => void;
  onOpenDetails: () => void;
  send: (command: Command) => void;
  dragging: boolean;
  dropAbove: boolean;
  onDragStart: () => void;
  onDragOver: () => void;
  onDrop: () => void;
  onDragEnd: () => void;
};

const StatusIcon = ({ download }: { download: Download }) => {
  const { status, stream, message } = download;
  if (status === "connecting" || status === "verifying" || (status === "downloading" && message))
    return <Spinner className="font-mono text-base text-accent" />;
  if (status === "downloading") return stream ? <Play className="size-4 text-accent" /> : <ArrowDown className="size-4 text-accent" />;
  if (status === "done") return <Check className="size-4 text-ok" />;
  if (status === "error") return <AlertTriangle className="size-4 text-danger" />;
  if (status === "held" || status === "paused") return <Pause className="size-4 text-warn" />;
  return <Clock className="size-4 text-faint" />;
};

const note = (t: Messages, d: Download, place: number | null): string => {
  if (d.status === "done") return d.path ?? "";
  if (d.status === "error") return d.expired ? `${d.message}. ${t.freshLinkHint}` : d.message;
  if (d.status === "held") return t.paused;
  if (d.status === "waiting") return place === 1 ? t.next : place ? t.waitingPlace(place) : t.waiting;
  if (d.message) return d.message;
  if (d.stream && d.ready && d.total) return t.playableTo(`${num(Math.floor((100 * d.ready) / d.total))}%`);
  return "";
};

export const DownloadRow = (props: DownloadRowProps) => {
  const t = useT();
  const { download: d, place, focused, first, send } = props;
  const [confirmRemove, setConfirmRemove] = useState(false);
  useEffect(() => {
    if (!confirmRemove) return;
    const timer = setTimeout(() => setConfirmRemove(false), 3000);
    return () => clearTimeout(timer);
  }, [confirmRemove]);

  const finished = d.status === "done" || d.status === "error";
  const running = ["connecting", "downloading", "verifying"].includes(d.status);
  const held = d.status === "held";

  return (
    <li
      data-download={d.id}
      onMouseDown={props.onSelect}
      onDoubleClick={props.onOpenDetails}
      draggable={!finished}
      onDragStart={props.onDragStart}
      onDragOver={(e) => {
        e.preventDefault();
        props.onDragOver();
      }}
      onDrop={props.onDrop}
      onDragEnd={props.onDragEnd}
      className={cn(
        "group relative grid grid-cols-[20px_minmax(0,1fr)] items-center gap-x-3 rounded-card px-3 py-2.5 transition-colors hover:bg-surface",
        props.dragging && "opacity-40",
        focused && "bg-accent/5",
        props.selected && "bg-surface ring-1 ring-accent/35",
        props.armed && "ring-danger/60",
      )}
    >
      {props.dropAbove && <span className="absolute inset-x-3 -top-px h-0.5 rounded-full bg-accent" />}
      <div className="grid place-items-center">
        <StatusIcon download={d} />
      </div>

      <div className="min-w-0">
        <div className="flex items-baseline gap-3">
          <span dir="auto" className={cn("truncate font-semibold", d.status === "done" && "text-muted")}>{d.name}</span>
          {focused && <span className="shrink-0 rounded-full bg-accent/15 px-2 text-xs text-accent">{t.fullSpeed}</span>}
          {d.stream && !finished && <span className="shrink-0 rounded-full bg-raised px-2 text-xs text-muted">{t.watch}</span>}
        </div>
        <div className="mt-2">
          <PieceBar pieces={d.pieces} active={running} done={d.status === "done"} />
        </div>
        <div className="mt-1.5 flex gap-4 text-xs text-muted">
          <span dir="auto" className={cn("truncate", d.status === "error" && "text-danger", held && "text-warn")}>{note(t, d, place)}</span>
          <span className="ms-auto flex shrink-0 gap-4 tabular">
            {!finished && <span>{percent(d.done, d.total)}</span>}
            {d.status === "downloading" && !d.message && (
              <>
                <span>{rate(d.speed)}</span>
                <span>{humanTime(d.eta)}</span>
                <span className="text-faint">{num(d.connections)}×</span>
              </>
            )}
            <span className="text-faint">
              {finished ? humanSize(d.total ?? d.done) : `${humanSize(d.done)} / ${humanSize(d.total)}`}
            </span>
          </span>
        </div>
      </div>

      {/* Over the row rather than beside it, so every bar is as long as the others. */}
      <div className="absolute end-2 top-1.5 flex gap-0.5 rounded-control bg-surface opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100">
        {!finished && (
          <IconButton icon={held ? Play : Pause} label={held ? t.resume : t.pause} onClick={() => send({ cmd: "hold", id: d.id, on: !held })} />
        )}
        {!finished && !first && <IconButton icon={ChevronsUp} label={t.downloadNext} onClick={() => send({ cmd: "next", id: d.id })} />}
        {!finished && (
          <IconButton
            icon={Zap}
            label={focused ? t.shareSpeed : t.onlyThis}
            active={focused}
            onClick={() => send({ cmd: "focus", id: focused ? null : d.id })}
          />
        )}
        {!finished && (
          <IconButton
            icon={Tv}
            label={d.stream ? t.stopInOrder : t.watchWhile}
            active={d.stream}
            onClick={() => send({ cmd: "stream", id: d.id, on: !d.stream })}
          />
        )}
        {(d.status === "done" || (d.stream && (d.ready ?? 0) > 0)) && (
          <IconButton icon={SquareArrowOutUpRight} label={t.open} onClick={() => send({ cmd: "open", id: d.id })} />
        )}
        {d.path && <IconButton icon={Folder} label={t.showInFolder} onClick={() => send({ cmd: "reveal", id: d.id })} />}
        {d.status === "error" && <IconButton icon={RotateCw} label={t.tryAgain} onClick={() => send({ cmd: "retry", id: d.id })} />}
        <IconButton
          icon={X}
          label={confirmRemove || props.armed ? t.removeConfirm : t.remove}
          danger={confirmRemove || props.armed}
          onClick={() => (confirmRemove ? send({ cmd: "remove", id: d.id }) : setConfirmRemove(true))}
        />
      </div>
    </li>
  );
};
